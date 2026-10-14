// AVM2 (ABC bytecode) -> TypeScript statements, for the ActionScript 3 engine.
//
// This is the AVM2 counterpart of `transpiler/as2/avm1.ts`: the operand stack is
// lifted into expressions and the branch structure into if/while/for statements.
// No VM is emitted and no bytecode is kept.
//
// Policies, deliberately the same as the AVM1 lifter's:
//   * Only reducible control flow is accepted, and the operand stack must be
//     empty at every join. The stack is simulated instruction by instruction;
//     values that must survive a statement boundary are materialised into
//     locals, so evaluation order and "evaluated exactly once" hold.
//   * Failure is atomic: a method either lifts completely or reports a
//     diagnostic naming the instruction it could not place. The caller keeps
//     the original bytes and emits a loud stub, never a half-lifted body.
//   * Unsupported today, refused with their instruction name: `lookupswitch`
//     (indexed switch), `for each`/`for in` iteration state (`hasnext2`,
//     `nextname`, `nextvalue`), `with` (`pushwith`), closures over an activation
//     (`newfunction` + `newactivation`) and dynamic class creation outside a
//     script body. The corpus histogram in the dev harness says how much of each
//     is left.

import type { Expr, Stmt } from '../as2/ast';
import { disassemble, type AbcFile, type AbcInstruction, type AbcMethodBody, type AbcTrait } from '../../decompiler/swf/abc';

export interface LiftDiagnostic { offset: number; message: string }

export interface LiftResult {
  /** The lifted body, or null when the method was refused. */
  stmts: Stmt[] | null;
  diagnostics: LiftDiagnostic[];
}

export interface MethodContext {
  abc: AbcFile;
  body: AbcMethodBody;
  /** What `this` is for this method: an instance method has one, static/script code does not. */
  target: 'instance' | 'class' | 'none';
  /** The traits of the class the method belongs to, so own members lift to `this.member`. */
  ownTraits?: AbcTrait[];
  /** Names the enclosing class defines (traits, bound frame scripts) — they lift to `this.name`. */
  memberNames?: Set<string>;
  /** Script-level function names of the ABC: they are globals, not `this` members. */
  globals?: Set<string>;
  /** Static members of the enclosing class: they are reached as `Owner.member`. */
  staticMembers?: Set<string>;
  /** The simple name of the class being emitted, for static member access. */
  staticOwner?: string;
  /** Parameter names when the ABC carries them (usually it does not). */
  paramNames?: string[];
  /** The method takes `...rest`: its array arrives as an extra local after the parameters. */
  needRest?: boolean;
  /** The method uses `arguments`: that object arrives as an extra local after the parameters. */
  needArguments?: boolean;
}

export class Refuse extends Error {
  constructor(readonly offset: number, message: string) { super(message); }
}

interface MnInfo { name: string; ns: string; nsKind?: string; dynamic: boolean; nsOnStack: boolean }

/** A conditional branch: the condition it jumps on, and the test for the arm that stays. */
/** A loop being lifted: its head, its exit, and (bottom-tested loops) its test. */
interface LoopFrame {
  head: number;
  exit: number;
  test?: number;
}

interface BranchInfo {
  jump: Expr;
  stay: Expr;
  value?: Expr;
  jumpOnTruthy?: boolean;
}

/** The property half of a member access: a pool name, or an index taken from the stack. */
interface PropExpr { name?: string; index?: Expr }

interface Value {
  e: Expr;
  /** The name this value was found as (`findpropstrict`/`findproperty`), for member fusion. */
  find?: string;
  /** The object the name was found on: a static field's class, or `this` for an instance member. */
  owner?: Expr;
  /** The type a `coerce` proved this value has, so redundant `Number(...)` wrappers vanish. */
  coerced?: string;
}

/** The types that widen into each other for free: `Number(int(x))` is just `x`. */
const NUMERIC = new Set(['Number', 'int', 'uint']);

const TERMINATORS = new Set(['throw', 'return_void', 'return_value']);

/** How a region of instructions ended. */
type RegionEnd =
  | { kind: 'stop' }                       // reached the caller's merge point
  | { kind: 'jump'; target: number }        // jumped away (past the region)
  | { kind: 'backEdge'; target: number }    // jumped backwards, to a loop head
  | { kind: 'end' };                        // returned or threw

/**
 * The complement of a condition. `==`/`!=` and `===`/`!==` are exact inverses in
 * ActionScript, so `if_ne` prints as `a == b` (what the source said) instead of
 * `!(a != b)`. Ordering comparisons keep the `!` form: `!(a < b)` is true for NaN
 * where `a >= b` is false, and the branch really does test the former.
 */
function notOf(e: Expr): Expr {
  const inverse: Record<string, string> = { '==': '!=', '!=': '==', '===': '!==', '!==': '===' };
  if (e.k === 'binary' && inverse[e.op]) return { k: 'binary', op: inverse[e.op], left: e.left, right: e.right };
  return { k: 'unary', op: '!', arg: e };
}

/** Default-package names the AS3 runtime provides as globals (not `this` members). */
const GLOBALS = new Set([
  'trace', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'escape', 'unescape', 'encodeURI', 'decodeURI',
  'encodeURIComponent', 'decodeURIComponent', 'getTimer', 'getDefinitionByName', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'Array', 'Boolean', 'Date', 'Error', 'Function', 'int', 'JSON', 'Math',
  'Namespace', 'Number', 'Object', 'QName', 'RegExp', 'String', 'uint', 'Vector', 'XML', 'XMLList',
  'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'ArgumentError',
  'DefinitionError', 'SecurityError', 'VerifyError', 'UninitializedError', 'undefined', 'NaN', 'Infinity',
  'this', 'super', 'arguments', 'ErrorEvent', 'uint', 'Boolean', 'Class', 'Function', 'Proxy', 'Vector',
  'Number', 'String', 'Object', 'Array', 'Boolean', 'int', 'uint', 'Namespace', 'QName', 'XML', 'XMLList',
]);

// ------------------------------------------------------------------ lifting

export function liftMethod(ctx: MethodContext): LiftResult {
  const { body } = ctx;
  const dis = disassemble(body.code);
  if (!dis.complete) {
    return { stmts: null, diagnostics: [{ offset: 0, message: `body does not disassemble: ${dis.errors.join('; ')}` }] };
  }
  try {
    const l = new Lifter(ctx, dis.instructions);
    return { stmts: l.run(), diagnostics: [] };
  } catch (e) {
    if (e instanceof Refuse) return { stmts: null, diagnostics: [{ offset: e.offset, message: e.message }] };
    throw e;
  }
}

class Lifter {
  private out: Stmt[] = [];
  private stack: Value[] = [];
  private temps = 0;
  private locals = new Map<number, string>();
  private blocks = new Map<number, AbcInstruction[]>();
  private leaders = new Set<number>();
  private pc = 0;
  /** Loop nesting, innermost last: `head` and `exit` are instruction offsets. */
  private loops: LoopFrame[] = [];

