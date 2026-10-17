// `for (k in o)` / `for each (v in o)` on hand-assembled ABC, checked by running
// the lifted code.
//
// AS3 enumerates an object's dynamic properties only. An instance of a sealed
// class (any class not declared `dynamic`, a subclass of a dynamic one included)
// enumerates nothing; an instance of a dynamic class enumerates what was added to
// it at run time — never the slots it declares, nor anything the engine keeps.
// The loop is compiled the way ASC compiles it: the index register starts at 0,
// `hasnext2` moves it, `nextname` / `nextvalue` read at it. Pinball's
// `for (el in this)` over its document class printed every declared field and
// engine internal; and the first element of an Array was skipped.
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN, RETURN_VOID, slot } from './testAbc';

const SUPER_INIT = [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID];

/** for (k in o) out.push(k) / for each (v in o) out.push(v); return out — registers: 1 o, 2 out, 3 object, 4 index. */
const loop = (index: number, read: 0x1e | 0x23) => ({
  ...body(index, [...OPEN,
    0x56, 0x00, 0xd6,             // 2  newarray 0; setlocal2
    0xd1, 0xd7,                   // 5  getlocal1; setlocal3
    0x24, 0x00, 0x63, 0x04,       // 7  pushbyte 0; setlocal 4
    0x10, 0x09, 0x00, 0x00,       // 11 jump → 24
    0x09,                         // 15 label
    0xd2, 0xd3, 0x62, 0x04, read, // 16 getlocal2; getlocal3; getlocal 4; nextname | nextvalue
    0x4f, 0x01, 0x01,             // 21 callpropvoid push(1)
    0x32, 0x03, 0x04,             // 24 hasnext2 3, 4
    0x11, 0xf0, 0xff, 0xff,       // 27 iftrue → 15
    0xd2, 0x48,                   // 31 getlocal2; returnvalue
  ]),
  localCount: 5,
});

function fixture(): AbcFile {
  const cls = (name: string, superName: string, sealed: boolean, iinit: number, traits: AbcFile['classes'][number]['instance']['traits']) =>
    ({ instance: { name, superName, interfaces: [], iinit, sealed, isFinal: false, isInterface: false, traits }, cinit: iinit + 1, traits: [] });
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [{ kind: '?', name: '' }, { kind: 'QName', name: 'push', ns: '', nsKind: 'package' }],
    methods: [method(), method(), method(['*']), method(['*']), method(), method(), method(), method(), method()],
    classes: [
      cls('Base', 'Object', false, 0, [{ ...slot('a', 'int'), slotId: 1 }, fn('keys', 2), fn('values', 3)]),
      cls('Sealed', 'Base', true, 4, [{ ...slot('b', 'int'), slotId: 1 }]),
      cls('Dyn', 'Base', false, 6, [{ ...slot('c', '*'), slotId: 1 }]),
    ],
    scripts: [{
      init: 8,
      traits: ['Base', 'Sealed', 'Dyn'].map((name, classIndex) => ({ name, kind: 'class' as const, attr, classIndex, slotId: classIndex + 1, metadata: [] })),
    }],
    bodies: [
      body(0, SUPER_INIT), body(1, [...OPEN, RETURN_VOID]),
      loop(2, 0x1e), loop(3, 0x23),
      body(4, SUPER_INIT), body(5, [...OPEN, RETURN_VOID]),
      body(6, SUPER_INIT), body(7, [...OPEN, RETURN_VOID]),
      body(8, [...OPEN, RETURN_VOID]),
    ],
    metadata: [],
  };
}

describe('for-in / for-each enumerate dynamic properties only', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Base', 'Sealed', 'Dyn']) });
  const text = (name: string) => result.files.find((f) => f.path === `${name}.ts`)?.text ?? '';
  const program = linkProgram(compileSources(result.files));
  type Base = Record<string, unknown> & { keys(o: unknown): unknown[]; values(o: unknown): unknown[] };
  const make = (name: string) => new (program.getDefinition(name) as new () => Base)();
  const probe = make('Base');

  it('lifts and links; a dynamic class registers the slots it inherits and declares', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
    expect(text('Dyn')).toContain('__dynamic(Dyn, ["c","a"])');
    expect(text('Base')).toContain('__dynamic(Base, ["a"])');
    expect(text('Sealed')).not.toContain('__dynamic');
  });

  it('an Array: every index from the first, then its values', () => {
    expect(probe.keys([10, 20, 30])).toEqual(['0', '1', '2']);
    expect(probe.values([10, 20, 30])).toEqual([10, 20, 30]);
    expect(probe.keys([])).toEqual([]);
  });

  it('an Object: its properties in order', () => {
    expect(probe.keys({ x: 1, y: 2 })).toEqual(['x', 'y']);
    expect(probe.values({ x: 1, y: 2 })).toEqual([1, 2]);
  });

  it('a sealed class, even under a dynamic one, enumerates nothing', () => {
    const sealed = make('Sealed');
    sealed.a = 1;
    sealed.b = 2;
    expect(probe.keys(sealed)).toEqual([]);
  });

  it('a dynamic class enumerates what was added, never its declared slots', () => {
    const dyn = make('Dyn');
    dyn.a = 1;
    dyn.c = 2;
    dyn.extra = 'e';
    expect(probe.keys(dyn)).toEqual(['extra']);
    expect(probe.values(dyn)).toEqual(['e']);
    const base = make('Base');
    base.a = 3;
    base.z = 4;
    expect(probe.keys(base)).toEqual(['z']);
    // `this` inside a method, as Pinball loops over itself
    expect(base.keys(base)).toEqual(['z']);
  });

  it('a class object and primitives enumerate nothing', () => {
    expect(probe.keys(program.getDefinition('Dyn'))).toEqual([]);
    expect(probe.keys('abc')).toEqual([]);
    expect(probe.keys(5)).toEqual([]);
    expect(probe.keys(null)).toEqual([]);
  });
});
