// `switch` on hand-assembled ABC in ASC's layout, checked by running the lift.
//
//   jump DISPATCH; <case bodies in source order>; DISPATCH: <selector chain>;
//   lookupswitch default, case_count, case_count + 1 offsets
//
// The lift is a source-shaped switch: case values instead of indices, one clause
// per target (a shared body is emitted once), fall-through kept, and the *last*
// table entry dispatched like the others (the table has case_count + 1 offsets).
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN, RETURN_VOID } from './testAbc';

type Item = number | { label: string } | { branch: number; to: string } | { lookup: string; cases: string[] };

/** Bytes with labels: branches are s24 from the end of the instruction, lookupswitch offsets from its start. */
function asm(items: Item[]): number[] {
  const s24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
  const size = (it: Item) => typeof it === 'number' ? 1 : 'label' in it ? 0 : 'branch' in it ? 4 : 1 + 3 + 1 + 3 * it.cases.length;
  const at = new Map<string, number>();
  let pc = 0;
  for (const it of items) { if (typeof it === 'object' && 'label' in it) at.set(it.label, pc); pc += size(it); }
  const out: number[] = [];
  for (const it of items) {
    const start = out.length;
    if (typeof it === 'number') out.push(it);
    else if ('branch' in it) out.push(it.branch, ...s24(at.get(it.to)! - (start + 4)));
    else if ('lookup' in it) {
      out.push(0x1b, ...s24(at.get(it.lookup)! - start), it.cases.length - 1);
      for (const c of it.cases) out.push(...s24(at.get(c)! - start));
    }
  }
  return out;
}

const JUMP = 0x10, IFSTRICTNE = 0x1a;
const addTo2 = (n: number) => [0xd2, 0x24, n, 0xa0, 0xd6]; // r = r + n

// kind(s): var r = 0;
//   switch (s) { case "a": r += 1; case "b": r += 10; break; case "c": default: r += 100; case "d": r += 7; }
//   return r;
const kindCode = asm([
  ...OPEN, 0x24, 0x00, 0xd6,          // r = 0
  { branch: JUMP, to: 'D' },
  { label: 'A' }, 0x09, ...addTo2(1),  // falls into B
  { label: 'B' }, 0x09, ...addTo2(10), { branch: JUMP, to: 'END' },
  { label: 'C' }, 0x09, ...addTo2(100), // falls into the last case
  { label: 'L' }, 0x09, ...addTo2(7), { branch: JUMP, to: 'END' },
  { label: 'D' }, 0xd1, 0xd7,          // getlocal1; setlocal3
  0x2c, 1, 0xd3, { branch: IFSTRICTNE, to: 'N1' }, 0x24, 0, { branch: JUMP, to: 'SW' },
  { label: 'N1' }, 0x2c, 2, 0xd3, { branch: IFSTRICTNE, to: 'N2' }, 0x24, 1, { branch: JUMP, to: 'SW' },
  { label: 'N2' }, 0x2c, 3, 0xd3, { branch: IFSTRICTNE, to: 'N3' }, 0x24, 2, { branch: JUMP, to: 'SW' },
  { label: 'N3' }, 0x2c, 4, 0xd3, { branch: IFSTRICTNE, to: 'N4' }, 0x24, 4, { branch: JUMP, to: 'SW' },
  { label: 'N4' }, 0x24, 3,            // no match: the default's index
  { label: 'SW' }, 0x08, 0x03, { lookup: 'C', cases: ['A', 'B', 'C', 'C', 'L'] },
  { label: 'END' }, 0xd2, 0x48,
]);

// count(s): var n = 0; for (var i = 0; i < s.length; i++) { if (s.charAt(i) == " ") continue; n++; } return n;
// The `continue` is a jump to the update (`i++`), not to the test: as a `while` it
// would skip the update and never end.
const countCode = asm([
  ...OPEN, 0x24, 0x00, 0xd6, 0x24, 0x00, 0xd7, // i = 0; n = 0
  { branch: JUMP, to: 'T' },
  { label: 'H' }, 0x09,
  0xd1, 0xd2, 0x46, 0x01, 0x01, 0x2c, 5,       // s.charAt(i), " "
  { branch: 0x14, to: 'L' },                    // ifne L
  { branch: JUMP, to: 'U' },                    // continue
  { label: 'L' }, 0xd3, 0x24, 0x01, 0xa0, 0xd7, // n = n + 1
  { label: 'U' }, 0xd2, 0x24, 0x01, 0xa0, 0xd6, // i = i + 1
  { label: 'T' }, 0xd2, 0xd1, 0x66, 0x02, { branch: 0x15, to: 'H' }, // iflt H
  0xd3, 0x48,
]);

function fixture(): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: ['', 'a', 'b', 'c', 'd', ' '], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'charAt', ns: '', nsKind: 'package' },
      { kind: 'QName', name: 'length', ns: '', nsKind: 'package' },
    ],
    methods: [method(), method(), method(['*']), method(), method(['*'])],
    classes: [{
      instance: { name: 'Sw', superName: 'Object', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false, traits: [fn('kind', 2), fn('count', 4)] },
      cinit: 1, traits: [],
    }],
    scripts: [{ init: 3, traits: [{ name: 'Sw', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] }] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      body(2, kindCode),
      body(3, [...OPEN, RETURN_VOID]),
      body(4, countCode),
    ],
    metadata: [],
  };
}

describe('switch', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Sw']) });
  const text = result.files.find((f) => f.path === 'Sw.ts')?.text ?? '';
  const program = linkProgram(compileSources(result.files));
  const Sw = program.getDefinition('Sw') as new () => { kind(s: unknown): number; count(s: string): number };

  it('lifts and links', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
  });

  it('runs every path: fall-through, the shared default body, the last table entry', () => {
    const o = new Sw();
    expect(['a', 'b', 'c', 'd', 'zzz', 1].map((s) => o.kind(s))).toEqual([11, 10, 107, 7, 107, 107]);
  });

  it('reads as the source: case values, one body per target', () => {
    expect(text).toMatch(/switch \(local3\) \{/);
    for (const v of ['"a"', '"b"', '"c"', '"d"']) expect(text).toContain(`case ${v}:`);
    expect(text).toContain('default:');
    expect(text.match(/\+ 100/g)).toHaveLength(1);
    expect(text).not.toContain('? 0 :');
  });

  it('a jump to a `for` update is `continue`, and the update still runs', () => {
    expect(new Sw().count('a b  c')).toBe(3);
    expect(text).toMatch(/for \(; local2 < param1\.length; local2 = local2 \+ 1\)/);
    expect(text).toContain('continue;');
  });
});