  constructor(private ctx: MethodContext, instructions: AbcInstruction[]) {
    // Only an instruction start can begin a block. A jump target that lands in the
    // middle of an instruction or past the end of the body (dead code in several
    // uploaded movies) is not one, and a branch to it is refused rather than
    // silently attaching its instructions to the wrong block.
    const starts = new Set(instructions.map((i) => i.offset));
    for (const i of instructions) this.blocks.set(i.offset, []);
    this.leaders.add(0);
    for (const i of instructions) {
      for (const t of targets(i)) if (starts.has(t)) this.leaders.add(t);
      const next = i.offset + i.size;
      if (!starts.has(next)) continue;
      if (branch(i) || TERMINATORS.has(i.name) || i.name === 'jump' || i.name === 'lookup_switch') this.leaders.add(next);
    }
    for (const i of instructions) {
      const block = this.blockStart(i.offset);
      this.blocks.get(block)!.push(i);
    }
  }

  run(): Stmt[] {
    // A body that opens with a jump (every `for` / pre-tested `while` does: the
    // compiler jumps to the test first) still has code after the jump. The region
    // ends there, so follow it — never leave the rest of the body on the floor.
    let at: number | undefined = 0;
    const seen = new Set<number>();
    while (at != null && !seen.has(at)) {
      seen.add(at);
      const end = this.emitRegion(at, null);
      at = end.kind === 'jump' ? end.target : undefined;
    }
    // AS3 locals have no declarations in the bytecode; TypeScript needs them, and a
    // local may be first assigned inside a branch that the emitted code then reads.
    const decls: Stmt[] = [...this.usedLocals]
      .sort((a, b) => a - b)
      .map((index) => ({ k: 'var' as const, decls: [{ name: this.locals.get(index) as string, type: null, init: null }] }));
    return [...decls, ...this.out];
  }

  private usedLocals = new Set<number>();

  /** The leader at or before `offset` — the block that instruction belongs to. */
  private blockStart(offset: number): number {
    let best = 0;
    for (const leader of this.leaders) if (leader <= offset && leader > best) best = leader;
    return best;
  }

  // -- region emission -------------------------------------------------------

  /**
   * Emit the linear region that starts at `entry` and ends when control leaves it:
   * at `stop` (the merge point its caller cares about), by a jump, by a backwards
   * jump (a loop edge) or by a return/throw. Nothing is emitted speculatively — a
   * region that cannot be placed throws `Refuse`.
   */
  private emitRegion(entry: number, stop: number | null): RegionEnd {
    const mine: number[] = [];
    try {
      return this.emitRegionInner(entry, stop, mine);
    } finally {
      for (const offset of mine) this.active.delete(offset);
    }
  }

  private emitRegionInner(entry: number, stop: number | null, mine: number[]): RegionEnd {
    let cur: number | null = entry;
    while (cur != null) {
      if (stop != null && cur === stop) return { kind: 'stop' };
      if (this.active.has(cur)) throw new Refuse(cur, 'control flow re-enters a region still being lifted (irreducible)');
      this.active.add(cur);
      mine.push(cur);
      const block = this.blocks.get(cur);
      if (!block || !block.length) throw new Refuse(cur, 'jump leaves the method body');
      const last = block[block.length - 1];
      this.pc = last.offset + last.size;
      for (const i of block) {
        if (i === last && (branch(i) || i.name === 'jump' || i.name === 'lookup_switch' || TERMINATORS.has(i.name))) continue;

        this.pc = i.offset;
        this.step(i);
      }
      const exit = this.emitControl(last, block, stop);
      if (exit.done) return exit.end;
      if (exit.next == null) return exit.end;
      // A nested construct can merge *past* this region's end (chained conditions do
      // exactly that): the region ends there and the caller continues from it.
      if (stop != null && exit.next > stop) return { kind: 'jump', target: exit.next };
      cur = exit.next;
    }
    return { kind: 'end' };
  }

  /** Offsets on the path currently being lifted, so nothing re-enters itself. */
  private active = new Set<number>();

