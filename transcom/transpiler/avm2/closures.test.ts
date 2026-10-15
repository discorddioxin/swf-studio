// Activations, closures and `with` scopes, on hand-assembled ABC, checked by running
// the lifted code.
//
// An activation lifts to plain variables named by the body's traits, so the JS
// closure captures them lexically — the closure reads `n` by name (`getlex n`), the
// creating method writes `getscopeobject 1; setslot 1`, and both must mean one
// variable. A name the scope chain finds on the creating method's instance goes
// through `__self`; the closure's own local 0 is its call receiver (`this`).
// `pushwith` makes names resolve on the object first, at run time.
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN, RETURN_VOID, slot } from './testAbc';

function fixture(): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'n', ns: '', nsKind: 'package' },    // 1
      { kind: 'QName', name: 'base', ns: '', nsKind: 'package' }, // 2
      { kind: 'QName', name: 'x', ns: '', nsKind: 'package' },    // 3
      { kind: 'QName', name: 'tag', ns: '', nsKind: 'package' },  // 4
    ],
    methods: [method(), method(), { ...method(), needActivation: true }, method(), method(['*']), method(), method()],
    classes: [{
      instance: {
        name: 'Counter', superName: 'Object', interfaces: [], iinit: 0, sealed: false, isFinal: false, isInterface: false,
        traits: [{ ...slot('base', 'int'), slotId: 1 }, { ...slot('x', '*'), slotId: 2 }, fn('make', 2), fn('pick', 4), fn('receiver', 5)],
      },
      cinit: 1, traits: [],
    }],
    scripts: [{ init: 6, traits: [{ name: 'Counter', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] }] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      // make(): var n:int = 5; return function () { return n + base; }
      {
        ...body(2, [...OPEN,
          0x57, 0x2a, 0xd5, 0x30,       // 2  newactivation; dup; setlocal1; pushscope
          0x65, 0x01, 0x24, 0x05, 0x6d, 0x01, // 6  getscopeobject 1; pushbyte 5; setslot 1
          0x40, 0x03, 0x48,             // 12 newfunction 3; returnvalue
        ]),
        traits: [{ ...slot('n', 'int'), slotId: 1 }],
      },
      // the closure: return n + base
      body(3, [...OPEN, 0x60, 0x01, 0x60, 0x02, 0xa0, 0x48]),
      // pick(o): with (o) { return x; }
      body(4, [...OPEN, 0xd1, 0x1c, 0x60, 0x03, 0x1d, 0x48]),
      // receiver(): return function () { return this.tag; }
      body(5, [...OPEN, 0x40, 0x07, 0x48]),
      body(6, [...OPEN, RETURN_VOID]),
      body(7, [...OPEN, 0xd0, 0x66, 0x04, 0x48]),
    ],
    metadata: [],
  };
}

describe('closures and with scopes', () => {
  const abc = fixture();
  abc.methods.push(method());
  const result = transpileAbc({ abc, projectClasses: new Set(['Counter']) });
  const text = result.files.find((f) => f.path === 'Counter.ts')?.text ?? '';
  const program = linkProgram(compileSources(result.files));
  type Counter = { base: number; x: unknown; make(): () => number; pick(o: unknown): unknown; receiver(): (this: unknown) => unknown };
  const Counter = program.getDefinition('Counter') as new () => Counter;

  it('lifts and links', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
  });

  it('a closure captures the activation variable and reaches the instance', () => {
    const o = new Counter();
    o.base = 10;
    const f = o.make();
    expect(f()).toBe(15);
    o.base = 20;
    expect(f()).toBe(25);
    expect(text).toContain('var n = 0;');
    expect(text).not.toContain('slot1');
    expect(text).not.toContain('__activation');
  });

  it("a closure's local 0 is its own receiver", () => {
    const f = new Counter().receiver();
    expect(f.call({ tag: 'mine' })).toBe('mine');
  });

  it('`with` resolves on the object first, then where the name lives without it', () => {
    const o = new Counter();
    o.x = 'field';
    expect(o.pick({ x: 'with' })).toBe('with');
    expect(o.pick({})).toBe('field');
    expect(o.pick(null)).toBe('field');
  });
});
