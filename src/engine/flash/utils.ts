// flash.utils + AS3 top-level functions/types (trace, int, uint, Vector, errors…).
//
// Timers run on *player* time, not wall-clock time: they pause with the
// player, advance with Step, and are cleared when the game is restarted.

import { runtime } from './context';
import { safeConstructor } from '../../runtime/shared/hostGuard';
import { EventDispatcher, TimerEvent } from './events';

interface Scheduler {
  schedule(delay: number, fn: () => void, repeat: boolean): number;
  cancel(id: number): void;
  getDefinition(name: string): unknown;
}
const scheduler = () => runtime.player as unknown as Scheduler | null;

export function getTimer(): number { return Math.floor((runtime.player?.time ?? 0) + 1e-6); }

/** AVM2 coerces the closure argument to `Function`: a string is TypeError #1034, never source. */
function closureOf(fn: unknown, caller: string): (...a: unknown[]) => unknown {
  if (typeof fn !== 'function') {
    throw new TypeError(`Error #1034: Type Coercion failed: cannot convert ${String(fn)} to Function (${caller}).`);
  }
  return fn as (...a: unknown[]) => unknown;
}
export function setTimeout(fn: (...a: unknown[]) => unknown, delay: number, ...args: unknown[]): number {
  const closure = closureOf(fn, 'setTimeout');
  return scheduler()?.schedule(Number(delay) || 0, () => closure(...args), false) ?? 0;
}
export function setInterval(fn: (...a: unknown[]) => unknown, delay: number, ...args: unknown[]): number {
  const closure = closureOf(fn, 'setInterval');
  return scheduler()?.schedule(Number(delay) || 0, () => closure(...args), true) ?? 0;
}
export function clearTimeout(id: number) { scheduler()?.cancel(id); }
export function clearInterval(id: number) { scheduler()?.cancel(id); }

export class Timer extends EventDispatcher {
  private _delay: number;
  repeatCount: number;
  private _count = 0;
  private _id = 0;
  constructor(delay: number, repeatCount = 0) {
    super();
    this._delay = Number(delay) || 0;
    this.repeatCount = repeatCount;
  }
  get delay() { return this._delay; }
  set delay(v: number) { this._delay = Number(v) || 0; if (this._id) { this.stop(); this.start(); } }
  get currentCount() { return this._count; }
  get running() { return this._id !== 0; }
  start() {
    if (this._id) return;
    this._id = scheduler()?.schedule(this._delay, () => this._tick(), true) ?? 0;
  }
  stop() { if (this._id) scheduler()?.cancel(this._id); this._id = 0; }
  reset() { this.stop(); this._count = 0; }
  private _tick() {
    this._count++;
    this.dispatchEvent(new TimerEvent(TimerEvent.TIMER));
    if (this.repeatCount > 0 && this._count >= this.repeatCount) {
      this.stop();
      this.dispatchEvent(new TimerEvent(TimerEvent.TIMER_COMPLETE));
    }
  }
}

/**
 * AS3 Dictionary. `d[key]` works for string/number keys (JavaScript turns
 * other property keys into strings before any code can see them), and the
 * Map-style `get/set/has/delete` methods keep object keys by identity for
 * transpilers that emit them.
 */
/** Each Dictionary (the proxy a script holds) → the map behind it: for-in visits its keys, objects included. */
const DICTIONARIES = new WeakMap<object, Map<unknown, unknown>>();
/** @internal A Dictionary's keys in insertion order; undefined for anything else. */
export function dictionaryKeys(o: unknown): unknown[] | undefined {
  const map = o && typeof o === 'object' ? DICTIONARIES.get(o) : undefined;
  return map ? [...map.keys()] : undefined;
}
/** @internal The value under `key` when `o` is a Dictionary. */
export function dictionaryValue(o: unknown, key: unknown): { found: boolean; value?: unknown } {
  const map = o && typeof o === 'object' ? DICTIONARIES.get(o) : undefined;
  return map ? { found: true, value: map.get(key) } : { found: false };
}

