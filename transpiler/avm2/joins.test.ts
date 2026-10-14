// Short-circuit joins and `callsuper`, on hand-assembled ABC, checked by *running*
// the lifted code.
//
// ASC writes `if (a || b)` as
//
//     <a>; dup; iftrue L; pop; <b>; L: iffalse ELSE
//
// The value at L is `a` when `a` is truthy and `b` otherwise. The lifter used to
// run the `<b>` arm when `a` was *truthy* (the `&&` reading) — `e == null || x`
// came out as `e == null && x` in FLVPlayback's VideoPlayer. And `callsuper` takes
// its receiver off the stack with the arguments; leaving it there made `return a ||
// super.f(x)` refuse (fl.controls.*::isOurFocus).
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN, RETURN_VOID } from './testAbc';

/** A signed 24-bit branch offset, little endian. */
const s24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

/** `return (a OP b) ? true : false` with the compiler's dup/branch/pop join. */
function joinBody(index: number, opcode: 0x11 | 0x12): ReturnType<typeof body> {
  return body(index, [
    ...OPEN,          // 0
    0xd1,             // 2  getlocal1  (a)
    0x2a,             // 3  dup
    opcode, ...s24(2),// 4  iftrue/iffalse -> 10
    0x29,             // 8  pop
    0xd2,             // 9  getlocal2  (b)
    0x12, ...s24(2),  // 10 iffalse -> 16
    0x26, 0x48,       // 14 pushtrue; returnvalue
    0x27, 0x48,       // 16 pushfalse; returnvalue
  ]);
}

function fixture(): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'check', ns: '', nsKind: 'package' }, // 1
    ],
    methods: [method(), method(), method(['*', '*']), method(['*', '*']), method(['*']), method(['*']), method(), method(), method()],
    classes: [
      {
        instance: { name: 'Base', superName: 'Object', interfaces: [], iinit: 6, traits: [fn('check', 4)], sealed: true, isFinal: false, isInterface: false },
        cinit: 7, traits: [],
      },
      {
        instance: {
          name: 'Logic', superName: 'Base', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false,
          traits: [fn('either', 2), fn('both', 3), { ...fn('check', 5), attr: { ...attr, override: true } }],
        },
        cinit: 1, traits: [],
      },
    ],
    scripts: [{ init: 8, traits: [
      { name: 'Base', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] },
      { name: 'Logic', kind: 'class', attr, classIndex: 1, slotId: 2, metadata: [] },
    ] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      joinBody(2, 0x11), // either: a || b
      joinBody(3, 0x12), // both:   a && b
      // Base.check(x): return x
      body(4, [...OPEN, 0xd1, 0x48]),
      // Logic.check(x): return x == 1 || super.check(x)   — getlocal0 is callsuper's receiver
      body(5, [...OPEN,
        0xd1, 0x24, 0x01, 0xab, // 2  getlocal1; pushbyte 1; equals
        0x2a,                   // 6  dup
        0x11, ...s24(6),        // 7  iftrue -> 17
        0x29,                   // 11 pop
        0xd0, 0xd1,             // 12 getlocal0; getlocal1
        0x45, 0x01, 0x01,       // 14 callsuper check, 1
        0x48,                   // 17 returnvalue
      ]),
      body(6, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(7, [...OPEN, RETURN_VOID]),
      body(8, [...OPEN, RETURN_VOID]),
    ],
    metadata: [],
  };
}

describe('short-circuit joins', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Base', 'Logic']) });
  const program = linkProgram(compileSources(result.files));
  const Logic = program.getDefinition('Logic') as new () => {
    either(a: unknown, b: unknown): boolean; both(a: unknown, b: unknown): boolean; check(x: unknown): unknown;
  };

  it('lifts every body and links', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
  });

  it('`a || b` keeps a truthy `a` and only then skips `b`', () => {
    const o = new Logic();
    expect([o.either(false, false), o.either(true, false), o.either(false, true), o.either(true, true)]).toEqual([false, true, true, true]);
  });

  it('`a && b` needs both', () => {
    const o = new Logic();
    expect([o.both(false, false), o.both(true, false), o.both(false, true), o.both(true, true)]).toEqual([false, false, false, true]);
  });

  it('`callsuper` consumes its receiver', () => {
    const o = new Logic();
    expect(o.check(1)).toBe(true);
    expect(o.check('x')).toBe('x');
    const text = result.files.find((f) => f.path === 'Logic.ts')?.text ?? '';
    expect(text).toContain('super.check(param1)');
  });
});
