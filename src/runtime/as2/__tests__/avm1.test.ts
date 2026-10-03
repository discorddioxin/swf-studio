import { describe, expect, it, beforeEach } from 'vitest';
import { runActions, runActionsBase64, setAvm1Env, bytesToBase64, takeAvm1Warnings, Avm1Thrown } from '../avm1';

// ---------------------------------------------------------------- assembler

type PushVal =
  | { t: 'str'; v: string }
  | { t: 'int'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'reg'; v: number }
  | { t: 'const'; v: number }
  | { t: 'null' }
  | { t: 'undef' };

const str = (v: string): PushVal => ({ t: 'str', v });
const int = (v: number): PushVal => ({ t: 'int', v });
const bool = (v: boolean): PushVal => ({ t: 'bool', v });
const reg = (v: number): PushVal => ({ t: 'reg', v });
const constant = (v: number): PushVal => ({ t: 'const', v });

const utf8 = (s: string) => [...new TextEncoder().encode(s)];

const OP = {
  stop: 0x07, add: 0x0a, not: 0x12, getVariable: 0x1c, setVariable: 0x1d,
  trace: 0x26, throw: 0x2a, callFunction: 0x3d, return: 0x3e, defineLocal: 0x3c,
  initArray: 0x42, initObject: 0x43, getMember: 0x4e, setMember: 0x4f, add2: 0x47, less2: 0x48,
  callMethod: 0x52, push: 0x96, jump: 0x99, ifOp: 0x9d, constantPool: 0x88, defineFunction2: 0x8e, tryOp: 0x8f,
  setTarget: 0x8b,
};

class Asm {
  bytes: number[] = [];
  private labels = new Map<string, number>();
  private fixups: { start: number; label: string }[] = [];

  payload(op: number, body: number[]): this {
    this.bytes.push(op, body.length & 0xff, (body.length >> 8) & 0xff, ...body);
    return this;
  }

  simple(op: number): this { this.bytes.push(op); return this; }

  label(name: string): this { this.labels.set(name, this.bytes.length); return this; }

  /** Jump (0x99) to a label. */
  jumpTo(name: string): this { return this.relative(OP.jump, name); }

  /** If (0x9d) to a label (jumps when the condition is true). */
  ifTo(name: string): this { return this.relative(OP.ifOp, name); }

  private relative(op: number, name: string): this {
    const start = this.bytes.length;
    this.bytes.push(op, 2, 0, 0, 0); // opcode, payload length, i16 offset placeholder
    this.fixups.push({ start, label: name });
    return this;
  }

  push(...values: PushVal[]): this {
    const body: number[] = [];
    for (const v of values) {
      switch (v.t) {
        case 'str': body.push(0, ...utf8(v.v), 0); break;
        case 'int': body.push(7, v.v & 0xff, (v.v >> 8) & 0xff, (v.v >> 16) & 0xff, (v.v >> 24) & 0xff); break;
        case 'bool': body.push(5, v.v ? 1 : 0); break;
        case 'reg': body.push(4, v.v); break;
        case 'const': body.push(8, v.v); break;
        case 'null': body.push(2); break;
        case 'undef': body.push(3); break;
      }
    }
    return this.payload(OP.push, body);
  }

  defineFunction2(name: string, params: string[], body: Asm, opts: { registerCount?: number; flags?: number; paramRegisters?: number[] } = {}): this {
    const header: number[] = [...utf8(name), 0, params.length & 0xff, (params.length >> 8) & 0xff];
    header.push(opts.registerCount ?? 0);
    const flags = opts.flags ?? 0;
    header.push(flags & 0xff, (flags >> 8) & 0xff);
    params.forEach((p, i) => {
      header.push(opts.paramRegisters?.[i] ?? 0);
      header.push(...utf8(p), 0);
    });
    header.push(body.bytes.length & 0xff, (body.bytes.length >> 8) & 0xff);
    // the record length excludes the body, which follows the payload (SWF spec)
    this.bytes.push(OP.defineFunction2, header.length & 0xff, (header.length >> 8) & 0xff, ...header, ...body.bytes);
    return this;
  }

  constantPool(...strings: string[]): this {
    const body: number[] = [strings.length & 0xff, (strings.length >> 8) & 0xff];
    for (const s of strings) body.push(...utf8(s), 0);
    return this.payload(OP.constantPool, body);
  }

  /** SetTarget("path"); pass '' to reset. */
  setTarget(path: string): this {
    return this.payload(OP.setTarget, [...utf8(path), 0]);
  }

