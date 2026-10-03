// AVM1 (ActionScript 1/2) bytecode interpreter.
//
// A Flash 7 game like Gaia Fishing is *not* AS3: its logic lives in AVM1
// ActionRecord streams (DoAction / DoInitAction tags, button condition actions
// and clip action records).  There is no source for it, and a source-level
// decompiler is both huge and lossy, so the studio executes the bytecode
// directly, exactly as the Flash Player would (see
// audits/GAIA_FISHING_INVESTIGATION.md §4).  The object model underneath is the
// one the engine installs into this runtime (src/engine/as2/builtins.ts):
// clips are JS objects with `_x`/`_parent`/… and MovieClip methods, and
// `_global` holds the AS2 built-ins.
//
// Scripts reach the interpreter through `$rt.actions(this, "<base64>")`, the
// one statement the SWF parser synthesises for a decoded action stream.
//
// Semantics follow the AVM1 spec as implemented by Ruffle (swf/src/avm1,
// core/src/avm1): scope chain = Local → With* → Target → Global, registers 0…n,
// operand stack, `tellTarget` targets, closures in SWF ≥ 6.

/** Host services the interpreter needs.  Installed by src/runtime/as2/index.ts. */
export interface Avm1Env {
  /** Max AVM1 action steps a single script may run (Flash's "script running slowly" guard).
   *  Defaults to DEFAULT_SCRIPT_BUDGET. Raise it for heavy but legitimate scripts. */
  budget?: number;
  /** the AS2 `_global` object (holds trace, getTimer, MovieClip, Object, …) */
  global: Record<string, any>;
  /** `_levelN` lookup for a loaded movie (undefined when the level is empty) */
  level?(n: number): any;
  /** override the display-object helpers below (the defaults call clip methods) */
  duplicateMovieClip?(from: any, target: any, name: string, depth: number): any;
  removeMovieClip?(from: any, target: any): void;
  startDrag?(from: any, target: any, lock?: boolean, l?: number, t?: number, r?: number, b?: number): void;
  stopDrag?(): void;
  getURL?(url: string, win?: string, method?: string): void;
  loadMovie?(from: any, url: string, target: any, method?: string): void;
  loadVariables?(from: any, url: string, target: any, method?: string): void;
  stopAllSounds?(): void;
  updateAfterEvent?(): void;
  /** runs another frame's script on this timeline (AS1 `call(frame)`) */
  callFrame?(from: any, frame: any): void;
  /** diagnostics (unknown opcodes, failed tellTargets, …) */
  onWarn?(warning: Avm1Warning): void;
}

let env: Avm1Env = { global: Object.create(null) };

/** The activation whose bytecode is running (the interpreter is single-threaded). */
let activeFrame: Frame | null = null;

export function setAvm1Env(next: Avm1Env | null): void {
  env = next ?? { global: Object.create(null) };
}

// --------------------------------------------------------------- warnings

export interface Avm1Warning { opcode?: number; message: string }
let warnings: Avm1Warning[] = [];
let warnCount = 0;

function warn(message: string, opcode?: number) {
  warnCount++;
  if (warnings.length < 200) warnings.push({ opcode, message });
  env.onWarn?.({ opcode, message });
}

/** Warnings collected since the last call (diagnostics for the Execute console). */
export function takeAvm1Warnings(): Avm1Warning[] {
  const out = warnings;
  warnings = [];
  return out;
}

// ------------------------------------------------------------------ values

const S_GLOBAL = 0;
const S_TARGET = 1;
const S_LOCAL = 2;
const S_WITH = 3;

interface Scope {
  cls: number;
  obj: any;
  parent: Scope | null;
}

interface Frame {
  /** value of `this` */
  thisVal: any;
  /** clip whose timeline this bytecode belongs to */
  baseClip: any;
  /** tellTarget target (starts as the base clip; null after a failed SetTarget) */
  target: any | null;
  scope: Scope;
  registers: any[];
  stack: any[];
  constants: string[];
  code: Uint8Array;
}

export interface Avm1Def {
  kind: 'avm1';
  name: string;
  code: Uint8Array;
  params: { name: string; register: number }[];
  registerCount: number;
  flags: number;
  scope: Scope;
  baseClip: any;
  constants: string[];
  fn?: any;
}

const F_PRELOAD_THIS = 1 << 0;
const F_SUPPRESS_THIS = 1 << 1;
const F_PRELOAD_ARGUMENTS = 1 << 2;
const F_SUPPRESS_ARGUMENTS = 1 << 3;
const F_PRELOAD_SUPER = 1 << 4;
const F_SUPPRESS_SUPER = 1 << 5;
const F_PRELOAD_ROOT = 1 << 6;
const F_PRELOAD_PARENT = 1 << 7;
const F_PRELOAD_GLOBAL = 1 << 8;

interface Return { kind: 'implicit' | 'return' | 'end'; value?: any }
const IMPLICIT: Return = { kind: 'implicit' };

/** Thrown AS2 value (`throw` / `ActionThrow`). */
export class Avm1Thrown {
  constructor(public value: any) {}
}

// ------------------------------------------------------------- coercions

function numberValue(v: any): number {
  if (v === undefined) return NaN;
  if (v === null) return 0;
  switch (typeof v) {
    case 'number': return v;
    case 'boolean': return v ? 1 : 0;
    case 'string': return stringToNumber(v);
    default: {
      const prim = primitiveOf(v, true);
      return prim === undefined ? NaN : numberValue(prim);
    }
  }
}

function stringToNumber(s: string): number {
  const t = s.trim();
  if (t === '') return 0;
  if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(t)) return (t[0] === '-' ? -1 : 1) * parseInt(t.replace(/^[-+]/, ''), 16);
  const n = Number(t);
  return Number.isNaN(n) ? NaN : n;
}

function primitiveOf(v: any, numberHint: boolean): any {
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return v;
  const order = numberHint ? ['valueOf', 'toString'] : ['toString', 'valueOf'];
  for (const m of order) {
    const f = v[m];
    if (typeof f === 'function') {
      try {
        const r = f.call(v);
        if (r === null || (typeof r !== 'object' && typeof r !== 'function')) return r;
      } catch { /* ignore */ }
    }
  }
  return undefined;
}

function stringValue(v: any): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string': return v;
    case 'number': return numberToString(v);
    case 'boolean': return v ? 'true' : 'false';
    case 'object': {
      const prim = primitiveOf(v, false);
      if (prim !== undefined && (prim === null || typeof prim !== 'object')) return stringValue(prim);
      return '[type Object]';
    }
    case 'function': return '[type Function]';
    default: return String(v);
  }
}

function numberToString(n: number): string {
  if (Number.isNaN(n)) return 'NaN';
  if (n === Infinity) return 'Infinity';
  if (n === -Infinity) return '-Infinity';
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
  return String(n);
}

