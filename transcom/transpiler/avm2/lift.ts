// AVM2 (ABC bytecode) -> TypeScript statements, for the ActionScript 3 engine.
//
// This is the AVM2 counterpart of `transcom/transpiler/as2/avm1.ts`: the operand stack is
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
//   * Closures are real closures: an activation object is emitted as the object the
//     nested function reads its captured register from, `newfunction` lifts the
//     nested body inline, and the handler object of a `try` is the catch binding.
//   * Unsupported today, refused with their instruction name: `lookupswitch`
//     (indexed switch), `for each`/`for in` iteration state (`hasnext2`,
//     `nextname`, `nextvalue`) and `with` (`pushwith`). The corpus histogram in
//     the dev harness says how much of each is left.

import type { Expr, Stmt } from '../as2/ast';
import { disassemble, type AbcFile, type AbcInstruction, type AbcMethodBody, type AbcTrait } from '../../decompiler/swf/abc';
import { FLASH_DEFINITIONS } from '../../../src/engine/flash/packages';

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
  /** The superclass's simple name: `super.m(...)` and `super.m` read against it. */
  superOwner?: string;
  /**
   * Instance methods reachable from this class, inherited ones included. A method
   * read as a *value* is a closure bound to its receiver in AVM2, so knowing which
   * names are methods (and not fields) is what lets a read emit that binding.
   */
  instanceMethods?: Set<string>;
  /** Static methods of the enclosing class, same reasoning. */
  staticMethods?: Set<string>;
  /**
   * The enclosing script's traits by slot id. `getglobalscope; getslot N` is how a
   * Flex-compiled class reaches itself: N is the slot the script put the class (or
   * function) trait in, and the value is the class object.
   */
  scriptSlots?: Map<number, string>;
  /** Parameter names when the ABC carries them (usually it does not). */
  paramNames?: string[];
  /** The method takes `...rest`: its array arrives as an extra local after the parameters. */
  needRest?: boolean;
  /** The method uses `arguments`: that object arrives as an extra local after the parameters. */
  needArguments?: boolean;
  /** The register the compiler chose for a closure created at this method's site. */
  captureLocal?: number;
  /** The scope objects of the function this one is nested in, for `get_scope_object`. */
  enclosingScopes?: Expr[];
  /**
   * Variables of enclosing frames' activations a closure sees, source name → the
   * emitted variable. Activations lift to plain `var`s, so a JS closure captures
   * them lexically, the way AVM2's scope chain does.
   */
  captured?: Map<string, string>;
  /**
   * The instance a closure's enclosing *method* runs on. A closure's own `this` is
   * its call receiver, so names the scope chain finds on that instance go through an
   * alias the method declares (`var __self = this;`) when a closure used it.
   */
  outerSelf?: { name: string; used: boolean };
}

export class Refuse extends Error {
  constructor(readonly offset: number, message: string) { super(message); }
}

interface MnInfo { name: string; ns: string; nsKind?: string; dynamic: boolean; nsOnStack: boolean; nsSet?: string[] }