export class Dictionary {
  constructor(_weakKeys = false) {
    const map = new Map<unknown, unknown>();
    const api: Record<string, unknown> = {
      get: (k: unknown) => map.get(k), set: (k: unknown, v: unknown) => { map.set(k, v); return api; },
      has: (k: unknown) => map.has(k), delete: (k: unknown) => map.delete(k), clear: () => map.clear(),
      keys: () => map.keys(), values: () => map.values(), entries: () => map.entries(),
      forEach: (fn: (v: unknown, k: unknown) => void) => map.forEach(fn), [Symbol.iterator]: () => map.entries(),
    };
    const proxy = new Proxy(this, {
      get: (_t, k) => (k === 'size' ? map.size : k in api && !map.has(k) ? api[k as string] : map.get(k)),
      set: (_t, k, v) => { map.set(k, v); return true; },
      has: (_t, k) => map.has(k),
      // AS3 `delete d[k]` is true whether or not the key was there (so is JavaScript's,
      // and a false here is a TypeError in strict code).
      deleteProperty: (_t, k) => { map.delete(k); return true; },
      ownKeys: () => [...map.keys()].filter((k): k is string | symbol => typeof k === 'string' || typeof k === 'symbol'),
      getOwnPropertyDescriptor: (_t, k) => (map.has(k) ? { enumerable: true, configurable: true, writable: true, value: map.get(k) } : undefined),
    });
    DICTIONARIES.set(proxy, map);
    return proxy;
  }
}

/**
 * AVM2's `Class`: the type of class objects. Here a class *is* its constructor, so
 * `x instanceof Class` asks whether x is one — which is what `getClassDef`-style
 * code does with the result of `getDefinitionByName`.
 *
 * `Class(x)` is a cast, and like every other cast in AS3 it is identity on a value
 * of the right kind and a `TypeError` otherwise.
 */
export function Class(value?: unknown): unknown {
  if (arguments.length === 0) return Class;
  if (isClassObject(value)) return value;
  throw new TypeError(`Error #1034: Type Coercion failed: cannot convert ${String(value)} to Class.`);
}
export function isClassObject(value: unknown): boolean {
  return typeof value === 'function' && (value as { prototype?: unknown }).prototype != null;
}
Object.defineProperty(Class, Symbol.hasInstance, { value: (value: unknown) => isClassObject(value) });

/**
 * Instance slot defaults of a lifted class. In AVM2 an object holds every declared
 * slot's default from the moment it is allocated, so a base-class constructor that
 * calls an overridden method already sees the subclass's `_value = 1`. JavaScript
 * runs field initializers only after `super()` returns; a default on the prototype
 * is visible from the start, and the first write makes the instance's own copy.
 *
 * A name the engine (or a base class) already defines as an accessor or method is
 * left alone: the lifted class named a slot in a namespace TypeScript cannot keep
 * apart, and shadowing the accessor would cut the display object off from it.
 */
export function __slots(owner: { prototype: object }, defaults: Record<string, unknown>): void {
  const proto = owner.prototype;
  for (const [name, value] of Object.entries(defaults)) {
    if (definesBehaviour(Object.getPrototypeOf(proto), name)) continue;
    Object.defineProperty(proto, name, { value, writable: true, configurable: true, enumerable: false });
  }
}

/** Is `name` an accessor or a method somewhere on the chain from `proto`? */
export function definesBehaviour(proto: object | null, name: string): boolean {
  for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    const desc = Object.getOwnPropertyDescriptor(p, name);
    if (!desc) continue;
    return !!(desc.get || desc.set || typeof desc.value === 'function');
  }
  return false;
}