function boolValue(v: any): boolean {
  if (v === undefined || v === null) return false;
  switch (typeof v) {
    case 'boolean': return v;
    case 'number': return !Number.isNaN(v) && v !== 0;
    case 'string': return v.length > 0; // SWF ≥ 7: any non-empty string is true
    default: return true;
  }
}

const toInt32 = (v: any) => { const n = numberValue(v); return Number.isFinite(n) ? n | 0 : 0; };
const toUint32 = (v: any) => { const n = numberValue(v); return Number.isFinite(n) ? n >>> 0 : 0; };
const toUint16 = (v: any) => toUint32(v) & 0xffff;

function abstractEquals(a: any, b: any): boolean {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  if (typeof a === 'boolean') return abstractEquals(a ? 1 : 0, b);
  if (typeof b === 'boolean') return abstractEquals(a, b ? 1 : 0);
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'number' && typeof b === 'string') return a === numberValue(b);
  if (typeof a === 'string' && typeof b === 'number') return numberValue(a) === b;
  if (typeof a === 'number' && typeof b === 'number') return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (typeof a === 'object' && typeof b === 'object') return a === b;
  if (typeof a === 'object' || typeof a === 'function') return abstractEquals(primitiveOf(a, true), b);
  if (typeof b === 'object' || typeof b === 'function') return abstractEquals(a, primitiveOf(b, true));
  return false;
}

/** ECMA-262 abstract relational comparison; `undefined` when a result is NaN. */
function lessThan(a: any, b: any): any {
  const pa = primitiveOf(a, true);
  if (pa !== null && typeof pa === 'object') return false;
  const pb = primitiveOf(b, true);
  if (pb !== null && typeof pb === 'object') return false;
  if (typeof pa === 'string' && typeof pb === 'string') return pa < pb;
  const x = numberValue(pa), y = numberValue(pb);
  if (Number.isNaN(x) || Number.isNaN(y)) return undefined;
  return x < y;
}

function typeOf(v: any): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  switch (typeof v) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'string': return 'string';
    case 'function': return 'function';
    default: return v && v.__avm1clip ? 'movieclip' : 'object';
  }
}

// -------------------------------------------------------------------- super

/** `super` inside an AS2 method, i.e. Ruffle's `SuperObject`: members resolve one
 *  prototype above the object that owns the running method, `super.method()` calls
 *  with `this` unchanged, and `super(...)`/`super()` runs the superclass ctor on the
 *  same instance. The value is callable (a function object) because `super()` is
 *  compiled to CallMethod with an undefined name, which calls the object itself. */
interface SuperInfo { thisVal: any; owner: any }
const SUPER = Symbol('avm1.super');
let pendingOwner: any;

function makeSuperValue(thisVal: any, owner: any): any {
  const fn: any = function superValue() { return undefined; };
  fn[SUPER] = { thisVal, owner } as SuperInfo;
  return fn;
}

function makeSuper(thisVal: any, owner: any): any {
  return thisVal === null || thisVal === undefined ? undefined : makeSuperValue(thisVal, owner);
}

function superInfo(v: any): SuperInfo | undefined {
  return typeof v === 'function' ? (v as any)[SUPER] : undefined;
}

function protoOf(v: any): any {
  if (v === null || v === undefined) return null;
  try { return Object.getPrototypeOf(Object(v)); } catch { return null; }
}

/** `obj[name]` plus the object the member was found on (the AS2 "home object"). */
function findMember(start: any, name: string): { owner: any; value: any } | undefined {
  for (let o = start; o !== null && o !== undefined; o = protoOf(o)) {
    try { if (name in Object(o)) return { owner: o, value: (o as any)[name] }; } catch { /* ignore */ }
  }
  return undefined;
}

/** Where `super.x` starts looking: the prototype above the method's home object. */
function superBase(info: SuperInfo): any {
  return protoOf(info.owner ?? info.thisVal);
}

function superFind(info: SuperInfo, name: string): { owner: any; value: any } | undefined {
  return findMember(superBase(info), name);
}

/** `new Ctor(...)` / `super(...)`: AS2 constructors run on the object that was already
 *  created, with the class prototype as their home object. */
function runConstructor(constr: any, thisVal: any, args: any[]): any {
  if (typeof constr !== 'function') return undefined;
  const home = constr.prototype && (typeof constr.prototype === 'object' || typeof constr.prototype === 'function')
    ? constr.prototype : undefined;
  if (constr.avm1) return callDef(constr.avm1, thisVal, args, true, home);
  try { return constr.apply(thisVal, args); } catch (e) { warn(`super: constructor threw: ${(e as Error)?.message ?? e}`); return undefined; }
}

function callSuperConstructor(info: SuperInfo, args: any[]): any {
  const found = findMember(info.owner ?? protoOf(info.thisVal), '__constructor__');
  if (!found) return undefined;
  return runConstructor(found.value, info.thisVal, args);
}

// ------------------------------------------------------------------ scopes

function hasProp(obj: any, name: string): boolean {
  if (obj === null || obj === undefined) return false;
  const info = superInfo(obj);
  if (info) return superFind(info, name) !== undefined;
  try { return name in Object(obj); } catch { return false; }
}

function hasOwn(obj: any, name: string): boolean {
  if (obj === null || obj === undefined) return false;
  try { return Object.prototype.hasOwnProperty.call(Object(obj), name); } catch { return false; }
}

function getProp(obj: any, name: string): any {
  if (obj === null || obj === undefined) return undefined;
  const info = superInfo(obj);
  if (info) return superFind(info, name)?.value;
  try { return obj[name]; } catch { return undefined; }
}

function setProp(obj: any, name: string, value: any): void {
  if (obj === null || obj === undefined) return;
  // `super.x = v` writes to the instance, not to the superclass prototype.
  const info = superInfo(obj);
  if (info) { setProp(info.thisVal, name, value); return; }
  try { obj[name] = value; } catch { /* frozen / read-only */ }
}

function deleteProp(obj: any, name: string): boolean {
  if (obj === null || obj === undefined) return true;
  const info = superInfo(obj);
  if (info) return deleteProp(info.thisVal, name);
  try { return delete obj[name]; } catch { return false; }
}

/** Scope chain lookup (Ruffle `Scope::resolve`). */
function resolveName(frame: Frame, name: string): { obj: any; value: any } {
  if (name === 'this') return { obj: null, value: frame.thisVal };
  for (let s: Scope | null = frame.scope; s; s = s.parent) {
    if (hasProp(s.obj, name)) return { obj: s.obj, value: getProp(s.obj, name) };
  }
  return { obj: null, value: pathProperty(frame, name) };
}

function pathProperty(frame: Frame, name: string): any {
  const clip = targetClipOrRoot(frame);
  if (name === '_root') return clip?._root;
  if (name === '_parent') return clip?._parent;
  if (name === '_global') return env.global;
  const lvl = /^_level(\d+)$/.exec(name);
  if (lvl) return env.level?.(Number(lvl[1]));
  return undefined;
}