  /** try { … } catch (name) { … } — no finally. */
  tryCatch(name: string, tryBody: Asm, catchBody: Asm): this {
    const header = [1, 0, 0, 0, 0, 0, 0, ...utf8(name), 0];
    header[1] = tryBody.bytes.length & 0xff; header[2] = (tryBody.bytes.length >> 8) & 0xff;
    header[3] = catchBody.bytes.length & 0xff; header[4] = (catchBody.bytes.length >> 8) & 0xff;
    this.bytes.push(OP.tryOp, header.length & 0xff, (header.length >> 8) & 0xff, ...header, ...tryBody.bytes, ...catchBody.bytes);
    return this;
  }

  done(): Uint8Array {
    for (const f of this.fixups) {
      const delta = (this.labels.get(f.label) ?? this.bytes.length) - (f.start + 5);
      this.bytes[f.start + 3] = delta & 0xff;
      this.bytes[f.start + 4] = (delta >> 8) & 0xff;
    }
    return new Uint8Array([...this.bytes, 0x00]);
  }
}

function assemble(build: (a: Asm) => void): Uint8Array {
  const a = new Asm();
  build(a);
  return a.done();
}

// --------------------------------------------------------------------- env

const traceLog: string[] = [];

beforeEach(() => {
  traceLog.length = 0;
  takeAvm1Warnings();
  setAvm1Env({
    global: {
      Object, Array, String, Number, Boolean, Math, Function, Date,
      trace: (m: string) => traceLog.push(String(m)),
      getTimer: () => 1234,
    },
  });
});

