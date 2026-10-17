// P-01: no string from an ABC constant pool may reach the emitted code as code.
//
// Every name the emitter prints comes from the ABC: class names, packages, trait
// names, multinames, parameter names. A hostile SWF controls all of them, so each
// one is fuzzed here with JavaScript payloads and the result is checked the way the
// player uses it — compiled by `compileSources`, linked by `linkProgram`, and every
// member called. The payload may end up quoted (a string literal, a bracketed key)
// or refused (a loud stub), but never parsed as code, and nothing it says may run.
//
// The second half probes the host intrinsics generated code could name or reach:
// `Function("…")`, string `setTimeout`, `this.constructor.constructor("…")` and
// its computed spelling. AVM2 has no string compiler; neither may the transpile.
import { afterEach, describe, expect, it } from 'vitest';
import type { AbcFile, AbcTrait } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../../src/engine/flash/loader';
import { transpileAbc } from './index';
import { attr, body, fn, method, slot, OPEN, RETURN_VOID } from './testAbc';

declare global { var __pwned: unknown }
const PWN = 'globalThis.__pwned=1';

const PAYLOADS = [
  `a;${PWN};//`,
  `a'+(${PWN})+'`,
  `a"+(${PWN})+"`,
  'a`${' + PWN + '}`',
  `a\u2028${PWN}`,
  `}${PWN};{`,
  `a*/${PWN}/*`,
  '../../evil',
  '__proto__',
  'constructor',
  'prototype',
  'eval',
  'Function',
  'delete',
];

/** Names in an ABC fixture; `payload` replaces exactly one of them. */
interface Names {
  pkg: string; cls: string; base: string; face: string; method: string; staticMethod: string;
  field: string; staticField: string; getter: string; param: string; global: string; prop: string;
  fnTrait: string; constTrait: string; str: string;
}
const SAFE: Names = {
  pkg: 'game', cls: 'Evil', base: 'Base', face: 'IFace', method: 'run', staticMethod: 'make', field: 'x',
  staticField: 'count', getter: 'size', param: 'arg', global: 'helper', prop: 'value', fnTrait: 'util',
  constTrait: 'LIMIT', str: 'hello',
};

/**
 * One package class `pkg.cls extends base implements face` with a method, a static
 * method, two slots, a getter, a parameter, a script function and a script const.
 * Bodies read a global by name, a property by name, and push a string constant.
 */
function fixture(n: Names): AbcFile {
  const MN = { Object: 1, base: 2, cls: 3, face: 4, global: 5, prop: 6 };
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: ['', n.str], namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'Object', ns: '', nsKind: 'package' },
      { kind: 'QName', name: n.base, ns: n.pkg, nsKind: 'package' },
      { kind: 'QName', name: n.cls, ns: n.pkg, nsKind: 'package' },
      { kind: 'QName', name: n.face, ns: n.pkg, nsKind: 'package' },
      { kind: 'QName', name: n.global, ns: '', nsKind: 'package' },
      { kind: 'QName', name: n.prop, ns: '', nsKind: 'package' },
    ],
    methods: [
      method(), method(), method(), method(),
      { ...method(['*']), paramNames: [n.param] },   // 4: run(arg)
      method(), method(), method(), method(), method(),
    ],
    metadata: [],
    classes: [
      {
        instance: { name: `${n.pkg}.${n.base}`, superName: 'Object', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false, traits: [] },
        cinit: 1, traits: [],
      },
      {
        instance: {
          name: `${n.pkg}.${n.cls}`, superName: `${n.pkg}.${n.base}`, interfaces: [`${n.pkg}.${n.face}`], iinit: 2, sealed: true,
          isFinal: false, isInterface: false,
          traits: [fn(n.method, 4), slot(n.field, '*', { kind: 0x01, value: 1 }), { name: n.getter, kind: 'getter', attr, method: 6, metadata: [] }],
        },
        cinit: 3, traits: [fn(n.staticMethod, 5), slot(n.staticField, 'int')],
      },
      {
        instance: { name: `${n.pkg}.${n.face}`, superName: '', interfaces: [], iinit: -1, sealed: true, isFinal: false, isInterface: true, traits: [fn(n.method, 7)] },
        cinit: -1, traits: [],
      },
    ],
    scripts: [{
      init: 9,
      traits: [
        { name: `${n.pkg}.${n.base}`, kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] },
        { name: `${n.pkg}.${n.cls}`, kind: 'class', attr, classIndex: 1, slotId: 2, metadata: [] },
        { name: `${n.pkg}.${n.face}`, kind: 'class', attr, classIndex: 2, slotId: 3, metadata: [] },
        { name: n.fnTrait, kind: 'function', attr, method: 8, slotId: 4, metadata: [] } as AbcTrait,
        { name: n.constTrait, kind: 'const', attr, slotId: 5, type: 'int', valueKind: 0x03, value: 7, metadata: [] } as AbcTrait,
      ],
    }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      body(2, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      // cinit: findpropstrict global; callpropvoid global 0 — the P-01 reproduction
      body(3, [...OPEN, 0x5d, MN.global, 0x4f, MN.global, 0x00, RETURN_VOID]),
      // run(arg): this.prop = arg; return "str"
      body(4, [...OPEN, 0xd0, 0xd1, 0x61, MN.prop, 0x2c, 0x01, 0x48]),
      // static make(): return global()
      body(5, [...OPEN, 0x5d, MN.global, 0x46, MN.global, 0x00, 0x48]),
      // get size(): return this.prop
      body(6, [...OPEN, 0xd0, 0x66, MN.prop, 0x48]),
      body(8, [...OPEN, 0x2c, 0x01, 0x48]),
      body(9, [...OPEN, RETURN_VOID]),
    ],
  };
}