/** Scope chain assignment (Ruffle `Scope::set`). */
function assignName(frame: Frame, name: string, value: any): void {
  if (name === 'this') { frame.thisVal = value; return; }
  for (let s: Scope | null = frame.scope; s; s = s.parent) {
    if (s.cls === S_TARGET || hasProp(s.obj, name) || !s.parent) { setProp(s.obj, name, value); return; }
  }
}

/** `var x` / ActionDefineLocal (Ruffle `Scope::define_local`). */
function defineLocalName(frame: Frame, name: string, value: any): void {
  let s = frame.scope;
  if (s.cls === S_WITH && hasOwn(s.obj, name)) { setProp(s.obj, name, value); return; }
  while (s.cls === S_WITH && s.parent) s = s.parent;
  setProp(s.obj, name, value);
}

function rootOf(clip: any): any {
  return clip?._root ?? clip;
}

function targetClipOrRoot(frame: Frame): any {
  return frame.target ?? rootOf(frame.baseClip);
}

function resolvePathFrom(start: any, path: string): any {
  let cur = start;
  let p = String(path ?? '').trim();
  if (!p) return cur;
  if (p.startsWith('/')) { cur = rootOf(start); p = p.slice(1); }
  for (const seg of p.split(/[./]/)) {
    if (!cur) return undefined;
    if (seg === '' || seg === 'this') continue;
    if (seg === '..' || seg === '_parent') cur = cur._parent;
    else if (seg === '_root') cur = rootOf(cur);
    else if (/^_level\d+$/.test(seg)) cur = env.level?.(Number(seg.slice(6)));
    else cur = getProp(cur, seg);
  }
  return cur;
}

/** Resolve the object part of a variable path through the scope chain. */
function resolvePathThroughScopes(frame: Frame, path: string): any {
  for (let s: Scope | null = frame.scope; s; s = s.parent) {
    if (!s.obj) continue;
    const obj = resolvePathFrom(s.obj, path);
    if (obj !== undefined && obj !== null) return obj;
  }
  return undefined;
}

function lastSeparator(path: string): number {
  return Math.max(path.lastIndexOf(':'), path.lastIndexOf('.'));
}

function getVariable(frame: Frame, path: string): { obj: any; value: any } {
  const sep = lastSeparator(path);
  if (sep > 0) {
    const target = resolvePathThroughScopes(frame, path.slice(0, sep));
    if (target !== undefined && target !== null) {
      const name = path.slice(sep + 1);
      return hasProp(target, name) ? { obj: target, value: getProp(target, name) } : { obj: null, value: undefined };
    }
    return { obj: null, value: undefined };
  }
  if (path.includes('/')) {
    const obj = resolvePathThroughScopes(frame, path);
    if (obj !== undefined && obj !== null) return { obj: null, value: obj };
  }
  return resolveName(frame, path);
}

function setVariable(frame: Frame, path: string, value: any): void {
  if (path === 'this') { frame.thisVal = value; return; }
  const sep = lastSeparator(path);
  if (sep > 0) {
    const target = resolvePathThroughScopes(frame, path.slice(0, sep));
    if (target !== undefined && target !== null) setProp(target, path.slice(sep + 1), value);
    return;
  }
  assignName(frame, path, value);
}

// -------------------------------------------------------------- functions

function makeArguments(args: any[], callee: any): any[] {
  const out: any[] = args.slice();
  (out as any).callee = callee;
  (out as any).caller = null;
  return out;
}

function callDef(def: Avm1Def, thisArg: any, args: any[], construct = false, owner?: any): any {
  const localScope: Scope = { cls: S_LOCAL, obj: {}, parent: def.scope };
  const suppressed = (def.flags & F_SUPPRESS_THIS) !== 0;
  const frame: Frame = {
    thisVal: suppressed && !(def.flags & F_PRELOAD_THIS) ? def.baseClip : thisArg,
    baseClip: def.baseClip,
    target: def.baseClip,
    scope: localScope,
    registers: new Array(def.registerCount).fill(undefined),
    stack: [],
    constants: def.constants,
    code: def.code,
  };
  let reg = 1;
  if (def.flags & F_PRELOAD_THIS) frame.registers[reg++] = suppressed ? undefined : thisArg;
  if (def.flags & F_PRELOAD_ARGUMENTS) frame.registers[reg++] = makeArguments(args, def.fn ?? null);
  else if (!(def.flags & F_SUPPRESS_ARGUMENTS) && !construct) setProp(localScope.obj, 'arguments', makeArguments(args, def.fn ?? null));
  if (def.flags & F_PRELOAD_SUPER) {
    frame.registers[reg++] = (def.flags & F_SUPPRESS_SUPER) ? undefined : makeSuper(frame.thisVal, owner);
  } else if (!(def.flags & F_SUPPRESS_SUPER)) {
    const sup = makeSuper(frame.thisVal, owner);
    if (sup !== undefined) setProp(localScope.obj, 'super', sup);
  }
  if (def.flags & F_PRELOAD_ROOT) frame.registers[reg++] = rootOf(def.baseClip);
  if (def.flags & F_PRELOAD_PARENT) { const p = def.baseClip?._parent; if (p) frame.registers[reg++] = p; }
  if (def.flags & F_PRELOAD_GLOBAL) frame.registers[reg++] = env.global;
  for (let i = 0; i < def.params.length; i++) {
    const param = def.params[i];
    const value = i < args.length ? args[i] : undefined;
    if (param.register > 0 && param.register < frame.registers.length) frame.registers[param.register] = value;
    else setProp(localScope.obj, param.name, value);
  }
  return exec(frame, frame.code, frame.scope).value;
}

/** Wraps an AVM1 function definition in a real JS function so both worlds can call it. */
function makeFunction(def: Avm1Def): any {
  const fn: any = function (this: any, ...args: any[]) {
    if (new.target) {
      const obj = Object.create(fn.prototype ?? Object.prototype);
      const r = callDef(def, obj, args, true, fn.prototype);
      return r !== null && (typeof r === 'object' || typeof r === 'function') ? r : obj;
    }
    const self = this === undefined || this === null ? def.baseClip : this;
    return callDef(def, self, args, false, pendingOwner);
  };
  fn.avm1 = def;
  def.fn = fn;
  fn.toString = () => '[type Function]';
  fn.valueOf = () => fn;
  return fn;
}

function constructValue(constr: any, args: any[]): any {
  if (typeof constr !== 'function') {
    warn(`new: ${stringValue(constr)} is not a constructor`);
    return undefined;
  }
  if (constr.avm1) {
    const def: Avm1Def = constr.avm1;
    const obj = Object.create(constr.prototype ?? Object.prototype);
    const r = callDef(def, obj, args, true, constr.prototype);
    return r !== null && (typeof r === 'object' || typeof r === 'function') ? r : obj;
  }
  try {
    return new constr(...args);
  } catch (e) {
    warn(`new: constructor threw: ${(e as Error)?.message ?? e}`);
    return undefined;
  }
}