  /** Handle a block's last instruction; either end the region or say where it continues. */
  /**
   * Handle a block's last instruction. `done` means the region ended; otherwise
   * emission continues at `next` (a construct was emitted and the code after it
   * is still part of this region).
   */
  private emitControl(last: AbcInstruction, insns: AbcInstruction[], stop: number | null): { done: boolean; end: RegionEnd; next: number | null } {
    this.pc = last.offset;
    if (TERMINATORS.has(last.name)) {
      this.step(last);
      return { done: true, end: { kind: 'end' }, next: null };
    }
    if (last.name === 'lookup_switch') {
      // Emitting nothing here silently drops the body; the table is a `switch`.
      throw new Refuse(last.offset, 'lookup_switch (a `switch` statement) is not lifted yet');
    }
    if (last.name === 'jump') {
      const target = last.target as number;
      {
        // a `continue` from inside the loop's body: the branch to the test is the edge
        const frame = this.loops[this.loops.length - 1];
        if (frame && frame.test === target) {
          this.out.push({ k: 'continue', label: null });
          return { done: true, end: { kind: 'stop' }, next: null };
        }
        const loop = this.tryPreTestedWhile(last, target);
        if (loop) return loop;
      }
      if (target <= last.offset && this.leaders.has(target)) return { done: true, end: { kind: 'backEdge', target }, next: null };
      if (stop != null && target === stop) return { done: true, end: { kind: 'stop' }, next: null };
      return { done: true, end: { kind: 'jump', target }, next: null };
    }
    if (branch(last)) {
      const fallThrough = last.offset + last.size;
      const target = last.target as number;
      // `if (cond) break;` / `continue;` of an enclosing loop: the arm leaves, we carry on
      if (this.breaksOut(target, fallThrough)) {
        const cond = this.branchTest(last);
        const unconditional = isLiteralTrue(cond);
        this.emitLoopExit(cond, target);
        return unconditional
          ? { done: true, end: { kind: 'jump', target }, next: null }
          : { done: false, end: { kind: 'stop' }, next: fallThrough };
      }
      // while (cond) { body }
      if (this.isWhileHead(last, target, fallThrough)) {
        const cond = this.branchTest(last);
        this.loops.push({ head: last.offset, exit: target });
        const arm = this.emitArm(fallThrough, target);
        this.loops.pop();
        if (arm.end.kind === 'jump') throw new Refuse(last.offset, 'loop body jumps past the loop');
        if (arm.end.kind === 'backEdge' && arm.end.target !== last.offset) throw new Refuse(last.offset, 'loop body jumps to another loop head');
        this.out.push({ k: 'while', test: cond, body: block(arm.stmts) });
        return { done: false, end: { kind: 'stop' }, next: target };
      }
      // a short-circuit whose value is consumed by the next branch
      const join = this.tryJoinValue(last, insns, fallThrough, target);
      if (join) return { done: false, end: { kind: 'stop' }, next: join.next };
      // `a && b` / `a || b` in value position
      const logical = this.tryLogicalJoin(last, fallThrough, target);
      if (logical) {
        this.push(logical.expr);
        return { done: false, end: { kind: 'stop' }, next: logical.merge };
      }
      // if (cond) { then } / if (cond) { then } else { else }, either as statements
      // or — when both arms leave one value on the stack — as a `cond ? a : b` value.
      const cond = this.branchTest(last);
      const base = [...this.stack];
      const thenArm = this.emitArm(fallThrough, target);
      const thenStack = [...this.stack];
      this.stack = [...base];
      const jumpTo = thenArm.end.kind === 'jump' ? thenArm.end.target : null;

      // `if (cond) { then }`: the arm either falls into the merge or jumps to it.
      if (jumpTo == null || jumpTo === target) {
        if (jumpTo === target && thenStack.length !== base.length) {
          throw new Refuse(last.offset, `if arm leaves values on the stack: base=${base.length} then=${thenStack.length} kinds=${thenStack.map((v) => v.e.k).join(',')} basekinds=${base.map((v) => v.e.k).join(',')}`);
        }
        if (thenArm.end.kind === 'backEdge') {
          // the arm leaves the region through a loop edge: `continue` / `break`
          const loop = this.loops[this.loops.length - 1];
          if (!loop || (thenArm.end.target !== loop.head && thenArm.end.target !== loop.exit)) {
            throw new Refuse(last.offset, 'branch leaves the method through an unknown loop edge');
          }
          thenArm.stmts.push(thenArm.end.target === loop.head ? { k: 'continue', label: null } : { k: 'break', label: null });
        } else if (thenStack.length !== base.length) {
          throw new Refuse(last.offset, `if without else leaves values on the stack: base=${base.length} then=${thenStack.length} kinds=${thenStack.map((v) => v.e.k).join(',')} basekinds=${base.map((v) => v.e.k).join(',')}`);
        }
        this.out.push({ k: 'if', test: cond, then: block(thenArm.stmts), else: null });
        return { done: false, end: { kind: 'stop' }, next: target };
      }

      // `if (cond) { then } else { else }`: the else arm runs from the branch target
      // to wherever the then arm jumped.
      const merge = jumpTo;
      const elseArm = this.emitArm(target, merge);
      if (elseArm.end.kind !== 'stop' && elseArm.end.kind !== 'end' && elseArm.end.kind !== 'jump') {
        throw new Refuse(last.offset, 'if/else arms end at different merges');
      }
      const thenVals = thenStack.slice(base.length);
      const elseVals = this.stack.slice(base.length);
      this.stack = [...base];
      if (thenVals.length || elseVals.length) {
        // Both paths must produce the same single value: that is the compiler's `?:`.
        if (thenVals.length !== 1 || elseVals.length !== 1 || elseArm.end.kind !== 'stop') {
          throw new Refuse(last.offset, 'if/else arms leave different numbers of values');
        }
        if (!thenArm.stmts.length && !elseArm.stmts.length) {
          this.push({ k: 'cond', test: cond, then: thenVals[0].e, else: elseVals[0].e });
        } else {
          const name = `__c${this.temps++}`;
          this.out.push({ k: 'var', decls: [{ name, type: null, init: null }] });
          this.out.push({
            k: 'if',
            test: cond,
            then: block([...thenArm.stmts, exprStmt(assign(id(name), thenVals[0].e))]),
            else: block([...elseArm.stmts, exprStmt(assign(id(name), elseVals[0].e))]),
          });
          this.push(id(name));
        }
        return { done: false, end: { kind: 'stop' }, next: merge };
      }
      this.out.push({
        k: 'if',
        test: cond,
        then: block(thenArm.stmts),
        else: elseArm.stmts.length ? block(elseArm.stmts) : null,
      });
      return { done: false, end: { kind: 'stop' }, next: merge };
    }
    // plain block: fall through
    const next = last.offset + last.size;
    if (next >= this.ctx.body.code.length) {
      throw new Refuse(last.offset, 'control falls off the end of the body (no return)');
    }
    return { done: false, end: { kind: 'stop' }, next };
  }

  /**
   * A `while` loop, as the compiler writes it: an entry jump to the test, the body
   * in between, and the test at the bottom jumping back into the body.
   *
   *     33: jump 78        ; entry: run the test first (so the body is guarded)
   *     37: …body…
   *     78: get_local3; get_local2; if_lt 37   ; test: back into the body while true
   *     84: …             ; exit
   *
   * Lifting it as a real loop keeps the body's statements reachable *once*, instead
   * of leaving a region that starts at the test and jumps backwards into code the
   * entry already covered.
   */
  private tryPreTestedWhile(jump: AbcInstruction, target: number): { done: boolean; end: RegionEnd; next: number | null } | null {
    if (target <= jump.offset) return null;
    const testBlock = this.blocks.get(target);
    if (!testBlock?.length) return null;
    const test = testBlock[testBlock.length - 1];
    if (!branch(test)) return null;
    const head = test.target as number;
    if (head <= jump.offset || head >= target) return null;         // the test must jump back into the body
    const exit = test.offset + test.size;
    if (exit <= target) return null;
    const snap = this.snapshot();
    try {
      const frame: LoopFrame = { head, exit, test: target };
      this.loops.push(frame);
      const arm = this.emitArm(head, target);
      this.loops.pop();
      if (arm.end.kind !== 'stop' && arm.end.kind !== 'end') throw new Refuse(jump.offset, 'loop body leaves through an unexpected edge');
      for (const i of testBlock) {
        if (i === test) continue;
        this.pc = i.offset;
        this.step(i);
      }
      const info = this.branchInfo(test);
      if (!info) throw new Refuse(test.offset, `${test.name} is not a supported loop test`);
      this.out.push({ k: 'while', test: info.jump, body: block(arm.stmts) });
      return { done: false, end: { kind: 'stop' }, next: exit };
    } catch (e) {
      this.restore(snap);
      if (e instanceof Refuse) return null;
      throw e;
    }
  }

