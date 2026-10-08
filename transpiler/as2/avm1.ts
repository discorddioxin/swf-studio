/** AVM1 -> editable TypeScript. No DOM, eval, or execution of input bytecode.
 *
 * The operand stack is lifted into expressions, not emitted as a VM. Values
 * still live across an observable operation are captured in locals so getters,
 * argument evaluation, duplicate, and register writes execute exactly once.
 * Only reducible, empty-stack control-flow joins are accepted. Failure is atomic:
 * callers must retain the ENTIRE original block, never a partly decoded prefix.
 */
export interface ActionDecodeResult {
  code: string | null;
  diagnostics: { offset: number; message: string }[];
}
export interface ActionDecodeOptions {
  target?: string;
  /** Resolve a literal AS variable in the surrounding transpiler scope. */
  identifier?: (name: string) => string;
}

class DecodeError extends Error {
  constructor(readonly offset: number, message: string) { super(message); }
}
class Reader {
  at = 0;
  constructor(readonly bytes: Uint8Array, readonly base = 0) {}
  fail(message: string): never { throw new DecodeError(this.base + this.at, message); }
  need(n: number) { if (this.at + n > this.bytes.length) this.fail('Truncated ActionRecord'); }
  u8() { this.need(1); return this.bytes[this.at++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  take(n: number) { this.need(n); const v = this.bytes.subarray(this.at, this.at + n); this.at += n; return v; }
  string() {
    const start = this.at;
    while (this.at < this.bytes.length && this.bytes[this.at] !== 0) this.at++;
    this.need(1);
    const s = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(start, this.at));
    this.at++;
    return s;
  }
  done() { if (this.at !== this.bytes.length) this.fail('Unexpected ActionRecord payload'); }
}
interface Action {
  offset: number; end: number; op: number; data: Uint8Array;
  fn?: { name: string; params: { name: string; register: number }[]; flags: number; registers: number; actions: Action[] };
}
function records(bytes: Uint8Array, base = 0, depth = 0): Action[] {
  if (depth > 32) throw new DecodeError(base, 'Function nesting exceeds decoder limit');
  const r = new Reader(bytes, base), out: Action[] = [];
  while (r.at < bytes.length) {
    const offset = base + r.at, op = r.u8();
    const size = op >= 0x80 ? r.u16() : 0;
    const data = r.take(size);
    const action: Action = { offset, end: base + r.at, op, data };
    if (op === 0x9b || op === 0x8e) {
      const p = new Reader(data, offset + 3);
      const name = p.string(), count = p.u16();
      const registers = op === 0x8e ? p.u8() : 4;
      const flags = op === 0x8e ? p.u16() : 0;
      const params = Array.from({ length: count }, () => {
        const register = op === 0x8e ? p.u8() : 0;
        return { register, name: p.string() };
      });
      const length = p.u16(); p.done();
      const start = base + r.at;
      action.fn = { name, params, registers, flags, actions: records(r.take(length), start, depth + 1) };
      action.end = base + r.at;
    }
    out.push(action);
    if (op === 0) {
      // Some encoders pad action blocks with zeroes. Nonzero trailing bytes are
      // not silently discarded: they could be a branch destination.
      if (r.take(bytes.length - r.at).some((b) => b !== 0)) r.fail('Code after ActionEnd');
      break;
    }
  }
  return out;
}

interface Value { code: string; literal?: string | number | boolean | null; stable: boolean }
const literal = (v: string | number | boolean | null): Value => ({
  code: typeof v === 'number' ? (Object.is(v, -0) ? '-0' : String(v)) : JSON.stringify(v), literal: v, stable: true,
});
const ident = /^[A-Za-z_$][\w$]*$/;
const member = (obj: string, key: string, optional = false) => ident.test(key)
  ? `${obj}${optional ? '?.' : '.'}${key}` : `${obj}${optional ? '?.' : ''}[${JSON.stringify(key)}]`;
const pad = (text: string) => text.split('\n').map((s) => s ? `  ${s}` : s).join('\n');

class Decoder {
  private stack: Value[] = [];
  private deferred = new Set<Value>();
  private hasLoops = false;
  private pool: string[];
  private lines: string[] = [];
  private offset = 0;
  private registers = new Set<number>();
  private locals = new Map<string, string>();
  private declarations = new Set<string>();
  private unresolvedNames = new Set<string>();
  private flowDepth = 0;
  private boundaries: Map<number, number>;
  private backEdges = new Map<number, number>();

