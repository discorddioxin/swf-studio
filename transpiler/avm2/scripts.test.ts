// Name resolution and script-level code on hand-assembled ABC, checked by running
// the linked program:
//
//  - `call` pops `…, function, receiver, args` — the receiver is the `this`;
//  - `newclass` pops the base class, and a script init's own statements (statics a
//    compiler set there, haXe's `Boot`) run once the program is linked;
//  - a private/protected name is the class's own member even when a global is
//    spelt the same (`getTimer`);
//  - a superclass's static named bare is `Base.name`.
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN, RETURN_VOID } from './testAbc';

const MN = { Object: 1, Base: 2, Sub: 3, K: 4, getTimer: 5, m: 6 };

function fixture(): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'Object', ns: '', nsKind: 'package' },
      { kind: 'QName', name: 'Base', ns: '', nsKind: 'package' },
      { kind: 'QName', name: 'Sub', ns: '', nsKind: 'package' },
      { kind: 'QName', name: 'K', ns: '', nsKind: 'package' },
      { kind: 'QName', name: 'getTimer', ns: '', nsKind: 'private' },
      { kind: 'QName', name: 'm', ns: '', nsKind: 'package' },
    ],
    methods: [method(), method(), method(), method(), method(['*', '*']), method(), method(), method(), method()],
    classes: [
      {
        instance: { name: 'Base', superName: 'Object', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false, traits: [] },
        cinit: 1, traits: [fn('m', 7)],
      },
      {
        instance: {
          name: 'Sub', superName: 'Base', interfaces: [], iinit: 2, sealed: true, isFinal: false, isInterface: false,
          traits: [fn('invoke', 4), fn('getTimer', 5), fn('stamp', 6), fn('inherited', 8)],
        },
        cinit: 3, traits: [],
      },
    ],
    scripts: [{
      init: 9,
      traits: [
        { name: 'Base', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] },
        { name: 'Sub', kind: 'class', attr, classIndex: 1, slotId: 2, metadata: [] },
      ],
    }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      body(2, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(3, [...OPEN, RETURN_VOID]),
      // invoke(f, o): return f.call(o) — getlocal1; getlocal2; call 0
      body(4, [...OPEN, 0xd1, 0xd2, 0x41, 0x00, 0x48]),
      // private getTimer(): return 42
      body(5, [...OPEN, 0x24, 42, 0x48]),
      // stamp(): return getTimer() — the private method, not flash.utils'
      body(6, [...OPEN, 0x5d, MN.getTimer, 0x46, MN.getTimer, 0x00, 0x48]),
      // static Base.m(): return 5
      body(7, [...OPEN, 0x24, 5, 0x48]),
      // inherited(): return m() — Base's static, named bare in Sub
      body(8, [...OPEN, 0x5d, MN.m, 0x46, MN.m, 0x00, 0x48]),
      // script init: Base = newclass(Object); Sub = newclass(Base); Base.K = 7
      body(9, [
        0xd0, 0x30, 0x65, 0x00,                      // getlocal0; pushscope; getscopeobject 0
        0x60, MN.Object, 0x30, 0x60, MN.Object,      // getlex Object; pushscope; getlex Object
        0x58, 0x00, 0x1d, 0x68, MN.Base,             // newclass 0; popscope; initproperty Base
        0x65, 0x00,
        0x60, MN.Object, 0x30, 0x60, MN.Base, 0x30, 0x60, MN.Base,
        0x58, 0x01, 0x1d, 0x1d, 0x68, MN.Sub,        // newclass 1; popscope ×2; initproperty Sub
        0x60, MN.Base, 0x24, 7, 0x61, MN.K,          // getlex Base; pushbyte 7; setproperty K
        RETURN_VOID,
      ]),
    ],
    metadata: [],
  };
}

describe('script code and name resolution', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Base', 'Sub']) });
  const text = (path: string) => result.files.find((f) => f.path === path)?.text ?? '';
  const program = linkProgram(compileSources(result.files));
  const Base = program.getDefinition('Base') as { K?: number };
  const Sub = program.getDefinition('Sub') as new () => {
    invoke(f: unknown, o: unknown): unknown; stamp(): number; inherited(): number;
  };

  it('lifts and links', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
  });

  it('`call` runs the function with the receiver under it as `this`', () => {
    expect(new Sub().invoke(function (this: { tag: string }) { return this.tag; }, { tag: 'mine' })).toBe('mine');
  });

  it('a script init keeps only what it does beyond defining its classes, and the loader runs it', () => {
    const init = text('script/init_9.ts');
    expect(init).toContain('.K = 7');
    expect(init).not.toMatch(/__class\d|Object\.(Base|Sub)|\bBase = /);
    expect(Base.K).toBe(7);
  });

  it('a private name is the member, even spelt like a global', () => {
    expect(new Sub().stamp()).toBe(42);
    expect(text('Sub.ts')).toContain('this.getTimer()');
  });

  it("a superclass's static named bare is the superclass's", () => {
    expect(new Sub().inherited()).toBe(5);
    expect(text('Sub.ts')).toMatch(/Base\.m\(\)/);
  });
});
