// P-03a: AS2 reaches JavaScript's `Function` through `constructor` — closed.
//
// AS1/AS2 had no string compiler. In JavaScript every function's `constructor` is
// one, so `"".constructor.constructor("…")()` was a way out of the movie. These run
// real AS2 source through `buildAS2Program` (transpile → sucrase → link) and call
// the frame script; the AVM1-bytecode twin is `src/runtime/as2/__tests__/avm1.sandbox.test.ts`.
import { afterEach, describe, expect, it } from 'vitest';
import { buildAS2Program } from '../../../../src/engine/as2/program';

declare global { var __x: unknown }
afterEach(() => { delete globalThis.__x; });

/** Run `code` as frame 1 of the main timeline on a plain clip; return the clip. */
function runFrame(code: string): Record<string, unknown> {
  const build = buildAS2Program([{ path: 'scripts/frame_1/DoAction.as', text: code }]);
  expect(build.errors).toEqual([]);
  const frame = build.program?.timelines[0]?.frames?.[1];
  expect(typeof frame).toBe('function');
  const clip: Record<string, unknown> = {};
  try { frame!.call(clip as never); } catch (e) { clip.__threw = String(e); }
  return clip;
}

const PWN = '"globalThis.__x = 1"';

describe('P-03a: transpiled AS2 cannot reach a string compiler', () => {
  it('"".constructor.constructor(src)', () => {
    const clip = runFrame(`var f = "".constructor.constructor(${PWN}); this.kind = typeof f; if (f) f();`);
    expect(globalThis.__x).toBeUndefined();
    expect(clip.kind).toBe('undefined');
  });

  it('this.constructor.constructor(src)', () => {
    runFrame(`var f = this.constructor.constructor(${PWN}); if (f) f();`);
    expect(globalThis.__x).toBeUndefined();
  });

  it('a computed "constr" + "uctor" key', () => {
    runFrame(`var k = "constr" + "uctor"; var c = this[k]; var f = c[k](${PWN}); if (f) f();`);
    expect(globalThis.__x).toBeUndefined();
  });

  it('a literal ["constructor"] key', () => {
    runFrame(`var f = this["constructor"]["constructor"](${PWN}); if (f) f();`);
    expect(globalThis.__x).toBeUndefined();
  });

  it('Function(src) and new Function(src)', () => {
    const clip = runFrame(`var f = Function(${PWN}); if (f) f(); var g = new Function(${PWN}); this.g = typeof g; this.ok = true;`);
    expect(globalThis.__x).toBeUndefined();
    expect(clip.ok).toBe(true);
    expect(clip.g).not.toBe('function');
  });

  it('a method of a function reached through its prototype', () => {
    runFrame(`var p = (function () {}).__proto__; var f = p.constructor(${PWN}); if (f) f();`);
    expect(globalThis.__x).toBeUndefined();
  });

  it('keeps AS2 semantics: constructor of an object, __proto__ writes, instanceof Function', () => {
    const clip = runFrame(`
      var o = new Object(); this.isObject = (o.constructor == Object);
      var base = { greet: 7 }; var d = {}; d.__proto__ = base; this.inherited = d.greet;
      this.isFn = (function () {}) instanceof Function;
      var dict = {}; var w = "constructor"; dict[w] = 3; this.stored = dict[w];`);
    expect(clip.__threw).toBeUndefined();
    expect(clip.isObject).toBe(true);
    expect(clip.inherited).toBe(7);
    expect(clip.isFn).toBe(true);
    expect(clip.stored).toBe(3);
  });

  it('page globals are out of reach of a frame script', () => {
    const clip = runFrame(`this.d = typeof document; this.e = typeof eval; this.g = typeof globalThis;`);
    // Unknown names resolve on the timeline in AS2, so these are the clip's own (unset) members.
    expect([clip.d, clip.e, clip.g]).toEqual(['undefined', 'undefined', 'undefined']);
  });
});