function callFunctionValue(fn: any, thisArg: any, args: any[], owner?: any): any {
  if (typeof fn !== 'function') return undefined;
  // `super(...)`: call the superclass constructor on the current instance.
  const info = superInfo(fn);
  if (info) return callSuperConstructor(info, args);
  const prev = pendingOwner;
  pendingOwner = owner;
  try {
    return fn.apply(thisArg, args);
  } catch (e) {
    if (e instanceof Avm1Thrown) throw e;
    warn(`call failed: ${(e as Error)?.message ?? e}`);
    return undefined;
  } finally {
    pendingOwner = prev;
  }
}

/** Flash aborts a script after ~15 s of CPU; the interpreter stops after this many
 *  action steps so a runaway loop (e.g. `while (charCodeAt(i) > 32)` on an empty
 *  string, which loops forever because NaN > 32 is false) cannot freeze the page. */
export const DEFAULT_SCRIPT_BUDGET = 1_000_000;
/** Budget for a code block that already hit the limit once: it is almost certainly a
 *  loop the game can never finish offline, so fail it fast instead of every frame. */
const REPEAT_SCRIPT_BUDGET = 5_000;
const timedOutCode = new WeakSet<Uint8Array>();
let scriptBudget = DEFAULT_SCRIPT_BUDGET;

/** obj[name](…args); AS2 ignores calls of non-function values. */
function callMethodValue(obj: any, name: string, args: any[]): any {
  if (obj === undefined || obj === null) return undefined;
  const info = superInfo(obj);
  if (info) {
    // `super.name(...)`: the method comes from the superclass prototype but runs
    // with the original `this` and its home object for further `super` lookups.
    const found = superFind(info, name);
    return found ? callFunctionValue(found.value, info.thisVal, args, found.owner) : undefined;
  }
  const value = getProp(obj, name);
  // Only methods that preload `super` need their home object resolved.
  if (typeof value === 'function' && value.avm1 && (value.avm1.flags & F_PRELOAD_SUPER)) {
    const found = findMember(obj, name);
    return callFunctionValue(value, obj, args, found ? found.owner : obj);
  }
  return callFunctionValue(value, obj, args, obj);
}

function globalFn(name: string, ...args: any[]): any {
  const fn = env.global[name];
  return typeof fn === 'function' ? fn(...args) : undefined;
}

// ------------------------------------------------------------ bytecode IO

function u16(b: Uint8Array, at: number): number {
  return (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
}

function s16(b: Uint8Array, at: number): number {
  const v = u16(b, at);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function readString(b: Uint8Array, at: number): { text: string; next: number } {
  let end = at;
  while (end < b.length && b[end] !== 0) end++;
  return { text: decodeString(b.subarray(at, end)), next: end + 1 };
}

function decodeString(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    let s = '';
    for (const c of bytes) s += String.fromCharCode(c);
    return s;
  }
}

// -------------------------------------------------------------- main loop

/** Execute an AVM1 action stream with `this` = `from`. */
export function runActions(from: any, code: Uint8Array): any {
  const prevBudget = scriptBudget;
  scriptBudget = env.budget && env.budget > 0 ? env.budget
    : timedOutCode.has(code) ? REPEAT_SCRIPT_BUDGET
    : DEFAULT_SCRIPT_BUDGET;
  try {
    return runActionsInner(from, code);
  } finally {
    scriptBudget = prevBudget;
  }
}

function runActionsInner(from: any, code: Uint8Array): any {
  installFrameGlobals(env.global);
  const frame: Frame = {
    thisVal: from,
    baseClip: from,
    target: from,
    scope: { cls: S_TARGET, obj: from, parent: { cls: S_GLOBAL, obj: env.global, parent: null } },
    registers: [],
    stack: [],
    constants: [],
    code,
  };
  return exec(frame, code, frame.scope).value;
}

/** Runs a decoded action stream (base64) on `from` — the `$rt.actions` entry point. */
export function runActionsBase64(from: any, base64: string): any {
  return runActions(from, base64ToBytes(base64));
}

function exec(frame: Frame, code: Uint8Array, scope: Scope): Return {
  const prevCode = frame.code;
  const prevScope = frame.scope;
  const prevFrame = activeFrame;
  frame.code = code;
  frame.scope = scope;
  activeFrame = frame;
  try {
    return loop(frame, code);
  } finally {
    frame.code = prevCode;
    frame.scope = prevScope;
    activeFrame = prevFrame;
  }
}

/** AS2 global functions that act on the timeline that is calling them. */
function installFrameGlobals(g: Record<string, any>): void {
  const call = (fn: (frame: Frame, ...args: any[]) => any) => (...args: any[]) => {
    const frame = activeFrame;
    return frame ? fn(frame, ...args) : undefined;
  };
  const put = (name: string, fn: (frame: Frame, ...args: any[]) => any) => { if (!(name in g)) g[name] = call(fn); };
  put('eval', (f, src) => resolveName(f, stringValue(src)).value);
  put('set', (f, name, value) => { assignName(f, stringValue(name), value); return value; });
  put('getProperty', (f, target, prop) => getTargetProperty(f, target, prop));
  put('setProperty', (f, target, prop, value) => setTargetProperty(f, target, prop, value));
  put('duplicateMovieClip', (f, target, name, depth) => {
    const clip = typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(f), target) : target;
    if (!clip) return undefined;
    if (env.duplicateMovieClip) return env.duplicateMovieClip(f.baseClip, clip, stringValue(name), numberValue(depth));
    return callMethodValue(clip, 'duplicateMovieClip', [stringValue(name), numberValue(depth)]);
  });
  put('removeMovieClip', (f, target) => {
    const clip = typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(f), target) : target;
    if (!clip) return undefined;
    if (env.removeMovieClip) return env.removeMovieClip(f.baseClip, clip);
    return callMethodValue(clip, 'removeMovieClip', []);
  });
  put('startDrag', (f, target, lock, ...rest) => {
    const clip = typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(f), target) : target;
    if (clip && env.startDrag) env.startDrag(f.baseClip, clip, boolValue(lock), ...(rest.length ? rest : [undefined, undefined, undefined, undefined]));
  });
  put('stopDrag', () => env.stopDrag?.());
  put('loadMovie', (f, url, target, method) => {
    if (env.loadMovie) env.loadMovie(f.baseClip, stringValue(url), typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(f), target) : target, method);
  });
  put('loadVariables', (f, url, target, method) => {
    if (env.loadVariables) env.loadVariables(f.baseClip, stringValue(url), typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(f), target) : target, method);
  });
  put('unloadMovie', (f, target) => {
    const clip = typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(f), target) : target;
    if (clip) callMethodValue(clip, 'unloadMovie', []);
  });
  put('call', (f, frame) => env.callFrame?.(targetClipOrRoot(f), frame));
  put('stopAllSounds', () => env.stopAllSounds?.());
  put('updateAfterEvent', () => env.updateAfterEvent?.());
  put('getURL', (_f, url, win, method) => env.getURL?.(stringValue(url), win && stringValue(win), method && stringValue(method)));
  put('targetPath', (_f, mc) => (mc ? (mc._target ?? String(mc)) : undefined));
}

