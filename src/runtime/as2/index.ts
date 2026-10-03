// AS2 runtime contract for code produced by the as2ts transpiler
// (src/transpiler/as2). Everything the generated TypeScript imports lives here.
//
// Pure language-level pieces (trace, int, typeOf, eval paths, class registry,
// _global …) are implemented here. Anything that needs the display list, the
// clock, input or the network is delegated to an `AS2Host` which the game
// engine installs with `installHost()`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { runActionsBase64, setAvm1Env, takeAvm1Warnings, type Avm1Warning } from './avm1';

// ------------------------------------------------------------------- types

/** A timeline/MovieClip as seen by transpiled code. AS2 objects are dynamic. */
export interface AS2Clip {
  [key: string]: any;
}

export interface AS2Handler {
  /** 'on' = button / clip mouse handler, 'onClipEvent' = clip event */
  kind: 'on' | 'onClipEvent';
  /** e.g. ['press', 'release'], ['enterFrame'], ['keyPress <Left>'] */
  events: string[];
  /** character id of the placed clip (placements only) */
  character?: number;
  run: (this: AS2Clip) => void;
}

export interface AS2TimelineModule {
  /** frame scripts keyed by 1-based frame number */
  frames?: Record<number, (this: AS2Clip) => void>;
  /** handlers of instances placed on this timeline, keyed by "frame:depth" */
  placements?: Record<string, AS2Handler[]>;
  /** DoInitAction code of this sprite (runs once, before its first frame) */
  init?: (this: AS2Clip) => void;
}

export interface AS2Program {
  /** timeline modules keyed by character id (0 = main timeline) */
  timelines: Record<number, AS2TimelineModule>;
  /** button handlers keyed by button character id */
  buttons: Record<number, AS2Handler[]>;
  /** AS2 classes keyed by fully-qualified name */
  classes: Record<string, unknown>;
  /** DoInitAction code of exported sprites, keyed by linkage (export) name */
  initByName?: Record<string, (this: AS2Clip) => void>;
}

/** Everything the runtime needs from the engine. */
export interface AS2Host {
  root: AS2Clip;
  level(n: number): AS2Clip | undefined;
  trace(message: string): void;
  getTimer(): number;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
  getURL(url: string, window?: string, method?: string): void;
  fscommand(command: string, args?: string): void;
  stopAllSounds(): void;
  updateAfterEvent(): void;
  duplicateMovieClip(target: AS2Clip, name: string, depth: number): AS2Clip | undefined;
  removeMovieClip(target: AS2Clip): void;
  startDrag(target: AS2Clip, lockCenter?: boolean, l?: number, t?: number, r?: number, b?: number): void;
  stopDrag(): void;
  loadMovie(url: string, target: AS2Clip | number, method?: string): void;
  loadVariables(url: string, target: AS2Clip | number, method?: string): void;
  unloadMovie(target: AS2Clip | number): void;
}

// ---------------------------------------------------------------- host glue

let host: AS2Host | null = null;
const log: string[] = [];

export function installHost(h: AS2Host | null) {
  host = h;
  installAvm1Bridge(h);
  if (h) installAS2Extensions();
}

/** Diagnostics the AVM1 interpreter collected (unknown opcodes, failed targets…). */
export function takeAvm1Diagnostics(): Avm1Warning[] { return takeAvm1Warnings(); }

/** The AS2 global object: the player built-ins plus every class the transpiled
 * scripts registered.  AVM1 bytecode resolves unqualified names through the
 * scope chain into this object, so it has to hold the same things `_global`
 * does in the Flash player. */