/**
 * A method read as a value: `obj.method` in AVM2 is a closure bound to `obj`, not the
 * bare function. Emitted reads go through here so `addEventListener(..., this.onTick)`
 * keeps its receiver, and so adding and removing the same listener pair up (the bound
 * closure is cached per receiver, where AVM2 compares the receiver and the method).
 */
export function __method(recv: unknown, name: string, owner?: { prototype?: object; name?: string }): unknown {
  if (recv == null) {
    throw new TypeError(`TypeError: Error #1009: Cannot access a property or method of a null object reference`);
  }
  // The guarded read the printer uses for `.constructor` (`runtime/shared/hostGuard.ts`).
  if (name === 'constructor') return safeConstructor(recv);
  const holder = (owner?.prototype ?? recv) as Record<string, unknown>;
  const fn = holder?.[name];
  if (typeof fn !== 'function') return (recv as Record<string, unknown>)[name];
  let cache = METHOD_CACHE.get(recv as object);
  const key = owner ? `${name}#${owner.name ?? 'super'}` : name;
  const hit = cache?.get(key);
  if (hit) return hit;
  const bound = fn.bind(recv);
  if (!cache) METHOD_CACHE.set(recv as object, (cache = new Map()));
  cache.set(key, bound);
  return bound;
}
const METHOD_CACHE = new WeakMap<object, Map<string, unknown>>();

/**
 * Name resolution through `with` scopes (`pushwith`; also every E4X filter
 * `list.(predicate)`, whose predicate runs with each item as a `with` scope). The
 * scopes come innermost first; the first that *has* the property is where the name
 * lives, as AVM2's scope-chain search asks each `with` object `hasProperty`. A value
 * can answer that itself through `__hasProperty` — XML does, since its children and
 * attributes are properties no `in` test sees. Otherwise the name resolves where it
 * would without the `with`: `fallback`, or what `lazyFallback()` returns — a global
 * is only read when no `with` object answers, since reading an undefined one throws.
 */
export function __withScope(scopes: unknown[], name: string, fallback: unknown, lazyFallback?: () => unknown): unknown {
  for (const scope of scopes) {
    if (scope == null) continue;
    const probe = (scope as { __hasProperty?: (n: string) => boolean }).__hasProperty;
    if (typeof probe === 'function' ? probe.call(scope, name) : name in Object(scope)) return scope;
  }
  return lazyFallback ? lazyFallback() : fallback;
}

/**
 * AVM2 interfaces exist at runtime: `x is IFoo`, `x as IFoo` and
 * `x instanceof IFoo` all work, and a class declares the interfaces it implements.
 * TypeScript erases both the interface and the `implements` clause, so the engine
 * keeps the two facts it needs explicitly:
 *
 *   const IFocusManagerComponent = __interface('fl.managers.IFocusManagerComponent');
 *   __implements(UIComponent, IEventDispatcher, IFocusManagerComponent);
 *
 * `instanceof` then walks the class's own list (and its supers', which the helper
 * flattens once at registration), including interfaces that extend interfaces.
 */
export interface InterfaceShape {
  readonly name: string;
  readonly parents: InterfaceShape[];
  readonly implementors: WeakSet<object>;
}

const INTERFACES = new WeakMap<object, InterfaceShape>();

/** An interface object: a value `instanceof` understands, and a type in AS3 terms. */
export function __interface(name: string, ...parents: unknown[]): InterfaceShape {
  const shape: InterfaceShape = {
    name,
    parents: parents.filter((p): p is InterfaceShape => INTERFACES.has(p as object) || (typeof p === 'object' && p !== null && 'implementors' in p)),
    implementors: new WeakSet<object>(),
  };
  INTERFACES.set(shape, shape);
  Object.defineProperty(shape, Symbol.hasInstance, {
    value: (value: unknown) => implementsInterface(value, shape),
    enumerable: false,
  });
  Object.defineProperty(shape, 'toString', { value: () => `[interface ${name}]`, enumerable: false });
  return shape;
}

