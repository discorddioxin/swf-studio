// Bottom-tested loops and stack copies of locals, on hand-assembled ABC in the
// layouts compilers emit, checked by running the linked program.
//
//   do { body } while (n-- > 0)   jump L+1; L: label; body; getlocal n; declocal n; pushbyte 0; ifgt L
//   while (n-- > 0) {}            jump T; L: label; T: <the same test>; ifgt L
//   r = i++                       getlocal i; inclocal i; convert_i; setlocal r
//
// The `label` is a marker: a branch onto it and a branch past it are one place.
// A value on the stack read from a local keeps the value it had when it was read.
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN, RETURN_VOID } from './testAbc';

type Item = number | { label: string } | { branch: number; to: string };

/** Bytes with labels: branches are s24 from the end of the instruction. */
function asm(items: Item[]): number[] {
  const s24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
  const size = (it: Item) => typeof it === 'number' ? 1 : 'label' in it ? 0 : 4;
  const at = new Map<string, number>();
  let pc = 0;
  for (const it of items) { if (typeof it === 'object' && 'label' in it) at.set(it.label, pc); pc += size(it); }
  const out: number[] = [];
  for (const it of items) {
    if (typeof it === 'number') out.push(it);
    else if ('branch' in it) out.push(it.branch, ...s24(at.get(it.to)! - (out.length + 4)));
  }
  return out;
}

const JUMP = 0x10, IFGT = 0x17, LABEL = 0x09;
const DECLOCAL_I = 0xc3, INCLOCAL_I = 0xc2;

// countDown(n): var r = 0; do { r = r + 1; } while (n-- > 0); return r;
const countDown = asm([
  ...OPEN, 0x24, 0x00, 0xd6,                       // r = 0
  { branch: JUMP, to: 'B' },                       // enter past the label
  { label: 'L' }, LABEL,
  { label: 'B' }, 0xd2, 0x24, 0x01, 0xa0, 0xd6,    // r = r + 1
  0xd1, DECLOCAL_I, 0x01, 0x24, 0x00,              // n (old value); n--; 0
  { branch: IFGT, to: 'L' },
  0xd2, 0x48,
]);

// drain(n): while (n-- > 0) {} return n;
const drain = asm([
  ...OPEN,
  { branch: JUMP, to: 'T' },
  { label: 'L' }, LABEL,
  { label: 'T' }, 0xd1, DECLOCAL_I, 0x01, 0x24, 0x00,
  { branch: IFGT, to: 'L' },
  0xd1, 0x48,
]);

// postIncrement(i): var r = i++; return r * 10 + i;
const postIncrement = [
  ...OPEN, 0xd1, INCLOCAL_I, 0x01, 0x73, 0xd6,     // getlocal1; inclocal_i 1; convert_i; setlocal2
  0xd2, 0x24, 10, 0xa2, 0xd1, 0xa0, 0x48,          // r * 10 + i
];

function fixture(): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [{ kind: '?', name: '' }],
    methods: [method(), method(), method(), method(['*']), method(['*']), method(['*'])],
    classes: [{
      instance: {
        name: 'Loops', superName: 'Object', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false,
        traits: [fn('countDown', 3), fn('drain', 4), fn('postIncrement', 5)],
      },
      cinit: 1, traits: [],
    }],
    scripts: [{ init: 2, traits: [{ name: 'Loops', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] }] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      body(2, [...OPEN, RETURN_VOID]),
      body(3, countDown),
      body(4, drain),
      body(5, postIncrement),
    ],
    metadata: [],
  };
}

describe('bottom-tested loops and stack copies of locals', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Loops']) });
  const text = result.files.find((f) => f.path === 'Loops.ts')?.text ?? '';
  const program = linkProgram(compileSources(result.files));
  const Loops = program.getDefinition('Loops') as new () => {
    countDown(n: number): number; drain(n: number): number; postIncrement(i: number): number;
  };

  it('lifts and links', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
  });

  it('a loop entered past its label is a do-while, and its test compares the value before n--', () => {
    expect([0, 1, 3].map((n) => new Loops().countDown(n))).toEqual([1, 2, 4]);
    expect(text).toMatch(/do \{/);
  });

  it('an empty body: the test alone repeats', () => {
    expect(new Loops().drain(3)).toBe(-1);
  });

  it('a value read before inclocal keeps the old value', () => {
    expect(new Loops().postIncrement(5)).toBe(56);
  });
});