export function as2Globals(): Record<string, any> {
  const g = _global as Record<string, any>;
  installObjectStatics();
  const add = (values: Record<string, any>) => {
    for (const [name, value] of Object.entries(values)) if (!(name in g)) g[name] = value;
  };
  add({
    Object, Array, String, Number, Boolean, Date, Math, Function, Infinity, NaN, undefined,
    isNaN, isFinite, parseInt, parseFloat, escape, unescape, encodeURI, decodeURI, encodeURIComponent, decodeURIComponent,
  });
  add({
    trace, getTimer, random, int, chr, ord, mbchr, mbord, mblength, mbsubstring, substring,
    setInterval, clearInterval, setTimeout, clearTimeout, getURL, fscommand, stopAllSounds,
    updateAfterEvent, getVersion, targetPath, stopDrag, loadMovieNum, loadVariablesNum, unloadMovieNum,
    ASSetPropFlags, toggleHighQuality,
  });
  add({
    MovieClip, Button, TextField, TextFormat, Sound, Color, Key, Mouse, Stage, Selection, System,
    XML, XMLNode, LoadVars, LocalConnection, MovieClipLoader, ContextMenu, ContextMenuItem,
    NetConnection, NetStream, Video, TextSnapshot, PrintJob, XMLSocket, AsBroadcaster,
    Camera, Microphone, Accessibility, flash, SharedObject,
  });
  return g;
}

/** Wires the AVM1 interpreter to the engine's display list and clock. */
function installAvm1Bridge(h: AS2Host | null): void {
  if (!h) { setAvm1Env(null); return; }
  setAvm1Env({
    global: as2Globals(),
    level: (n) => h.level(n),
    getURL: (url, win, method) => h.getURL(url, win, method),
    stopAllSounds: () => h.stopAllSounds(),
    updateAfterEvent: () => h.updateAfterEvent(),
    duplicateMovieClip: (_from, target, name, depth) => h.duplicateMovieClip(target, name, depth),
    removeMovieClip: (_from, target) => h.removeMovieClip(target),
    startDrag: (_from, target, lock, l, t, r, b) => h.startDrag(target, lock, l, t, r, b),
    stopDrag: () => h.stopDrag(),
    loadMovie: (_from, url, target, method) => h.loadMovie(url, target, method),
    loadVariables: (_from, url, target, method) => h.loadVariables(url, target, method),
    callFrame: (from, frame) => {
      const fn = (from as any)?.__callFrame;
      if (typeof fn === 'function') fn.call(from, frame);
    },
  });
}
export function currentHost(): AS2Host | null { return host; }
function need(): AS2Host {
  if (!host) throw new Error('AS2 runtime: no host installed (call installHost() from the engine first)');
  return host;
}

// ------------------------------------------------------------------ _global

/** AS2 _global object. Clips fall back to it for unresolved names. */
export const _global: Record<string, any> = Object.create(null);

// ----------------------------------------------------------- class registry

const classes = new Map<string, unknown>();
/** Object.registerClass registry, one per loaded SWF library (scope null = the main movie). */
const linkage = new Map<unknown, Map<string, unknown>>();
let linkageScope: unknown = null;
/** Sets the library that Object.registerClass calls register into (the engine sets it while a loaded SWF's init actions run). */
export function setLinkageScope(scope: unknown): unknown { const prev = linkageScope; linkageScope = scope; return prev; }

/**
 * Flash statics on the global `Object` that SWFs rely on. Only
 * `Object.registerClass` matters in practice: the Flash 8 (v2) UI components
 * bind their library symbols to their classes with
 * `Object.registerClass("List", mx.controls.List)` from an init action, and the
 * engine then gives every instance of that symbol the class prototype.
 * Transpiled code resolves `Object` to the JavaScript global, so the method has
 * to live there.
 */
export function installObjectStatics(): void {
  const target = Object as unknown as Record<string, unknown>;
  if (typeof target.registerClass === 'function') return;
  Object.defineProperty(Object, 'registerClass', {
    configurable: true,
    writable: true,
    enumerable: false,
    value: (symbolId: unknown, cls: unknown): undefined => {
      const key = symbolId == null ? '' : String(symbolId);
      if (!key) return undefined;
      let lib = linkage.get(linkageScope);
      if (!lib) linkage.set(linkageScope, (lib = new Map()));
      if (cls == null) lib.delete(key); else lib.set(key, cls);
      return undefined;
    },
  });
}