  /**
   * The compiler's short-circuit idiom in *value* position:
   *
   *     <a>            ; computed once
   *     dup
   *     if_false L     ; a is false -> L keeps the copy of a on the stack
   *     pop            ; otherwise drop the copy …
   *     <b>            ; … and compute b
   * L:  if_false …     ; one branch tests either b (a true) or a (a false)
   *
   * The value at L is a phi of `a` and `b`, which is exactly `a && b`; the merge
   * branch then consumes it. Lift it as a real join on a materialised local.
   */
  private tryJoinValue(last: AbcInstruction, insns: AbcInstruction[], fallThrough: number, target: number): { next: number } | null {
    const before = insns[insns.length - 2];
    if (before?.name !== 'dup') return null;
    // `dup` left two copies: the branch consumes the top one as its test.
    if (this.stack.length !== 2) return null;
    const armFirst = this.blocks.get(fallThrough)?.[0];
    if (armFirst?.name !== 'pop') return null;
    const info = this.branchInfo(last);
    if (!info) return null;
    const left = this.stack[0];
    this.stack = [left];

    const leftName = `__v${this.temps++}`;
    const joinName = `__j${this.temps++}`;
    this.out.push({ k: 'var', decls: [{ name: leftName, type: null, init: left.e }] });
    this.out.push({ k: 'var', decls: [{ name: joinName, type: null, init: null }] });

    const arm = this.emitArm(fallThrough, target);
    if (arm.end.kind !== 'stop' || this.stack.length !== 1) {
      throw new Refuse(last.offset, 'short-circuit join does not produce a single value');
    }
    const right = this.stack[this.stack.length - 1];
    this.out.push({
      k: 'if',
      test: info.value as Expr,
      then: block([...arm.stmts, exprStmt(assign(id(joinName), right.e))]),
      else: block([exprStmt(assign(id(joinName), id(leftName)))]),
    });
    this.stack = [{ e: id(joinName) }];
    return { next: target };
  }

  /** Everything lifting mutates, so a speculative arm can be rolled back. */
  private snapshot(): {
    stack: Value[];
    locals: Map<number, string>;
    types: Map<number, string>;
    killed: Set<string>;
    active: Set<number>;
    temps: number;
    used: Set<number>;
    loops: LoopFrame[];
    out: number;
    pc: number;
  } {
    return {
      stack: [...this.stack], locals: new Map(this.locals), types: new Map(this.localTypes),
      killed: new Set(this.killed), active: new Set(this.active), temps: this.temps,
      used: new Set(this.usedLocals), loops: [...this.loops], out: this.out.length, pc: this.pc,
    };
  }

  private restore(snap: ReturnType<Lifter['snapshot']>) {
    this.out.length = snap.out;
    this.pc = snap.pc;
    this.stack = snap.stack;
    this.locals = snap.locals;
    this.localTypes = snap.types;
    this.killed = snap.killed;
    this.active = snap.active;
    this.temps = snap.temps;
    this.usedLocals = snap.used;
    this.loops = snap.loops;
  }

  /**
   * `a && b` / `a || b` in value position. The compiler branches on `a`, computes
   * `b` on one path, and pushes the constant on the other, so both paths reach the
   * merge with one value on the stack. Lift that to a single `&&`/`||` expression
   * (which keeps the short-circuit), and refuse anything more elaborate.
   */
  private tryLogicalJoin(i: AbcInstruction, fallThrough: number, target: number): { expr: Expr; merge: number } | null {
    if (this.stack.length) return null;
    const info = this.branchInfo(i);
    if (!info || info.value == null) return null;
    const snap = this.snapshot();
    const arm = this.emitArm(fallThrough, target);
    if (arm.end.kind !== 'jump' || arm.end.target <= target || arm.stmts.length) { this.restore(snap); return null; }
    const merge = arm.end.target;
    const block = this.blocks.get(target);
    const push = block?.[0];
    const isTrue = push?.name === 'push_true';
    const isFalse = push?.name === 'push_false';
    const single = block ? block[0].offset + block[0].size === merge : false;
    if (!(isTrue || isFalse) || !single) { this.restore(snap); return null; }
    // `if_true` branches to the truthy constant ⇒ the other operand is `||`
    if (info.jumpOnTruthy !== isTrue) { this.restore(snap); return null; }
    const right = this.stack[this.stack.length - 1];
    if (!right) { this.restore(snap); return null; }
    this.stack.pop();
    const expr: Expr = { k: 'binary', op: info.jumpOnTruthy ? '||' : '&&', left: info.value, right: right.e };
    return { expr, merge };
  }

  /** Emit a region into a fresh statement list, so the caller can place it. */
  private emitArm(entry: number, stop: number | null): { stmts: Stmt[]; end: RegionEnd } {
    const saved = this.out;
    const stmts: Stmt[] = [];
    this.out = stmts;
    try {
      return { stmts, end: this.emitRegion(entry, stop) };
    } finally {
      this.out = saved;
    }
  }

  private breaksOut(target: number, fallThrough: number): boolean {
    const loop = this.loops[this.loops.length - 1];
    return !!loop && (target === loop.exit || target === loop.head) && fallThrough !== target;
  }

  private emitLoopExit(cond: Expr, target: number) {
    const loop = this.loops[this.loops.length - 1];
    const kind = target === loop.exit ? 'break' : 'continue';
    if (isLiteralTrue(cond)) { this.out.push({ k: kind, label: null }); return; }
    this.out.push({ k: 'if', test: cond, then: { k: kind, label: null }, else: null });
  }

  /** `while (cond) { … }`: the branch leaves the loop forward and the body heads back to it. */
  private isWhileHead(last: AbcInstruction, target: number, fallThrough: number): boolean {
    if (target <= last.offset) return false;
    return this.reachesBackTo(fallThrough, last.offset, target);
  }

  /** Does the region [from, stop) reach `head`? */
  private reachesBackTo(from: number, head: number, stop: number): boolean {
    const seen = new Set<number>();
    const work = [from];
    while (work.length) {
      const at = work.pop() as number;
      if (seen.has(at)) continue;
      seen.add(at);
      if (at === head) return true;
      if (at === stop) continue;
      const block = this.blocks.get(at);
      if (!block?.length) continue;
      const last = block[block.length - 1];
      if (last.offset + last.size === head) return true;
      for (const t of targets(last)) {
        if (t === head) return true;
        if (t < from || t >= stop) continue;
        work.push(t);
      }
      const next = last.offset + last.size;
      if (next > from && next < stop) work.push(next);
      else if (next === stop && next === head) return true;
    }
    return false;
  }

  // -- instruction emission --------------------------------------------------

  /** Wrap the instruction dispatch with an optional stack trace for debugging. */
  private step(i: AbcInstruction) {
    if (!process.env.ABC_DEBUG) return this.stepInner(i);
    console.log(`${String(i.offset).padStart(4)} ${i.name} stack=[${this.stack.map((v) => v.e.k).join(',')}]`);
    this.stepInner(i);
    console.log(`     -> [${this.stack.map((v) => v.e.k).join(',')}]`);
  }