function loop(frame: Frame, code: Uint8Array): Return {
  const stack = frame.stack;
  const push = (v: any) => stack.push(v);
  const pop = () => (stack.length ? stack.pop() : undefined);
  let pc = 0;

  const skipActions = (count: number) => {
    let n = 0;
    while (n < count && pc < code.length) {
      const op = code[pc++];
      if (op === 0) { pc--; break; }
      if (op >= 0x80) { pc += 2 + u16(code, pc); }
      n++;
    }
  };

  while (pc < code.length) {
    const start = pc;
    if (--scriptBudget <= 0) {
      timedOutCode.add(code);
      const msg = `script ran too long and was stopped at pc ${pc} (Flash Player's script timeout)`;
      warn(msg);
      if (typeof console !== 'undefined') console.warn(`[avm1] ${msg}`);
      return IMPLICIT;
    }
    const op = code[pc++];
    let len = 0;
    if (op >= 0x80) { len = u16(code, pc); pc += 2; }
    const payloadStart = pc;
    const payload = code.subarray(payloadStart, payloadStart + len);
    /** skip the record by default */
    const advance = () => { pc = payloadStart + len; };
    /** jump by a signed byte offset relative to the end of the record */
    const jump = (delta: number) => { pc = payloadStart + len + delta; };

    switch (op) {
      case 0x00: return IMPLICIT;
      case 0x04: callMethodValue(frame.target, 'nextFrame', []); advance(); break;
      case 0x05: callMethodValue(frame.target, 'prevFrame', []); advance(); break;
      case 0x06: callMethodValue(frame.target, 'play', []); advance(); break;
      case 0x07: callMethodValue(frame.target, 'stop', []); advance(); break;
      case 0x08: advance(); break; // ToggleQuality (no-op)
      case 0x09: if (env.stopAllSounds) env.stopAllSounds(); else globalFn('stopAllSounds'); advance(); break;

      case 0x0a: { const a = pop(), b = pop(); push(numberValue(b) + numberValue(a)); advance(); break; }
      case 0x0b: { const a = pop(), b = pop(); push(numberValue(b) - numberValue(a)); advance(); break; }
      case 0x0c: { const a = pop(), b = pop(); push(numberValue(b) * numberValue(a)); advance(); break; }
      case 0x0d: { const a = pop(), b = pop(); push(numberValue(b) / numberValue(a)); advance(); break; }
      case 0x0e: { const a = pop(), b = pop(); push(numberValue(b) === numberValue(a)); advance(); break; }
      case 0x0f: { const a = pop(), b = pop(); push(numberValue(b) < numberValue(a)); advance(); break; }
      case 0x10: { const a = pop(), b = pop(); push(boolValue(b) && boolValue(a)); advance(); break; }
      case 0x11: { const a = pop(), b = pop(); push(boolValue(b) || boolValue(a)); advance(); break; }
      case 0x12: push(!boolValue(pop())); advance(); break;
      case 0x13: { const a = pop(), b = pop(); push(stringValue(b) === stringValue(a)); advance(); break; }
      case 0x14: push(stringValue(pop()).length); advance(); break;
      case 0x15: { // StringExtract(str, start(1-based), length)
        const n = toInt32(pop()), i = toInt32(pop()), s = stringValue(pop());
        push(s.substr(i >= 1 ? i - 1 : 0, n < 0 ? 0 : n)); advance(); break;
      }
      case 0x17: pop(); advance(); break;
      case 0x18: push(toInt32(pop())); advance(); break;

      case 0x1c: push(getVariable(frame, stringValue(pop())).value); advance(); break;
      case 0x1d: { const value = pop(); setVariable(frame, stringValue(pop()), value); advance(); break; }

      case 0x20: { // SetTarget2 (dynamic tellTarget)
        const t = pop();
        if (t === undefined || t === null) frame.target = frame.baseClip;
        else setTarget(frame, stringValue(t));
        advance(); break;
      }
      case 0x21: { const a = pop(), b = pop(); push(stringValue(b) + stringValue(a)); advance(); break; }
      case 0x22: { // GetProperty(target, property)
        const prop = pop(); push(getTargetProperty(frame, pop(), prop)); advance(); break;
      }
      case 0x23: { // SetProperty(target, property, value)
        const value = pop(), prop = pop(); setTargetProperty(frame, pop(), prop, value); advance(); break;
      }
      case 0x24: { // CloneSprite(source, name, depth)
        const depth = toInt32(pop()), name = stringValue(pop()), source = pop();
        const clip = typeof source === 'string' ? resolvePathFrom(targetClipOrRoot(frame), source) : source;
        if (clip) {
          if (env.duplicateMovieClip) env.duplicateMovieClip(frame.baseClip, clip, name, depth);
          else callMethodValue(clip, 'duplicateMovieClip', [name, depth]);
        }
        advance(); break;
      }
      case 0x25: { // RemoveSprite(target)
        const target = pop();
        const clip = typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(frame), target) : target;
        if (clip) {
          if (env.removeMovieClip) env.removeMovieClip(frame.baseClip, clip);
          else callMethodValue(clip, 'removeMovieClip', []);
        }
        advance(); break;
      }
      case 0x26: { const v = pop(); (env.global.trace ?? (() => void 0))(stringValue(v)); advance(); break; }
      case 0x27: { // StartDrag(target, lock, left, top, right, bottom)
        const target = pop();
        const clip = typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(frame), target) : target;
        const lock = pop(), constrain = pop();
        const args = constrain ? [pop(), pop(), pop(), pop()].reverse() : undefined;
        if (clip) {
          if (env.startDrag) env.startDrag(frame.baseClip, clip, boolValue(lock), ...(args ?? [undefined, undefined, undefined, undefined]).map(numberValue) as [number, number, number, number]);
          else callMethodValue(clip, 'startDrag', [boolValue(lock), ...(args ?? [])]);
        }
        advance(); break;
      }
      case 0x28: if (env.stopDrag) env.stopDrag(); else globalFn('stopDrag'); advance(); break;
      case 0x29: { const a = pop(), b = pop(); push(stringValue(b) < stringValue(a)); advance(); break; }
      case 0x2a: throw new Avm1Thrown(pop());
      case 0x2b: { // CastOp(object, constructor)
        const obj = pop(); const constr = pop();
        push(obj !== null && obj !== undefined && isInstance(obj, constr) ? obj : null); advance(); break;
      }

      case 0x2c: { // ImplementsOp (AS2 `implements`) — records interfaces, no runtime effect
        pop(); // constructor
        const n = toInt32(pop());
        for (let i = 0; i < n; i++) pop();
        advance(); break;
      }
      case 0x30: { const n = toInt32(pop()); push(n > 0 ? Math.floor(Math.random() * n) : 0); advance(); break; }
      case 0x31: push(stringValue(pop()).length); advance(); break;
      case 0x32: push(stringValue(pop()).charCodeAt(0) || 0); advance(); break;
      case 0x33: { const c = toUint16(pop()); push(c ? String.fromCharCode(c) : ''); advance(); break; }
      case 0x34: push(Number(globalFn('getTimer')) || 0); advance(); break;
      case 0x35: { const n = toInt32(pop()), i = toInt32(pop()), s = stringValue(pop()); push(s.substr(i >= 1 ? i - 1 : 0, n < 0 ? 0 : n)); advance(); break; }
      case 0x36: push(stringValue(pop()).charCodeAt(0) || 0); advance(); break;
      case 0x37: { const c = toUint16(pop()); push(c ? String.fromCharCode(c) : ''); advance(); break; }

      case 0x3a: { const name = stringValue(pop()); const obj = pop(); push(obj === null || obj === undefined ? true : deleteProp(obj, name)); advance(); break; }
      case 0x3b: {
        const path = stringValue(pop());
        const sep = lastSeparator(path);
        push(sep > 0 ? deleteProp(resolvePathThroughScopes(frame, path.slice(0, sep)), path.slice(sep + 1)) : deleteProp(frame.scope.obj, path));
        advance(); break;
      }
      case 0x3c: { const value = pop(); defineLocalName(frame, stringValue(pop()), value); advance(); break; }
      case 0x3d: { // CallFunction: args…, argCount, name
        const name = stringValue(pop());
        const args = popArgs(stack, toInt32(pop()));
        const found = getVariable(frame, name);
        push(callFunctionValue(found.value, found.obj ?? targetClipOrRoot(frame), args));
        advance(); break;
      }
      case 0x3e: return { kind: 'return', value: pop() };
      case 0x3f: { const a = pop(), b = pop(); push(numberValue(b) % numberValue(a)); advance(); break; }
      case 0x40: { // NewObject: args…, argCount, name
        const name = stringValue(pop());
        const args = popArgs(stack, toInt32(pop()));
        push(constructValue(resolveName(frame, name).value, args));
        advance(); break;
      }
      case 0x41: { const name = stringValue(pop()); if (!hasProp(frame.scope.obj, name)) defineLocalName(frame, name, undefined); advance(); break; }
      case 0x42: { // InitArray
        const n = toInt32(pop());
        if (n < 0) { push(undefined); break; }
        const arr: any[] = [];
        for (let i = 0; i < n; i++) arr.push(pop());
        push(arr); advance(); break;
      }
      case 0x43: { // InitObject
        const n = toInt32(pop());
        if (n < 0) { push(undefined); break; }
        const obj: Record<string, any> = {};
        for (let i = 0; i < n; i++) { const v = pop(); obj[stringValue(pop())] = v; }
        push(obj); advance(); break;
      }
      case 0x44: push(typeOf(pop())); advance(); break;
      case 0x45: { const v = pop(); push(v && v.__avm1clip ? (v._target ?? String(v)) : undefined); advance(); break; }
      case 0x46: { // Enumerate(name)
        const value = getVariable(frame, stringValue(pop())).value;
        push(undefined);
        const keys = enumerateKeys(value);
        for (let i = keys.length - 1; i >= 0; i--) push(keys[i]);
        advance(); break;
      }
      case 0x47: { // Add2 (ECMAScript +)
        const a = primitiveOf(pop(), false), b = primitiveOf(pop(), false);
        push(typeof a === 'string' || typeof b === 'string' ? stringValue(b) + stringValue(a) : numberValue(b) + numberValue(a));
        advance(); break;
      }
      case 0x48: { const a = pop(), b = pop(); push(lessThan(b, a)); advance(); break; }
      case 0x49: { const a = pop(), b = pop(); push(abstractEquals(b, a)); advance(); break; }
      case 0x4a: push(numberValue(pop())); advance(); break;
      case 0x4b: push(stringValue(pop())); advance(); break;
      case 0x4c: { const v = pop(); push(v); push(v); advance(); break; }
      case 0x4d: { const a = pop(), b = pop(); push(a); push(b); advance(); break; }
      case 0x4e: { const name = stringValue(pop()); push(getProp(coerceObject(pop()), name)); advance(); break; }
      case 0x4f: { const value = pop(), name = stringValue(pop()); setProp(coerceObject(pop()), name, value); advance(); break; }
      case 0x50: push(numberValue(pop()) + 1); advance(); break;
      case 0x51: push(numberValue(pop()) - 1); advance(); break;
      case 0x52: { // CallMethod: args…, argCount, obj, name
        const nameVal = pop(), obj = pop();
        const args = popArgs(stack, toInt32(pop()));
        // An undefined or empty name calls the object itself — this is how `super()`
        // (and Flash's anonymous method calls) reach the superclass constructor.
        if (nameVal === undefined) push(callFunctionValue(obj, undefined, args));
        else {
          const name = stringValue(nameVal);
          push(name === '' ? callFunctionValue(obj, undefined, args) : callMethodValue(obj, name, args));
        }
        advance(); break;
      }
      case 0x53: { // NewMethod: args…, argCount, obj, name
        const name = stringValue(pop()), obj = pop();
        const args = popArgs(stack, toInt32(pop()));
        push(constructValue(name === '' ? obj : getProp(obj, name), args));
        advance(); break;
      }
      case 0x54: { const constr = pop(), obj = pop(); push(isInstance(obj, constr)); advance(); break; }
      case 0x55: { const v = pop(); push(undefined); const keys = enumerateKeys(v); for (let i = keys.length - 1; i >= 0; i--) push(keys[i]); advance(); break; }

      case 0x60: { const a = toInt32(pop()), b = toInt32(pop()); push(b & a); advance(); break; }
      case 0x61: { const a = toInt32(pop()), b = toInt32(pop()); push(b | a); advance(); break; }
      case 0x62: { const a = toInt32(pop()), b = toInt32(pop()); push(b ^ a); advance(); break; }
      case 0x63: { const a = toUint32(pop()) & 31, b = toInt32(pop()); push(b << a); advance(); break; }
      case 0x64: { const a = toUint32(pop()) & 31, b = toInt32(pop()); push(b >> a); advance(); break; }
      case 0x65: { const a = toUint32(pop()) & 31, b = toUint32(pop()); push(b >>> a); advance(); break; }
      case 0x66: { const a = pop(), b = pop(); push(b === a); advance(); break; }
      case 0x67: { const a = pop(), b = pop(); push(lessThan(a, b) ?? false); advance(); break; }
      case 0x68: { const a = pop(), b = pop(); push(stringValue(b) > stringValue(a)); advance(); break; }
      case 0x69: { // Extends(subclass, superclass)
        const superclass = coerceObject(pop()), subclass = coerceObject(pop());
        if (subclass && superclass) {
          const proto = Object.create(superclass.prototype ?? Object.prototype);
          proto.constructor = superclass;
          proto.__constructor__ = superclass;
          try { subclass.prototype = proto; } catch { /* ignore */ }
        }
        advance(); break;
      }

      case 0x81: callMethodValue(frame.target, 'gotoAndStop', [u16(payload, 0) + 1]); advance(); break;
      case 0x83: { // GetURL(url, target)
        const url = readString(payload, 0);
        const target = readString(payload, url.next);
        if (env.getURL) env.getURL(url.text, target.text);
        else globalFn('getURL', url.text, target.text);
        advance(); break;
      }
      case 0x87: { const r = payload[0] ?? 0; frame.registers[r] = stack.length ? stack[stack.length - 1] : undefined; advance(); break; }
      case 0x88: { // ConstantPool
        let at = 0;
        const count = u16(payload, at); at += 2;
        const pool: string[] = [];
        for (let i = 0; i < count && at < payload.length; i++) { const s = readString(payload, at); pool.push(s.text); at = s.next; }
        frame.constants = pool;
        advance(); break;
      }
      case 0x8a: { // WaitForFrame(frame, skipActions)
        const frameNum = u16(payload, 0);
        const loaded = !frame.target || frameNum > 16000 ||
          (frame.target._framesloaded ?? 1) >= Math.min(frameNum, frame.target._totalframes ?? frameNum);
        if (!loaded) skipActions(payload[2] ?? 0);
        advance(); break;
      }
      case 0x8b: setTarget(frame, readString(payload, 0).text); advance(); break;
      case 0x8c: callMethodValue(frame.target, 'gotoAndStop', [readString(payload, 0).text]); advance(); break;
      case 0x8d: { // WaitForFrame2(skipActions)
        const v = pop();
        const n = typeof v === 'number' ? v : numberValue(stringValue(v));
        const loaded = !frame.target || !Number.isFinite(n) || n > 16000 ||
          (frame.target._framesloaded ?? 1) + 1 >= Math.min(n + 1, frame.target._totalframes ?? n + 1);
        if (!loaded) skipActions(payload[0] ?? 0);
        advance(); break;
      }
      case 0x8e: { // DefineFunction2
        const { def, codeLength } = parseDefineFunction2(frame, payload, code.subarray(payloadStart + len));
        const fn = makeFunction(def);
        if (def.name) setVariable(frame, def.name, fn);
        else push(fn);
        pc = payloadStart + len + codeLength;
        break;
      }
      case 0x8f: { // Try
        const flags = payload[0] ?? 0;
        const trySize = u16(payload, 1), catchSize = u16(payload, 3), finallySize = u16(payload, 5);
        let at = 7;
        let catchRegister = -1;
        let catchName = '';
        if (flags & 4) catchRegister = payload[at++] ?? 0;
        else if (flags & 1) { const s = readString(payload, at); catchName = s.text; at = s.next; }
        const bodyStart = payloadStart + len;
        const end = bodyStart + trySize + catchSize + finallySize;
        const tryCode = code.subarray(bodyStart, bodyStart + trySize);
        const catchCode = code.subarray(bodyStart + trySize, bodyStart + trySize + catchSize);
        const finallyCode = code.subarray(bodyStart + trySize + catchSize, end);
        const stackSize = stack.length;
        const runFinally = (): Return | null => {
          if (!finallySize) return null;
          const r = exec(frame, finallyCode, frame.scope);
          return r.kind === 'return' ? r : null;
        };
        let caught: Avm1Thrown | null = null;
        let finished: Return | null = null;
        try {
          const r = exec(frame, tryCode, frame.scope);
          if (r.kind === 'return') finished = r;
        } catch (e) {
          if (e instanceof Avm1Thrown && (flags & 1)) caught = e;
          else {
            const f = runFinally();
            if (f) return f;
            throw e;
          }
        }
        if (caught) {
          stack.length = stackSize;
          if (catchRegister >= 0) frame.registers[catchRegister] = caught.value;
          else setVariable(frame, catchName, caught.value);
          const r = exec(frame, catchCode, frame.scope);
          if (r.kind === 'return') finished = r;
        }
        const f = runFinally();
        if (f) return f;
        if (finished) return finished;
        pc = end;
        break;
      }
      case 0x94: { // With
        const obj = pop();
        const size = u16(payload, 0);
        const bodyCode = code.subarray(payloadStart + 2, payloadStart + 2 + size);
        if (obj !== undefined && obj !== null) {
          const withScope: Scope = { cls: S_WITH, obj: coerceObject(obj), parent: frame.scope };
          const r = exec(frame, bodyCode, withScope);
          if (r.kind === 'return') return r;
        }
        pc = payloadStart + 2 + size;
        break;
      }
      case 0x96: { // Push
        let at = 0;
        while (at < payload.length) {
          const t = payload[at++];
          switch (t) {
            case 0: { const s = readString(payload, at); push(s.text); at = s.next; break; }
            case 1: { const dv = new DataView(payload.buffer, payload.byteOffset + at, 4); push(dv.getFloat32(0, true)); at += 4; break; }
            case 2: push(null); break;
            case 3: push(undefined); break;
            case 4: push(frame.registers[payload[at++] ?? 0]); break;
            case 5: push(payload[at++] !== 0); break;
            case 6: {
              // f64 stored as two LE 32-bit words, high word first
              const dv = new DataView(payload.buffer, payload.byteOffset + at, 8);
              const hi = dv.getUint32(0, true), lo = dv.getUint32(4, true);
              const buf = new ArrayBuffer(8); const out = new DataView(buf);
              out.setUint32(0, lo, true); out.setUint32(4, hi, true);
              push(out.getFloat64(0, true)); at += 8; break;
            }
            case 7: { const dv = new DataView(payload.buffer, payload.byteOffset + at, 4); push(dv.getInt32(0, true)); at += 4; break; }
            case 8: push(frame.constants[payload[at++] ?? 0]); break;
            case 9: { const i = u16(payload, at); at += 2; push(frame.constants[i]); break; }
            default: warn(`ActionPush: unknown value type ${t}`, 0x96); break;
          }
        }
        advance(); break;
      }
      case 0x99: jump(s16(payload, 0)); break; // Jump
      case 0x9a: { // GetURL2
        const flags = payload[0] ?? 0;
        const target = pop(), url = stringValue(pop());
        const method = (flags & 3) === 1 ? 'GET' : (flags & 3) === 2 ? 'POST' : undefined;
        const clip = typeof target === 'string' ? resolvePathFrom(targetClipOrRoot(frame), target) : target;
        if (flags & 8) {
          if (env.loadVariables) env.loadVariables(frame.baseClip, url, clip, method);
          else callMethodValue(clip, 'loadVariables', method ? [url, method] : [url]);
        } else if (flags & 4) {
          if (env.loadMovie) env.loadMovie(frame.baseClip, url, clip, method);
          else callMethodValue(clip, 'loadMovie', method ? [url, method] : [url]);
        } else if (env.getURL) env.getURL(url, target === undefined ? '_self' : stringValue(target), method);
        else globalFn('getURL', url, target === undefined ? '_self' : stringValue(target), method);
        advance(); break;
      }
      case 0x9b: { // DefineFunction (AS1)
        const name = readString(payload, 0);
        let at = name.next;
        const count = u16(payload, at); at += 2;
        const params: { name: string; register: number }[] = [];
        for (let i = 0; i < count; i++) { const s = readString(payload, at); params.push({ name: s.text, register: 0 }); at = s.next; }
        const codeLength = u16(payload, at);
        const def: Avm1Def = {
          kind: 'avm1', name: name.text, code: code.subarray(payloadStart + len, payloadStart + len + codeLength),
          params, registerCount: 4, flags: 0, scope: frame.scope, baseClip: frame.baseClip,
          constants: frame.constants.slice(),
        };
        const fn = makeFunction(def);
        if (def.name) setVariable(frame, def.name, fn);
        else push(fn);
        pc = payloadStart + len + codeLength;
        break;
      }
      case 0x9d: { // If
        const delta = s16(payload, 0);
        if (boolValue(pop())) jump(delta); else advance();
        break;
      }
      case 0x9e: { // Call(frame) — runs another frame's script without moving the playhead
        const v = pop();
        if (typeof v === 'number') env.callFrame?.(frame.target ?? frame.baseClip, v);
        else {
          const s = stringValue(v);
          const sep = s.lastIndexOf(':');
          const clip = sep > 0 ? resolvePathFrom(targetClipOrRoot(frame), s.slice(0, sep)) : frame.target;
          env.callFrame?.(clip ?? frame.baseClip, sep > 0 ? s.slice(sep + 1) : s);
        }
        advance(); break;
      }
      case 0x9f: { // GotoFrame2
        const flags = payload[0] ?? 0;
        const target = pop();
        callMethodValue(frame.target ?? frame.baseClip, (flags & 1) ? 'gotoAndPlay' : 'gotoAndStop', [target]);
        advance(); break;
      }
      default:
        warn(`unhandled AVM1 opcode 0x${op.toString(16)}`, op);
        advance();
        break;
    }
    if (pc === start) break; // defensive: a jump that makes no progress
    void warnCount;
  }
  return IMPLICIT;
}

