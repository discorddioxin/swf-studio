// Slot defaults and optional parameters, on a hand-assembled ABC.
//
// AVM2 gives every declared slot its value when the object is *allocated*, before
// any constructor runs: a base class whose constructor calls an overridden method
// already sees the subclass's `_value = 1`. A JavaScript field initializer only runs
// after `super()` returns, so a lifted class that relied on one read `undefined`
// there (towns2's NumericStepper: `this._value.toString()` from UIComponent's
// constructor). Untyped/typed slots without a value get the type's default
// (Number NaN, Boolean false, int 0, `*` undefined, otherwise null), and optional
// parameters keep their declared defaults.
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN, RETURN_VOID, slot } from './testAbc';

function fixture(): AbcFile {
  return {
    version: '46.16', ints: [0, 1], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'Base', ns: '', nsKind: 'package' },      // 1
      { kind: 'QName', name: 'Child', ns: '', nsKind: 'package' },     // 2
      { kind: 'QName', name: 'configure', ns: '', nsKind: 'package' }, // 3
      { kind: 'QName', name: '_value', ns: '', nsKind: 'package' },    // 4
      { kind: 'QName', name: 'seen', ns: '', nsKind: 'package' },      // 5
    ],
    methods: [
      method(), method(), method(), method(), method(), method(),
      method(['int'], [{ kind: 'number', value: 7 }]),
      method(),
    ],
    classes: [
      {
        instance: { name: 'Base', superName: 'Object', interfaces: [], iinit: 0, traits: [fn('configure', 5)], sealed: true, isFinal: false, isInterface: false },
        cinit: 1, traits: [],
      },
      {
        instance: {
          name: 'Child', superName: 'Base', interfaces: [], iinit: 2, sealed: true, isFinal: false, isInterface: false,
          traits: [
            slot('_value', 'int', { kind: 0x03, value: 1 }),
            slot('seen', ''),
            slot('ratio', 'Number'),
            slot('flag', 'Boolean'),
            slot('count', 'uint'),
            slot('label', 'String'),
            { ...fn('configure', 4), attr: { ...attr, override: true } },
            fn('pick', 6),
          ],
        },
        cinit: 3, traits: [],
      },
    ],
    scripts: [{ init: 7, traits: [
      { name: 'Base', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] },
      { name: 'Child', kind: 'class', attr, classIndex: 1, slotId: 2, metadata: [] },
    ] }],
    bodies: [
      // Base(): super(); this.configure();
      body(0, [...OPEN, 0xd0, 0x49, 0x00, 0xd0, 0x4f, 0x03, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      // Child(): super();
      body(2, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(3, [...OPEN, RETURN_VOID]),
      // Child.configure(): this.seen = this._value;
      body(4, [...OPEN, 0xd0, 0xd0, 0x66, 0x04, 0x61, 0x05, RETURN_VOID]),
      body(5, [...OPEN, RETURN_VOID]),
      // Child.pick(a: int = 7): return a;
      body(6, [...OPEN, 0xd1, 0x48]),
      body(7, [...OPEN, RETURN_VOID]),
    ],
    metadata: [],
  };
}

describe('slot defaults', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Base', 'Child']) });
  const child = result.files.find((f) => f.path === 'Child.ts')?.text ?? '';

  it('puts instance defaults on the prototype and typed defaults where none is given', () => {
    expect(result.diagnostics).toEqual([]);
    expect(child).toContain('__slots(Child, { "_value": 1, "ratio": NaN, "flag": false, "count": 0, "label": null });');
    expect(child).toContain('public _value: number;');
    expect(child).toContain('public pick(param1: number = 7): any {');
  });

  it('lets a base constructor see the subclass default, as AVM2 does', () => {
    const program = linkProgram(compileSources(result.files));
    expect(program.errors).toEqual([]);
    const Child = program.getDefinition('Child') as new () => Record<string, unknown> & { pick(a?: number): number };
    const instance = new Child();
    expect(instance.seen).toBe(1);
    expect(instance.ratio).toBeNaN();
    expect(instance.flag).toBe(false);
    expect(instance.label).toBeNull();
    expect(instance.pick()).toBe(7);
    expect(instance.pick(3)).toBe(3);
    // A write makes the instance's own copy; the default stays for the next object.
    instance._value = 5;
    expect(new Child()._value).toBe(1);
  });
});