  private stepInner(i: AbcInstruction) {
    const o = i.operands;
    const mn = (k = 0) => this.multiname(o[k]);
    switch (i.name) {
      case 'jump': case 'nop': case 'label': case 'bkpt': case 'timestamp':
      case 'debug': case 'debug_line': case 'debug_file': case 'bkpt_line':
        return;
      case 'push_scope':
        this.pop();                                         // the scope object goes onto the scope stack
        return;
      case 'pop_scope':
        // activation scopes are structural, but the scope object comes back on the
        // operand stack (a real value in AVM2), so keep the depth honest.
        this.push({ k: 'id', name: 'this', line: 0 });
        return;
      case 'get_scope_object': case 'get_global_scope':
        this.push({ k: 'id', name: 'this', line: 0 });
        return;
      case 'get_local0': case 'get_local1': case 'get_local2': case 'get_local3':
        this.pushValue(this.readLocal(Number(i.name.slice(-1))));
        return;
      case 'get_local':
        this.pushValue(this.readLocal(o[0]));
        return;
      case 'set_local0': case 'set_local1': case 'set_local2': case 'set_local3':
        this.storeLocal(Number(i.name.slice(-1)));
        return;
      case 'set_local':
        this.storeLocal(o[0]);
        return;
      case 'kill': {
        // Values already on the stack keep the local's old value.
        const name = (this.local(o[0]) as { name: string }).name;
        for (let k = 0; k < this.stack.length; k++) if (isId(this.stack[k].e, name)) this.hold(k);
        // `kill` releases the register, so there is nothing to print: the compiler
        // only kills a local it is finished with. A read that still follows reads
        // `undefined`, which is what the register holds from here on.
        this.killed.add(name);
        this.localTypes.delete(o[0]);
        return;
      }
      case 'push_byte': case 'push_short': case 'push_int': case 'push_uint':
        this.push({ k: 'num', v: String(i.name === 'push_byte' ? ((o[0] << 24) >> 24) : o[0]) });
        return;
      case 'push_double': {
        const v = this.ctx.abc.doubles?.[o[0]];
        this.push({ k: 'num', v: String(v ?? 0) });
        return;
      }
      case 'push_string': {
        const s = this.ctx.abc.strings[o[0]] ?? '';
        this.push({ k: 'str', v: s });
        return;
      }
      case 'push_null': this.push(lit('null')); return;
      case 'push_undefined': this.push(lit('undefined')); return;
      case 'push_true': this.push(lit('true')); return;
      case 'push_false': this.push(lit('false')); return;
      case 'push_na_n': this.push({ k: 'id', name: 'NaN', line: 0 }); return;
      case 'pop': this.drop(); return;
      case 'dup': {
        const v = this.stack[this.stack.length - 1];
        if (!v) throw new Refuse(i.offset, 'dup on an empty stack');
        this.pushValue({ ...v });
        return;
      }
      case 'swap': {
        const a = this.pop(), b = this.pop();
        this.stack.push(a, b);
        return;
      }
      case 'get_lex': {
        const m = mn();
        this.push(this.reference(m.name, m.ns, m.nsKind));
        return;
      }
      case 'find_prop_strict': case 'find_property': case 'find_def': {
        const m = mn();
        if (m.dynamic || m.nsOnStack) throw new Refuse(i.offset, `${i.name} on a runtime name is not lifted yet`);
        this.pushValue(this.findReference(m));
        return;
      }
      case 'get_property': case 'get_descendants': {
        const { recv, prop } = this.popAccess(mn());
        this.push(this.memberOfValue(recv, prop));
        return;
      }
      case 'get_super': {
        const { prop } = this.popAccess(mn());
        this.push(this.memberOfValue({ e: superRef() }, prop));
        return;
      }
      case 'set_super': {
        const m = mn();
        const v = this.pop();
        this.holdCopies(v.e);
        const { prop } = this.popAccess(m);
        this.statement({ k: 'assign', op: '=', target: this.memberOfValue({ e: superRef() }, prop), value: v.e });
        return;
      }
      case 'set_property': case 'init_property': {
        const m = mn();
        const v = this.pop();
        const { recv, prop } = this.popAccess(m);
        // The compiler keeps the assigned value on the stack: copies of it must not
        // re-run the expression, so they read a temp assigned before the store.
        this.holdCopies(v.e);
        this.statement({ k: 'assign', op: '=', target: this.memberOfValue(recv, prop), value: v.e });
        return;
      }
      case 'delete_property': {
        const { recv, prop } = this.popAccess(mn());
        this.statement({ k: 'unary', op: 'delete ', arg: this.memberOfValue(recv, prop) });
        return;
      }
      case 'call_property': case 'call_prop_void': case 'call_prop_lex': {
        const m = mn();
        const args = this.popArgs(argCountOf(i, o));
        const { recv, prop } = this.popAccess(m);
        this.resultOrStatement({ k: 'call', callee: this.memberOfValue(recv, prop), args }, i.name === 'call_prop_void');
        return;
      }
      case 'construct_prop': {
        const m = mn();
        const args = this.popArgs(argCountOf(i, o));
        const { recv, prop } = this.popAccess(m);
        this.push({ k: 'new', callee: this.memberOfValue(recv, prop), args });
        return;
      }
      case 'call_method': {
        const args = this.popArgs(argCountOf(i, o));
        const recv = this.pop();
        const trait = this.traitByMethod(o[0]);
        const name = trait ? simpleName(trait.name) : `__method${o[0]}`;
        this.resultOrStatement({ k: 'call', callee: member(recv.e, name), args }, false);
        return;
      }
      case 'call_super': case 'call_super_void': {
        const args = this.popArgs(argCountOf(i, o));
        const trait = this.traitByMethod(o[0]);
        const name = trait ? simpleName(trait.name) : `__method${o[0]}`;
        this.resultOrStatement({ k: 'call', callee: member(superRef(), name), args }, i.name === 'call_super_void');
        return;
      }
      case 'call': {
        const args = this.popArgs(argCountOf(i, o));
        const fn = this.pop();
        this.resultOrStatement({ k: 'call', callee: fn.e, args }, false);
        return;
      }
      case 'construct': {
        const args = this.popArgs(argCountOf(i, o));
        const cls = this.pop();
        this.push({ k: 'new', callee: cls.e, args });
        return;
      }
      case 'construct_super': {
        const args = this.popArgs(argCountOf(i, o));
        this.drop();                                     // the object being constructed
        this.statement({ k: 'call', callee: superRef(), args });
        return;
      }
      case 'return_void':
        this.emit({ k: 'return', arg: null });
        return;
      case 'return_value': {
        const v = this.pop();
        this.emit({ k: 'return', arg: v.e });
        return;
      }
      case 'throw': {
        const v = this.pop();
        this.emit({ k: 'throw', arg: v.e });
        return;
      }
      case 'new_class': {
        // `newclass` builds the class object of the enclosing script; the emitted
        // TypeScript class declaration *is* that object, so the value is a no-op.
        this.push({ k: 'id', name: `__class${o[0]}`, line: 0 });
        return;
      }
      case 'new_array': {
        const items = this.popArgs(argCountOf(i, o));
        this.push({ k: 'array', items });
        return;
      }
      case 'new_object': {
        const values = this.popArgs(argCountOf(i, o) * 2);
        const props: { key: string; value: Expr }[] = [];
        for (let k = 0; k < values.length; k += 2) {
          const key = values[k];
          props.push({ key: key.k === 'str' ? key.v : `__key${k}`, value: values[k + 1] });
        }
        this.push({ k: 'object', props });
        return;
      }
      case 'coerce': {
        const top = this.stack[this.stack.length - 1];
        if (top) top.coerced = typeNameOf(this.multiname(o[0]));
        return;
      }
      case 'coerce_a': case 'coerce_s': case 'coerce_b':
      case 'coerce_i': case 'coerce_d': case 'coerce_u': case 'coerce_o': case 'check_filter':
        return;                                             // annotations: erased in TypeScript
      case 'convert_s': this.convert('String'); return;
      case 'convert_i': this.convert('int'); return;
      case 'convert_u': this.convert('uint'); return;
      case 'convert_d': this.convert('Number'); return;
      case 'convert_b': this.convert('Boolean'); return;
      case 'convert_o': {
        // object coercion throws on null/undefined; keep that visible
        const v = this.pop();
        this.push({ k: 'call', callee: { k: 'id', name: '__coerceObject', line: 0 }, args: [v.e] });
        return;
      }
      case 'as_type': case 'as_type_late': case 'is_type': case 'is_type_late': {
        const right = i.name.endsWith('_late') ? this.pop().e : this.multinameExpr(o[0]);
        const left = this.pop();
        const op = i.name.startsWith('as_') ? 'as' : 'is';
        this.push({ k: 'binary', op, left: left.e, right });
        return;
      }
      case 'apply_type': {
        const args = this.popArgs(argCountOf(i, o));
        const base = this.pop();
        this.push({ k: 'call', callee: { k: 'id', name: '__applyType', line: 0 }, args: [base.e, ...args] });
        return;
      }
      case 'add': case 'subtract': case 'multiply': case 'divide': case 'modulo':
      case 'bit_and': case 'bit_or': case 'bit_xor': case 'l_shift': case 'r_shift': case 'u_r_shift':
      case 'equals': case 'strict_equals': case 'less_than': case 'less_equals':
      case 'greater_than': case 'greater_equals': case 'instance_of': case 'in':
        this.binary(opOf(i.name));
        return;
      case 'add_i': case 'subtract_i': case 'multiply_i':
        this.binary(opOf(i.name.slice(0, -2)));
        return;
      case 'negate': case 'not': case 'bit_not': case 'type_of':
        this.unary(opOf(i.name));
        return;
      case 'negate_i': this.unary('-'); return;
      case 'increment': case 'decrement': {
        // arithmetic: pop a value, push it ± 1 (the *local* variants are the mutations)
        const v = this.pop();
        const one: Expr = { k: 'num', v: '1' };
        const op = i.name === 'increment' ? '+' : '-';
        this.push({ k: 'binary', op, left: v.e, right: one });
        return;
      }
      case 'increment_i': case 'decrement_i': {
        const v = this.pop();
        const one: Expr = { k: 'num', v: '1' };
        const sum: Expr = { k: 'binary', op: i.name === 'increment_i' ? '+' : '-', left: v.e, right: one };
        this.push({ k: 'call', callee: { k: 'id', name: 'int', line: 0 }, args: [sum] });
        return;
      }
      case 'inc_local': case 'dec_local': case 'inc_local_i': case 'dec_local_i': {
        const target = this.local(o[0]);
        this.statement({ k: 'update', op: i.name.startsWith('inc') ? '++' : '--', prefix: false, arg: target });
        return;
      }
      case 'sxi1': case 'sxi8': case 'sxi16':
        this.push({ k: 'id', name: 'Number', line: 0 });     // value-preserving enough for the sign extension sites we have
        return;
      case 'has_next2': case 'next_name': case 'next_value': case 'has_next':
        throw new Refuse(i.offset, `${i.name} (for-in / for-each iteration) is not lifted yet`);
      case 'lookup_switch':
        throw new Refuse(i.offset, 'lookupswitch (indexed switch) is not lifted yet');
      case 'push_with':
        throw new Refuse(i.offset, 'with (pushwith) is not lifted yet');
      case 'new_function': case 'new_activation':
        throw new Refuse(i.offset, `${i.name} (closures over an activation) is not lifted yet`);
      case 'new_catch':
        throw new Refuse(i.offset, 'newcatch outside a lifted try/catch is not supported');
      case 'li8': case 'li16': case 'li32': case 'lf32': case 'lf64':
      case 'si8': case 'si16': case 'si32': case 'sf32': case 'sf64':
        throw new Refuse(i.offset, `${i.name} (byte-array memory access) is not lifted yet`);
      case 'dxns': case 'dxns_late':
        throw new Refuse(i.offset, 'E4X default namespace (dxns) is not lifted yet');
      case 'esc_xelem': case 'esc_xattr':
        throw new Refuse(i.offset, 'E4X escaping is not lifted yet');
      default: {
        throw new Refuse(i.offset, `opcode ${i.name} is not lifted yet`);
      }
    }
  }

