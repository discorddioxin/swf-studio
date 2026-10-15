// P-03a, interpreted mode: the same escapes as raw AVM1 bytecode, run by the
// interpreter (`runActions`) with the `_global` the player installs. Every member
// read and every call of the interpreter goes through the host guard, so however a
// script reaches JavaScript's `Function`, it gets AS1/AS2's, which compiles nothing.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runActions, setAvm1Env, takeAvm1Warnings } from '../avm1';
import { as2Globals } from '..';

declare global { var __x: unknown }

const utf8 = (s: string) => [...new TextEncoder().encode(s)];
type V = string | number | undefined;
/** A minimal AVM1 assembler: Push (strings, ints, undefined) and the plain opcodes. */
class Asm {
  bytes: number[] = [];
  push(...values: V[]): this {
    const body: number[] = [];
    for (const v of values) {
      if (typeof v === 'string') body.push(0, ...utf8(v), 0);
      else if (typeof v === 'number') body.push(7, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
      else body.push(3);
    }
    this.bytes.push(0x96, body.length & 0xff, body.length >> 8, ...body);
    return this;
  }
  op(code: number): this { this.bytes.push(code); return this; }
  done(): Uint8Array { return new Uint8Array([...this.bytes, 0]); }
}
const OP = { getVariable: 0x1c, setVariable: 0x1d, getMember: 0x4e, callMethod: 0x52, callFunction: 0x3d, newObject: 0x40, add2: 0x47, pop: 0x17 };
const PWN = 'globalThis.__x = 1';

beforeEach(() => { takeAvm1Warnings(); setAvm1Env({ global: as2Globals() }); });
afterEach(() => { delete globalThis.__x; setAvm1Env(null); });

/** Run, then call whatever the script stored in `f` (as AS2 would: `f()`). */
function run(build: (a: Asm) => Asm): Record<string, unknown> {
  const clip: Record<string, unknown> = {};
  runActions(clip, build(new Asm()).done());
  runActions(clip, new Asm().push(0, 'f').op(OP.callFunction).op(OP.pop).done());
  return clip;
}

describe('P-03a: interpreted AVM1 cannot reach a string compiler', () => {
  it('"".constructor.constructor(src)', () => {
    // f = "".constructor.constructor(PWN)
    run((a) => a.push('f', PWN, 1, '', 'constructor').op(OP.getMember).push('constructor').op(OP.callMethod).op(OP.setVariable));
    expect(globalThis.__x).toBeUndefined();
  });

  it('this.constructor.constructor(src)', () => {
    run((a) => a.push('f', PWN, 1, 'this').op(OP.getVariable).push('constructor').op(OP.getMember)
      .push('constructor').op(OP.callMethod).op(OP.setVariable));
    expect(globalThis.__x).toBeUndefined();
  });

  it('a computed "constr" + "uctor" key', () => {
    run((a) => a.push('f', PWN, 1, 'this').op(OP.getVariable).push('constr', 'uctor').op(OP.add2).op(OP.getMember)
      .push('constr', 'uctor').op(OP.add2).op(OP.callMethod).op(OP.setVariable));
    expect(globalThis.__x).toBeUndefined();
  });

  it('Function(src) and new Function(src)', () => {
    run((a) => a.push('f', PWN, 1, 'Function').op(OP.callFunction).op(OP.setVariable));
    expect(globalThis.__x).toBeUndefined();
    run((a) => a.push('f', PWN, 1, 'Function').op(OP.newObject).op(OP.setVariable));
    expect(globalThis.__x).toBeUndefined();
  });

  it('a property descriptor\'s value', () => {
    // f = Object.getOwnPropertyDescriptor(Function.prototype, "constructor").value(PWN)
    run((a) => a.push('f', PWN, 1, 'constructor', 'Function').op(OP.getVariable).push('prototype').op(OP.getMember)
      .push(2, 'Object').op(OP.getVariable).push('getOwnPropertyDescriptor').op(OP.callMethod)
      .push('value').op(OP.callMethod).op(OP.setVariable));
    expect(globalThis.__x).toBeUndefined();
  });

  it('keeps AS2 semantics: an object\'s constructor is its class', () => {
    const clip = run((a) => a
      .push('o', 0, 'Object').op(OP.newObject).op(OP.setVariable)
      .push('this').op(OP.getVariable).push('isObject', 'o').op(OP.getVariable).push('constructor').op(OP.getMember)
      .push('Object').op(OP.getVariable).op(0x49 /* equals2 */).op(0x4f /* setMember */));
    expect(clip.isObject).toBe(true);
  });
});