function parseDefineFunction2(frame: Frame, payload: Uint8Array, body: Uint8Array): { def: Avm1Def; codeLength: number } {
  const name = readString(payload, 0);
  let at = name.next;
  const count = u16(payload, at); at += 2;
  const registerCount = payload[at++] ?? 0;
  const flags = u16(payload, at); at += 2;
  const params: { name: string; register: number }[] = [];
  for (let i = 0; i < count; i++) {
    const register = payload[at++] ?? 0;
    const s = readString(payload, at);
    params.push({ name: s.text, register });
    at = s.next;
  }
  const codeLength = u16(payload, at);
  const code = body.slice(0, codeLength);
  return {
    def: {
      kind: 'avm1', name: name.text, code, params, registerCount, flags,
      scope: frame.scope, baseClip: frame.baseClip, constants: frame.constants.slice(),
    },
    codeLength,
  };
}

/** Pops a call's arguments. AVM1 compilers push them right-to-left (last argument
 *  first), so popping them in order yields the argument list — see Ruffle's
 *  pop_call_args / action_call_method. */
function popArgs(stack: any[], n: number): any[] {
  const args: any[] = [];
  for (let i = 0; i < n; i++) args.push(stack.pop());
  return args;
}

function coerceObject(v: any): any {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object' || typeof v === 'function') return v;
  const ObjectCtor = env.global.Object;
  if (typeof ObjectCtor === 'function') { try { return ObjectCtor(v); } catch { /* fall through */ } }
  return Object(v);
}