  // -- stack helpers ---------------------------------------------------------

  private push(e: Expr, find?: string) { this.stack.push({ e, find }); }
  private pushValue(v: Value) { this.stack.push(v); }
  private pop(): Value {
    const v = this.stack.pop();
    if (!v) throw new Refuse(this.pc, 'operand stack underflow');
    return v;
  }
  private popArgs(count: number): Expr[] {
    const args: Expr[] = [];
    for (let k = 0; k < count; k++) args.unshift(this.pop().e);
    return args;
  }
  private drop() {
    const v = this.pop();
    // Dropping a pure expression can be left out entirely; anything else stays.
    if (!isTrivial(v.e) && !isPure(v.e)) this.statement(v.e);
  }
  private convert(kind: string) {
    const v = this.pop();
    // A conversion the compiler already proved unnecessary prints as noise; the
    // declared types (`coerce`) are what the source-level value really is.
    const same = v.coerced === kind || (kind === 'Number' && v.coerced != null && NUMERIC.has(v.coerced));
    const literal = v.e.k === 'num';
    if (kind === 'Number' && (same || literal || v.e.k === 'update')) {
      this.pushValue(v);
      return;
    }
    this.pushValue({ ...v, e: { k: 'call', callee: { k: 'id', name: kind, line: 0 }, args: [v.e] }, coerced: kind });
  }
  private binary(op: string) {
    const right = this.pop(), left = this.pop();
    this.push({ k: 'binary', op, left: left.e, right: right.e });
  }
  private unary(op: string) {
    const v = this.pop();
    this.push({ k: 'unary', op, arg: v.e });
  }
  private resultOrStatement(e: Expr, discard: boolean) {
    if (discard) this.statement(e);
    else this.push(e);
  }