describe('AVM1 interpreter', () => {
  it('assigns and reads timeline variables through SetVariable/GetVariable', () => {
    const clip: any = {};
    runActions(clip, assemble((a) => {
      a.push(str('answer'), int(41), int(1)).simple(OP.add).simple(OP.setVariable);
      a.push(str('answer')).simple(OP.getVariable).simple(OP.trace);
    }));
    expect(clip.answer).toBe(42);
    expect(traceLog).toEqual(['42']);
  });

  it('resolves variables through the scope chain onto the clip', () => {
    const clip: any = { existing: 'old' };
    runActions(clip, assemble((a) => {
      a.push(str('existing'), str('new')).simple(OP.setVariable);
      a.push(str('fresh'), int(7)).simple(OP.setVariable);
    }));
    expect(clip.existing).toBe('new');
    expect(clip.fresh).toBe(7);
  });

  it('defines and calls an AVM1 function with parameters (registers + names)', () => {
    const clip: any = {};
    const body = new Asm();
    body.push(reg(1), reg(2)).simple(OP.add).simple(OP.return); // return a + b
    runActions(clip, assemble((a) => {
      a.defineFunction2('add', ['a', 'b'], body, { paramRegisters: [1, 2], registerCount: 3 });
      // compilers push the arguments right-to-left (last argument first)
      a.push(str('sum'), int(3), int(2), int(2), str('add')).simple(OP.callFunction).simple(OP.setVariable);
    }));
    expect(clip.sum).toBe(5);
  });

  it('binds named parameters as locals', () => {
    const clip: any = {};
    const body = new Asm();
    body.push(str('doubled'), str('x')).simple(OP.getVariable).simple(OP.defineLocal); // var doubled = x
    body.push(str('doubled')).simple(OP.getVariable).simple(OP.trace);
    body.push(str('x')).simple(OP.getVariable).push(int(2)).simple(0x0c).simple(OP.return); // return x * 2
    runActions(clip, assemble((a) => {
      a.defineFunction2('double', ['x'], body, { registerCount: 1 });
      a.push(str('out'), int(21), int(1), str('double')).simple(OP.callFunction).simple(OP.setVariable);
    }));
    expect(clip.out).toBe(42);
    expect(clip.x).toBeUndefined();
    expect(clip.doubled).toBeUndefined();
    expect(traceLog).toEqual(['21']);
  });

  it('keeps the argument order of a real compiler (args pushed last-first)', () => {
    // `this.root.attachMovie("splashScreen", "splashScreen", 400)` compiled by the
    // Flash 8 compiler: the three arguments are pushed right-to-left.
    const calls: any[] = [];
    const clip: any = { root: { attachMovie: (...args: any[]) => { calls.push(args); return {}; } } };
    runActions(clip, assemble((a) => {
      a.push(int(400), str('splashScreen'), str('splashScreen'), int(3)); // depth, name, linkage, argc
      a.push(str('root')).simple(OP.getVariable);                           // receiver
      a.push(str('attachMovie')).simple(OP.callMethod);
    }));
    expect(calls).toEqual([['splashScreen', 'splashScreen', 400]]);
  });

  it('calls methods with CallMethod (args, count, object, name)', () => {
    const calls: any[] = [];
    const obj: any = { hit(a: number, b: number) { calls.push([this, a, b]); return a + b; } };
    const clip: any = { obj };
    runActions(clip, assemble((a) => {
      a.push(str('result'));                                   // assignment target
      a.push(int(5), int(4), int(2));                          // args (last first), argCount
      a.push(str('obj')).simple(OP.getVariable);               // receiver
      a.push(str('hit')).simple(OP.callMethod).simple(OP.setVariable);
    }));
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(obj);
    expect(clip.result).toBe(9);
  });

  it('implements If/Jump control flow (counts to 3)', () => {
    const clip: any = {};
    runActions(clip, assemble((a) => {
      a.push(str('i'), int(0)).simple(OP.setVariable);
      a.label('test');
      a.push(str('i')).simple(OP.getVariable).push(int(3)).simple(OP.less2); // i < 3
      a.ifTo('body');
      a.jumpTo('end');
      a.label('body');
      a.push(str('i'), str('i')).simple(OP.getVariable).push(int(1)).simple(OP.add2).simple(OP.setVariable);
      a.jumpTo('test');
      a.label('end');
      a.push(str('i')).simple(OP.getVariable).simple(OP.trace);
    }));
    expect(clip.i).toBe(3);
    expect(traceLog).toEqual(['3']);
  });

  it('reads constants from a ConstantPool (Push constant8)', () => {
    const clip: any = {};
    runActions(clip, assemble((a) => {
      a.constantPool('hello', 'world');
      a.push(str('joined'), constant(0), constant(1)).simple(OP.add2).simple(OP.setVariable);
    }));
    expect(clip.joined).toBe('helloworld');
  });

  it('supports tellTarget (SetTarget) scoping', () => {
    const inner: any = {};
    const clip: any = { inner };
    runActions(clip, assemble((a) => {
      a.setTarget('inner');
      a.push(str('x'), int(5)).simple(OP.setVariable);
      a.setTarget('');
      a.push(str('y'), int(6)).simple(OP.setVariable);
    }));
    expect(inner.x).toBe(5);
    expect(clip.y).toBe(6);
    expect(clip.x).toBeUndefined();
  });

  it('keeps function locals local (DefineLocal)', () => {
    const clip: any = {};
    const body = new Asm();
    body.push(str('secret'), int(1)).simple(OP.defineLocal);
    body.push(str('secret')).simple(OP.getVariable).simple(OP.return);
    runActions(clip, assemble((a) => {
      a.defineFunction2('f', [], body, { registerCount: 1 });
      a.push(str('out'), int(0), str('f')).simple(OP.callFunction).simple(OP.setVariable);
    }));
    expect(clip.out).toBe(1);
    expect(clip.secret).toBeUndefined();
  });

  it('throws and catches with Try/catch', () => {
    const clip: any = {};
    const tryBody = new Asm(); tryBody.push(int(7)).simple(OP.throw);
    const catchBody = new Asm(); catchBody.push(str('caught'), str('e')).simple(OP.getVariable).simple(OP.setVariable);
    runActions(clip, assemble((a) => { a.tryCatch('e', tryBody, catchBody); }));
    expect(clip.caught).toBe(7);
  });

  it('exposes thrown values to the caller', () => {
    expect(() => runActions({}, assemble((a) => { a.push(str('boom')).simple(OP.throw); }))).toThrowError(Avm1Thrown);
  });

  it('handles InitArray/InitObject and SetMember', () => {
    const clip: any = { holder: {} };
    runActions(clip, assemble((a) => {
      a.push(str('holder')).simple(OP.getVariable);   // object
      // array literal: elements are pushed in reverse ([a, b] → push b, push a, count)
      a.push(str('list'), str('b'), str('a'), int(2)).simple(OP.initArray).simple(OP.setMember);
      a.push(str('holder')).simple(OP.getVariable);
      a.push(str('map'), str('k'), int(9), int(1)).simple(OP.initObject).simple(OP.setMember);
    }));
    expect(clip.holder.list).toEqual(['a', 'b']);
    expect(clip.holder.map).toEqual({ k: 9 });
  });

  it('runs bytecode from base64 (the $rt.actions channel)', () => {
    const clip: any = {};
    runActionsBase64(clip, bytesToBase64(assemble((a) => { a.push(str('ok'), bool(true)).simple(OP.setVariable); })));
    expect(clip.ok).toBe(true);
  });

  it('reports unknown opcodes instead of throwing', () => {
    runActions({}, new Uint8Array([0x01, 0x00]));
    expect(takeAvm1Warnings().some((w) => /unhandled/.test(w.message))).toBe(true);
  });
});