function isInstance(obj: any, constr: any): boolean {
  if (typeof constr !== 'function' || obj === null || obj === undefined) return false;
  try { return obj instanceof constr; } catch { return false; }
}

function enumerateKeys(value: any): string[] {
  if (value === null || value === undefined) return [];
  const info = superInfo(value);
  if (info) { const s = superBase(info); return s === null || s === undefined ? [] : enumerateKeys(s); }
  const out: string[] = [];
  for (const k in Object(value)) out.push(k);
  return out;
}

function setTarget(frame: Frame, path: string): void {
  const base = frame.baseClip;
  const target = path === '' ? base : resolvePathFrom(base, path) ?? resolvePathFrom(rootOf(base), path);
  if (target === undefined || target === null) {
    warn(`tellTarget("${path}") failed: target not found`);
    frame.target = null;
  } else {
    frame.target = target;
  }
  // tellTarget replaces the innermost Target scope, keeping Local/With scopes
  const clipObj = targetClipOrRoot(frame);
  const chain: Scope[] = [];
  for (let cur: Scope | null = frame.scope; cur; cur = cur.parent) {
    chain.push(cur);
    if (cur.cls === S_TARGET) break;
  }
  const tail = chain.length ? chain[chain.length - 1].parent : null;
  let rebuilt: Scope = { cls: S_TARGET, obj: clipObj, parent: tail };
  for (let i = chain.length - 2; i >= 0; i--) rebuilt = { cls: chain[i].cls, obj: chain[i].obj, parent: rebuilt };
  frame.scope = rebuilt;
}

