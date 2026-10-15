// A method's frame, on hand-assembled ABC: the scope indices `getscopeobject` reads,
// and the debug parameter names the signature takes.
//
// `getscopeobject n` indexes the frame's *local* scope stack, which starts empty, so
// in `getlocal0; pushscope; newactivation; …; pushscope` the activation is index 1.
// The lifter used to seed that stack with `this`, which made index 1 `this` again:
// an activation slot write became a write to whichever instance field had the same
// slot number (FocusManager.addFocusables wrote `this.SEEK_BAR_HANDLE`).
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { parameterNames } from './lift';
import { attr, body, fn, method, OPEN, RETURN_VOID, slot } from './testAbc';

function fixture(): AbcFile {
  const scoped = { ...method(['*']), needActivation: true };
  // Flex SDK output: one name repeated for every parameter.
  const repeated = { ...method(['*', '*']), paramNames: ['b', 'b'] };
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [{ kind: '?', name: '' }],
    methods: [method(), method(), scoped, repeated, method()],
    classes: [{
      instance: {
        name: 'Frames', superName: 'Object', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false,
        // Instance slot 1: what a mis-numbered scope index lands on.
        traits: [{ ...slot('field', 'String'), slotId: 1 }, fn('scoped', 2), fn('sum', 3)],
      },
      cinit: 1, traits: [],
    }],
    scripts: [{ init: 4, traits: [{ name: 'Frames', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] }] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      // scoped(x): var x lives in the activation; return it from there.
      {
        ...body(2, [...OPEN,
          0x57, 0x2a, 0xd6, 0x30, // 2  newactivation; dup; setlocal2; pushscope
          0x65, 0x01, 0xd1, 0x6d, 0x01, // 6  getscopeobject 1; getlocal1; setslot 1
          0x65, 0x01, 0x6c, 0x01, 0x48, // 11 getscopeobject 1; getslot 1; returnvalue
        ]),
        traits: [{ ...slot('x', '*'), slotId: 1 }],
      },
      // sum(a, b): return a + b
      body(3, [...OPEN, 0xd1, 0xd2, 0xa0, 0x48]),
      body(4, [...OPEN, RETURN_VOID]),
    ],
    metadata: [],
  };
}

describe('method frames', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Frames']) });
  const text = result.files.find((f) => f.path === 'Frames.ts')?.text ?? '';
  const program = linkProgram(compileSources(result.files));
  const Frames = program.getDefinition('Frames') as new () => { field: unknown; scoped(x: unknown): unknown; sum(a: number, b: number): number };

  it('lifts and links', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
  });

  it('`getscopeobject 1` after `this` is the activation, not `this`', () => {
    const o = new Frames();
    expect(o.scoped(7)).toBe(7);
    expect(o.field).toBe(null);
    expect(text).not.toContain('this.field');
  });

  it('repeated debug parameter names fall back to paramN', () => {
    expect(new Frames().sum(2, 3)).toBe(5);
    expect(text).toContain('sum(param1');
  });
});

describe('parameterNames', () => {
  const info = (paramNames: string[]) => ({ paramTypes: paramNames.map(() => '*'), paramNames });
  it('keeps a usable declared set', () => {
    expect(parameterNames(info(['event', 'count']))).toEqual(['event', 'count']);
  });
  it('drops the whole set on a duplicate, a keyword or a generated-name clash', () => {
    expect(parameterNames(info(['b', 'b']))).toEqual(['param1', 'param2']);
    expect(parameterNames(info(['void']))).toEqual(['param1']);
    expect(parameterNames(info(['x', 'local3']))).toEqual(['param1', 'param2']);
  });
  it('uses paramN when no names were written', () => {
    expect(parameterNames({ paramTypes: ['*', '*'], paramNames: [] })).toEqual(['param1', 'param2']);
  });
});
