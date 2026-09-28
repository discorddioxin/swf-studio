// flash.utils + AS3 top-level functions/types (trace, int, uint, Vector, errors…).
//
// Timers run on *player* time, not wall-clock time: they pause with the
// player, advance with Step, and are cleared when the game is restarted.

import { runtime } from './context';
import { EventDispatcher, TimerEvent } from './events';

interface Scheduler {
  schedule(delay: number, fn: () => void, repeat: boolean): number;
  cancel(id: number): void;
  getDefinition(name: string): unknown;
}
const scheduler = () => runtime.player as unknown as Scheduler | null;

export function getTimer(): number { return Math.floor((runtime.player?.time ?? 0) + 1e-6); }

export function setTimeout(fn: (...a: unknown[]) => unknown, delay: number, ...args: unknown[]): number {
  return scheduler()?.schedule(Number(delay) || 0, () => fn(...args), false) ?? 0;
}
export function setInterval(fn: (...a: unknown[]) => unknown, delay: number, ...args: unknown[]): number {
  return scheduler()?.schedule(Number(delay) || 0, () => fn(...args), true) ?? 0;
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
export class Dictionary {
  constructor(_weakKeys = false) {
    const map = new Map<unknown, unknown>();
    const api: Record<string, unknown> = {
      get: (k: unknown) => map.get(k), set: (k: unknown, v: unknown) => { map.set(k, v); return api; },
      has: (k: unknown) => map.has(k), delete: (k: unknown) => map.delete(k), clear: () => map.clear(),
      keys: () => map.keys(), values: () => map.values(), entries: () => map.entries(),
      forEach: (fn: (v: unknown, k: unknown) => void) => map.forEach(fn), [Symbol.iterator]: () => map.entries(),
    };
    return new Proxy(this, {
      get: (_t, k) => (k === 'size' ? map.size : k in api && !map.has(k) ? api[k as string] : map.get(k)),
      set: (_t, k, v) => { map.set(k, v); return true; },
      has: (_t, k) => map.has(k),
      deleteProperty: (_t, k) => map.delete(k),
      ownKeys: () => [...map.keys()].filter((k): k is string | symbol => typeof k === 'string' || typeof k === 'symbol'),
      getOwnPropertyDescriptor: (_t, k) => (map.has(k) ? { enumerable: true, configurable: true, writable: true, value: map.get(k) } : undefined),
    });
  }
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