function propertyTarget(frame: Frame, target: any): any {
  if (typeof target === 'string') return resolvePathFrom(targetClipOrRoot(frame), target) ?? resolvePathThroughScopes(frame, target);
  return target;
}

const NUMERIC_PROPERTIES = [
  '_x', '_y', '_xscale', '_yscale', '_currentframe', '_totalframes', '_alpha', '_visible', '_width', '_height',
  '_rotation', '_target', '_framesloaded', '_name', '_droptarget', '_url', '_highquality', '_focusrect',
  '_soundbuftime', '_quality', '_xmouse', '_ymouse',
];

function getTargetProperty(frame: Frame, target: any, prop: any): any {
  const name = typeof prop === 'number' ? NUMERIC_PROPERTIES[Math.trunc(prop)] : stringValue(prop);
  return name === undefined ? undefined : getProp(propertyTarget(frame, target), name);
}

function setTargetProperty(frame: Frame, target: any, prop: any, value: any): void {
  const name = typeof prop === 'number' ? NUMERIC_PROPERTIES[Math.trunc(prop)] : stringValue(prop);
  if (name !== undefined) setProp(propertyTarget(frame, target), name, value);
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const host = globalThis as { atob?: (s: string) => string; Buffer?: any };
  let bin: string;
  if (typeof host.atob === 'function') bin = host.atob(clean);
  else bin = host.Buffer.from(clean, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const host = globalThis as { btoa?: (s: string) => string; Buffer?: any };
  if (typeof host.btoa === 'function') return host.btoa(bin);
  return host.Buffer.from(bin, 'binary').toString('base64');
}