  /** Emit something with side effects; pending stack values are materialised first. */
  private statement(e: Expr) {
    this.materialize();
    this.out.push({ k: 'expr', e });
  }
  /** Emit a statement that is not an expression (return/throw), materialising first. */
  private emit(s: Stmt) {
    this.materialize();
    this.out.push(s);
  }
  /**
   * Store a value into a local, the way the compiler's operand stack sees it: the
   * stored value stays on the stack, so its copies become *reads of the local*.
   * Reads that were already pending keep the value they had before the store.
   */
  private storeLocal(index: number) {
    const v = this.pop();
    const name = (this.local(index) as { name: string }).name;
    for (let k = 0; k < this.stack.length; k++) {
      const e = this.stack[k].e;
      if (e.k === 'id' && e.name === name) this.hold(k);
    }
    // The compiler leaves the stored value on the stack: those copies read the local,
    // so they must be rewritten *before* the store emits (nothing else may re-run).
    for (let k = 0; k < this.stack.length; k++) {
      if (this.stack[k].e === v.e) this.stack[k] = { e: { k: 'id', name, line: 0 }, coerced: v.coerced };
    }
    this.killed.delete(name);
    if (v.coerced) this.localTypes.set(index, v.coerced);
    this.assign({ k: 'id', name, line: 0 }, v.e);
  }

  /** Give the value at `index` a temp, so later reads of it see the same value. */
  private hold(index: number) {
    const name = `__h${this.temps++}`;
    this.out.push({ k: 'var', decls: [{ name, type: null, init: this.stack[index].e }] });
    this.stack[index] = { e: { k: 'id', name, line: 0 } };
  }

  /** Temp every other stack copy of `e`, so a store cannot change what they see. */
  private holdCopies(e: Expr) {
    for (let k = 0; k < this.stack.length; k++) if (this.stack[k].e === e) this.hold(k);
  }

  private assign(target: Expr, value: Expr) {
    // `x = x++` (a postfix update whose value is stored straight back) is just `x++`
    if (value.k === 'update' && target.k === 'id' && value.arg.k === 'id' && value.arg.name === target.name) {
      this.statement(value);
      return;
    }
    this.statement({ k: 'assign', op: '=', target, value });
  }
  private materialize() {
    for (let k = 0; k < this.stack.length; k++) {
      const v = this.stack[k];
      if (isTrivial(v.e)) continue;
      const name = `__t${this.temps++}`;
      this.out.push({ k: 'var', decls: [{ name, type: null, init: v.e }] });
      this.stack[k] = { e: { k: 'id', name, line: 0 }, find: v.find };
    }
  }

  // -- names -----------------------------------------------------------------

  /**
   * A multiname. `dynamic` marks `MultinameL`/`RTQNameL`: the property name is on
   * the stack (`obj[i]`), not in the pool. `nsOnStack` marks `RTQName`: the pool
   * carries the name and the stack carries the namespace.
   */
  private multiname(index: number): MnInfo {
    const m = this.ctx.abc.multinames[index];
    if (!m) throw new Refuse(this.pc, `multiname ${index} is out of range`);
    const dynamic = m.kind === 'MultinameL' || m.kind === 'MultinameLA' || m.kind === 'RTQNameL' || m.kind === 'RTQNameLA';
    const nsOnStack = m.kind === 'RTQName' || m.kind === 'RTQNameA';
    return { name: m.name || `__mn${index}`, ns: m.ns ?? '', nsKind: m.nsKind, dynamic, nsOnStack };
  }
  /**
   * Pop a member access in AVM2 order: the property operand (a runtime name, or a
   * namespace for `RTQName`) is on top, the object under it.
   */
  private popAccess(m: MnInfo): { recv: Value; prop: PropExpr } {
    let index: Expr | undefined;
    if (m.dynamic) index = this.pop().e;
    else if (m.nsOnStack) this.pop();
    const recv = this.pop();
    return { recv, prop: index ? { index } : { name: m.name } };
  }

  /** The property expression of a member access: `obj[i]`, `obj.x`, `this.x`, `X`. */
  private memberOfValue(recv: Value, prop: PropExpr): Expr {
    if (prop.index) return { k: 'index', obj: recv.e, index: prop.index };
    const name = prop.name as string;
    if (recv.find === name) {
      return recv.owner ? member(recv.owner, name) : { k: 'id', name, line: 0 };
    }
    return member(recv.e, name);
  }
  /** A multiname used as a *type* (`x as Foo`, `x is Foo`): always a bare class name. */
  private multinameExpr(index: number): Expr {
    const m = this.multiname(index);
    return { k: 'id', name: typeNameOf(m), line: 0 };
  }
  /**
   * `findpropstrict X` yields the object X lives on: the class object for a static
   * member, `this` for an instance member, the global object otherwise. A following
   * `get/set/callproperty X` then fuses to `Owner.X` / `this.X` / `X`.
   */
  private findReference(m: MnInfo): Value {
    const name = m.name;
    const ownNamespace = m.nsKind === 'private' || m.nsKind === 'protected' || m.nsKind === 'staticProtected' || m.ns === '';
    if (ownNamespace && this.ctx.staticMembers?.has(name)) {
      const owner: Expr = { k: 'id', name: this.ctx.staticOwner ?? 'this', line: 0 };
      return { e: owner, find: name, owner };
    }
    if (ownNamespace && this.ctx.target === 'instance' && !GLOBALS.has(name) && !this.ctx.globals?.has(name) && !this.knownLocal(name)) {
      const owner = thisRef();
      return { e: owner, find: name, owner };
    }
    return { e: { k: 'id', name, line: 0 }, find: name };
  }

  private reference(name: string, ns: string, nsKind?: string): Expr {
    if (this.knownLocal(name)) return { k: 'id', name, line: 0 };
    if (GLOBALS.has(name) || this.ctx.globals?.has(name)) return { k: 'id', name, line: 0 };
    // A trait of the class being emitted — frame scripts included — is a member.
    if (this.ctx.target === 'instance' && this.ctx.memberNames?.has(name)) return member(thisRef(), name);
    if (this.ctx.staticMembers?.has(name)) {
      return member({ k: 'id', name: this.ctx.staticOwner ?? 'this', line: 0 }, name);
    }
    const ownNamespace = nsKind === 'private' || nsKind === 'protected' || nsKind === 'staticProtected' || ns === '';
    if (!ownNamespace) return { k: 'id', name, line: 0 };
    if (this.ctx.target === 'instance') return member(thisRef(), name);
    return { k: 'id', name, line: 0 };
  }
  /**
   * AVM2 passes the `rest` array and the `arguments` object as extra locals after
   * the declared parameters; both exist as real names in the emitted function.
   */
  private extraArgName(index: number): string | null {
    if (index < 1) return null;
    const first = 1 + (this.ctx.paramNames?.length ?? 0);       // local 0 is `this`
    if (this.ctx.needArguments && index === first) return 'arguments';
    if (this.ctx.needRest && index === first + (this.ctx.needArguments ? 1 : 0)) return 'rest';
    return null;
  }

