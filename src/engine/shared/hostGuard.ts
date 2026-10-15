// What code from a SWF may reach of the JavaScript host it runs in.
//
// A transpiled movie is ordinary JavaScript in the page's realm. Flash had no way
// to compile a string into code (AVM2 `Function("…")` is EvalError #1066, AS2 has
// no `eval` of source), and no access to the page. JavaScript has both, reachable
// by name (`Function`, `eval`, `setTimeout("…")`, `document`, `fetch`) and by
// reflection (`f.constructor`, `obj["constr" + "uctor"]`). This module closes
// those doors for generated code:
//
//   - `AvmFunction` stands in for `Function`: `x is Function` still works, calling
//     it with source text throws as AVM2 does;
//   - `safeConstructor` is what a `.constructor` read returns: the real value,
//     except the host's code-compiling constructors, which become `AvmFunction`
//     (and the real `Object`, which becomes the `ObjectFacade`);
//   - `safeKey` is a computed property key: the key itself, except `constructor`,
//     which maps to a private symbol (a computed `o["constr" + "uctor"]` reads a
//     dynamic property, never the host constructor). `__proto__` is not guarded:
//     AVM2 reads it as the object's prototype too, and real movies use it (Sushi's
//     `Serializer` switches on `value.__proto__`);
//   - `hostShadows` lists every global of the page that is not an ECMAScript
//     builtin, so the module loader can bind each to `undefined`.
//
// This is a guard inside one realm, not an isolation boundary: a movie runs in the
// page's realm, and the complete fix is to run it in its own (RESOLUTION_PLAN
// P-03b). It does make every route generated code is *printed* with safe.

const EVAL_ERROR_1066 = "Error #1066: The form function('function body') is not supported.";

/**
 * AVM2's `Function` class as a value: a type to test against, a constructor that
 * makes an empty function, never a compiler.
 */
export const AvmFunction = function Function(...args: unknown[]): () => void {
  if (args.length) throw new EvalError(EVAL_ERROR_1066);
  return function () { /* the empty function `new Function()` makes */ };
} as unknown as FunctionConstructor;
Object.defineProperty(AvmFunction, Symbol.hasInstance, { value: (v: unknown) => typeof v === 'function' });
Object.defineProperty(AvmFunction, 'prototype', { value: Object.freeze(Object.create(null)), writable: false });

/** The host constructors that compile source text. */
const COMPILERS: ReadonlySet<unknown> = new Set([
  Function,
  Object.getPrototypeOf(async function () { /* */ }).constructor,
  Object.getPrototypeOf(function* () { /* */ }).constructor,
  Object.getPrototypeOf(async function* () { /* */ }).constructor,
]);

/** `Object` statics that hand out what a `.constructor` read is guarded from. */
const REFLECTIVE = new Set(['getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'getPrototypeOf', 'setPrototypeOf']);

/**
 * `Object` as generated code sees it: callable, constructible, `instanceof`-able,
 * everything ActionScript and the module system use — minus the reflective statics
 * that would read a function's real `constructor` past `safeConstructor`.
 */
export const ObjectFacade: ObjectConstructor = new Proxy(Object, {
  get(target, key, receiver) {
    if (typeof key === 'string' && REFLECTIVE.has(key)) return undefined;
    return Reflect.get(target, key, receiver);
  },
});

/** A `.constructor` read: the real value, unless that is a door to the host. */
export function safeConstructor(obj: unknown): unknown {
  const value = (obj as { constructor?: unknown }).constructor;
  if (COMPILERS.has(value)) return AvmFunction;
  if (value === Object) return ObjectFacade;
  return value;
}

const GUARDED_KEYS = new Map<string, symbol>([['constructor', Symbol('constructor')]]);

/**
 * A computed property key. Numbers and symbols pass through; anything else is
 * the string it converts to — once, here, so an object cannot answer differently
 * the second time — with `constructor` held apart from the host's constructor.
 */
export function safeKey(key: unknown): PropertyKey {
  if (typeof key === 'number' || typeof key === 'symbol') return key;
  const text = String(key);
  return GUARDED_KEYS.get(text) ?? text;
}

/** ECMAScript's own globals (and `console`): what generated code may name freely. */
const ECMASCRIPT_GLOBALS = new Set([
  'Object', 'Array', 'Boolean', 'Number', 'String', 'Symbol', 'BigInt', 'Math', 'JSON', 'Date', 'RegExp',
  'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'AggregateError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry', 'Promise', 'Proxy', 'Intl',
  'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'encodeURIComponent', 'decodeURI',
  'decodeURIComponent', 'escape', 'unescape', 'NaN', 'Infinity', 'undefined', 'console',
]);

/** Words that cannot be a parameter name of a sloppy-mode function. */
const NOT_BINDABLE = new Set(('break case catch class const continue debugger default delete do else enum export extends ' +
  'false finally for function if import in instanceof new null return super switch this throw true try typeof var void ' +
  'while with yield let static implements interface package private protected public await arguments').split(' '));

/**
 * Every name the page's global object answers (own and inherited) that generated
 * code must not reach: everything but the ECMAScript builtins. `eval` and
 * `globalThis` are among them. The loader binds each to `undefined` in a sloppy
 * outer function around each (strict) module.
 */
export function hostShadows(): string[] {
  const names = new Set<string>();
  for (let o: object | null = globalThis; o; o = Object.getPrototypeOf(o)) {
    for (const name of Object.getOwnPropertyNames(o)) names.add(name);
  }
  names.add('eval');
  names.add('globalThis');
  names.add('Function');
  names.add('Reflect');
  return [...names].filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && !NOT_BINDABLE.has(name) && !ECMASCRIPT_GLOBALS.has(name)).sort();
}

/** Host names that generated code gets a safe stand-in for instead of `undefined`. */
export const HOST_STAND_INS: Readonly<Record<string, unknown>> = { Function: AvmFunction, Object: ObjectFacade };