/** Declare (once per class) the interfaces a class implements. */
export function __implements(owner: unknown, ...faces: InterfaceShape[]): void {
  const target = classOf(owner);
  if (!target) return;
  const list = interfaceList(target);
  for (const face of faces) {
    if (!face) continue;
    if (!list.includes(face)) list.push(face);
    face.implementors.add(target);
  }
}

/** Does `value` implement `iface`? Walks the class chain, interfaces included. */
export function implementsInterface(value: unknown, iface: InterfaceShape): boolean {
  if (value == null) return false;
  const target = classOf(value);
  if (!target) return false;
  if (iface.implementors.has(target)) return true;
  return interfaceList(target).some((face) => face === iface || face.parents.some((p) => p === iface));
}

/** The interfaces of a class, including the ones its superclasses declared. */
function interfaceList(target: object): InterfaceShape[] {
  const existing = interfaceLists.get(target);
  if (existing) return existing;
  const own = [...(Object.getOwnPropertyDescriptor(target, '__interfaces')?.value as InterfaceShape[] | undefined ?? [])];
  const list: InterfaceShape[] = [];
  for (const face of own) if (!list.includes(face)) list.push(face);
  for (const face of [...list]) for (const parent of face.parents) if (!list.includes(parent)) list.push(parent);
  interfaceLists.set(target, list);
  return list;
}
const interfaceLists = new WeakMap<object, InterfaceShape[]>();

/** The class of a value: instances give their constructor, class objects themselves. */
function classOf(value: unknown): object | null {
  if (typeof value === 'function') return value;
  if (typeof value !== 'object' || value === null) return null;
  const ctor = (value as { constructor?: unknown }).constructor;
  return ctor && ctor !== Object ? (ctor as object) : null;
}

export function getDefinitionByName(name: string): unknown {
  const def = scheduler()?.getDefinition(String(name));
  if (def == null) throw new ReferenceError(`Error #1065: Variable ${name} is not defined.`);
  return def;
}
export function getQualifiedClassName(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'Number';
  if (typeof value === 'string') return 'String';
  if (typeof value === 'boolean') return 'Boolean';
  const ctor = typeof value === 'function' ? value as { name?: string; __qualifiedName?: string } : (value as { constructor?: { name?: string; __qualifiedName?: string } }).constructor;
  return ctor?.__qualifiedName ?? ctor?.name ?? 'Object';
}
export function getQualifiedSuperclassName(value: unknown): string | null {
  const ctor = typeof value === 'function' ? value : (value as { constructor?: unknown })?.constructor;
  const sup = ctor ? Object.getPrototypeOf(ctor) : null;
  return sup && sup !== Function.prototype ? getQualifiedClassName(sup) : null;
}
export function describeType(value: unknown) { return `<type name="${getQualifiedClassName(value)}"/>`; }
export function escapeMultiByte(s: string) { return encodeURIComponent(s); }
export function unescapeMultiByte(s: string) { return decodeURIComponent(s); }

/** Minimal ByteArray (enough for clone-by-serialisation and simple buffers). */
export class ByteArray {
  private _data: unknown[] = [];
  position = 0;
  endian = 'bigEndian';
  get length() { return this._data.length; }
  get bytesAvailable() { return Math.max(0, this._data.length - this.position); }
  writeObject(o: unknown) { this._data[this.position++] = structuredCloneSafe(o); }
  readObject() { return structuredCloneSafe(this._data[this.position++]); }
  writeByte(v: number) { this._data[this.position++] = v & 255; }
  readByte() { return Number(this._data[this.position++] ?? 0); }
  writeUTFBytes(s: string) { for (const ch of s) this._data[this.position++] = ch; }
  clear() { this._data = []; this.position = 0; }
}
function structuredCloneSafe<T>(o: T): T {
  try { return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)); } catch { return o; }
}

// ------------------------------------------------------- AS3 top level ---