function setPath(obj: Record<string, any>, path: string, value: unknown) {
  const parts = path.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p] ??= {};
  o[parts[parts.length - 1]] = value;
}

// ----------------------------------------------------------------- $rt API

/** Assignment target for writes through undefined objects (`undefined.x = 1` is a no-op in AS2). */
const sink: any = new Proxy(Object.create(null), { set: () => true, get: () => undefined, deleteProperty: () => true });

export const $rt = {
  sink,

  /** Executes a raw AVM1 action stream (base64) captured from a SWF tag. */
  avm1Actions(from: AS2Clip, base64: string): void {
    runActionsBase64(from, base64);
  },
  get root(): AS2Clip { return need().root; },
  level(n: number): AS2Clip | undefined { return need().level(n); },

  /** Registers a transpiled AS2 class (and exposes it on _global like the player). */
  registerClass(name: string, cls: unknown): boolean {
    // AS2 classes live on _global under their package path
    classes.set(name, cls);
    setPath(_global, name, cls);
    return true;
  },
  /** Object.registerClass("linkageId", Class) */
  registerLinkage(id: string, cls: unknown): boolean {
    let lib = linkage.get(linkageScope);
    if (!lib) linkage.set(linkageScope, (lib = new Map()));
    lib.set(String(id), cls);
    return true;
  },
  classByName(name: string): unknown { return classes.get(name) ?? (_global as any)[name]; },
  /** class registered for a linkage id in the given library (default: the current scope) */
  linkedClass(id: string, scope: unknown = linkageScope): unknown { return linkage.get(scope)?.get(id); },

  /** obj[name](...args) when it is a function; AS2 ignores calls of non-function values. */
  invoke(obj: any, name: string, ...args: unknown[]): any {
    const f = obj?.[name];
    return typeof f === 'function' ? f.apply(obj, args) : undefined;
  },

  /** AS2 cast `Type(value)`: the value if it is an instance of Type, otherwise null. */
  cast<T>(value: unknown, type: abstract new (...args: any[]) => T): T {
    return (value instanceof type ? value : null) as T;
  },

  /** AS2 typeof: movie clips report "movieclip". */
  typeOf(v: unknown): string {
    if (v instanceof MovieClip) return 'movieclip';
    return typeof v;
  },

  /** with(...) lookup: first object on the chain that has the property (else the last one). */
  scope(chain: any[], name: string): any {
    for (const o of chain) if (o != null && name in Object(o)) return o;
    return chain[chain.length - 1];
  },

  /** tellTarget("path") / tellTarget(clip) */
  tellTarget(from: AS2Clip, target: unknown): AS2Clip {
    const t = typeof target === 'string' ? resolvePath(from, target) : target;
    return (t as AS2Clip) ?? from;
  },

  eval(from: AS2Clip, path: unknown): any { return resolveVar(from, String(path)); },
  set(from: AS2Clip, path: unknown, value: unknown): unknown {
    const s = String(path);
    const cut = Math.max(s.lastIndexOf('.'), s.lastIndexOf(':'), s.lastIndexOf('/'));
    const owner = cut < 0 ? from : resolvePath(from, s.slice(0, cut) || '/');
    if (owner) owner[s.slice(cut + 1)] = value;
    return value;
  },
  getProperty(from: AS2Clip, target: unknown, prop: string): any {
    const t = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    return t?.[prop];
  },
  setProperty(from: AS2Clip, target: unknown, prop: string, value: unknown): void {
    const t = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    if (t) t[prop] = value;
  },
  duplicateMovieClip(from: AS2Clip, target: unknown, name: string, depth: number) {
    const t = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    return t ? need().duplicateMovieClip(t, name, depth) : undefined;
  },
  removeMovieClip(from: AS2Clip, target: unknown) {
    const t = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    if (t) need().removeMovieClip(t);
  },
  startDrag(from: AS2Clip, target: unknown, lock?: boolean, l?: number, t?: number, r?: number, b?: number) {
    const c = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    if (c) need().startDrag(c, lock, l, t, r, b);
  },
  loadMovie(from: AS2Clip, url: string, target: unknown, method?: string) {
    const t = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    if (t) need().loadMovie(url, t, method);
  },
  loadVariables(from: AS2Clip, url: string, target: unknown, method?: string) {
    const t = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    if (t) need().loadVariables(url, t, method);
  },
  unloadMovie(from: AS2Clip, target: unknown) {
    const t = typeof target === 'string' ? resolvePath(from, target) : (target as AS2Clip);
    if (t) need().unloadMovie(t);
  },
  /** AS1 call(frame): runs another frame's script on this timeline without moving the playhead. */
  call(from: AS2Clip, frame: unknown) {
    const fn = from.__callFrame;
    if (typeof fn === 'function') fn.call(from, frame);
  },
  print(_from: AS2Clip, ..._args: unknown[]) { /* printing is not supported */ },
  printAsBitmap(_from: AS2Clip, ..._args: unknown[]) { /* printing is not supported */ },

  /** Marker emitted where FFDec could not decompile bytecode (§§push etc.). */
  ffdec(marker: string): any {
    const msg = `as2ts: reached undecompiled code (${marker})`;
    if (host) host.trace(msg); else log.push(msg);
    return undefined;
  },
  /** Emitted for scripts that could not be parsed at all. */
  untranslated(file: string, error: string): void {
    const msg = `as2ts: ${file} was not translated (${error})`;
    if (host) host.trace(msg); else log.push(msg);
  },
};