/** The text with every string literal and comment removed: what is left is code. */
function codeOnly(text: string): string {
  return text
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/** Link the transpile, construct every class, call every method; report what went wrong. */
function exercise(abc: AbcFile) {
  const result = transpileAbc({ abc });
  const compiled = compileSources(result.files);
  const compileErrors = compiled.modules.filter((m) => m.error).map((m) => `${m.path}: ${m.error}`);
  const program = linkProgram(compiled);
  for (const info of program.classes) {
    const cls = program.getDefinition(info.qualifiedName) as (new () => Record<string, unknown>) | undefined;
    if (typeof cls !== 'function') continue;
    for (const key of Object.getOwnPropertyNames(cls)) {
      try { const v = (cls as unknown as Record<string, unknown>)[key]; if (typeof v === 'function') (v as () => void).call(cls); } catch { /* refusals throw */ }
    }
    let obj: Record<string, unknown> | undefined;
    try { obj = new cls(); } catch { continue; }
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(obj))) {
      try { const v = obj[key]; if (typeof v === 'function') (v as (a: unknown) => void).call(obj, 1); } catch { /* refusals throw */ }
    }
  }
  return { result, compileErrors, program };
}

afterEach(() => { delete globalThis.__pwned; });

describe('P-01: ABC names never become code', () => {
  const slots = Object.keys(SAFE) as (keyof Names)[];
  for (const where of slots) {
    for (const payload of PAYLOADS) {
      it(`${where} = ${JSON.stringify(payload)}`, () => {
        const { result, compileErrors } = exercise(fixture({ ...SAFE, [where]: payload }));
        expect(globalThis.__pwned).toBeUndefined();
        // Every emitted file is valid TypeScript: a hostile name cannot break the syntax.
        expect(compileErrors).toEqual([]);
        // A payload that carries code appears only inside string literals.
        if (payload.includes(PWN)) {
          for (const file of result.files) expect(codeOnly(file.text), file.path).not.toContain(PWN);
        }
        // No module escapes the project folder.
        for (const file of result.files) {
          expect(file.path.split('/')).not.toContain('..');
          expect(file.path.startsWith('/')).toBe(false);
        }
      });
    }
  }

  it('reports an unusable class name as a diagnostic instead of emitting it', () => {
    const { result } = exercise(fixture({ ...SAFE, cls: `a;${PWN};//` }));
    expect(result.diagnostics.some((d) => /name/i.test(d.message))).toBe(true);
  });

  it('refuses a member whose body names an unusable global, with a diagnostic', () => {
    const { result } = exercise(fixture({ ...SAFE, global: `a;${PWN};//` }));
    expect(result.diagnostics.some((d) => d.where.endsWith('::<cinit>') || d.where.endsWith('::make'))).toBe(true);
  });

  it('keeps ordinary names readable (no quoting or refusal for safe input)', () => {
    const { result, compileErrors } = exercise(fixture(SAFE));
    expect(compileErrors).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    const evil = result.files.find((f) => f.path === 'game/Evil.ts')!.text;
    expect(evil).toContain('export class Evil extends Base implements IFace {');
    expect(evil).toContain('public run(arg: any): any {');
    expect(evil).toContain('this.value = arg;');
  });
});

// ---------------------------------------------------------------- host intrinsics