export function trace(...args: unknown[]) {
  const text = args.map((a) => (a === undefined ? 'undefined' : a === null ? 'null' : String(a))).join(' ');
  if (runtime.player) runtime.player.trace(text);
  else console.log(text);
}

/** AS3 `int(x)` coercion (also usable as a type name in transpiled code). */
export function int(v: unknown) { return Number(v) | 0; }
/** AS3 `uint(x)` coercion. */
export function uint(v: unknown) { return Number(v) >>> 0; }

/** AS3 Vector.<T>: an Array with `fixed` and AS3's constructor signature. */
export class Vector<T = unknown> extends Array<T> {
  fixed = false;
  constructor(length: number | unknown = 0, fixed = false) {
    super();
    if (typeof length === 'number') this.length = length;
    this.fixed = fixed;
  }
  static get [Symbol.species]() { return Array; }
}

export class ArgumentError extends Error { constructor(message = '', public errorID = 0) { super(message); this.name = 'ArgumentError'; } }
export class DefinitionError extends Error { constructor(message = '', public errorID = 0) { super(message); this.name = 'DefinitionError'; } }
export class SecurityError extends Error { constructor(message = '', public errorID = 0) { super(message); this.name = 'SecurityError'; } }
export class VerifyError extends Error { constructor(message = '', public errorID = 0) { super(message); this.name = 'VerifyError'; } }
export class IllegalOperationError extends Error { constructor(message = '', public errorID = 0) { super(message); this.name = 'IllegalOperationError'; } }
export class IOError extends Error { constructor(message = '', public errorID = 0) { super(message); this.name = 'IOError'; } }
export class EOFError extends IOError { constructor(message = '', errorID = 0) { super(message, errorID); this.name = 'EOFError'; } }

export function isXMLName(s: string) { return /^[A-Za-z_][\w.-]*$/.test(s); }

// `Object.prototype.setPropertyIsEnumerable` is ActionScript-only (Flash's Object
// class has it; JavaScript's does not). A movie calls it on any object — its own
// class instances included — so it is installed once, here, as a non-enumerable
// method, exactly where AS3 defines it.
declare global {
  interface Object {
    setPropertyIsEnumerable(name: string, isEnum?: boolean): void;
  }
}
if (!Object.prototype.setPropertyIsEnumerable) {
  Object.defineProperty(Object.prototype, 'setPropertyIsEnumerable', {
    value: function (this: Record<string, unknown>, name: string, isEnum = true) {
      // `length` and other built-in properties cannot be re-declared; AS3 leaves
      // them as they are rather than throwing.
      if (name === 'length') return;
      const value = this[name];
      Object.defineProperty(this, name, { value, enumerable: isEnum, configurable: true, writable: true });
    },
    enumerable: false, configurable: true, writable: true,
  });
}

// ---------------------------------------------------------------------------
// Emitter helpers: the three bytecodes whose ActionScript semantics have no
// JavaScript spelling. A transpiled module calls these by name — the loader puts
// every top-level name in scope — so they live here rather than in the emitter.

/**
 * `applytype` — `Vector.<int>`: the class is asked to specialise itself with the
 * type arguments. The engine's Vector is untyped at runtime (TypeScript erases the
 * type), so the class itself is the answer.
 */
export function __applyType(base: unknown, ...types: unknown[]): unknown {
  const klass = base as { applyType?: (...t: unknown[]) => unknown } | null;
  if (klass && typeof klass === 'object' || typeof klass === 'function') {
    if (klass && typeof klass.applyType === 'function') return klass.applyType(...types);
    return klass;
  }
  throw new TypeError('applytype of a non-class');
}

/** `convert_o` — coercing to Object throws on null and undefined. */
export function __coerceObject(value: unknown): unknown {
  if (value === null || value === undefined) throw new TypeError('null or undefined cannot be coerced to Object');
  return value;
}