// ---------------------------------------------------------- path resolution

/** Resolves AS2 target paths: "_root.a.b", "../a", "/a/b", "_level0.a", "a:b" (slash syntax). */
export function resolvePath(from: AS2Clip, path: string): AS2Clip | undefined {
  let cur: AS2Clip | undefined = from;
  let p = path.trim();
  if (!p) return from;
  if (p.startsWith('/')) { cur = cur?._root ?? host?.root; p = p.slice(1); }
  for (const seg of p.split(/[./]/)) {
    if (!cur) return undefined;
    if (seg === '' || seg === 'this') continue;
    if (seg === '..' || seg === '_parent') cur = cur._parent;
    else if (seg === '_root') cur = cur._root ?? host?.root;
    else if (/^_level\d+$/.test(seg)) cur = host?.level(Number(seg.slice(6)));
    else cur = cur[seg];
  }
  return cur;
}

/** eval("a.b.c") / eval("/a:var") */
function resolveVar(from: AS2Clip, path: string): any {
  const colon = path.lastIndexOf(':');
  if (colon >= 0) return resolvePath(from, path.slice(0, colon))?.[path.slice(colon + 1)];
  const dot = path.lastIndexOf('.');
  if (dot < 0 && !path.includes('/')) {
    return path in Object(from) ? from[path] : _global[path];
  }
  return resolvePath(from, path);
}

// --------------------------------------------------------- global functions

export function trace(value: unknown): void {
  const msg = value === undefined ? 'undefined' : String(value);
  if (host) host.trace(msg); else log.push(msg);
}
export function getTimer(): number { return need().getTimer(); }
export function random(n: number): number { return Math.floor(Math.random() * Math.max(0, Number(n) || 0)); }
export function int(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; }
export function chr(n: number): string { return String.fromCharCode(n); }
export function ord(s: string): number { return String(s).charCodeAt(0) || 0; }
export const mbchr = chr;
export const mbord = ord;
export function mblength(s: string): number { return String(s).length; }
export function mbsubstring(s: string, i: number, n: number): string { return String(s).substr(Math.max(0, i - 1), n); }
export function substring(s: string, i: number, n: number): string { return String(s).substr(Math.max(0, i - 1), n); }

