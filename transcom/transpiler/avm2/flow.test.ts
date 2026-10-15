// Control-flow and name-resolution shapes, on hand-assembled ABC, checked by running
// the linked program:
//
//   while (n > 0) { … }     L: label; <test>; ifngt END; body; jump L; END:
//   catch (e)               the handler starts with the thrown value as the only
//                           operand and an empty scope stack; `newcatch` makes the
//                           catch scope, whose slot 1 is the caught value; the
//                           register that held the scope may be reused afterwards
//   switch                  the table first, then the cases, each jumping past the
//                           last one to where they all meet
//   SoundTransform          a Multiname whose namespace set holds `flash.media`:
//                           the player's class, not a member of `this`
import { describe, expect, it } from 'vitest';
import type { AbcFile } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, OPEN } from './testAbc';

type Item = number | { label: string } | { branch: number; to: string } | { lookupswitch: string; cases: string[] };

const s24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

/** Bytes with labels: branches are relative to their end, `lookupswitch` to its start. */
function asm(items: Item[]): number[] {
  const size = (it: Item) => typeof it === 'number' ? 1
    : 'label' in it ? 0
    : 'branch' in it ? 4
    : 1 + 3 + 1 + 3 * it.cases.length;
  const at = new Map<string, number>();
  let pc = 0;
  for (const it of items) { if (typeof it === 'object' && 'label' in it) at.set(it.label, pc); pc += size(it); }
  const out: number[] = [];
  for (const it of items) {
    if (typeof it === 'number') out.push(it);
    else if ('branch' in it) out.push(it.branch, ...s24(at.get(it.to)! - (out.length + 4)));
    else if ('lookupswitch' in it) {
      const start = out.length;
      out.push(0x1b, ...s24(at.get(it.lookupswitch)! - start), it.cases.length - 1);
      for (const c of it.cases) out.push(...s24(at.get(c)! - start));
    }
  }
  return out;
}

const JUMP = 0x10, IFNGT = 0x0e, LABEL = 0x09, DECLOCAL_I = 0xc3;
const GETLOCAL1 = 0xd1, GETLOCAL2 = 0xd2, GETLOCAL3 = 0xd3, SETLOCAL2 = 0xd6, SETLOCAL3 = 0xd7;
const PUSHBYTE = 0x24, ADD = 0xa0, MULTIPLY = 0xa2, RETURN_VALUE = 0x48;

// topWhile(n): var r = 0; while (n > 0) { r = r + 1; n--; } return r;
const topWhile = asm([
  ...OPEN, PUSHBYTE, 0, SETLOCAL2,
  { label: 'L' }, LABEL,
  GETLOCAL1, PUSHBYTE, 0, { branch: IFNGT, to: 'END' },
  GETLOCAL2, PUSHBYTE, 1, ADD, SETLOCAL2,
  DECLOCAL_I, 1,
  { branch: JUMP, to: 'L' },
  { label: 'END' }, GETLOCAL2, RETURN_VALUE,
]);

// caught(x): try { throw x; } catch (e) { r = e * 2; } local2 = 5; return r + local2;
// Register 2 first holds the catch scope (an alias needing no declaration), then a number.
const caught = asm([
  ...OPEN,
  { label: 'FROM' }, GETLOCAL1, 0x03,                     // throw x
  { label: 'TO' }, { branch: JUMP, to: 'END' },
  { label: 'TARGET' }, ...OPEN,
  0x5a, 0x00, 0x2a, SETLOCAL2, 0x2a, 0x30, 0x2b, 0x6d, 0x01,  // newcatch 0; dup; setlocal2; dup; pushscope; swap; setslot 1
  0x65, 0x01, 0x6c, 0x01, PUSHBYTE, 2, MULTIPLY, SETLOCAL3,   // r = (catch scope).slot1 * 2
  0x1d, 0x08, 0x02,                                         // popscope; kill 2
  { label: 'END' },
  PUSHBYTE, 5, SETLOCAL2, GETLOCAL3, GETLOCAL2, ADD, RETURN_VALUE,
]);
const caughtOffsets = (() => {
  // FROM is right after OPEN; TO after `getlocal1; throw`; TARGET after the jump.
  const from = OPEN.length, to = from + 2, target = to + 4;
  return { from, to, target };
})();

// pick(k): switch (k) { case 0: r = 10; break; case 1: r = 20; break; default: r = 30; } return r;
// The table comes first; the cases follow it and meet past the last one.
const pick = asm([
  ...OPEN, GETLOCAL1, 0x73,                                 // convert_i
  { lookupswitch: 'D', cases: ['C0', 'C1'] },
  { label: 'C0' }, PUSHBYTE, 10, SETLOCAL2, { branch: JUMP, to: 'M' },
  { label: 'C1' }, PUSHBYTE, 20, SETLOCAL2, { branch: JUMP, to: 'M' },
  { label: 'D' }, PUSHBYTE, 30, SETLOCAL2,
  { label: 'M' }, GETLOCAL2, RETURN_VALUE,
]);

// transform(): return new SoundTransform();  — found through a namespace set
const transform = [...OPEN, 0x5d, 0x01, 0x4a, 0x01, 0x00, RETURN_VALUE];

function fixture(): AbcFile {
  const withExceptions = body(4, caught);
  withExceptions.exceptions = [{ ...caughtOffsets, type: '*', name: 'e' }];
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: [''], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'Multiname', name: 'SoundTransform', nsSet: ['', 'flash.media', 'Flow'] },
    ],
    methods: [method(), method(), method(), method(['*']), method(['*']), method(['*']), method()],
    classes: [{
      instance: {
        name: 'Flow', superName: 'Object', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false,
        traits: [fn('topWhile', 3), fn('caught', 4), fn('pick', 5), fn('transform', 6)],
      },
      cinit: 1, traits: [],
    }],
    scripts: [{ init: 2, traits: [{ name: 'Flow', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] }] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, 0x47]),
      body(1, [...OPEN, 0x47]),
      body(2, [...OPEN, 0x47]),
      body(3, topWhile),
      withExceptions,
      body(5, pick),
      body(6, transform),
    ],
    metadata: [],
  };
}

describe('control flow and namespace-set names', () => {
  const result = transpileAbc({ abc: fixture(), projectClasses: new Set(['Flow']) });
  const text = result.files.find((f) => f.path === 'Flow.ts')?.text ?? '';
  const program = linkProgram(compileSources(result.files));
  const Flow = program.getDefinition('Flow') as new () => {
    topWhile(n: number): number; caught(x: number): number; pick(k: number): number; transform(): { volume: number };
  };

  it('lifts and links', () => {
    expect(result.diagnostics).toEqual([]);
    expect(program.errors).toEqual([]);
  });

  it('a loop tested at its head is a while', () => {
    expect([0, 1, 4].map((n) => new Flow().topWhile(n))).toEqual([0, 1, 4]);
    expect(text).toMatch(/while \(/);
  });

  it('the handler receives the thrown value, and a register reused after the catch scope is declared', () => {
    expect(new Flow().caught(4)).toBe(13);
    expect(text).toMatch(/var local2;/);
  });

  it('a switch whose table comes first meets past its last case', () => {
    expect([0, 1, 7].map((k) => new Flow().pick(k))).toEqual([10, 20, 30]);
    expect(text).toMatch(/switch \(/);
  });

  it("a player class named through a namespace set is the global, not a member", () => {
    expect(text).toMatch(/new SoundTransform\(\)/);
    expect(text).not.toMatch(/this\.SoundTransform/);
    expect(new Flow().transform().volume).toBe(1);
  });
});