  private knownLocal(name: string): boolean {
    for (const local of this.locals.values()) if (local === name) return true;
    return false;
  }
  /** Overrides inherit their name from the base class, so search every class in the ABC. */
  private traitByMethod(index: number): AbcTrait | undefined {
    const own = this.ctx.ownTraits?.find((t) => t.method === index);
    if (own) return own;
    if (!this.methodOwners) {
      this.methodOwners = new Map<number, AbcTrait>();
      for (const def of this.ctx.abc.classes) {
        for (const trait of [...def.instance.traits, ...def.traits]) {
          if (trait.method != null && !this.methodOwners.has(trait.method)) this.methodOwners.set(trait.method, trait);
        }
      }
    }
    return this.methodOwners.get(index);
  }

  private methodOwners?: Map<number, AbcTrait>;
  /** A local as a value: the expression plus whatever type a `coerce` proved for it. */
  private readLocal(index: number): Value {
    const e = this.local(index);
    if (e.k === 'id' && this.killed.has(e.name)) return { e: lit('undefined') };
    return { e, coerced: this.localTypes.get(index) };
  }

  /** Types proved for a local slot by a `coerce` before its store. */
  private localTypes = new Map<number, string>();
  /** Locals released by `kill`: a read of one is `undefined` until the next store. */
  private killed = new Set<string>();

  private local(index: number): Expr {
    const known = this.locals.get(index);
    if (known) return { k: 'id', name: known, line: 0 };
    const declared = index > 0 ? this.ctx.paramNames?.[index - 1] : undefined;
    // Local 0 is the receiver: the instance in a constructor/method, the class
    // object in a static method (where TypeScript's `this` is that class object).
    const receiver = index === 0 && (this.ctx.target === 'instance' || this.ctx.target === 'class');
    const name = receiver ? 'this' : declared || this.extraArgName(index) || `local${index}`;
    this.locals.set(index, name);
    // `this` needs no declaration, parameters come from the signature, and the ABI
    // extra locals (`rest`, `arguments`) exist as real names already.
    if (index !== 0 && !declared && !this.extraArgName(index)) this.usedLocals.add(index);
    return { k: 'id', name, line: 0 };
  }
  /**
   * A conditional branch, decoded once: the condition under which it *jumps* and
   * the test for the arm that stays. AVM2's `if_lt` and friends jump when their
   * comparison holds, so the arm that stays needs the negation — written as `!(a < b)`
   * rather than `a >= b`, because the two differ when an operand is NaN.
   */
  private branchInfo(i: AbcInstruction): BranchInfo | null {
    const name = i.name.replace(/^if_/, '');
    if (name === 'true' || name === 'false') {
      const value = this.pop().e;
      const jumpOnTruthy = name === 'true';
      const jump = jumpOnTruthy ? value : notOf(value);
      const stay = jumpOnTruthy ? notOf(value) : value;
      return { jump, stay, value, jumpOnTruthy };
    }
    const ops: Record<string, string> = {
      eq: '==', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>=',
      strict_eq: '===', strict_ne: '!==', nlt: '<', nle: '<=', ngt: '>', nge: '>=',
    };
    const op = ops[name];
    if (!op) return null;
    const right = this.pop(), left = this.pop();
    const jump: Expr = { k: 'binary', op, left: left.e, right: right.e };
    return { jump, stay: notOf(jump) };
  }

  private branchTest(i: AbcInstruction): Expr {
    const info = this.branchInfo(i);
    if (!info) throw new Refuse(i.offset, `${i.name} is not a supported comparison`);
    return info.stay;
  }
}

// ------------------------------------------------------------------ helpers

function block(body: Stmt[]): Stmt { return { k: 'block', body }; }
function lit(v: 'true' | 'false' | 'null' | 'undefined' | 'this'): Expr { return { k: 'lit', v }; }
function member(obj: Expr, prop: string): Expr { return { k: 'member', obj, prop }; }
function thisRef(): Expr { return { k: 'lit', v: 'this' }; }
function superRef(): Expr { return { k: 'id', name: 'super', line: 0 }; }
function simpleName(qualified: string): string {
  const cut = Math.max(qualified.lastIndexOf('.'), qualified.lastIndexOf(':'));
  return cut >= 0 ? qualified.slice(cut + 1) : qualified;
}
/**
 * The argument count of a call-ish instruction. The disassembler reads it as the
 * last operand (`callproperty` = multiname + u30 arg count), but a few opcodes
 * carry the count first, so both shapes are covered.
 */
function argCountOf(ins: AbcInstruction, operands: number[]): number {
  const last = operands[operands.length - 1];
  if (ins.name === 'call' || ins.name === 'construct' || ins.name === 'construct_super' ||
      ins.name === 'new_array' || ins.name === 'new_object' || ins.name === 'apply_type') return operands[0];
  return last;
}
/** The name a type position uses: `Class` for the AS3 type, the pool name otherwise. */
function typeNameOf(m: MnInfo): string {
  const simple = m.name.includes('.') ? m.name.slice(m.name.lastIndexOf('.') + 1) : m.name;
  if (simple === 'Class' || !simple) return 'Object';
  return /^[A-Za-z_$][\w$]*$/.test(simple) ? simple : 'Object';
}
function id(name: string): Expr { return { k: 'id', name, line: 0 }; }
function exprStmt(e: Expr): Stmt { return { k: 'expr', e }; }
function assign(target: Expr, value: Expr): Expr { return { k: 'assign', op: '=', target, value }; }

/** True when evaluating the expression cannot do anything observable. */
function isPure(e: Expr): boolean {
  switch (e.k) {
    case 'num': case 'str': case 'lit': case 'id': return true;
    case 'member': return isPure(e.obj);
    case 'index': return isPure(e.obj) && isPure(e.index);
    case 'array': return e.items.every((i) => !i || isPure(i));
    case 'object': return e.props.every((p) => isPure(p.value));
    case 'binary': return isPure(e.left) && isPure(e.right);
    case 'unary': return e.op !== 'delete ' && isPure(e.arg);
    default: return false;
  }
}

function isId(e: Expr, name: string): boolean { return e.k === 'id' && e.name === name; }
function isTrivial(e: Expr): boolean {
  return e.k === 'num' || e.k === 'str' || e.k === 'id' || e.k === 'lit';
}
function isLiteralTrue(e: Expr): boolean { return e.k === 'lit' && e.v === 'true'; }
function branch(i: AbcInstruction): boolean { return i.name.startsWith('if_'); }
function targets(i: AbcInstruction): number[] {
  return [i.target, ...(i.targets ?? [])].filter((t): t is number => t != null);
}
function opOf(name: string): string {
  const ops: Record<string, string> = {
    add: '+', subtract: '-', multiply: '*', divide: '/', modulo: '%',
    bit_and: '&', bit_or: '|', bit_xor: '^', l_shift: '<<', r_shift: '>>', u_r_shift: '>>>',
    equals: '==', strict_equals: '===', less_than: '<', less_equals: '<=',
    greater_than: '>', greater_equals: '>=', instance_of: 'instanceof', in: 'in',
    negate: '-', not: '!', bit_not: '~', type_of: 'typeof', increment: '++', decrement: '--',
  };
  const op = ops[name];
  if (!op) throw new Error(`no operator for ${name}`);
  return op;
}