/** setInterval(fn, ms, …args) or setInterval(obj, "method", ms, …args) */
export function setInterval(a: any, b: any, ...rest: any[]): number {
  if (typeof a === 'function') { const args = rest; return need().setInterval(() => a(...args), Number(b)); }
  const [ms, ...args] = rest;
  return need().setInterval(() => a?.[b]?.(...args), Number(ms));
}
export function clearInterval(id: number): void { need().clearInterval(id); }
export function setTimeout(a: any, b: any, ...rest: any[]): number {
  let id = 0;
  const fire = typeof a === 'function' ? () => a(...rest) : () => a?.[b]?.(...rest.slice(1));
  id = need().setInterval(() => { need().clearInterval(id); fire(); }, Number(typeof a === 'function' ? b : rest[0]));
  return id;
}
export const clearTimeout = clearInterval;
export function getURL(url: string, window?: string, method?: string): void { need().getURL(url, window, method); }
export function fscommand(command: string, args?: string): void { need().fscommand(command, args); }
export function stopAllSounds(): void { need().stopAllSounds(); }
export function updateAfterEvent(): void { need().updateAfterEvent(); }
export function getVersion(): string { return 'WIN 7,0,19,0'; }
export function targetPath(mc: AS2Clip): string {
  const parts: string[] = [];
  for (let c: AS2Clip | undefined = mc; c && c._parent; c = c._parent) parts.unshift(String(c._name));
  return ['_level0', ...parts].join('.');
}
export function stopDrag(): void { need().stopDrag(); }
export function loadMovieNum(url: string, level: number, method?: string) { need().loadMovie(url, level, method); }
export function loadVariablesNum(url: string, level: number, method?: string) { need().loadVariables(url, level, method); }
export function unloadMovieNum(level: number) { need().unloadMovie(level); }
/** ASSetPropFlags(obj, props, set, clear): only the "don't enumerate" bit (1) is emulated – it hides
 * properties from for..in (V2 components hide e.g. Object.prototype.LargestID this way). Read-only (4)
 * and don't-delete (2) are ignored. props: null = all own properties, "a,b" or an array of names. */
export function ASSetPropFlags(obj: unknown, props: unknown, set: number, clear?: number): void {
  if (obj == null || (typeof obj !== 'object' && typeof obj !== 'function')) return;
  const o = obj as Record<string, unknown>;
  const names = props == null ? Object.getOwnPropertyNames(o)
    : Array.isArray(props) ? props.map(String)
    : String(props).split(',').map((n) => n.trim()).filter(Boolean);
  const hide = (Number(set) & 1) !== 0, show = (Number(clear) & 1) !== 0;
  if (!hide && !show) return;
  for (const n of names) {
    const d = Object.getOwnPropertyDescriptor(o, n);
    if (!d || !d.configurable) continue;
    try { Object.defineProperty(o, n, { enumerable: show && !hide ? true : !hide }); } catch { /* frozen */ }
  }
}
export function toggleHighQuality(): void { /* no-op */ }

// ------------------------------------------------------------ Flash classes
// Real (dynamic) classes so transpiled classes can `extends MovieClip` at load
// time. The engine attaches behaviour by filling in their prototypes / static
// members when it installs itself – exactly how the AS2 player exposes them.

/**
 * Display classes. The engine creates instances (including instances of
 * registered subclasses) by setting `__construct` right before `new`, so the
 * display state, instance name and init object exist before the subclass
 * constructor body runs – exactly the order the AS2 player uses.
 */