/** A default-package class `Probe` whose static `go()` runs `code`. */
function probe(code: number[], extra: { strings?: string[]; multinames?: AbcFile['multinames'] } = {}): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: ['', PWN, ...(extra.strings ?? [])],
    namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'Object', ns: '', nsKind: 'package' },
      { kind: 'QName', name: 'Probe', ns: '', nsKind: 'package' },
      ...(extra.multinames ?? []),
    ],
    methods: [method(), method(), method(), method()],
    metadata: [],
    classes: [{
      instance: { name: 'Probe', superName: 'Object', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false, traits: [] },
      cinit: 1, traits: [fn('go', 2)],
    }],
    scripts: [{ init: 3, traits: [{ name: 'Probe', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] }] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),
      body(1, [...OPEN, RETURN_VOID]),
      body(2, [...OPEN, ...code]),
      body(3, [...OPEN, RETURN_VOID]),
    ],
  };
}

function runProbe(abc: AbcFile): { error: unknown; text: string } {
  const result = transpileAbc({ abc });
  const program = linkProgram(compileSources(result.files));
  expect(program.errors).toEqual([]);
  const Probe = program.getDefinition('Probe') as { go(): unknown };
  let error: unknown;
  try { Probe.go(); } catch (e) { error = e; }
  return { error, text: result.files.map((f) => f.text).join('\n') };
}

describe('P-01: generated code cannot reach a string compiler', () => {
  // Multinames 3.. for the probes.
  const N = (name: string, kind = 'QName'): AbcFile['multinames'][number] => ({ kind, name, ns: '', nsKind: 'package' });

  it('Function("…") is AVM2\'s EvalError #1066, not a compiler', () => {
    // findpropstrict Function; pushstring PWN; callproperty Function 1; getlocal0; call 0; returnvalue
    const { error } = runProbe(probe([0x5d, 3, 0x2c, 1, 0x46, 3, 1, 0xd0, 0x41, 0, 0x48], { multinames: [N('Function')] }));
    expect(globalThis.__pwned).toBeUndefined();
    expect(String(error)).toMatch(/EvalError.*1066/);
  });

  it('setTimeout("…") does not evaluate its string', async () => {
    // findpropstrict setTimeout; pushstring PWN; pushbyte 0; callpropvoid setTimeout 2; returnvoid
    runProbe(probe([0x5d, 3, 0x2c, 1, 0x24, 0, 0x4f, 3, 2, RETURN_VOID], { multinames: [N('setTimeout')] }));
    await new Promise((r) => globalThis.setTimeout(r, 20));
    expect(globalThis.__pwned).toBeUndefined();
  });

  it('this.constructor.constructor("…") yields the AVM2 Function, which refuses strings', () => {
    // getlocal0; getproperty constructor; pushstring PWN; callproperty constructor 1; getlocal0; call 0; returnvalue
    const { error } = runProbe(probe([0xd0, 0x66, 3, 0x2c, 1, 0x46, 3, 1, 0xd0, 0x41, 0, 0x48], { multinames: [N('constructor')] }));
    expect(globalThis.__pwned).toBeUndefined();
    expect(String(error)).toMatch(/EvalError.*1066/);
  });

  it('a computed "constr"+"uctor" key cannot reach Function either', () => {
    // getlocal0; getlocal0; pushstring "constr"; pushstring "uctor"; add; getproperty [L]   -> this[k]
    // pushstring "constr"; pushstring "uctor"; add; getproperty [L]                          -> this[k][k]
    // pushstring PWN; call 1 (receiver = this); getlocal0; call 0; returnvalue
    const { text } = runProbe(probe([
      0xd0, 0xd0, 0x2c, 2, 0x2c, 3, 0xa0, 0x66, 3,
      0x2c, 2, 0x2c, 3, 0xa0, 0x66, 3,
      0x2c, 1, 0x41, 1, 0xd0, 0x41, 0, 0x48,
    ], { strings: ['constr', 'uctor'], multinames: [{ kind: 'MultinameL', name: '', nsSet: [''] }] }));
    expect(globalThis.__pwned).toBeUndefined();
    expect(text).toContain('__key(');
  });

  it('browser globals are not in scope of a module', () => {
    // findpropstrict document; getproperty document; returnvalue   (AS3: `return document`)
    const abc = probe([0x60, 3, 0x48], { multinames: [N('document')] });
    (globalThis as Record<string, unknown>).document ??= { cookie: 'secret' };
    const result = transpileAbc({ abc });
    const program = linkProgram(compileSources(result.files));
    const Probe = program.getDefinition('Probe') as { go(): unknown };
    let value: unknown = 'threw';
    try { value = Probe.go(); } catch { /* a ReferenceError is fine too */ }
    delete (globalThis as Record<string, unknown>).document;
    expect(value === undefined || value === 'threw').toBe(true);
  });
});