/** A conditional branch: the condition it jumps on, and the test for the arm that stays. */
/** A loop being lifted: its head, its exit, and (bottom-tested loops) its test. */
interface LoopFrame {
  head: number;
  exit: number;
  test?: number;
  /** A `for` loop's update: a jump here from the body is `continue`. */
  cont?: number;
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
  /** This value is the script's global object (`getglobalscope`), whose slots are its traits. */
  globals?: boolean;
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

/** Structural equality of two expressions: same code, whatever line it came from. */
function sameExpr(a: Expr, b: Expr): boolean {
  return JSON.stringify(a, (key, value) => (key === 'line' ? undefined : value))
    === JSON.stringify(b, (key, value) => (key === 'line' ? undefined : value));
}

/** Is `cond` the exact negation of `value`? (`!(x)`, or `a != b` of `a == b`.) */
function isNegationOf(cond: Expr, value: Expr): boolean {
  if (cond.k === 'unary' && cond.op === '!') return sameExpr(cond.arg, value);
  const inverse: Record<string, string> = { '==': '!=', '!=': '==', '===': '!==', '!==': '===' };
  return cond.k === 'binary' && value.k === 'binary'
    && inverse[cond.op] === value.op
    && sameExpr(cond.left, value.left) && sameExpr(cond.right, value.right);
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

const RESERVED_PARAM = new Set(('this arguments rest super class function var let const return new delete default if else ' +
  'while do for in of instanceof typeof void switch case break continue throw try catch finally with import export ' +
  'extends implements interface package private public protected static yield await enum null true false undefined ' +
  'eval NaN Infinity debugger').split(' '));

/**
 * The parameter names a method's body and signature use. `HAS_PARAM_NAMES` is debug
 * information only — the VM never reads it — and compilers fill it unreliably:
 * Flex SDK output repeats one name for every parameter (`easeIn(b, b, b, b, …)`) or
 * writes a keyword (`localToGlobal(void)`). The declared set is used when it is a
 * set of distinct, usable identifiers; otherwise every parameter is `paramN`, so a
 * signature never mixes the two schemes.
 */
export function parameterNames(info: { paramTypes: string[]; paramNames?: string[] } | undefined): string[] {
  if (!info) return [];
  const fallback = info.paramTypes.map((_, k) => `param${k + 1}`);
  const declared = info.paramNames ?? [];
  if (declared.length !== info.paramTypes.length) return fallback;
  const usable = declared.every((name) => /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED_PARAM.has(name) &&
    !/^(local|param)\d+$/.test(name) && !name.startsWith('__'));
  return usable && new Set(declared).size === declared.length ? [...declared] : fallback;
}

export function liftMethod(ctx: MethodContext): LiftResult {
  const { body } = ctx;
  const dis = disassemble(body.code);
  if (!dis.complete) {
    return { stmts: null, diagnostics: [{ offset: 0, message: `body does not disassemble: ${dis.errors.join('; ')}` }] };
  }
  try {
    const canonical = absorbMarkers(dis.instructions, body.exceptions);
    const l = new Lifter({ ...ctx, body: { ...body, exceptions: canonical.exceptions } }, canonical.instructions);
    return { stmts: l.run(), diagnostics: [] };
  } catch (e) {
    if (e instanceof Refuse) return { stmts: null, diagnostics: [{ offset: e.offset, message: e.message }] };
    throw e;
  }
}

/**
 * `label` (and `nop`) do nothing, so a branch onto one and a branch past it go to
 * the same place. A bottom-tested loop may be entered just past its `label` while
 * its latch jumps onto the `label` (`jump L+1; L: label; body; iftrue L`); taken
 * literally that is a loop with two entries. Each run of markers is absorbed into the instruction
 * after it — which takes the run's offset — so every way of reaching it (a branch
 * to the marker, a branch past it, falling into it, a switch's end, a protected
 * range) names one offset. A `jump` to the instruction after it is a marker too.
 */
function absorbMarkers(instructions: AbcInstruction[], exceptions: AbcMethodBody['exceptions']): {
  instructions: AbcInstruction[]; exceptions: AbcMethodBody['exceptions'];
} {
  const isMarker = (ins: AbcInstruction) => ins.name === 'label' || ins.name === 'nop';
  // A run in front of a `try` or a handler stays as it is: the protected range
  // starts exactly where it says, and a loop head in front of it stays apart.
  const pinned = new Set((exceptions ?? []).flatMap((ex) => [ex.from, ex.target]));
  /** Each absorbable run's first marker, by the offset of the instruction after it. */
  const runsOf = (list: AbcInstruction[]) => {
    const runOf = new Map<number, number>();   // marker or real offset -> the run's start
    for (let k = 0; k < list.length; k++) {
      if (!isMarker(list[k]) || k === list.length - 1) continue;
      let j = k;
      while (j < list.length - 1 && isMarker(list[j])) j++;
      if (!pinned.has(list[j].offset)) for (let m = k; m <= j; m++) runOf.set(list[m].offset, list[k].offset);
      k = j;
    }
    return runOf;
  };
  // A `jump` to the instruction after it (markers aside) is a marker itself.
  const first = runsOf(instructions);
  const realOf = (list: AbcInstruction[], runOf: Map<number, number>) => {
    const real = new Map<number, number>();
    for (let k = list.length - 1, next = -1; k >= 0; k--) {
      if (!runOf.has(list[k].offset) || !isMarker(list[k]) || next < 0) next = list[k].offset;
      real.set(list[k].offset, next);
    }
    return (to: number) => real.get(to) ?? to;
  };
  const before = realOf(instructions, first);
  const marked = instructions.map((ins) => (ins.name === 'jump' && ins.target != null
    && before(ins.target) === before(ins.offset + ins.size) ? { ...ins, name: 'nop', target: undefined } : ins));
  const runOf = runsOf(marked);
  const out: AbcInstruction[] = [];
  for (const ins of marked) {
    const start = runOf.get(ins.offset);
    if (start == null) { out.push(ins); continue; }
    if (isMarker(ins)) continue;
    out.push({ ...ins, offset: start, size: ins.offset + ins.size - start });
  }
  const at = (to: number) => runOf.get(to) ?? to;
  return {
    instructions: out.map((ins) => (ins.target == null && !ins.targets ? ins : {
      ...ins,
      ...(ins.target != null ? { target: at(ins.target) } : {}),
      ...(ins.targets ? { targets: ins.targets.map(at) } : {}),
    })),
    exceptions: exceptions?.map((ex) => ({ ...ex, from: at(ex.from), to: at(ex.to), target: at(ex.target) })),
  };
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

  /** The scope objects `get_scope_object` indexes into; 0 is the enclosing traits. */
  private scopeObjects: Expr[] = [];
  /** Which entries of `scopeObjects` are `with` scopes (`pushwith`), parallel to it. */
  private withFlags: boolean[] = [];
  private withs = 0;
  /** Activation objects this body made: their slots are fields of that object. */
  private activationNames = new Set<string>();
  private activations = 0;
  /** This frame's activation slots as variables: slot id → emitted name. */
  private activationVars = new Map<number, string>();
  /** Source name → emitted name for this frame's activation variables. */
  private activationByName = new Map<string, string>();
  /** The alias of `this` closures created here use, shared down the closure tree. */
  private selfAlias: { name: string; used: boolean } | null = null;
  /** The catch variable of the handler being lifted, so `newcatch` names it. */
  private catchParam: string | null = null;
  /**
   * Catch scopes (`newcatch`) and the locals that hold one → the catch variable
   * that is their only slot. Like an activation, the scope is no value of its own.
   */
  private catchScopes = new Map<string, string>();
  private catches = 0;
  /** The cursor register of the `hasnext2` this body's loop test uses. */
  private lastIterCursor: number | null = null;
  private byOffset = new Map<number, AbcInstruction>();
  private slotTraits?: Map<number, AbcTrait>;

  /** The next instruction after each offset: a zero-size `label` has no size to add. */
  private nextAt = new Map<number, number>();

  constructor(private ctx: MethodContext, instructions: AbcInstruction[]) {
    this.byOffset = new Map(instructions.map((i) => [i.offset, i]));
    for (let k = 0; k + 1 < instructions.length; k++) this.nextAt.set(instructions[k].offset, instructions[k + 1].offset);
    // `getscopeobject n` indexes the *local* scope stack of this frame (AVM2 overview,
    // `getscopeobject`: "the index of the scope object to retrieve from the local scope
    // stack"). It starts empty in
    // every frame — a method's `getlocal0; pushscope` makes `this` index 0, and its
    // activation index 1. The closure's captured chain is the *outer* scope, reached by
    // name or `getouterscope`, never by these indices.
    this.scopeObjects = [];
    // An exception table makes its protected ranges `try` blocks: those boundaries
    // are leaders even when no branch lands on them.
    for (const ex of ctx.body.exceptions ?? []) this.leaders.add(ex.from);
    // Only an instruction start can begin a block. A jump target that lands in the
    // middle of an instruction or past the end of the body (dead code in several
    // uploaded movies) is not one, and a branch to it is refused rather than
    // silently attaching its instructions to the wrong block.
    const starts = new Set(instructions.map((i) => i.offset));
    for (const i of instructions) this.blocks.set(i.offset, []);
    this.leaders.add(0);
    for (const ex of ctx.body.exceptions ?? []) this.leaders.add(ex.target);
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
    // The activation's slots are this frame's captured variables, with AVM2's
    // per-type defaults until the code assigns them.
    const params = new Set(this.ctx.paramNames ?? []);
    for (const trait of this.ctx.body.traits ?? []) {
      const name = trait.slotId != null ? this.activationVars.get(trait.slotId) : undefined;
      if (!name || params.has(name)) continue;
      decls.push({ k: 'var', decls: [{ name, type: null, init: slotDefaultExpr(trait.type) }] });
    }
    if (this.selfAlias?.used) decls.unshift({ k: 'var', decls: [{ name: this.selfAlias.name, type: null, init: thisRef() }] });
    return [...decls, ...this.out];
  }

  private usedLocals = new Set<number>();

  /** The innermost scope object — a catch object the code is writing a slot on. */
  private scopeValue(): Value {
    const scope = this.scopeObjects[this.scopeObjects.length - 1];
    if (!scope) throw new Refuse(this.pc, 'no scope object for a slot access');
    return { e: scope };
  }

  /**
   * The property a slot index means. A slot of `this` is the trait declared at that
   * index; a slot of an activation or catch object is a field of that object, and
   * the closure that reads it names the same field.
   */
  private slotProp(index: number, recv: Expr): string {
    const self = recv.k === 'id' && (recv.name === 'this' || recv.name === this.ctx.staticOwner);
    if (!self) return `slot${index}`;
    const trait = this.slotTrait(index);
    if (!trait) throw new Refuse(this.pc, `slot ${index} has no trait in ${this.ctx.staticOwner ?? 'this class'}`);
    return simpleName(trait.name);
  }

  /**
   * The trait that declares a slot index. Slots are numbered by the class that
   * declares them and inherited, so a `this.slot` read in a subclass is found by
   * walking up to the class that introduced it.
   */
  private slotTrait(index: number): AbcTrait | undefined {
    if (!this.slotTraits) {
      this.slotTraits = new Map();
      const byName = new Map(this.ctx.abc.classes.map((c) => [c.instance.name, c]));
      let cls = [...byName.values()].find((c) => simpleName(c.instance.name) === this.ctx.staticOwner);
      const seen = new Set<string>();
      for (let depth = 0; cls && depth < 32; depth++) {
        for (const trait of [...cls.instance.traits, ...cls.traits]) {
          if (trait.slotId == null || trait.name === 'slot') continue;
          if (!this.slotTraits.has(trait.slotId)) this.slotTraits.set(trait.slotId, trait);
        }
        const superName = cls.instance.superName;
        if (!superName || seen.has(superName)) break;
        seen.add(superName);
        cls = byName.get(superName);
      }
      // A slot reached through an interface (or a class the file only mentions) is
      // still one slot among all of them; first declaration wins.
      for (const c of byName.values()) for (const trait of [...c.instance.traits, ...c.traits]) {
        if (trait.slotId == null || trait.name === 'slot') continue;
        if (!this.slotTraits.has(trait.slotId)) this.slotTraits.set(trait.slotId, trait);
      }
    }
    return this.slotTraits.get(index);
  }

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
  private emitRegion(entry: number, stop: number | null, enter = true, shared?: number[]): RegionEnd {
    const mine: number[] = shared ?? [];
    try {
      return this.emitRegionInner(entry, stop, mine, enter);
    } finally {
      // A nested region (a try and its handler) leaves its offsets to the region
      // that owns them, so `active` is emptied exactly once per entry.
      if (!shared) for (const offset of mine) this.active.delete(offset);
    }
  }

  private emitRegionInner(entry: number, stop: number | null, mine: number[], enter: boolean): RegionEnd {
    let cur: number | null = entry;
    let first = true;
    while (cur != null) {
      if (stop != null && cur === stop) return { kind: 'stop' };
      // The end of the code: ASC's switch layout jumps there from after its last case
      // (`jump END` behind a case that returns) when nothing follows the switch. The
      // verifier rejects falling off the code, so no path arriving here is live.
      if (cur === this.ctx.body.code.length) return { kind: 'end' };
      // A protected range is a `try`: its handler runs on the same stack, and both
      // sides merge where the try's closing jump goes.
      // `enter === false` means this region *is* a protected body: its handler was
      // already picked up by the caller, and must not be entered again here.
      const handler = enter || !first
        ? this.ctx.body.exceptions?.find((ex) => ex.from === cur && ex.to > cur && this.byOffset.has(ex.target))
        : null;
      if (handler) {
        const end = this.emitTry(handler, mine);
        // A `try` whose both sides land exactly on this region's stop *is* this
        // region reaching its stop — the caller must be able to tell.
        return end.kind === 'jump' && stop != null && end.target === stop ? { kind: 'stop' } : end;
      }
      if (!this.active.has(cur)) {
        const loop = this.tryDoWhile(cur);
        if (loop) {
          first = false;
          if (loop.next == null) return loop.end;
          if (stop != null && loop.next > stop) return { kind: 'jump', target: loop.next };
          cur = loop.next;
          continue;
        }
      }
      if (this.active.has(cur)) {
        if (first && !enter) { first = false; }
        else throw new Refuse(cur, `control flow re-enters a region still being lifted (irreducible: ${cur} in [${[...this.active].join(',')}])`);
      } else {
        this.active.add(cur);
        mine.push(cur);
      }
      first = false;
      const block = this.blocks.get(cur);
      if (!block || !block.length) throw new Refuse(cur, 'jump leaves the method body');
      const last = block[block.length - 1];
      this.enterScopes(cur);
      this.blockMark = { at: cur, out: this.out.length, stack: this.stack.length };
      this.pc = last.offset + last.size;
      for (const i of block) {
        if (i === last && (branch(i) || i.name === 'jump' || i.name === 'lookup_switch' || TERMINATORS.has(i.name))) continue;

        this.pc = i.offset;
        this.step(i);
      }
      // Every successor starts with the scope stack this block leaves, whichever
      // order the lifter visits them in.
      const falls = !(last.name === 'jump' || last.name === 'lookup_switch' || TERMINATORS.has(last.name));
      for (const next of [...targets(last), ...(falls ? [last.offset + last.size] : [])]) this.recordScopes(next);
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

  /**
   * The scope stack at a block's entry. The verifier requires the same scope depth on
   * every path into an instruction, so it is a property of the offset — but the
   * lifter visits blocks in construct order, not flow order: the then arm may run
   * through the merge's `popscope` before the else arm is lifted. The state each
   * control transfer carries is recorded for its targets and restored on entry.
   */
  private scopesAt = new Map<number, { objects: Expr[]; withFlags: boolean[] }>();

  private recordScopes(offset: number, objects = this.scopeObjects, withFlags = this.withFlags) {
    if (!this.scopesAt.has(offset)) this.scopesAt.set(offset, { objects: [...objects], withFlags: [...withFlags] });
  }

  private enterScopes(offset: number) {
    const known = this.scopesAt.get(offset);
    if (!known) { this.recordScopes(offset); return; }
    this.scopeObjects = [...known.objects];
    this.withFlags = [...known.withFlags];
  }

  /** Where the block being lifted started, and what it found: a pure condition block emits nothing. */
  private blockMark: { at: number; out: number; stack: number } | null = null;

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
    if (last.name === 'lookup_switch') return this.emitLookupSwitch(last);
    if (last.name === 'jump') {
      const target = last.target as number;
      {
        // a `continue` from inside the loop's body: the branch to the test is the edge
        const frame = this.loops[this.loops.length - 1];
        if (frame && (frame.test === target || frame.cont === target)) {
          this.out.push({ k: 'continue', label: null });
          return { done: true, end: { kind: 'stop' }, next: null };
        }
        // A jump straight out of the loop (or back to its head) is that loop's
        // `break` / `continue`, even when it happens inside a `try` — the trip out
        // belongs to the statement, not to the region the `try` is lifted from.
        if (frame && (target === frame.exit || target === frame.head) && target !== stop) {
          this.out.push({ k: target === frame.exit ? 'break' : 'continue', label: null });
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
      const head = this.whileHead(last, target, fallThrough);
      if (head != null) {
        const cond = this.branchTest(last);
        this.loops.push({ head, exit: target });
        const arm = this.emitArm(fallThrough, target);
        this.loops.pop();
        if (arm.end.kind === 'jump') throw new Refuse(last.offset, 'loop body jumps past the loop');
        if (arm.end.kind === 'backEdge' && arm.end.target !== head) throw new Refuse(last.offset, 'loop body jumps to another loop head');
        // The trip back to the head that ends the body is the loop itself.
        const tail = arm.stmts[arm.stmts.length - 1];
        if (tail?.k === 'continue' && !tail.label) arm.stmts.pop();
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
      let thenArm = this.emitArm(fallThrough, target);
      // The then arm cannot merge *inside itself*: a jump that lands within
      // [fallThrough, target) is still the arm — the compiler's trampoline after a
      // `try` (its closing jump lands on another jump), or the jump over a switch's
      // case bodies to its dispatch. Lifting continues there.
      for (let guard = 0; guard < 8; guard++) {
        if (thenArm.end.kind !== 'jump' || thenArm.end.target <= fallThrough || thenArm.end.target >= target) break;
        const more = this.emitArm(thenArm.end.target, target);
        thenArm = { stmts: [...thenArm.stmts, ...more.stmts], end: more.end };
      }
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
      const elseArm = this.emitArmTo(target, merge);
      if (elseArm.end.kind !== 'stop' && elseArm.end.kind !== 'end' && elseArm.end.kind !== 'jump') {
        throw new Refuse(last.offset, 'if/else arms end at different merges');
      }
      const thenVals = thenStack.slice(base.length);
      const elseVals = this.stack.slice(base.length);
      this.stack = [...base];
      if (thenVals.length || elseVals.length) {
        // Both paths must produce the same single value: that is the compiler's `?:`.
        if (thenVals.length !== 1 || elseVals.length !== 1 || elseArm.end.kind !== 'stop') {
          throw new Refuse(last.offset, `if/else arms leave different numbers of values (then=${thenVals.map((v) => v.e.k).join(',')} else=${elseVals.map((v) => v.e.k).join(',')} thenEnd=${thenArm.end.kind} elseEnd=${elseArm.end.kind})`);
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
    // plain block: fall through. A zero-size `label` — every loop head carries one —
    // is not code of its own: the region continues at the next instruction, or it
    // would re-enter itself at the same offset.
    const next = last.size ? last.offset + last.size : (this.nextAt.get(last.offset) ?? last.offset + last.size);
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
   *     37: …body…         ; and the latch, for a `for`
   *     78: …test…; if_lt 37   ; test: back into the body while true
   *     84: …             ; exit
   *
   * Lifting it as a real loop keeps the body's statements reachable *once*, instead
   * of leaving a region that starts at the test and jumps backwards into code the
   * entry already covered. The test itself is a region of its own (see
   * `foldTestRegion`) because ASC writes a compound condition as several blocks.
   */
  private tryPreTestedWhile(jump: AbcInstruction, target: number): { done: boolean; end: RegionEnd; next: number | null } | null {
    if (target <= jump.offset) return null;
    // A loop is *recognised* speculatively here: the condition region is walked
    // before we know it is one. Whatever the walk did has to be undone if it turns
    // out not to be — the instructions it read belong to the region that follows.
    const snap = this.snapshot();
    let lifted: { done: boolean; end: RegionEnd; next: number | null } | null = null;
    try {
      lifted = this.liftPreTestedWhile(jump, target);
    } catch (e) {
      if (!(e instanceof Refuse)) throw e;
      lifted = null;
    }
    if (!lifted) this.restore(snap);
    return lifted;
  }

  private liftPreTestedWhile(jump: AbcInstruction, target: number): { done: boolean; end: RegionEnd; next: number | null } | null {
    {
      // `while (true)`: the entry jumps to the bottom, and the bottom is an
      // unconditional jump back into the body — the loop's only exits are `break`s,
      // which land on the instruction after the latch.
      const latch = this.blocks.get(target)?.at(-1);
      if (latch?.name === 'jump') {
        const head = latch.target as number;
        if (head <= jump.offset || head >= target) return null;
        const exit = latch.offset + latch.size;
        if (exit <= target) return null;
        const frame: LoopFrame = { head, exit, test: target };
        this.loops.push(frame);
        const arm = this.emitArmTo(head, target);
        this.loops.pop();
        if (arm.end.kind !== 'stop' && arm.end.kind !== 'end') throw new Refuse(jump.offset, 'an endless loop leaves through an unexpected edge');
        this.out.push({ k: 'while', test: lit('true'), body: block(arm.stmts) });
        return { done: false, end: { kind: 'stop' }, next: exit };
      }
      const test = this.foldTestRegion(target);
      if (!test) return null;
      const head = test.decide.target as number;
      if (head <= jump.offset || head >= target) return null;       // the test must jump back into the body
      const exit = test.decide.offset + test.decide.size;
      if (exit <= target) return null;
      // A `for-in` compiles to the same shape with `hasnext2` as the test: its cursor
      // register is what the body's `nextname`/`nextvalue` reads.
      for (const i of test.insns) if (i.name === 'has_next2' && i.operands.length >= 2) this.lastIterCursor = i.operands[1];
      // The test consumed its own operands, so the body starts on the stack the
      // test started on — which is where the loop head is entered from.
      const info = this.branchInfo(test.decide);
      if (!info) throw new Refuse(test.decide.offset, `${test.decide.name} is not a supported loop test`);
      const cont = this.forUpdate(head, target);
      if (cont != null) {
        const lifted = this.tryForLoop(head, exit, target, cont, info.jump);
        if (lifted) return lifted;
      }
      const frame: LoopFrame = { head, exit, test: target };
      this.loops.push(frame);
      const arm = this.emitArmTo(head, target);
      this.loops.pop();
      if (arm.end.kind !== 'stop' && arm.end.kind !== 'end') throw new Refuse(jump.offset, `loop body leaves through an unexpected edge (${JSON.stringify(arm.end)})`);
      this.out.push({ k: 'while', test: info.jump, body: block(arm.stmts) });
      return { done: false, end: { kind: 'stop' }, next: exit };
    }
  }

  /**
   * `do { body } while (test)`: the head is reached by falling into it, and a
   * conditional branch further down jumps back to it — the loop's latch. The test is the latch's
   * own block (folded with the blocks a compound condition spans); a jump there
   * from the body is `continue`, which in a `do` evaluates the test, exactly as the
   * bytecode does. Speculative: anything else is rolled back.
   */
  private tryDoWhile(head: number): { done: boolean; end: RegionEnd; next: number | null } | null {
    if (this.loops.some((f) => f.head === head)) return null;
    let latch: AbcInstruction | null = null;
    for (const [at, block] of this.blocks) {
      const last = block.at(-1);
      if (at < head || !last || !branch(last) || last.target !== head) continue;
      if (!latch || last.offset > latch.offset) latch = last;
    }
    if (!latch || this.stack.length) return null;
    const exit = latch.offset + latch.size;
    // Only the latch may go back to the head: a jump there skips the test, and that
    // is no `continue`.
    for (const [at, block] of this.blocks) {
      const last = block.at(-1);
      if (at < head || at >= exit || !last || last === latch) continue;
      if (targets(last).includes(head)) return null;
    }
    const snap = this.snapshot();
    try {
      for (const testStart of this.latchStarts(head, latch)) {
        const frame: LoopFrame = { head, exit, test: testStart };
        this.loops.push(frame);
        let arm: { stmts: Stmt[]; end: RegionEnd } = { stmts: [], end: { kind: 'stop' } };
        try {
          // A test that starts at the head: the body is empty (`while (busy) {}`).
          if (testStart !== head) arm = this.emitArmTo(head, testStart);
        } catch (e) {
          if (!(e instanceof Refuse)) throw e;
          this.restore(snap);
          continue;
        } finally {
          this.loops.pop();
        }
        if (arm.end.kind !== 'stop' && arm.end.kind !== 'end') { this.restore(snap); continue; }
        const saved = this.out;
        const testStmts: Stmt[] = [];
        this.out = testStmts;
        let test: ReturnType<Lifter['foldTestRegion']> = null;
        try {
          test = this.foldTestRegion(testStart);
        } finally {
          this.out = saved;
        }
        if (!test || test.decide !== latch) { this.restore(snap); continue; }
        const info = this.branchInfo(latch);
        if (!info || this.stack.length) { this.restore(snap); continue; }
        // What the test runs before deciding (`i--` in `while (i-- > 0)`) is part of
        // the condition — `while ((t = i, i = i - 1, t > 0))` — so a `continue`
        // runs it too.
        // A temp the test takes (`var __h = i`) is declared before the loop.
        const effects: Expr[] = [];
        const declared: Stmt[] = [];
        let plain = true;
        for (const st of testStmts) {
          if (st.k === 'expr') effects.push(st.e);
          else if (st.k === 'var' && st.decls.length === 1 && st.decls[0].init) {
            declared.push({ k: 'var', decls: [{ ...st.decls[0], init: null }] });
            effects.push(assign(id(st.decls[0].name), st.decls[0].init));
          } else plain = false;
        }
        if (!plain) { this.restore(snap); continue; }
        const cond: Expr = effects.length ? { k: 'seq', items: [...effects, info.jump] } : info.jump;
        this.out.push(...declared, { k: 'dowhile', body: block(arm.stmts), test: cond });
        return { done: false, end: { kind: 'stop' }, next: exit };
      }
    } catch (e) {
      if (!(e instanceof Refuse)) throw e;
    }
    this.restore(snap);
    return null;
  }

  /** Where a latch's test may start: its own block, then earlier blocks that fall or branch forward into it. */
  private latchStarts(head: number, latch: AbcInstruction): number[] {
    const starts: number[] = [];
    let at = this.blockStart(latch.offset);
    if (at === head) return [head];
    for (let guard = 0; guard < 6 && at > head; guard++) {
      starts.push(at);
      const before = this.blockStart(at - 1);
      const last = this.blocks.get(before)?.at(-1);
      if (!last || last.name === 'jump' || TERMINATORS.has(last.name) || last.name === 'lookup_switch') break;
      if (branch(last) && ((last.target as number) <= at || (last.target as number) > latch.offset + latch.size)) break;
      at = before;
    }
    return starts;
  }

  /**
   * A `for` loop's update block: straight-line code that runs into the test, and
   * that the body jumps to — that jump is the `continue` of a `for (…; …; update)`,
   * which must run the update before testing again. Null when no jump goes there.
   */
  private forUpdate(head: number, test: number): number | null {
    let best: number | null = null;
    for (const [at, block] of this.blocks) {
      if (at < head || at >= test || !block.length) continue;
      const last = block[block.length - 1];
      if (last.name !== 'jump') continue;
      const to = last.target as number;
      if (to <= at || to >= test || (best != null && to >= best)) continue;
      if (this.straightTo(to, test)) best = to;
    }
    return best;
  }

  /** Does [from, to) run straight into `to` — no branch, jump or exit on the way? */
  private straightTo(from: number, to: number): boolean {
    let at = from;
    for (let guard = 0; guard < 64 && at < to; guard++) {
      const block = this.blocks.get(at);
      if (!block?.length) return false;
      const last = block[block.length - 1];
      if (branch(last) || last.name === 'jump' || last.name === 'lookup_switch' || TERMINATORS.has(last.name)) return false;
      at = last.offset + last.size;
    }
    return at === to;
  }

  /** `for (; test; update) { body }`, speculatively: the update must lift to expressions. */
  private tryForLoop(head: number, exit: number, test: number, cont: number, cond: Expr): { done: boolean; end: RegionEnd; next: number | null } | null {
    const snap = this.snapshot();
    try {
      const frame: LoopFrame = { head, exit, test, cont };
      this.loops.push(frame);
      const body = this.emitArmTo(head, cont);
      if (body.end.kind !== 'stop' && body.end.kind !== 'end') throw new Refuse(head, 'for body');
      const update = this.emitArm(cont, test);
      this.loops.pop();
      if (update.end.kind !== 'stop' || !update.stmts.every((st) => st.k === 'expr')) throw new Refuse(cont, 'for update');
      const items = update.stmts.map((st) => (st as { e: Expr }).e);
      this.out.push({
        k: 'for', init: null, test: cond,
        update: items.length === 0 ? null : items.length === 1 ? items[0] : { k: 'seq', items },
        body: block(body.stmts),
      });
      return { done: false, end: { kind: 'stop' }, next: exit };
    } catch (e) {
      if (!(e instanceof Refuse)) throw e;
      this.restore(snap);
      return null;
    }
  }

  /**
   * The region that computes a loop's condition, folded into one expression.
   *
   * The entry jump of a pre-tested loop lands on the test, and the test is *not*
   * one basic block: ASC writes a boolean condition as a chain of
   * `dup / if_* / pop` diamonds — `a && (b || c)` is a diamond per operand — whose
   * arms converge on the branch that decides the loop (with shared tails between
   * them, like the `not` of `!(a && b)`). The value that reaches the deciding
   * branch is the phi of those arms, and each arm's branch condition selects its
   * value, so the phi is expressible:
   *
   *     c ? c : b   is exactly   c || b        (AS3's `||` returns the left operand)
   *    !c ? c : b   is exactly   c && b        (… and `&&` returns the false one)
   *
   * which is what makes the folded condition print as the source's `&&`/`||` rather
   * than a nest of `?:`. Returns the deciding branch, its value, and the
   * instructions the region ran (so the caller can see its `hasnext2`), or null if
   * the region is not one of these chains.
   */
  private foldTestRegion(entry: number, max = 512): { decide: AbcInstruction; value: Expr; insns: AbcInstruction[] } | null {
    const base = this.stack.length;
    const arrivals = new Map<number, { value: Expr; cond: Expr }[]>();
    const insns: AbcInstruction[] = [];
    const bail = () => {
      while (this.stack.length > base) this.stack.pop();
      return null;
    };
    let cur: number | null = entry;
    let decide: AbcInstruction | null = null;
    while (cur != null && insns.length <= max) {
      const block = this.blocks.get(cur);
      if (!block?.length) break;
      const merged = arrivals.get(cur);
      if (merged) {
        arrivals.delete(cur);
        const top = this.stack[this.stack.length - 1];
        if (!top) return bail();
        let value = top.e;
        for (const arm of [...merged].reverse()) {
          const joined = joinValue(arm.cond, arm.value, value);
          if (!joined) return bail();
          value = joined;
        }
        this.stack[this.stack.length - 1] = { e: value };
      }
      const last = block[block.length - 1];
      for (const i of block) {
        if (i === last && (branch(i) || i.name === 'jump' || i.name === 'lookup_switch' || TERMINATORS.has(i.name))) continue;
        this.pc = i.offset;
        insns.push(i);
        const mark = this.out.length;
        this.step(i);
        // A `pop` of a `dup` copy: the branch kept the other copy, so the value's
        // evaluation is already in the condition — emitting it again as a statement
        // would run its side effects twice.
        if (this.out.length > mark) {
          const added = this.out.splice(mark);
          for (const st of added) {
            // The value is still live if it is on the stack *or* if an arm already
            // jumped away carrying it (an arrival recorded below) — either way its
            // evaluation is in the condition, and repeating it would repeat its
            // side effects.
            const live = st.k === 'expr' && (this.stack.some((v) => sameExpr(v.e, st.e))
              || [...arrivals.values()].some((list) => list.some((a) => sameExpr(a.value, st.e) || sameExpr(a.cond, st.e))));
            if (live) continue;
            this.out.push(st);
          }
        }
      }
      this.pc = last.offset;
      if (!branch(last)) {
        // A condition is written across as many blocks as it has operands; a block
        // that simply falls through is still part of it. Anything else (a jump, a
        // return) ends the region without deciding anything.
        if (last.name === 'jump' || i_is_control(last)) break;
        const next = last.size ? last.offset + last.size : (this.nextAt.get(last.offset) ?? last.offset + last.size);
        if (next > last.offset && this.blocks.get(next)?.length) { cur = next; continue; }
        break;
      }
      const to = last.target as number;
      if (to <= entry) { decide = last; break; }                    // it decides the loop
      if (to <= last.offset) break;                                 // backwards inside the region: not a chain
      const info = this.branchInfo(last);
      if (!info) break;
      const list = arrivals.get(to) ?? [];
      list.push({ value: info.value ?? info.jump, cond: info.jump });
      arrivals.set(to, list);
      cur = last.offset + last.size;
      continue;
    }
    if (!decide || arrivals.size) return bail();
    const value = this.stack[this.stack.length - 1]?.e;
    if (value == null) return bail();
    return { decide, value, insns };
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
    if (info.value == null) return null;
    const left = this.stack[0];
    // The arm runs when the branch does *not* jump: `if_false` falls through on a
    // truthy `a` (`a && b`), `if_true` on a falsy one (`a || b`).
    const op = info.jumpOnTruthy ? '||' : '&&';
    const mark = this.out.length;
    const leftName = `__v${this.temps++}`;
    const joinName = `__j${this.temps++}`;
    this.out.push({ k: 'var', decls: [{ name: leftName, type: null, init: left.e }] });
    this.out.push({ k: 'var', decls: [{ name: joinName, type: null, init: null }] });

    // The copy the arm's leading `pop` discards is `a` itself, already evaluated:
    // the arm sees the temp, so dropping it runs nothing a second time.
    this.stack = [{ ...left, e: id(leftName) }];
    const arm = this.emitArm(fallThrough, target);
    if (arm.end.kind !== 'stop' || this.stack.length !== 1) {
      throw new Refuse(last.offset, `short-circuit join does not produce a single value (end=${arm.end.kind} stack=${this.stack.length})`);
    }
    const right = this.stack[this.stack.length - 1];
    if (!arm.stmts.length) {
      // Nothing but the right operand's value: the join is the expression itself.
      this.out.splice(mark);
      this.stack = [{ e: { k: 'binary', op, left: left.e, right: right.e } }];
      return { next: target };
    }
    // `a` is evaluated once, into `__v`; the arm (with its statements) runs only on
    // the path that needs `b`.
    const runsArm: Expr = info.jumpOnTruthy ? notOf(id(leftName)) : id(leftName);
    this.out.push({
      k: 'if',
      test: runsArm,
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
    scopes: Expr[];
    withFlags: boolean[];
    scopesAt: Map<number, { objects: Expr[]; withFlags: boolean[] }>;
  } {
    return {
      stack: [...this.stack], locals: new Map(this.locals), types: new Map(this.localTypes),
      killed: new Set(this.killed), active: new Set(this.active), temps: this.temps,
      used: new Set(this.usedLocals), loops: [...this.loops], out: this.out.length, pc: this.pc,
      scopes: [...this.scopeObjects], withFlags: [...this.withFlags], scopesAt: new Map(this.scopesAt),
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
    this.scopeObjects = snap.scopes;
    this.withFlags = snap.withFlags;
    this.scopesAt = snap.scopesAt;
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
  private emitArm(entry: number, stop: number | null, opts?: { enter?: boolean; shared?: number[] }): { stmts: Stmt[]; end: RegionEnd } {
    const saved = this.out;
    const stmts: Stmt[] = [];
    this.out = stmts;
    try {
      return { stmts, end: this.emitRegion(entry, stop, opts?.enter ?? true, opts?.shared) };
    } finally {
      this.out = saved;
    }
  }

  /**
   * A protected range and its handler: `try { … } catch (e) { … }`.
   *
   * The try body and the handler run on the same operand stack, and both leave
   * through the same merge — the target of the jump the try body closes with. A
   * `finally` block is the same shape with the catch variable unused (the
   * compiler's `newcatch` object carries the payload).
   */
  private emitTry(ex: { from: number; to: number; target: number; type: string }, mine: number[]): RegionEnd {
    this.pc = ex.from;
    const base = [...this.stack];
    const scopes = [...this.scopeObjects], withFlags = [...this.withFlags];
    // `from` is already on the active list: this region is the try's body.
    const body = this.emitArm(ex.from, ex.to, { enter: false, shared: mine });
    // The jump at the end of the protected range is where the `try` continues when
    // it completes; a body that ended early (a `break` out of the enclosing loop, a
    // `return`) does not move that point.
    const tail = this.byOffset.get(ex.to);
    let merge: number | null = null;
    if (tail?.name === 'jump') merge = tail.target as number;
    else if (body.end.kind === 'jump') merge = body.end.target;
    else if (body.end.kind === 'end') merge = null;                 // the body returns
    else if (body.end.kind === 'stop') throw new Refuse(ex.from, 'a protected region does not end on a jump');
    else throw new Refuse(ex.from, 'a protected region leaves through a loop edge');

    this.stack = [...base];
    // A handler is entered with the scope stack emptied (AVM2 overview, exception
    // handling): its code pushes `this`, the activation and the catch scope again,
    // so its `getscopeobject` indices count from zero.
    this.scopeObjects = [];
    this.withFlags = [];
    this.recordScopes(ex.target, [], []);
    const param = `__caught${this.catches++}`;
    this.catchParam = param;
    // …and with the operand stack cleared but for the thrown value (same section),
    // which the handler stores, coerces or drops.
    this.stack = [{ e: id(param) }];
    // The two paths usually merge on the same instruction, but the compiler's scope
    // cleanup (`popscope; kill`) can sit between the handler's jump and the try
    // body's: the handler arm runs through it, so the region after the try starts at
    // the merge both paths share.
    const handler = merge == null
      ? this.emitArm(ex.target, null, { shared: mine })
      : this.emitArmTo(ex.target, merge);
    this.catchParam = null;
    this.scopeObjects = scopes;
    this.withFlags = withFlags;
    if (handler.end.kind === 'backEdge') throw new Refuse(ex.from, 'an exception handler leaves through a loop edge');
    if (handler.end.kind === 'jump') {
      if (merge == null) merge = handler.end.target;
      // A handler that jumps *past* the merge skips only the compiler's scope
      // cleanup, which lifts to nothing: the region after the `try` stays at the
      // merge the try body itself uses.
    }
    this.out.push({ k: 'try', block: body.stmts, param, handler: handler.stmts, finalizer: null });
    this.stack = [...base];
    // A try leaves its region through the merge its body and handler share; with no
    // merge both sides ended the flow (a return or a throw on every path).
    return merge != null ? { kind: 'jump', target: merge } : { kind: 'end' };
  }

  /**
   * `lookup_switch` — the table ASC puts at the tail of every `switch` statement.
   *
   * The compiler first computes a *selector*: a local holding an index, one per
   * `case`, built by comparing the discriminant against each case value in turn.
   * Then it dispatches on that index. The case bodies are laid out *before* the
   * table, in whatever order the compiler chose (so the targets usually point
   * backwards), and each one ends by jumping to the instruction after the table,
   * which is the code that follows the `switch`.
   *
   * That makes the lift a real `switch` statement whose arms are those regions and
   * whose discriminant is whatever the table pops — the index the compiler built,
   * not the case value, so the output is as faithful as the table itself.
   */
  private emitLookupSwitch(i: AbcInstruction): { done: boolean; end: RegionEnd; next: number | null } {
    const all = i.targets ?? [];
    // The table is `default (s24), case_count (u30), case_count + 1 offsets` (AVM2
    // overview, `lookupswitch`: index 0 … case_count are cases); the parser hands
    // the case offsets over in order and the default as `target`.
    const count = (i.operands[1] ?? all.length - 1) + 1;
    const cases = all.slice(0, count);
    const fallback = i.target ?? all[all.length - 1];
    if (!cases.length || fallback == null) throw new Refuse(i.offset, 'a switch table with nothing to dispatch to');
    const merge = this.switchMerge(i, [...cases, fallback]);
    const structured = this.tryStructuredSwitch(i, cases, fallback, merge);
    if (structured) return structured;
    const index = this.pop();
    const base = [...this.stack];

    const clauses: { test: Expr | null; body: Stmt[]; stack: Value[]; merges: boolean }[] = [];
    const liftCase = (target: number, test: Expr | null) => {
      this.stack = [...base];
      // A case can fall through into the next one (`case 1: case 2:` or a missing
      // `break`), which is a jump to another case body: follow it and inline it.
      const arm = this.emitArmTo(target, merge);
      const stack = [...this.stack];
      const body = [...arm.stmts];
      let merges = false;
      if (arm.end.kind === 'stop') merges = true;
      else if (arm.end.kind === 'jump') throw new Refuse(i.offset, 'a switch case jumps out of the switch before its end');
      else if (arm.end.kind === 'backEdge') {
        const loop = this.loops[this.loops.length - 1];
        if (!loop || (arm.end.target !== loop.head && arm.end.target !== loop.exit)) {
          throw new Refuse(i.offset, `a switch case at ${target} leaves through an unknown loop edge (to ${arm.end.target})`);
        }
        body.push(arm.end.target === loop.head ? { k: 'continue', label: null } : { k: 'break', label: null });
      }
      clauses.push({ test, body, stack, merges });
      return merges;
    };

    for (let n = 0; n < cases.length; n++) liftCase(cases[n], { k: 'num', v: String(n) });
    liftCase(fallback, null);

    // A `switch` cannot carry values out of its cases. When the compiler used the
    // table to *choose a value* (each case leaves one and the code after the table
    // consumes it), the cases write it to one variable and the merge reads that.
    const joining = clauses.filter((c) => c.merges);
    const depths = new Set(joining.map((c) => c.stack.length));
    if (depths.size > 1) throw new Refuse(i.offset, `switch cases leave different numbers of values (${[...depths].sort().join(',')})`);
    const depth = joining.length ? joining[0].stack.length : base.length;
    if (depth !== base.length && depth !== base.length + 1) {
      throw new Refuse(i.offset, `a switch case leaves ${depth - base.length} values on the stack`);
    }
    let pushed: Expr | null = null;
    if (depth === base.length + 1) {
      const name = `__s${this.temps++}`;
      this.out.push({ k: 'var', decls: [{ name, type: null, init: null }] });
      for (const clause of joining) {
        clause.body.push(exprStmt(assign(id(name), clause.stack[base.length].e)), { k: 'break', label: null });
      }
      pushed = id(name);
    } else {
      for (const clause of clauses) if (clause.merges) clause.body.push({ k: 'break', label: null });
    }

    this.out.push({ k: 'switch', disc: index.e, cases: clauses.map((c) => ({ test: c.test, body: c.body })) });
    this.stack = pushed ? [...base, { e: pushed }] : [...base];
    return { done: false, end: { kind: 'stop' }, next: merge };
  }

  /**
   * Where a switch's cases meet. ASC dispatches at the end (`jump DISPATCH; cases;
   * DISPATCH: lookupswitch`), so the cases jump to the instruction after the table.
   * A table that dispatches first has its cases after it, and they jump past the
   * last one: the merge is the one place every jumping case body goes beyond
   * all the case starts.
   */
  private switchMerge(i: AbcInstruction, targets: number[]): number {
    const after = i.offset + i.size;
    const hi = Math.max(...targets);
    const lo = Math.min(...targets);
    if (lo < after) return after;
    const outs = new Set<number>();
    for (const [at, block] of this.blocks) {
      const last = block.at(-1);
      if (at < lo || at > hi || last?.name !== 'jump') continue;
      if ((last.target as number) > hi) outs.add(last.target as number);
    }
    return outs.size === 1 ? [...outs][0] : after;
  }

  /**
   * The switch as it was written. Every target is one clause, in address order —
   * the order of the source — labelled with every index that dispatches to it, so a
   * shared body (`case 4:` and `default:` on one target) is emitted once and a case
   * that runs into the next one falls through as JavaScript does. When the selector
   * is ASC's comparison chain (`K0 === x ? 0 : K1 === x ? 1 : … : n`) over constants,
   * the labels are the case values and the discriminant is `x` itself.
   *
   * Speculative: anything outside that shape (a case leaving values, jumping to a
   * place that is neither the next clause nor the end) restores the state and the
   * table lift above takes over.
   */
  private tryStructuredSwitch(i: AbcInstruction, cases: number[], fallback: number, merge: number): { done: boolean; end: RegionEnd; next: number | null } | null {
    const snap = this.snapshot();
    try {
      const index = this.pop();
      const base = [...this.stack];
      const groups = new Map<number, { labels: number[]; isDefault: boolean }>();
      cases.forEach((target, n) => {
        const g = groups.get(target) ?? { labels: [], isDefault: false };
        g.labels.push(n);
        groups.set(target, g);
      });
      if (fallback !== merge) {
        const g = groups.get(fallback) ?? { labels: [], isDefault: false };
        g.isDefault = true;
        groups.set(fallback, g);
      }
      const order = [...groups.keys()].sort((a, b) => a - b);
      if (order.some((t) => t >= merge || t > i.offset)) throw new Refuse(i.offset, 'switch layout');

      // The selector chain, when there is one: index → case value.
      const chain = selectorChain(index.e);
      const values = new Map<number, Expr>();
      let elseIndex: number | null = null;
      if (chain) {
        for (const link of chain.links) if (!values.has(link.index)) values.set(link.index, link.value);
        elseIndex = chain.elseIndex;
        // A chain index past the table dispatches to the default, like any other.
        const fallbackGroup = groups.get(fallback);
        for (const n of values.keys()) if (n >= cases.length && n !== elseIndex && fallbackGroup) fallbackGroup.labels.push(n);
      }

      const clauses: { labels: (Expr | null)[]; body: Stmt[] }[] = [];
      for (let k = 0; k < order.length; k++) {
        const target = order[k];
        const stop = order[k + 1] ?? merge;
        this.stack = [...base];
        const arm = this.emitArmTo(target, stop);
        const body = [...arm.stmts];
        if (arm.end.kind === 'jump' && arm.end.target === merge) body.push({ k: 'break', label: null });
        else if (arm.end.kind === 'stop') {
          // Ran into the next clause (falls through) or, for the last, into the end.
          if (stop === merge) body.push({ k: 'break', label: null });
        } else if (arm.end.kind !== 'end') throw new Refuse(i.offset, 'switch layout');
        if (arm.end.kind !== 'end' && this.stack.length !== base.length) throw new Refuse(i.offset, 'switch layout');
        const g = groups.get(target)!;
        const labels: (Expr | null)[] = [];
        for (const n of g.labels) {
          if (chain) {
            const value = values.get(n);
            if (value) labels.push(value);
            else if (n === elseIndex && !g.isDefault) labels.push(null);
          } else labels.push({ k: 'num', v: String(n) });
        }
        if (g.isDefault && !labels.includes(null)) labels.push(null);
        if (!labels.length) throw new Refuse(i.offset, 'switch layout');
        clauses.push({ labels, body });
      }
      // With a chain, the index the chain falls back to must reach the default.
      if (chain && elseIndex != null && fallback !== merge) {
        const elseTarget = cases[elseIndex] ?? fallback;
        if (elseTarget !== fallback) throw new Refuse(i.offset, 'switch layout');
      }
      if (clauses.filter((c) => c.labels.includes(null)).length > 1) throw new Refuse(i.offset, 'switch layout');
      // JavaScript tests `case` expressions lazily, in textual order, with `===` — the
      // chain's own semantics — so the labels may be any expressions as long as they
      // come out in the chain's order. Distinct constants can come in any order.
      if (chain) {
        const emitted = clauses.flatMap((c) => c.labels).filter((l): l is Expr => l != null);
        // Values that dispatch past the table with no default clause run nothing.
        const dropped = (n: number) => n >= cases.length && n !== elseIndex && fallback === merge;
        const expected = chain.links.filter((l, k) => chain.links.findIndex((m) => m.index === l.index) === k && !dropped(l.index)).map((l) => l.value);
        const inOrder = emitted.length === expected.length && emitted.every((e, k) => e === expected[k]);
        const known = emitted.map((e) => this.constantValue(e));
        const constants = known.every((v) => v !== NOT_CONSTANT) && new Set(known.map((v) => JSON.stringify(v))).size === known.length;
        if (!inOrder && !constants) throw new Refuse(i.offset, 'switch layout');
      }

      const cs: { test: Expr | null; body: Stmt[] }[] = [];
      for (const clause of clauses) {
        clause.labels.forEach((test, n) => cs.push({ test, body: n === clause.labels.length - 1 ? clause.body : [] }));
      }
      this.out.push({ k: 'switch', disc: chain ? chain.subject : index.e, cases: cs });
      this.stack = [...base];
      return { done: false, end: { kind: 'stop' }, next: merge };
    } catch (e) {
      if (!(e instanceof Refuse)) throw e;
      this.restore(snap);
      return null;
    }
  }

  /**
   * The value of a constant expression: a literal, or a `static const` the ABC gives
   * a value (`VideoAlign.CENTER`, also reached as `require('./VideoAlign').VideoAlign
   * .CENTER`). Reading one has no effect, so constants may be tested in any order.
   */
  private constantValue(e: Expr): unknown {
    if (e.k === 'str') return e.v;
    if (e.k === 'num') return Number(e.v);
    if (e.k === 'unary' && e.op === '-' && e.arg.k === 'num') return -Number(e.arg.v);
    if (e.k === 'lit' && e.v !== 'this') return ({ true: true, false: false, null: null, undefined: '\u0000undefined' } as const)[e.v];
    if (e.k !== 'member') return NOT_CONSTANT;
    const owner = e.obj.k === 'id' ? e.obj.name : e.obj.k === 'member' ? e.obj.prop : null;
    if (!owner) return NOT_CONSTANT;
    const cls = this.ctx.abc.classes.find((c) => simpleName(c.instance.name) === owner);
    const trait = cls?.traits.find((t) => simpleName(t.name) === e.prop);
    if (!trait || trait.kind !== 'const' || trait.value === undefined) return NOT_CONSTANT;
    return trait.value;
  }

  /**
   * An arm of an `if`: it usually reaches the merge directly, but the compiler also
   * leaves it as a jump to a point *before* the merge — the arm continues there, on
   * the stack it was carrying. Following it keeps those values with the arm.
   */
  private emitArmTo(entry: number, stop: number): { stmts: Stmt[]; end: RegionEnd } {
    let arm = this.emitArm(entry, stop);
    for (let guard = 0; guard < 8; guard++) {
      if (arm.end.kind !== 'jump' || arm.end.target <= entry || arm.end.target >= stop) break;
      const next = this.emitArm(arm.end.target, stop);
      arm = { stmts: [...arm.stmts, ...next.stmts], end: next.end };
    }
    return arm;
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

  /**
   * `while (cond) { … }`: the branch leaves the loop forward and the body heads back
   * to it — to the branch itself, or (`L: label; <cond>; iffalse END; body;
   * jump L`) to the start of a block that computes nothing but the condition, which
   * then runs again on every trip. The head is where the body goes back to.
   */
  private whileHead(last: AbcInstruction, target: number, fallThrough: number): number | null {
    if (target <= last.offset) return null;
    if (this.reachesBackTo(fallThrough, last.offset, target)) return last.offset;
    const mark = this.blockMark;
    if (!mark || mark.at >= last.offset || mark.stack !== 0 || this.out.length !== mark.out) return null;
    if (this.loops.some((f) => f.head === mark.at)) return null;
    return this.reachesBackTo(fallThrough, mark.at, target) ? mark.at : null;
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

  private step(i: AbcInstruction) {
    const o = i.operands;
    const mn = (k = 0) => this.multiname(o[k]);
    switch (i.name) {
      case 'jump': case 'nop': case 'label': case 'bkpt': case 'timestamp':
      case 'debug': case 'debug_line': case 'debug_file': case 'bkpt_line':
        return;
      case 'push_scope':
        // The scope object goes onto the scope stack, where `get_scope_object`
        // finds it again: the value itself is what those reads want.
        this.scopeObjects.push(this.pop().e);
        this.withFlags.push(false);
        return;
      case 'push_with': {
        // A `with` scope: names are looked up on this object first, at run time
        // (`with (o) {…}`, and every E4X filter `list.(predicate)`, which ASC
        // compiles as a loop that pushes each item as a `with` scope). The object is
        // read once per lookup, so anything but a plain name is held in a temp.
        let scope = this.pop().e;
        if (scope.k !== 'id') {
          const name = `__w${this.withs++}`;
          this.out.push({ k: 'var', decls: [{ name, type: null, init: scope }] });
          scope = id(name);
        }
        this.scopeObjects.push(scope);
        this.withFlags.push(true);
        return;
      }
      case 'pop_scope':
        // The scope frame shrinks; the scope object itself is not an operand.
        this.scopeObjects.pop();
        this.withFlags.pop();
        return;
      case 'get_global_scope':
        // The script's global object. A class reaches itself through it — the script's
        // traits are its slots (`getglobalscope; getslot N`) — and everything else that
        // goes through it (`getlex`, `findproperty`) is the scope already modelled.
        this.pushValue({ e: thisRef(), globals: true });
        return;
      case 'get_scope_object': {
        const index = o[0] ?? 0;
        const scope = this.scopeObjects[index] ?? (index === 0 && !this.ctx.enclosingScopes ? ({ k: 'id', name: 'this', line: 0 } as Expr) : undefined);
        if (!scope) throw new Refuse(i.offset, `get_scope_object ${index} is outside the scope frame this body builds (depth ${this.scopeObjects.length})`);
        this.push(scope);
        return;
      }
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
        // The compiler's scope juggling (`newcatch; dup; setlocal; dup; pushscope;
        // swap; setslot 1`) leaves a single value where the instruction formally
        // wants two: nothing to exchange means nothing to do.
        if (this.stack.length < 2) return;
        const a = this.pop(), b = this.pop();
        this.stack.push(a, b);
        return;
      }
      case 'get_lex': {
        const m = mn();
        const scope = this.withScope(m);
        this.push(scope ? member(scope, m.name) : this.reference(m.name, m.ns, m.nsKind));
        return;
      }
      case 'find_prop_strict': case 'find_property': case 'find_def': {
        const m = mn();
        if (m.dynamic || m.nsOnStack) throw new Refuse(i.offset, `${i.name} on a runtime name is not lifted yet`);
        // `finddef` searches the global definitions only; `with` scopes don't apply.
        const scope = i.name === 'find_def' ? null : this.withScope(m);
        this.pushValue(scope ? { e: scope } : this.findReference(m));
        return;
      }
      case 'get_slot': {
        // `getslot` without an object on the stack is the compiler reading a slot of
        // the scope it just pushed (a catch object): the scope frame has it.
        const recv = this.stack.length ? this.pop() : this.scopeValue();
        // A slot of the script's global object is one of the script's traits: the
        // class or function it defines. That is how a class fetches its own class
        // object, and the emitted module already *has* that name.
        if (recv.globals && this.ctx.scriptSlots?.has(o[0])) {
          this.push({ k: 'id', name: this.ctx.scriptSlots.get(o[0])!, line: 0 });
          return;
        }
        const variable = this.activationVar(recv.e, o[0]);
        if (variable) { this.push(id(variable)); return; }
        const caught = recv.e.k === 'id' && o[0] === 1 ? this.catchScopes.get(recv.e.name) : undefined;
        if (caught) { this.push(id(caught)); return; }
        this.push(this.memberOfValue(recv, { name: this.slotProp(o[0], recv.e) }));
        return;
      }
      case 'set_slot': case 'init_slot': case 'set_slot_no_coerce': {
        const value = this.pop();
        const recv = this.stack.length ? this.pop() : this.scopeValue();
        // The compiler keeps the stored value on the stack; copies must not re-run it.
        this.holdCopies(value.e);
        const variable = this.activationVar(recv.e, o[0]) ?? (recv.e.k === 'id' && o[0] === 1 ? this.catchScopes.get(recv.e.name) : undefined);
        if (variable) {
          // ASC copies each captured parameter into its slot, and the thrown value
          // into the catch scope's: `x = x` says nothing.
          if (!isId(value.e, variable)) this.assign(id(variable), value.e);
          return;
        }
        this.assign(this.memberOfValue(recv, { name: this.slotProp(o[0], recv.e) }), value.e);
        return;
      }
      case 'get_property': case 'get_descendants': {
        const { recv, prop } = this.popAccess(mn());
        this.push(this.propertyRead(recv, prop));
        return;
      }
      case 'get_super': {
        const { prop } = this.popAccess(mn());
        this.push(this.propertyRead({ e: superRef() }, prop, true));
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
        // The delete itself happens here, before anything else can run, and AVM2's
        // `deleteproperty` leaves a Boolean behind: deleting a configurable property
        // succeeds, which is what every movie's `delete obj.name` relies on.
        this.statement({ k: 'unary', op: 'delete ', arg: this.memberOfValue(recv, prop) });
        this.push(lit('true'));
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
        // `callsuper`'s operand is a *multiname* — the same pool `callproperty` uses —
        // and its namespace is the class that declares the method. Resolving it as a
        // method index instead picks up whichever trait happens to share that number.
        // Stack: receiver, arg1 … argN → value. The receiver is `this` in compiled code
        // (`getlocal0`), and it has to come off the stack with the arguments.
        const args = this.popArgs(argCountOf(i, o));
        this.pop();
        const name = this.multiname(o[0]).name;
        this.resultOrStatement({ k: 'call', callee: member(superRef(), name), args }, i.name === 'call_super_void');
        return;
      }
      case 'call': {
        // `…, function, receiver, arg1…argN` (AVM2 overview, `call`): the receiver
        // is the `this` the function runs with, so the emitted call carries it.
        const args = this.popArgs(argCountOf(i, o));
        const recv = this.pop();
        const fn = this.pop();
        this.resultOrStatement({ k: 'call', callee: member(fn.e, 'call'), args: [recv.e, ...args] }, false);
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
        // `newclass` pops the base class and pushes the new class object. The
        // emitted TypeScript class declaration *is* that object, so the value is the
        // class itself, by name.
        this.pop();
        const made = this.ctx.abc.classes[o[0]]?.instance.name;
        this.push({ k: 'id', name: made ? simpleName(made) : `__class${o[0]}`, line: 0 });
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
        // `a[i++]` is `getlocal i; inclocal i; …`: the copy already on the stack is
        // the old value.
        if (target.k === 'id') this.holdReaders(target.name);
        this.statement({ k: 'update', op: i.name.startsWith('inc') ? '++' : '--', prefix: false, arg: target });
        return;
      }
      case 'sxi1': case 'sxi8': case 'sxi16':
        this.push({ k: 'id', name: 'Number', line: 0 });     // value-preserving enough for the sign extension sites we have
        return;
      case 'has_next2': {
        // `for (k in o)` / `for each (v in o)`: the compiler keeps the iteration in
        // two registers and `hasnext2` advances it. The cursor register holds the
        // current key here, so `nextname` reads it back and `nextvalue` looks the
        // value up with it — one runtime helper, no iteration state of our own.
        const object = this.readLocal(o[0]);
        if (o.length < 2) throw new Refuse(i.offset, 'hasnext2 without two registers');
        const cursor = this.local(o[1]);
        this.lastIterCursor = o[1];
        const advanced: Expr = {
          k: 'assign', op: '=', target: cursor,
          value: { k: 'call', callee: { k: 'id', name: '__iterAdvance', line: 0 }, args: [object.e, cursor] },
        };
        this.push({ k: 'binary', op: '!=', left: advanced, right: lit('null') });
        return;
      }
      case 'next_name': {
        this.pop();                                          // the object register
        this.pop();                                          // the cursor register
        if (this.lastIterCursor == null) throw new Refuse(i.offset, 'nextname without a hasnext2 before it');
        this.push(this.local(this.lastIterCursor));           // the key `hasnext2` advanced to
        return;
      }
      case 'next_value': {
        this.pop();                                          // the cursor register
        const object = this.pop();                            // the object register
        if (this.lastIterCursor == null) throw new Refuse(i.offset, 'nextvalue without a hasnext2 before it');
        this.push({
          k: 'call', callee: { k: 'id', name: '__iterValue', line: 0 },
          args: [object.e, this.local(this.lastIterCursor)],
        });
        return;
      }
      case 'has_next':
        throw new Refuse(i.offset, 'hasnext (the registerless for-in form) is not lifted yet');
      case 'lookup_switch':
        throw new Refuse(i.offset, 'lookupswitch (indexed switch) is not lifted yet');
      case 'new_activation': {
        // The activation object is where a nested function reads the locals this
        // frame captures: `setslot k` writes register `k` of this frame, and the
        // closure reads the same field through the scope it was created with.
        // Its slots become plain variables named by the body's traits (`var itr`), so
        // the object itself never needs to exist: every access to it is a slot access.
        const name = `__activation${this.activations++}`;
        this.declareActivation();
        this.activationNames.add(name);
        this.push({ k: 'id', name, line: 0 });
        return;
      }
      case 'new_function': {
        const method = this.ctx.abc.methods[o[0]];
        const body = this.ctx.abc.bodies.find((b) => b.method === o[0]);
        if (!body) throw new Refuse(i.offset, 'a nested function without a body');
        const scope = this.traitByMethod(o[0]);
        const definedIn = /^local(\d+)$/.exec(scope?.name ?? '');
        const paramCount = method?.paramTypes.length ?? 0;
        const result = liftMethod({
          abc: this.ctx.abc,
          body,
          target: 'none',
          ownTraits: this.ctx.ownTraits,
          globals: this.ctx.globals,
          memberNames: this.ctx.memberNames,
          staticMembers: this.ctx.staticMembers,
          staticOwner: this.ctx.staticOwner,
          superOwner: this.ctx.superOwner,
          instanceMethods: this.ctx.instanceMethods,
          staticMethods: this.ctx.staticMethods,
          scriptSlots: this.ctx.scriptSlots,
          captured: new Map([...(this.ctx.captured ?? []), ...this.activationByName]),
          outerSelf: this.closureSelf(),
          paramNames: parameterNames(method),
          needRest: method?.needRest,
          needArguments: method?.needArguments,
          // A closure sees the frames its creation site sits in, and the register the
          // compiler chose for it (`getlex local2` in the designator = register 2 of
          // this frame), so its own names line up with the slots written here.
          enclosingScopes: [...this.scopeObjects],
          captureLocal: definedIn ? Number(definedIn[1]) : undefined,
        });
        if (!result.stmts) {
          const d = result.diagnostics[0];
          throw new Refuse(d?.offset ?? i.offset, `a nested function could not be lifted: ${d?.message ?? 'unknown'}`);
        }
        const names = parameterNames(method);
        const params = Array.from({ length: paramCount }, (_, k) => names[k] ?? `param${k + 1}`);
        // `newfunction` takes nothing off the operand stack: the closure captures the
        // *scope chain* (AVM2 overview, `newfunction`: "… => …, function_obj").
        this.push({ k: 'func', name: null, params: params.map((name) => ({ name, type: null, rest: false })), ret: null, body: result.stmts });
        return;
      }
      case 'new_catch': {
        // The catch object: its slot 1 is the exception itself (the compiler stores
        // it in a local too). The lifted `catch` binding is that payload.
        if (!this.catchParam) throw new Refuse(i.offset, 'newcatch outside a lifted try/catch is not supported');
        const scope = `${this.catchParam}$scope`;
        this.catchScopes.set(scope, this.catchParam);
        this.push(id(scope));
        return;
      }
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
    if (!v) throw new Refuse(this.pc, `operand stack underflow (at ${this.byOffset.get(this.pc)?.name ?? this.pc})`);
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
    const caught = v.e.k === 'id' ? this.catchScopes.get(v.e.name) : undefined;
    if (caught) {
      // A local holding the catch scope is that scope, under another name.
      this.catchScopes.set(name, caught);
      this.usedLocals.delete(index);
      for (let k = 0; k < this.stack.length; k++) if (this.stack[k].e === v.e) this.stack[k] = { e: id(name) };
      return;
    }
    if (v.e.k === 'id' && this.activationNames.has(v.e.name)) {
      // The register only ever holds the activation: it is an alias, not a value.
      this.activationNames.add(name);
      this.usedLocals.delete(index);
      for (let k = 0; k < this.stack.length; k++) if (this.stack[k].e === v.e) this.stack[k] = { e: id(name) };
      return;
    }
    this.holdReaders(name, v.e);
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

  /**
   * Before a local changes, every value on the stack computed from it gets a temp:
   * those values were read already (`int(i)`, `i + 1`, not just `i`). `dup` copies
   * share one temp. `except` (the value being stored) is rewritten by the caller.
   */
  private holdReaders(name: string, except?: Expr) {
    const held = new Map<Expr, Expr>();
    for (let k = 0; k < this.stack.length; k++) {
      const e = this.stack[k].e;
      if (e === except) continue;
      const done = held.get(e);
      if (done) { this.stack[k] = { e: done }; continue; }
      if (!readsName(e, name)) continue;
      this.hold(k);
      held.set(e, this.stack[k].e);
    }
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
    return { name: m.name || `__mn${index}`, ns: m.ns ?? '', nsKind: m.nsKind, dynamic, nsOnStack, nsSet: m.nsSet };
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
      if (recv.owner) return member(recv.owner, name);
      return recv.e.k === 'id' ? recv.e : { k: 'id', name, line: 0 };
    }
    return member(recv.e, name);
  }
  /**
   * A property *read*. In AVM2 a method name read as a value is not the method
   * itself but a closure bound to the receiver — that is how `addEventListener(Event.ADDED,
   * this.addedHandler)` keeps working with the right `this`, and how removing it by
   * the same expression finds the same listener. Emitting the read as a binding keeps
   * that meaning; a field (or a getter) is a plain read.
   */
  private propertyRead(recv: Value, prop: PropExpr, superRead = false): Expr {
    const name = prop.name;
    if (!prop.index && name) {
      if (this.isMethodName(name, recv, superRead)) {
        // `super.m` reads the version the superclass declares, not an override.
        const owner = superRead ? this.ctx.superOwner : undefined;
        return this.methodRef(superRead ? thisRef() : recv.e, name, owner);
      }
    }
    return this.memberOfValue(recv, prop);
  }

  /** A method read as a value: the closure bound to its receiver. */
  private methodRef(recv: Expr, name: string, owner?: string): Expr {
    const args: Expr[] = [recv, { k: 'str', v: name }];
    if (owner) args.push({ k: 'id', name: owner, line: 0 });
    return { k: 'call', callee: { k: 'id', name: '__method', line: 0 }, args };
  }

  /**
   * Is `name` a method — not a field — on the receiver? `this` and `super` are
   * answered from the enclosing class; anything else only when the value's type was
   * proved by a `coerce`, so an unknown receiver is never guessed at.
   */
  private isMethodName(name: string, recv: Value, superRead: boolean): boolean {
    if (superRead) return this.methodsOf(this.ctx.superOwner).has(name) || this.ctx.instanceMethods?.has(name) === true;
    const isThis = this.isSelf(recv.e) || (recv.e.k === 'id' && recv.e.name === (this.ctx.staticOwner ?? '\u0000'));
    if (isThis) {
      if (recv.find === name && this.ctx.staticMethods?.has(name)) return true;
      return this.ctx.instanceMethods?.has(name) === true;
    }
    if (recv.find === name && this.ctx.staticMethods?.has(name)) return true;
    const type = recv.coerced;
    if (type) return this.methodsOf(type).has(name);
    return false;
  }

  /** The instance method names a class and its supers declare; empty when unknown. */
  private methodsOf(className?: string): Set<string> {
    if (!className) return EMPTY_NAMES;
    const cached = this.methodNames?.get(className);
    if (cached) return cached;
    const byName = new Map(this.ctx.abc.classes.map((c) => [c.instance.name, c]));
    const names = new Set<string>();
    let cls = byName.get(className) ?? [...byName.values()].find((c) => simpleName(c.instance.name) === className);
    const seen = new Set<string>();
    for (let depth = 0; cls && depth < 32; depth++) {
      for (const trait of cls.instance.traits) if (trait.kind === 'method') names.add(simpleName(trait.name));
      const superName = cls.instance.superName;
      if (!superName || seen.has(superName)) break;
      seen.add(superName);
      cls = byName.get(superName);
    }
    (this.methodNames ??= new Map()).set(className, names);
    return names;
  }

  private methodNames?: Map<string, Set<string>>;

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
  /**
   * While a `with` scope is on the scope stack, a name is resolved at run time:
   * `__withScope([innermost, …], name, fallback)` is the first `with` object that has
   * the property, else the object the name resolves on without them — `this`, the
   * class, or (for a global/imported definition) a one-property object holding it.
   * The caller reads, writes or calls `<that>.name`, so a method keeps its receiver.
   */
  private withScope(m: MnInfo): Expr | null {
    const scopes: Expr[] = [];
    for (let k = this.scopeObjects.length - 1; k >= 0; k--) if (this.withFlags[k]) scopes.push(this.scopeObjects[k]);
    if (!scopes.length) return null;
    const normal = this.findReference(m);
    const args: Expr[] = [{ k: 'array', items: scopes }, { k: 'str', v: m.name }];
    if (normal.owner || normal.e.k !== 'id' || normal.e.name !== m.name) return { k: 'call', callee: id('__withScope'), args: [...args, normal.owner ?? normal.e] };
    // A global/imported name is read only if no `with` object has it: AVM2 never
    // looks further, and a JavaScript free name that nothing defines would throw
    // just by being evaluated (`type` inside `describeType(x).(@name == type)`).
    const holder: Expr = { k: 'object', props: [{ key: m.name, value: this.reference(m.name, m.ns, m.nsKind) }] };
    const lazy: Expr = { k: 'func', name: null, params: [], ret: null, body: [{ k: 'return', arg: holder }] };
    return { k: 'call', callee: id('__withScope'), args: [...args, { k: 'lit', v: 'undefined' }, lazy] };
  }

  /** The `this` alias a closure created here resolves member names against. */
  private closureSelf(): { name: string; used: boolean } | undefined {
    if (this.ctx.target === 'instance') return (this.selfAlias ??= { name: '__self', used: false });
    return this.ctx.target === 'none' ? this.ctx.outerSelf : undefined;
  }

  /** Name the activation's slots, avoiding names the module already uses. */
  private declareActivation() {
    if (this.activationVars.size) return;
    const taken = new Set<string>([...GLOBALS, ...(this.ctx.globals ?? []), ...this.ctx.abc.classes.map((c) => simpleName(c.instance.name))]);
    const params = new Set(this.ctx.paramNames ?? []);
    for (const trait of this.ctx.body.traits ?? []) {
      if (trait.slotId == null) continue;
      const source = simpleName(trait.name);
      let name = /^[A-Za-z_$][\w$]*$/.test(source) && !RESERVED_PARAM.has(source) && !/^(local|param)\d+$/.test(source) && !source.startsWith('__')
        ? source : `slot${trait.slotId}`;
      if (taken.has(name) && !params.has(name)) name = `${name}_`;
      while ([...this.activationVars.values()].includes(name)) name = `${name}_`;
      this.activationVars.set(trait.slotId, name);
      this.activationByName.set(source, name);
    }
  }

  /** A slot access on this frame's activation: the variable it lifted to. */
  private activationVar(recv: Expr, slot: number): string | null {
    if (recv.k !== 'id' || !this.activationNames.has(recv.name)) return null;
    return this.activationVars.get(slot) ?? null;
  }

  /**
   * A name the scope chain finds in an activation — this frame's (a nested function
   * statement it declared) or an enclosing one's (a closure's captured variable).
   */
  private capturedName(name: string): string | null {
    return this.activationByName.get(name) ?? this.ctx.captured?.get(name) ?? null;
  }

  /** In a closure created by an instance method, member names resolve on that instance. */
  private selfTarget(): MethodContext['target'] {
    return this.ctx.target === 'none' && this.ctx.outerSelf ? 'instance' : this.ctx.target;
  }

  private selfRef(): Expr {
    if (this.ctx.target === 'none' && this.ctx.outerSelf) {
      this.ctx.outerSelf.used = true;
      return id(this.ctx.outerSelf.name);
    }
    return thisRef();
  }

  private isSelf(e: Expr): boolean {
    if (e.k === 'lit' && e.v === 'this') return this.ctx.target !== 'none' || !this.ctx.outerSelf;
    if (e.k !== 'id') return false;
    if (this.ctx.target === 'none' && this.ctx.outerSelf) return e.name === this.ctx.outerSelf.name;
    return e.name === 'this';
  }

  /**
   * Does the enclosing class (or a superclass this ABC defines) declare `name` in
   * namespace `ns` — as a static of the class itself, or as an instance member?
   */
  private declaredIn(name: string, ns: string): 'static' | 'instance' | null {
    if (!ns || !this.ctx.staticOwner) return null;
    const qualified = `${ns}.${name}`;
    const byName = new Map(this.ctx.abc.classes.map((c) => [c.instance.name, c]));
    let cls = [...byName.values()].find((c) => simpleName(c.instance.name) === this.ctx.staticOwner);
    if (cls?.traits.some((t) => t.name === qualified)) return 'static';
    const seen = new Set<string>();
    for (let depth = 0; cls && depth < 32; depth++) {
      if (cls.instance.traits.some((t) => t.name === qualified)) return 'instance';
      const superName = cls.instance.superName;
      if (!superName || seen.has(superName)) break;
      seen.add(superName);
      cls = byName.get(superName);
    }
    return null;
  }

  /**
   * A superclass's static, named without its class: AS3 code sees the statics of
   * every class it extends (`mergeStyles(…)` in LabelButton is
   * `UIComponent.mergeStyles`). Instance members, own statics and locals win; the
   * nearest superclass this ABC defines that declares the name is the owner.
   */
  private inheritedStaticOwner(name: string): string | null {
    if (!this.ctx.staticOwner || this.knownLocal(name) || this.capturedName(name)) return null;
    if (this.ctx.memberNames?.has(name) || this.ctx.instanceMethods?.has(name) || this.ctx.staticMembers?.has(name)) return null;
    if (GLOBALS.has(name) || this.ctx.globals?.has(name)) return null;
    const byName = new Map(this.ctx.abc.classes.map((c) => [c.instance.name, c]));
    let cls = [...byName.values()].find((c) => simpleName(c.instance.name) === this.ctx.staticOwner);
    const seen = new Set<string>();
    for (let depth = 0; cls && depth < 32; depth++) {
      const superName = cls.instance.superName;
      if (!superName || seen.has(superName)) break;
      seen.add(superName);
      cls = byName.get(superName);
      if (cls?.traits.some((t) => t.kind !== 'class' && simpleName(t.name) === name)) return simpleName(cls.instance.name);
    }
    return null;
  }

  /**
   * A name looked up through a namespace *set* (`findpropstrict` with a Multiname)
   * is searched along the scope chain: the instance first, then the global scope,
   * where a package-level definition in one of the set's namespaces is found
   * (AVM2 overview, `findpropstrict` and multiname resolution). Unless the class
   * declares the name itself, a player class such as `flash.media.SoundTransform`
   * in one of those packages is the global, not a member of `this`.
   */
  private playerDefinitionInSet(m: MnInfo): boolean {
    if (!m.nsSet?.length || this.ctx.memberNames?.has(m.name) || this.knownLocal(m.name)) return false;
    return m.nsSet.some((ns) => !!ns && FLASH_DEFINITIONS.has(`${ns}.${m.name}`));
  }

  /** A private/protected multiname for a member this class declares. */
  private classPrivate(name: string, nsKind?: string): boolean {
    if (nsKind !== 'private' && nsKind !== 'protected' && nsKind !== 'staticProtected') return false;
    return !!(this.ctx.memberNames?.has(name) || this.ctx.staticMembers?.has(name));
  }

  private staticMethodOf(owner: string, name: string): boolean {
    const cls = this.ctx.abc.classes.find((c) => simpleName(c.instance.name) === owner);
    return !!cls?.traits.some((t) => t.kind === 'method' && simpleName(t.name) === name);
  }

  private findReference(m: MnInfo): Value {
    const name = m.name;
    const captured = this.capturedName(name);
    if (captured) return { e: id(captured), find: name };
    const ownNamespace = m.nsKind === 'private' || m.nsKind === 'protected' || m.nsKind === 'staticProtected' || m.ns === '';
    // In class code the class object is the scope the name is found on, so a static is
    // a static whatever namespace it was declared in — Adobe's own framework classes
    // put some of theirs in a namespace of their own (`http://www.adobe.com/...`).
    const declared = this.declaredIn(name, m.ns);
    const staticHit = (this.ctx.staticMembers?.has(name) && (ownNamespace || this.ctx.target === 'class')) || declared === 'static';
    if (staticHit) {
      const owner: Expr = { k: 'id', name: this.ctx.staticOwner ?? 'this', line: 0 };
      return { e: owner, find: name, owner };
    }
    const inherited = this.inheritedStaticOwner(name);
    if (inherited) {
      const owner = id(inherited);
      return { e: owner, find: name, owner };
    }
    // A private/protected name is the class's own however a global would be spelt
    // (SushiAPI's private `getTimer()` is no flash.utils.getTimer).
    const global = ((GLOBALS.has(name) || !!this.ctx.globals?.has(name)) && !this.classPrivate(name, m.nsKind)) ||
      this.playerDefinitionInSet(m);
    if ((ownNamespace || declared === 'instance') && this.selfTarget() === 'instance' && !global && !this.knownLocal(name)) {
      const owner = this.selfRef();
      return { e: owner, find: name, owner };
    }
    return { e: { k: 'id', name, line: 0 }, find: name };
  }

  private reference(name: string, ns: string, nsKind?: string): Expr {
    if (this.knownLocal(name)) return { k: 'id', name, line: 0 };
    const captured = this.capturedName(name);
    if (captured) return id(captured);
    if ((GLOBALS.has(name) || this.ctx.globals?.has(name)) && !this.classPrivate(name, nsKind)) return { k: 'id', name, line: 0 };
    // A trait of the class being emitted — frame scripts included — is a member, and
    // a *method* read this way is the bound closure `obj.method` means in AVM2.
    if (this.selfTarget() === 'instance' && this.ctx.memberNames?.has(name)) {
      const self = this.selfRef();
      return this.ctx.instanceMethods?.has(name) ? this.methodRef(self, name) : member(self, name);
    }
    if (this.ctx.staticMembers?.has(name)) {
      const owner: Expr = { k: 'id', name: this.ctx.staticOwner ?? 'this', line: 0 };
      return this.ctx.staticMethods?.has(name) ? this.methodRef(owner, name) : member(owner, name);
    }
    const inherited = this.inheritedStaticOwner(name);
    if (inherited) {
      const owner = id(inherited);
      return this.staticMethodOf(inherited, name) ? this.methodRef(owner, name) : member(owner, name);
    }
    const ownNamespace = nsKind === 'private' || nsKind === 'protected' || nsKind === 'staticProtected' || ns === '';
    if (!ownNamespace) {
      // A member in a namespace of its own (`flvplayback_internal`, `mx_internal`):
      // the class — or a superclass in this ABC — declares exactly `ns.name`.
      const declared = this.declaredIn(name, ns);
      if (declared === 'static') {
        const owner: Expr = { k: 'id', name: this.ctx.staticOwner ?? 'this', line: 0 };
        return this.ctx.staticMethods?.has(name) ? this.methodRef(owner, name) : member(owner, name);
      }
      if (declared === 'instance' && this.selfTarget() === 'instance') {
        const self = this.selfRef();
        return this.ctx.instanceMethods?.has(name) ? this.methodRef(self, name) : member(self, name);
      }
      return { k: 'id', name, line: 0 };
    }
    if (this.selfTarget() === 'instance') {
      const self = this.selfRef();
      return this.ctx.instanceMethods?.has(name) ? this.methodRef(self, name) : member(self, name);
    }
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
    if (known) {
      // Every use of a plain register asks for its declaration again: a register that
      // once only aliased the activation or a catch scope (which needs none) may be
      // reused later for an ordinary value.
      if (known === `local${index}` && index !== this.ctx.captureLocal && !this.extraArgName(index)) this.usedLocals.add(index);
      return { k: 'id', name: known, line: 0 };
    }
    // A closure's own register for the variable it was created for: the compiler
    // hands the closure its enclosing register, and this name is what the frame
    // that created it writes into its activation object.
    if (index === this.ctx.captureLocal) {
      const captured = `local${index}`;
      this.locals.set(index, captured);
      return { k: 'id', name: captured, line: 0 };
    }
    const declared = index > 0 ? this.ctx.paramNames?.[index - 1] : undefined;
    // Local 0 is the receiver: the instance in a constructor/method, the class
    // object in a static method (where TypeScript's `this` is that class object).
    // A closure's (and a script function's) local 0 is its own receiver — `this` of
    // the emitted `function`, never an undeclared register.
    const receiver = index === 0;
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
    // `ifNxx` jumps on the *negation* of the comparison: `ifngt` is `!(a > b)`, not
    // `a > b`, so its two arms read the other way round. That is also why the staying
    // arm keeps the bare comparison — `a <= b` would differ from `!(a > b)` on NaN.
    const order: Record<string, string> = { lt: '<', le: '<=', gt: '>', ge: '>=' };
    const negated = name.startsWith('n') && order[name.slice(1)] != null;
    const op = order[name] ?? OPS[negated ? name.slice(1) : name];
    if (!op) return null;
    const right = this.pop(), left = this.pop();
    const test: Expr = { k: 'binary', op, left: left.e, right: right.e };
    return negated ? { jump: notOf(test), stay: test } : { jump: test, stay: notOf(test) };
  }

  private branchTest(i: AbcInstruction): Expr {
    const info = this.branchInfo(i);
    if (!info) throw new Refuse(i.offset, `${i.name} is not a supported comparison`);
    return info.stay;
  }
}

// ------------------------------------------------------------------ helpers

/**
 * The value that reaches a join: `then` if that arm's condition held, the other
 * arm's value when it did not. The two simplifications are exact, not cosmetic —
 * they are how AS3's `&&`/`||` are defined on non-boolean operands — and they keep
 * the evaluation count the bytecode had (the condition is written once).
 */
function joinValue(cond: Expr, then: Expr, otherwise: Expr): Expr | null {
  if (sameExpr(cond, then)) return { k: 'binary', op: '||', left: then, right: otherwise };
  if (isNegationOf(cond, then)) return { k: 'binary', op: '&&', left: then, right: otherwise };
  return null;
}

/** Does this instruction end a region rather than fall into the next block? */
function i_is_control(i: AbcInstruction): boolean {
  return TERMINATORS.has(i.name) || i.name === 'lookup_switch';
}

/** AVM2's default for a slot of this type: false, NaN, 0, null — `*` stays undefined. */
function slotDefaultExpr(type: string | undefined): Expr | null {
  const t = simpleName(type ?? '');
  if (t === 'Boolean') return lit('false');
  if (t === 'Number') return id('NaN');
  if (t === 'int' || t === 'uint') return { k: 'num', v: '0' };
  if (!t || t === '*' || t === 'void') return null;
  return lit('null');
}

/**
 * ASC's switch selector: `K0 === x ? 0 : K1 === x ? 1 : … : n`, one subject `x` (a
 * plain name, read once either way). Null when the expression is anything else.
 */
function selectorChain(e: Expr): { subject: Expr; links: { value: Expr; index: number }[]; elseIndex: number } | null {
  const links: { value: Expr; index: number }[] = [];
  let subject: Expr | null = null;
  let at = e;
  while (at.k === 'cond') {
    const test = at.test;
    if (test.k !== 'binary' || test.op !== '===' || at.then.k !== 'num') return null;
    // ASC pushes the case value, then the subject: `K === x`.
    const [value, x]: [Expr, Expr] = test.right.k === 'id' && (!subject || sameExpr(subject, test.right)) ? [test.left, test.right] : [test.right, test.left];
    if (x.k !== 'id') return null;
    if (subject && !sameExpr(subject, x)) return null;
    subject = x;
    links.push({ value, index: Number(at.then.v) });
    at = at.else;
  }
  if (!subject || at.k !== 'num' || !links.length) return null;
  return { subject, links, elseIndex: Number(at.v) };
}

const NOT_CONSTANT = Symbol('not constant');


function block(body: Stmt[]): Stmt { return { k: 'block', body }; }
function lit(v: 'true' | 'false' | 'null' | 'undefined' | 'this'): Expr { return { k: 'lit', v }; }
function member(obj: Expr, prop: string): Expr { return { k: 'member', obj, prop }; }
function thisRef(): Expr { return { k: 'lit', v: 'this' }; }
function superRef(): Expr { return { k: 'id', name: 'super', line: 0 }; }

/** No method names known: a receiver nothing is proved about. */
const EMPTY_NAMES: Set<string> = new Set();
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
/** Does `e` read the variable `name` when evaluated (a closure's body reads it later)? */
function readsName(e: unknown, name: string): boolean {
  if (!e || typeof e !== 'object') return false;
  const node = e as Record<string, unknown>;
  if (node.k === 'id') return node.name === name;
  if (node.k === 'func') return false;
  for (const value of Object.values(node)) {
    if (Array.isArray(value) ? value.some((x) => readsName(x, name)) : readsName(value, name)) return true;
  }
  return false;
}

function targets(i: AbcInstruction): number[] {
  return [i.target, ...(i.targets ?? [])].filter((t): t is number => t != null);
}
/** The comparison an `if_xx` opcode tests, by the name after `if_`. */
const OPS: Record<string, string> = {
  eq: '==', ne: '!=', strict_eq: '===', strict_ne: '!==', lt: '<', le: '<=', gt: '>', ge: '>=',
};

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