export class MovieClip {
  [key: string]: any;
  static __construct: ((obj: any) => void) | null = null;
  constructor() {
    const c = MovieClip.__construct; MovieClip.__construct = null; c?.(this);
  }
}
export class Button {
  [key: string]: any;
  static __construct: ((obj: any) => void) | null = null;
  constructor() { const c = Button.__construct; Button.__construct = null; c?.(this); }
}
export class TextField {
  [key: string]: any;
  static __construct: ((obj: any) => void) | null = null;
  constructor() { const c = TextField.__construct; TextField.__construct = null; c?.(this); }
}
export class TextFormat {
  [key: string]: any;
  constructor(font?: string, size?: number, color?: number, bold?: boolean, italic?: boolean, underline?: boolean, url?: string, target?: string, align?: string, leftMargin?: number, rightMargin?: number, indent?: number, leading?: number) {
    Object.assign(this, { font, size, color, bold, italic, underline, url, target, align, leftMargin, rightMargin, indent, leading });
  }
}
export class Sound { [key: string]: any; constructor(public target?: AS2Clip) {} }
export class Color { [key: string]: any; constructor(public target?: AS2Clip) {} }
export class XMLNode { [key: string]: any; }
export class XML extends XMLNode { constructor(public source?: string) { super(); } }
export class LoadVars { [key: string]: any; }
export class LocalConnection { [key: string]: any; }
export class MovieClipLoader { [key: string]: any; }
export class ContextMenu {
  [key: string]: any;
  constructor(onSelect?: unknown) {
    this.onSelect = onSelect;
    this.customItems = [];
    this.builtInItems = { forward_back: true, loop: true, play: true, print: true, quality: true, rewind: true, save: true, zoom: true };
  }
}
export class ContextMenuItem { [key: string]: any; constructor(public caption?: string, public onSelect?: unknown) {} }
export class NetConnection { [key: string]: any; }
export class NetStream { [key: string]: any; }
export class Video { [key: string]: any; }
export class TextSnapshot { [key: string]: any; }
export class PrintJob { [key: string]: any; }
export class XMLSocket { [key: string]: any; }

/** Key codes as in Flash's Key object; the engine fills in isDown / listeners. */
export const Key: Record<string, any> = {
  BACKSPACE: 8, TAB: 9, ENTER: 13, SHIFT: 16, CONTROL: 17, CAPSLOCK: 20, ESCAPE: 27, SPACE: 32, PGUP: 33, PGDN: 34,
  END: 35, HOME: 36, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, INSERT: 45, DELETEKEY: 46,
};
export const Mouse: Record<string, any> = {};
export const Stage: Record<string, any> = { scaleMode: 'showAll', align: '', width: 0, height: 0, showMenu: true };
export const Selection: Record<string, any> = {};
export const System: Record<string, any> = { capabilities: {}, security: {} };
export const SharedObject: Record<string, any> = {};
export const AsBroadcaster: Record<string, any> = {};
export const Camera: Record<string, any> = {};
export const Microphone: Record<string, any> = {};
export const Accessibility: Record<string, any> = { isActive: () => false, updateProperties: () => {} };
export const flash: Record<string, any> = { geom: {}, filters: {}, display: {}, external: {}, net: {}, text: {} };

// ------------------------------------------------------ scope-chain fallback
// Timeline code reads unresolved names as `$t.name`. In the AS2 player the
// scope chain continues from the timeline to _global, so MovieClip instances
// get a prototype link whose lookups fall through to _global.
// Object.prototype members (toString, hasOwnProperty, …) keep working.
const globalFallback = new Proxy(Object.create(null), {
  get: (_t, p, receiver) => (typeof p === 'string' && !(p in Object.prototype) ? _global[p] : Reflect.get(Object.prototype, p, receiver)),
  has: (_t, p) => p in Object.prototype || (typeof p === 'string' && p in _global),
  set: (_t, p, v, receiver) => Reflect.defineProperty(receiver, p, { value: v, writable: true, enumerable: true, configurable: true }),
});
Object.setPrototypeOf(MovieClip.prototype, globalFallback);

