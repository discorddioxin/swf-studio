// @vitest-environment jsdom
// The host guard on its own, and the loader using it in a browser-shaped global
// scope (jsdom: `window`, `document`, `fetch`-like APIs, hundreds of names).
import { afterEach, describe, expect, it } from 'vitest';
import { AvmFunction, hostShadows, ObjectFacade, safeConstructor, safeKey } from '../hostGuard';
import { compileSources, linkProgram } from '../../../engine/flash/loader';

declare global { var __pwned: unknown }
afterEach(() => { delete globalThis.__pwned; });

describe('hostGuard', () => {
  it('AvmFunction is a type test and an empty-function factory, never a compiler', () => {
    expect((() => 1) instanceof AvmFunction).toBe(true);
    expect({} instanceof AvmFunction).toBe(false);
    expect(typeof (AvmFunction as unknown as () => unknown)()).toBe('function');
    expect(() => (AvmFunction as unknown as (s: string) => unknown)('globalThis.__pwned = 1')).toThrow(/EvalError|1066/);
    expect(globalThis.__pwned).toBeUndefined();
  });

  it('a .constructor read never yields a host compiler', () => {
    expect(safeConstructor(() => 1)).toBe(AvmFunction);
    expect(safeConstructor(async () => 1)).toBe(AvmFunction);
    expect(safeConstructor(function* () { /* */ })).toBe(AvmFunction);
    expect(safeConstructor(async function* () { /* */ })).toBe(AvmFunction);
    expect(safeConstructor({})).toBe(ObjectFacade);
    class Thing {}
    expect(safeConstructor(new Thing())).toBe(Thing);
    expect(safeConstructor([])).toBe(Array);
    expect(safeConstructor(3)).toBe(Number);
  });

  it('the Object facade works as Object without its reflective statics', () => {
    expect({} instanceof ObjectFacade).toBe(true);
    expect(ObjectFacade.keys({ a: 1 })).toEqual(['a']);
    expect(new ObjectFacade()).toEqual({});
    expect(ObjectFacade.getOwnPropertyDescriptor).toBeUndefined();
    expect(ObjectFacade.getPrototypeOf).toBeUndefined();
  });

  it('a computed key keeps its value, except constructor', () => {
    expect(safeKey(3)).toBe(3);
    expect(safeKey('x')).toBe('x');
    expect(safeKey('__proto__')).toBe('__proto__');
    expect(typeof safeKey('constructor')).toBe('symbol');
    // An object is converted once: a key cannot change its answer between checks.
    let calls = 0;
    const sly = { toString: () => (calls++ ? 'constructor' : 'harmless') };
    expect(safeKey(sly)).toBe('harmless');
    expect(typeof safeKey(sly)).toBe('symbol');
    expect(calls).toBe(2);
  });

  it('shadows every browser global and keeps ECMAScript builtins', () => {
    const shadows = new Set(hostShadows());
    for (const name of ['window', 'document', 'fetch', 'localStorage', 'XMLHttpRequest', 'eval', 'globalThis', 'Function', 'Reflect', 'setTimeout']) {
      if (name in globalThis || ['eval', 'globalThis', 'Function', 'Reflect'].includes(name)) expect(shadows.has(name), name).toBe(true);
    }
    for (const name of ['Object', 'Array', 'Math', 'JSON', 'Error', 'Map', 'Promise', 'parseInt', 'undefined', 'console']) {
      expect(shadows.has(name), name).toBe(false);
    }
  });
});

describe('linkProgram in a browser-shaped scope', () => {
  const link = (code: string) => linkProgram(compileSources([{ path: 'probe.ts', text: code }]));

  it('a module cannot reach the page', () => {
    const program = link(`
      export const seen = {
        window: typeof window, document: typeof document, fetch: typeof fetch, eval: typeof eval,
        globalThis: typeof globalThis, localStorage: typeof localStorage, reflect: typeof Reflect,
      };`);
    expect(program.errors).toEqual([]);
    expect(program.getDefinition('seen')).toBeUndefined();   // not a class: read the module another way
  });

  it('reports every host name as undefined, and the builtins as themselves', () => {
    const program = link(`
      export class Probe {
        static seen() {
          return [typeof window, typeof document, typeof fetch, typeof eval, typeof globalThis, typeof Reflect,
            typeof Math, typeof JSON, typeof Object, typeof Array];
        }
      }`);
    expect(program.errors).toEqual([]);
    const Probe = program.getDefinition('Probe') as { seen(): string[] };
    expect(Probe.seen()).toEqual(['undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined',
      'object', 'object', 'function', 'function']);
  });

  it('a module may declare a class with a browser name (Image, Event, Node)', () => {
    const program = link(`export class Image { w = 1 } export class Event {} export class Node {}`);
    expect(program.errors).toEqual([]);
    expect(typeof program.getDefinition('Image')).toBe('function');
  });

  it('Function and the timers are AVM2\'s inside a module', () => {
    const program = link(`
      export class Probe {
        static compile() { return Function('globalThis.__pwned = 1'); }
        static timer() { return setTimeout('globalThis.__pwned = 1', 0); }
        static isFn(f: unknown) { return f instanceof Function; }
      }`);
    const Probe = program.getDefinition('Probe') as { compile(): unknown; timer(): unknown; isFn(f: unknown): boolean };
    expect(() => Probe.compile()).toThrow(/1066/);
    expect(() => Probe.timer()).toThrow(/1034/);
    expect(Probe.isFn(() => 1)).toBe(true);
    expect(globalThis.__pwned).toBeUndefined();
  });
});