  constructor(private actions: Action[], private options: Required<ActionDecodeOptions>, pool: string[] = [],
    private fn?: Action['fn'], private namespace = '', private ids = { next: 0 }, private parent?: Decoder) {
    this.pool = [...pool];
    this.boundaries = new Map(actions.map((a, i) => [a.offset, i]));
    if (actions.length) this.boundaries.set(actions[actions.length - 1].end, actions.length);
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i]; this.offset = a.offset;
      if (a.op === 0x99 || a.op === 0x9d) {
        const dest = this.target(a);
        if (a.op === 0x99 && dest < i) {
          if (this.backEdges.has(dest)) this.fail('Multiple back edges require interpreter');
          this.backEdges.set(dest, i);
        }
      }
    }
    if (fn) {
      for (const [i, p] of fn.params.entries()) {
        if (this.locals.has(p.name)) this.fail('Duplicate function parameter');
        this.locals.set(p.name, this.localName(p.name, i));
      }
    }
  }
  private fail(message: string): never { throw new DecodeError(this.offset, message); }
  private localName(name: string, i: number) {
    // Avoid TS keywords, injected identifiers, and collisions with decoder locals.
    return ident.test(name) && !name.startsWith('$') && !RESERVED.has(name) ? name : `$param${this.namespace}${i}`;
  }
  private pop() {
    const value = this.stack.pop() ?? this.fail('Operand stack underflow');
    this.deferred.delete(value);
    return value;
  }
  private emit(s: string) { this.lines.push(s); }
  private capture(v: Value): Value {
    if (v.stable) return v;
    const name = `$value${++this.ids.next}`;
    this.emit(`const ${name}: any = ${v.code};`);
    this.deferred.delete(v);
    v.code = name; v.stable = true;
    return v;
  }
  private flush() { for (const value of this.deferred) this.capture(value); }
  private push(code: string) {
    // Older pending evaluations must occur before this one (even if popped later).
    this.flush();
    const value = { code, stable: false };
    this.stack.push(value); this.deferred.add(value);
  }
  private readName(name: string): string {
    if (name === 'this') return this.fn ? `(this ?? ${this.options.target})` : this.options.target;
    if (this.fn && name === 'arguments') this.fail('AVM1 arguments object requires interpreter');
    if (this.fn?.params.some((p) => p.name === name && p.register)) this.fail('Register-only parameter name requires interpreter');
    if (name === 'super') this.fail('super scope requires interpreter');
    const local = this.locals.get(name);
    if (local) return local;
    if (!ident.test(name)) this.fail(`Dynamic/path variable ${JSON.stringify(name)} requires interpreter`);
    this.unresolvedNames.add(name);
    return this.options.identifier(name);
  }
  private writeName(name: string): string {
    if (name === 'this' || name === 'arguments' || name === 'super') this.fail('Assignment to special scope name');
    const local = this.locals.get(name);
    if (local) return local;
    if (this.parent) return this.parent.writeName(name);
    const target = member(this.options.target, name);
    if (!ident.test(name) || this.options.identifier(name) !== target) {
      this.fail(`Assignment shadows resolved global ${JSON.stringify(name)}; requires interpreter`);
    }
    return target;
  }
  private name(v: Value): string {
    if (typeof v.literal !== 'string') this.fail('Dynamic variable name requires interpreter');
    return v.literal;
  }
  private count(): number {
    const n = this.pop().literal;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > this.stack.length) this.fail('Nonconstant or invalid argument count');
    return n;
  }
  private args(): string[] {
    const count = this.count();
    this.flush(); // AVM1 pushes arguments in reverse order; JS evaluates left to right.
    return Array.from({ length: count }, () => this.pop().code);
  }
  private target(a: Action): number {
    const p = new Reader(a.data, a.offset + 3), n = p.u16(); p.done();
    const dest = a.end + (n & 0x8000 ? n - 0x10000 : n);
    return this.boundaries.get(dest) ?? this.fail(`Branch target ${dest} is not an instruction boundary`);
  }
  private empty() { if (this.stack.length) this.fail('Nonempty stack at control-flow join'); }
  private region(start: number, end: number): string[] {
    const previous = this.lines; this.lines = []; this.flowDepth++;
    if (this.flowDepth > 64) this.fail('Control-flow nesting exceeds decoder limit');
    this.range(start, end); this.empty();
    this.flowDepth--; const lines = this.lines; this.lines = previous; return lines;
  }
  private range(start: number, end: number) {
    for (let i = start; i < end; i++) {
      const a = this.actions[i]; this.offset = a.offset;
      // A canonical pre-test loop has a forward If exit and a Jump back to its
      // condition. Keep condition evaluation INSIDE the loop, including calls.
      const loopTail = this.backEdges.get(i) ?? -1;
      let exitTest = -1;
      if (loopTail >= end) this.fail('Cross-region back edge requires interpreter');
      if (loopTail >= 0) {
        this.empty();
        for (let j = i; j < loopTail; j++) {
          if (this.actions[j].op === 0x9d && this.target(this.actions[j]) === loopTail + 1) { exitTest = j; break; }
          if ([0x99, 0x9d].includes(this.actions[j].op)) break;
        }
        if (exitTest < 0) this.fail('Unstructured loop requires interpreter');
        const previous = this.lines; this.lines = []; this.flowDepth++;
        for (let j = i; j < exitTest; j++) this.action(this.actions[j]);
        const condition = this.pop(); this.empty();
        const conditionLines = this.lines; this.lines = previous;
        const body = this.region(exitTest + 1, loopTail);
        this.flowDepth--;
        const budget = `$iterations${this.namespace}`;
        this.hasLoops = true;
        body.unshift(`if (++${budget} > 1000000) throw new Error("Decoded AVM1 loop budget exceeded");`);
        if (!conditionLines.length) this.emit(`while (!(${condition.code})) {\n${pad(body.join('\n'))}\n}`);
        else this.emit(`while (true) {\n${pad([body[0], ...conditionLines, `if (${condition.code}) break;`, ...body.slice(1)].join('\n'))}\n}`);
        i = loopTail; continue;
      }
      if (a.op === 0x9d) {
        const dest = this.target(a);
        if (dest <= i || dest > end) this.fail('Unstructured conditional branch requires interpreter');
        const condition = this.pop(); this.empty();
        const tail = this.actions[dest - 1];
        let join = dest;
        if (tail?.op === 0x99) join = this.target(tail);
        if (join < dest || join > end) this.fail('Unstructured branch join requires interpreter');
        const then = this.region(i + 1, tail?.op === 0x99 ? dest - 1 : dest);
        const otherwise = join > dest ? this.region(dest, join) : null;
        this.emit(`if (!(${condition.code})) {\n${pad(then.join('\n'))}\n}${otherwise ? ` else {\n${pad(otherwise.join('\n'))}\n}` : ''}`);
        i = join - 1; continue;
      }
      if (a.op === 0x99) {
        const dest = this.target(a);
        if (dest !== end) this.fail('Unstructured jump requires interpreter');
        this.empty(); return;
      }
      this.action(a);
      if ([0, 0x3e, 0x2a].includes(a.op)) {
        if (i + 1 < end && this.actions.slice(i + 1, end).some((x) => x.op !== 0)) this.fail('Unreachable actions require interpreter');
        return;
      }
    }
  }
  private action(a: Action) {
    this.offset = a.offset;
    const p = new Reader(a.data, a.offset + 3);
    const binary: Record<number, string> = { 0x47: '+', 0x48: '<', 0x49: '==', 0x60: '&', 0x61: '|', 0x62: '^', 0x63: '<<', 0x64: '>>', 0x65: '>>>', 0x66: '===', 0x67: '>' };
    if (binary[a.op]) {
      const right = this.pop(), left = this.pop();
      if ([0x47, 0x48, 0x49, 0x67].includes(a.op)) {
        const helper = ({ 0x47: 'add', 0x48: 'less', 0x49: 'equals', 0x67: 'greater' } as Record<number, string>)[a.op];
        this.push(`$rt.avm1.${helper}(${left.code}, ${right.code})`);
      } else if (a.op === 0x66) this.push(`$rt.avm1.strictEquals(${left.code}, ${right.code})`);
      else this.push(`($rt.avm1.number(${left.code}) ${binary[a.op]} $rt.avm1.number(${right.code}))`);
      return;
    }
    switch (a.op) {
      case 0: this.flush(); this.stack = []; break;
      case 0x04: case 0x05: case 0x06: case 0x07:
        this.flush(); this.emit(`${this.options.target}.${({ 4: 'nextFrame', 5: 'prevFrame', 6: 'play', 7: 'stop' } as Record<number, string>)[a.op]}();`); break;
      case 0x09: this.flush(); this.emit(`${this.options.identifier('stopAllSounds')}();`); break;
      case 0x0a: case 0x0b: case 0x0c: case 0x0d: case 0x0e: case 0x0f: case 0x3f: {
        const right = this.pop(), left = this.pop();
        const op = ({ 10: '+', 11: '-', 12: '*', 13: '/', 14: '===', 15: '<', 63: '%' } as Record<number, string>)[a.op];
        this.push(`($rt.avm1.number(${left.code}) ${op} $rt.avm1.number(${right.code}))`); break;
      }
      case 0x10: case 0x11: {
        const right = this.capture(this.pop()), left = this.pop();
        this.push(`(Boolean(${left.code}) ${a.op === 0x10 ? '&&' : '||'} Boolean(${right.code}))`); break;
      }
      case 0x12: this.push(`(!(${this.pop().code}))`); break;
      case 0x13: case 0x21: case 0x29: case 0x68: {
        const right = this.pop(), left = this.pop();
        const op = ({ 19: '===', 33: '+', 41: '<', 104: '>' } as Record<number, string>)[a.op];
        this.push(`($rt.avm1.string(${left.code}) ${op} $rt.avm1.string(${right.code}))`); break;
      }
      case 0x14: case 0x31: this.push(`$rt.avm1.string(${this.pop().code}).length`); break;
      case 0x17: { const value = this.pop(); if (!value.stable) this.emit(`${value.code};`); break; }
      case 0x18: this.push(`($rt.avm1.number(${this.pop().code}) | 0)`); break;
      case 0x1c: this.push(this.readName(this.name(this.pop()))); break;
      case 0x1d: case 0x3c: case 0x41: {
        const value = a.op === 0x41 ? { code: 'undefined', stable: true } : this.pop();
        const name = this.name(this.pop()); this.flush();
        if (name === 'this' || name === 'arguments') this.fail('Assignment to special scope name');
        if (a.op !== 0x1d && this.fn && !this.locals.has(name)) {
          if (this.flowDepth) this.fail('Conditional local declaration requires interpreter');
          if (this.unresolvedNames.has(name)) this.fail(`Local ${name} was read before declaration; dynamic scope requires interpreter`);
          const local = `$local${++this.ids.next}`;
          this.locals.set(name, local); this.declarations.add(local);
        }
        if (a.op !== 0x41) this.emit(`${this.writeName(name)} = ${value.code};`);
        else if (!this.fn) this.emit(`if (!(${JSON.stringify(name)} in ${this.options.target})) ${this.writeName(name)} = undefined;`);
        break;
      }
      case 0x22: { const property = this.pop(), target = this.pop(); this.push(`$rt.getProperty(${this.options.target}, ${target.code}, ${this.property(property)})`); break; }
      case 0x23: {
        const value = this.pop(), property = this.pop(), target = this.pop(); this.flush();
        this.emit(`$rt.setProperty(${this.options.target}, ${target.code}, ${this.property(property)}, ${value.code});`); break;
      }
      case 0x26: { const v = this.pop(); this.flush(); this.emit(`${this.options.identifier('trace')}(${typeof v.literal === 'string' ? v.code : `$rt.avm1.string(${v.code})`});`); break; }
      case 0x2a: case 0x3e: {
        const value = this.pop(); this.empty();
        if (a.op === 0x3e && !this.fn) this.fail('Top-level return requires interpreter');
        this.emit(a.op === 0x2a ? `$rt.avm1.raise(${value.code});` : `return ${value.code};`); break;
      }
      case 0x30: this.push(`${this.options.identifier('random')}(($rt.avm1.number(${this.pop().code}) | 0))`); break;
      case 0x34: this.push(`${this.options.identifier('getTimer')}()`); break;
      case 0x3d: case 0x40: {
        const name = this.name(this.pop()), args = this.args(); this.flush();
        if (CONTEXT_CALLS.has(name)) this.fail(`Context-dependent call ${name} requires interpreter`);
        const callee = this.readName(name);
        this.push(a.op === 0x40 ? `$rt.avm1.construct(${callee}, [${args.join(', ')}])` : `$rt.avm1.call(${callee}, ${this.options.target}, [${args.join(', ')}])`); break;
      }
      case 0x42: { const args = this.args(); this.push(`([${args.join(', ')}] as any)`); break; }
      case 0x43: {
        const count = this.count(); if (count * 2 > this.stack.length) this.fail('Invalid object entry count');
        this.flush(); const props: string[] = [];
        for (let i = 0; i < count; i++) {
          const value = this.pop(), key = this.pop();
          if (key.literal === undefined || key.literal === '__proto__') this.fail('Dynamic/prototype object key requires interpreter');
          props.push(`[${JSON.stringify(String(key.literal))}]: ${value.code}`);
        }
        this.push(`({ ${props.join(', ')} } as any)`); break;
      }
      case 0x44: this.push(`$rt.avm1.typeOf(${this.pop().code})`); break;
      case 0x4a: this.push(`$rt.avm1.number(${this.pop().code})`); break;
      case 0x4b: this.push(`$rt.avm1.string(${this.pop().code})`); break;
      case 0x4c: { const value = this.capture(this.pop()); this.stack.push(value, value); break; }
      case 0x4d: { this.flush(); const a = this.pop(), b = this.pop(); this.stack.push(a, b); break; }
      case 0x4e: {
        const key = this.pop(), obj = this.pop();
        const receiver = obj.literal !== undefined || obj.code === 'undefined' ? `(${obj.code} as any)` : obj.code;
        this.push(typeof key.literal === 'string' ? member(receiver, key.literal, true) : `${receiver}?.[${key.code}]`); break;
      }
      case 0x4f: {
        const value = this.pop(), key = this.pop(), obj = this.pop(); this.flush();
        const target = `(${obj.code} ?? $rt.sink)`;
        this.emit(`${typeof key.literal === 'string' ? member(target, key.literal) : `${target}[${key.code}]`} = ${value.code};`); break;
      }
      case 0x54: { const type = this.pop(), obj = this.pop(); this.push(`$rt.avm1.instanceOf(${obj.code}, ${type.code})`); break; }
      case 0x50: case 0x51: this.push(`($rt.avm1.number(${this.pop().code}) ${a.op === 0x50 ? '+' : '-'} 1)`); break;
      case 0x52: case 0x53: {
        const key = this.pop(), obj = this.pop();
        // Object evaluation happened AFTER arguments in the bytecode. Snapshot
        // arguments before constructing a JS call with the receiver first.
        const args = this.args(); this.flush();
        if (a.op === 0x52 && key.literal === 'registerClass' && obj.code === 'Object') {
          this.push(`$rt.registerLinkage(${args.join(', ')})`);
        } else if (a.op === 0x53) {
          this.push(`$rt.avm1.construct(${key.literal === '' ? obj.code : `${obj.code}?.[${key.code}]`}, [${args.join(', ')}])`);
        } else if (key.literal === '' || key.code === 'undefined') {
          this.push(`$rt.avm1.call(${obj.code}, undefined, [${args.join(', ')}])`);
        } else this.push(`$rt.invoke(${obj.code}, ${key.code}, ${args.join(', ')})`.replace(/, \)$/, ')'));
        break;
      }
      case 0x81: this.flush(); this.emit(`${this.options.target}.gotoAndStop(${p.u16() + 1});`); break;
      case 0x87: {
        const r = p.u8(); this.registers.add(r); this.flush();
        const value = this.pop(); this.emit(`$register${this.namespace}${r} = ${value.code};`);
        this.push(`$register${this.namespace}${r}`); break;
      }
      case 0x88: {
        if (this.flowDepth) this.fail('Control-flow-dependent constant pool requires interpreter');
        const count = p.u16(); this.pool = Array.from({ length: count }, () => p.string()); break;
      }
      case 0x8c: this.flush(); this.emit(`${this.options.target}.gotoAndStop(${JSON.stringify(p.string())});`); break;
      case 0x8e: case 0x9b: {
        const fn = a.fn!;
        if (fn.flags & ~ (1 | 8 | 32 | 64 | 256) || fn.params.some((x) => x.register > 0 && x.register >= fn.registers)) this.fail('Unsupported function register/preload configuration');
        const child = new Decoder(fn.actions, { ...this.options, identifier: (n) => this.readName(n) }, this.pool, fn, `fn${++this.ids.next}_`, this.ids, this);
        const body = child.decode();
        const params = [...child.locals.values()].slice(0, fn.params.length).map((n) => `${n}?: any`);
        const code = `function (this: any${params.length ? ', ' + params.join(', ') : ''}): any {\n${pad(body)}\n}`;
        this.flush();
        if (fn.name) this.emit(`${this.writeName(fn.name)} = ${code};`);
        else this.push(`(${code})`);
        return;
      }
      case 0x96: {
        while (p.at < p.bytes.length) {
          const kind = p.u8();
          if (kind === 0) this.stack.push(literal(p.string()));
          else if (kind === 2) this.stack.push(literal(null));
          else if (kind === 3) this.stack.push({ code: 'undefined', stable: true });
          else if (kind === 4) { const r = p.u8(); this.registers.add(r); this.push(`$register${this.namespace}${r}`); }
          else if (kind === 5) this.stack.push(literal(p.u8() !== 0));
          else if (kind === 8 || kind === 9) {
            const index = kind === 8 ? p.u8() : p.u16();
            if (index >= this.pool.length) this.fail(`Missing constant pool entry ${index}`);
            this.stack.push(literal(this.pool[index]));
          } else if ([1, 6, 7].includes(kind)) {
            const bytes = p.take(kind === 6 ? 8 : 4).slice();
            if (kind === 6) bytes.set([...bytes.slice(4), ...bytes.slice(0, 4)]);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            this.stack.push(literal(kind === 1 ? view.getFloat32(0, true) : kind === 6 ? view.getFloat64(0, true) : view.getInt32(0, true)));
          } else this.fail(`Unsupported Push value type ${kind}`);
        }
        break;
      }
      case 0x9f: {
        const flags = p.u8(); if (flags & ~3) this.fail('Invalid GotoFrame2 flags');
        const bias = flags & 2 ? p.u16() : 0;
        const frame = this.pop(); this.flush();
        if (bias) this.fail('GotoFrame2 scene bias requires interpreter');
        this.emit(`${this.options.target}.${flags & 1 ? 'gotoAndPlay' : 'gotoAndStop'}(${frame.code});`); break;
      }
      default: this.fail(`Unsupported opcode 0x${a.op.toString(16).padStart(2, '0')}`);
    }
    p.done();
  }
  private property(v: Value): string {
    const names = ['_x', '_y', '_xscale', '_yscale', '_currentframe', '_totalframes', '_alpha', '_visible', '_width', '_height', '_rotation', '_target', '_framesloaded', '_name', '_droptarget', '_url', '_highquality', '_focusrect', '_soundbuftime', '_quality', '_xmouse', '_ymouse'];
    if (typeof v.literal !== 'number' || !names[v.literal]) this.fail('Dynamic property index requires interpreter');
    return JSON.stringify(names[v.literal]);
  }
  decode(): string {
    this.range(0, this.actions.length); this.flush();
    const initial = new Map<number, string>();
    if (this.fn) {
      let reg = 1;
      const preloads: [number, () => string][] = [
        [1, () => `(this ?? ${this.options.target})`],
        [64, () => this.options.identifier('_root')],
        [256, () => this.options.identifier('_global')],
      ];
      for (const [flag, expr] of preloads) if (this.fn.flags & flag) initial.set(reg++, expr());
      for (const param of this.fn.params) if (param.register) initial.set(param.register, this.locals.get(param.name)!);
      for (const r of initial.keys()) this.registers.add(r);
    }
    return [
      ...(this.hasLoops ? [`let $iterations${this.namespace} = 0;`] : []),
      ...[...this.declarations].map((n) => `let ${n}: any;`),
      ...[...this.registers].sort((a, b) => a - b).map((r) => `let $register${this.namespace}${r}: any${initial.has(r) ? ` = ${initial.get(r)}` : ''};`),
      ...this.lines,
    ].join('\n');
  }
}
const CONTEXT_CALLS = new Set('eval set getProperty setProperty duplicateMovieClip removeMovieClip startDrag loadMovie loadVariables unloadMovie call print printAsBitmap'.split(' '));
const RESERVED = new Set('this arguments super class function var let const return new delete default if else while do for in instanceof switch case break continue throw try catch finally with import export extends implements interface private public protected static yield await enum null true false undefined'.split(' '));

/** Decode one Base64 action block. `code === null` means retain original bytes. */
export function decodeAVM1Actions(base64: string, options: ActionDecodeOptions = {}): ActionDecodeResult {
  try {
    if (base64.length > 180_000) throw new DecodeError(0, 'Action block exceeds decoder size limit');
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(base64)) throw new DecodeError(0, 'Invalid Base64 action block');
    const bytes = Uint8Array.from(atob(base64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const target = options.target ?? '$t';
    const identifier = options.identifier ?? ((name: string) => member(target, name));
    return { code: new Decoder(records(bytes), { target, identifier }).decode(), diagnostics: [] };
  } catch (e) {
    return { code: null, diagnostics: [{ offset: e instanceof DecodeError ? e.offset : 0, message: e instanceof Error ? e.message : String(e) }] };
  }
}