// ------------------------------------------------------------ AS2 built-ins
// AS2 Array extras that JavaScript lacks (sortOn, numeric sort flags).
const ARRAY_FLAGS = { CASEINSENSITIVE: 1, DESCENDING: 2, UNIQUESORT: 4, RETURNINDEXEDARRAY: 8, NUMERIC: 16 };
let extensionsInstalled = false;
function flagCompare(flags: number) {
  return (a: any, b: any) => {
    let x = a, y = b;
    if (flags & ARRAY_FLAGS.NUMERIC) { x = Number(a); y = Number(b); }
    else { x = String(a); y = String(b); if (flags & ARRAY_FLAGS.CASEINSENSITIVE) { x = x.toLowerCase(); y = y.toLowerCase(); } }
    const r = x < y ? -1 : x > y ? 1 : 0;
    return flags & ARRAY_FLAGS.DESCENDING ? -r : r;
  };
}
function sortWith(arr: any[], cmp: (a: any, b: any) => number, flags: number) {
  const idx = arr.map((v, i) => ({ v, i })).sort((p, q) => cmp(p.v, q.v));
  if (flags & ARRAY_FLAGS.UNIQUESORT && idx.some((p, i) => i > 0 && cmp(idx[i - 1].v, p.v) === 0)) return 0;
  if (flags & ARRAY_FLAGS.RETURNINDEXEDARRAY) return idx.map((p) => p.i);
  idx.forEach((p, i) => { arr[i] = p.v; });
  return arr;
}
export function installAS2Extensions() {
  if (extensionsInstalled) return;
  extensionsInstalled = true;
  Object.assign(Array, ARRAY_FLAGS);
  const nativeSort = Array.prototype.sort;
  Object.defineProperty(Array.prototype, 'sort', {
    configurable: true, writable: true,
    value: function sort(this: any[], a?: any, b?: any) {
      if (typeof a === 'number') return sortWith(this, flagCompare(a), a);
      if (typeof a === 'function' && typeof b === 'number') return sortWith(this, b & ARRAY_FLAGS.DESCENDING ? (x: any, y: any) => -a(x, y) : a, b);
      return nativeSort.call(this, a);
    },
  });
  Object.defineProperty(Array.prototype, 'sortOn', {
    configurable: true, writable: true,
    value: function sortOn(this: any[], field: string | string[], options?: number | number[]) {
      const fields = Array.isArray(field) ? field : [field];
      const opts = fields.map((_, i) => (Array.isArray(options) ? options[i] ?? 0 : options ?? 0));
      const cmp = (a: any, b: any) => {
        for (let i = 0; i < fields.length; i++) { const r = flagCompare(opts[i])(a?.[fields[i]], b?.[fields[i]]); if (r) return r; }
        return 0;
      };
      return sortWith(this, cmp, opts[0]);
    },
  });
}

/** Clears all program state (_global, class and linkage registries) for a fresh run. */
export function resetRuntime() {
  for (const k of Object.getOwnPropertyNames(_global)) delete _global[k];
  installGlobals();
  classes.clear();
  linkage.clear();
  linkageScope = null;
  log.length = 0;
}

/** Messages logged before a host was installed. */
export function pendingLog(): string[] { return log.splice(0); }

/** In Flash _global is the object holding the built-ins (_global.ASSetPropFlags, _global.MovieClip, …).
 * They are installed non-enumerable so for..in over _global only sees game data. */
function installGlobals() {
  const builtins: Record<string, unknown> = {
    Object, Array, String, Number, Boolean, Math, Date, Function, Error, parseInt, parseFloat, isNaN, isFinite, escape, unescape,
    trace, getTimer, random, int, chr, ord, mbchr, mbord, mblength, mbsubstring, substring, setInterval, clearInterval, setTimeout, clearTimeout,
    getURL, fscommand, stopAllSounds, updateAfterEvent, getVersion, targetPath, stopDrag, loadMovieNum, loadVariablesNum, unloadMovieNum,
    ASSetPropFlags, toggleHighQuality, MovieClip, Button, TextField, TextFormat, Sound, Color, XMLNode, XML, LoadVars, LocalConnection,
    MovieClipLoader, ContextMenu, ContextMenuItem, NetConnection, NetStream, Video, TextSnapshot, PrintJob, XMLSocket,
    Key, Mouse, Stage, Selection, System, SharedObject, AsBroadcaster, Camera, Microphone,
  };
  for (const [k, v] of Object.entries(builtins)) {
    if (v !== undefined) Object.defineProperty(_global, k, { value: v, writable: true, configurable: true, enumerable: false });
  }
}
installGlobals();
