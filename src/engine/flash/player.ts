// FlashPlayer: runs an AS3 program (transpiled to TypeScript) against the
// parsed SWF: the display list, timelines, frame lifecycle, input, timers,
// sound and rendering.
//
// Frame order (per SWF frame), following the AVM2 player:
//   1. advance the playhead of every playing MovieClip on stage (removing and
//      constructing timeline children; each new frame's script is queued)
//   2. Event.ENTER_FRAME is broadcast to every listener, on stage or not
//   3. Event.FRAME_CONSTRUCTED is broadcast
//   4. queued frame scripts run (addFrameScript)
//   5. Event.EXIT_FRAME is broadcast
// and the canvas is repainted on the next animation frame. Timers
// (flash.utils.Timer / setTimeout / setInterval) run on player time before
// the frame. Input events are dispatched as they arrive; frame scripts
// queued by input handlers (gotoAndPlay on a click, new children…) run
// right after the handler.

import type { LoadedAsset } from '../../lib/assets';
import type { Frame, Rect, SwfDocument, Timeline } from '../../types';
import { runtime, ScriptAbort, type PlayerContext } from './context';
import {
  constructPlaced, DisplayObject, DisplayObjectContainer, InteractiveObject, MovieClip, SimpleButton,
  Sprite, Stage, transformRect, type DisplayHost, type SymbolRef,
} from './display';
import { Event, EventDispatcher, IOErrorEvent, KeyboardEvent, MouseEvent } from './events';
import { Point, Rectangle } from './geom';
import type { AudioBackend, AudioHandle, SoundChannel } from './media';
import { TextField } from './text';

const TWIPS = 20;

/** What the player needs from the asset cache (AssetCache satisfies it). */
export interface AssetSource {
  get(id: number, kind: string, bounds?: Rect): LoadedAsset;
  preview(id: number, kind: string): { url: string } | undefined;
}

/** What the player needs from the linked program (see loader.ts). */
export interface ProgramLike {
  /** Resolve an AS3 class name (qualified or simple) to a constructor. */
  getDefinition(name: string): unknown;
}

export type LogLevel = 'trace' | 'error' | 'warn' | 'info';
export type LogSource = 'app' | 'engine' | 'forge' | 'network';
export type LogKind = 'log' | 'problem' | 'request' | 'response';
export type NetworkTransport = 'http' | 'xmlsocket' | 'url-loader' | 'external-swf' | 'navigation';

/** Structured request/response metadata shared by the engine and offline mocks. */
export interface NetworkEvent {
  kind: 'request' | 'response';
  transport: NetworkTransport;
  direction: 'outgoing' | 'incoming';
  requestId?: string;
  method?: string;
  url?: string;
  status?: string | number;
  payload?: string;
  message?: string;
}
export type NetworkObserver = (event: NetworkEvent) => void;

export type LogMetadata = Partial<Omit<LogEntry, 'level' | 'message' | 'time'>>;
export interface LogEntry {
  level: LogLevel;
  message: string;
  detail?: string;
  time: number;
  /** Origin used by the Problems view; normal logs remain useful without it. */
  source?: LogSource;
  kind?: LogKind;
  context?: string;
  /** Present for Req/Res records. */
  transport?: NetworkTransport;
  direction?: 'outgoing' | 'incoming';
  requestId?: string;
  method?: string;
  url?: string;
  status?: string | number;
  payload?: string;
}

export interface PlayerOptions {
  doc: SwfDocument;
  assets?: AssetSource | null;
  /** The linked game code, or a factory that links it while this player is active. */
  program?: ProgramLike | ((player: FlashPlayer) => ProgramLike) | null;
  /** Override for the document class (defaults to SymbolClass id 0). */
  documentClass?: string | null;
  audio?: AudioBackend | null;
  onLog?: (entry: LogEntry) => void;
}

interface Scheduled { id: number; due: number; interval: number; repeat: boolean; fn: () => void }
type Ctor = abstract new (...args: never[]) => unknown;

export class FlashPlayer implements PlayerContext, DisplayHost {
  readonly doc: SwfDocument;
  readonly stage: Stage;
  root: DisplayObject | null = null;
  frameId = 0;
  time = 0;
  readonly mouse = { x: 0, y: 0, down: false };
  readonly audio: AudioBackend | null;
  readonly activeChannels = new Set<SoundChannel>();
  /** Human-readable linkage report for the UI. */
  readonly linkage: { id: number; className: string; linked: boolean }[] = [];
  documentClassName: string | null = null;
  cursor = 'default';

  private readonly assets: AssetSource | null;
  private program: ProgramLike | null = null;
  private readonly onLog: (entry: LogEntry) => void;
  private readonly symbolClass = new Map<number, Ctor>();
  private readonly classSymbol = new Map<Function, SymbolRef>();
  private readonly frameListeners = new Map<string, Set<EventDispatcher>>();
  private scriptQueue: MovieClip[] = [];
  private scheduled: Scheduled[] = [];
  private nextTimerId = 1;
  private accumulator = 0;
  private started = false;
  private disposed = false;
  private hover: InteractiveObject | null = null;
  private pressed: InteractiveObject | null = null;
  private drag: { target: Sprite; dx: number; dy: number; bounds: Rectangle | null } | null = null;
  private frameSounds = new Map<number, AudioHandle>();
  private errorCount = 0;
  private networkRequestSequence = 0;

  constructor(opts: PlayerOptions) {
    this.doc = opts.doc;
    this.assets = opts.assets ?? null;
    this.audio = opts.audio ?? null;
    this.onLog = opts.onLog ?? (() => {});
    const s = this.doc.header.stage;
    const previous = runtime.player;
    runtime.player = this as unknown as typeof runtime.player; // Stage construction reads host()
    try {
      this.stage = new Stage(
        Math.max(1, (s.xMax - s.xMin) / TWIPS) || 550,
        Math.max(1, (s.yMax - s.yMin) / TWIPS) || 400,
        this.doc.header.frameRate || 24,
      );
    } finally {
      runtime.player = previous;
    }
    this.stage.color = this.doc.header.backgroundColor ?? 0xffffff;
    const program = opts.program;
    this.program = typeof program === 'function' ? this.activate(() => program(this)) : program ?? null;
    this.linkClasses(opts.documentClass ?? null);
  }

  get frameRate() { return this.stage.frameRate; }
  get isStarted() { return this.started; }

  // ---------------------------------------------------------- linkage --

  private linkClasses(documentOverride: string | null) {
    const table = new Map(this.doc.symbolClasses ?? []);
    for (const ch of this.doc.characters.values()) if (ch.className && !table.has(ch.id)) table.set(ch.id, ch.className);
    if (documentOverride) table.set(0, documentOverride);
    for (const [id, className] of [...table].sort((a, b) => a[0] - b[0])) {
      const def = this.program?.getDefinition(className);
      const linked = typeof def === 'function';
      this.linkage.push({ id, className, linked });
      if (id === 0) this.documentClassName = className;
      if (!linked) continue;
      const ctor = def as Ctor;
      if (id === 0) { this.classSymbol.set(ctor, 'root'); continue; }
      this.symbolClass.set(id, ctor);
      if (!this.classSymbol.has(ctor)) this.classSymbol.set(ctor, id);
    }
  }

  classForSymbol(id: number) { return this.symbolClass.get(id); }
  symbolForClass(ctor: Function): SymbolRef | undefined {
    // Only the exact linked class carries the symbol: a subclass of a linked
    // class shares it (as in Flash), a base engine class never does.
    for (let c: Function | null = ctor; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
      const s = this.classSymbol.get(c);
      if (s !== undefined) return s;
      if (c === MovieClip || c === Sprite || c === DisplayObject) return undefined;
    }
    return undefined;
  }
  timelineFor(symbol: SymbolRef): Timeline | undefined {
    if (symbol === 'root') return this.doc.root;
    const ch = this.doc.characters.get(symbol);
    return (ch?.timelineId ? this.doc.timelines.get(ch.timelineId) : undefined)
      ?? this.doc.timelines.get(`sprite:${symbol}`) ?? this.doc.timelines.get(`button:${symbol}`);
  }
  getDefinition(name: string): unknown {
    return this.program?.getDefinition(name) ?? undefined;
  }

  // ------------------------------------------------------------ start --

  /** Construct the document class (or a plain root MovieClip) and run frame 1. */
  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    this.activate(() => {
      const docName = this.documentClassName;
      let Root: new () => DisplayObject = MovieClip;
      if (docName) {
        const def = this.program?.getDefinition(docName);
        if (typeof def === 'function' && def.prototype instanceof DisplayObject) Root = def as new () => DisplayObject;
        else if (typeof def === 'function') this.log('error', `Document class ${docName} does not extend a flash.display class; using a plain MovieClip root.`, undefined, { source: 'forge', kind: 'problem', context: `document class ${docName}` });
        else this.log('warn', `Document class ${docName} was not found in the loaded code; running the timeline without it.`, undefined, { source: 'forge', kind: 'problem', context: `document class ${docName}` });
      }
      this.root = constructPlaced(Root, { symbol: 'root', parent: this.stage, depth: 16384, name: 'root1' });
      if (!this.root) this.log('error', 'The document class constructor failed; nothing to run.', undefined, { source: 'app', kind: 'problem', context: `document class ${docName ?? '(timeline root)'}` });
      this.flushScripts();
    });
  }

  /** Advance player time by `ms` (called from requestAnimationFrame). Runs due timers and frames. */
  tick(ms: number) {
    if (!this.started || this.disposed) return;
    const dt = Math.max(0, Math.min(ms, 250));
    this.activate(() => {
      const frameMs = 1000 / this.stage.frameRate;
      this.accumulator += dt;
      let frames = 0;
      while (this.accumulator >= frameMs && frames < 4) {
        this.accumulator -= frameMs;
        this.advanceTime(frameMs);
        this.runFrame();
        frames++;
      }
      if (frames === 4) this.accumulator = 0; // fell behind: drop time rather than spiral
    });
  }

  /** Run exactly one frame (Step while paused). */
  step() {
    if (!this.started || this.disposed) return;
    this.activate(() => { this.advanceTime(1000 / this.stage.frameRate); this.runFrame(); });
  }

  private advanceTime(ms: number) {
    const end = this.time + ms;
    for (let guard = 0; guard < 1000; guard++) {
      const next = this.scheduled.reduce<Scheduled | null>((m, s) => (!m || s.due < m.due ? s : m), null);
      if (!next || next.due > end) break;
      this.time = Math.max(this.time, next.due);
      if (next.repeat) next.due += Math.max(next.interval, 1);
      else this.scheduled = this.scheduled.filter((s) => s !== next);
      this.guard(next.fn, 'timer');
      this.flushScripts();
    }
    this.time = end;
  }

  private runFrame() {
    this.frameId++;
    // 1. advance timelines (parents before children; children created during
    //    this frame start on their frame 1 and are not advanced again)
    for (const clip of this.collectClips()) {
      if (clip._createdFrame < this.frameId && clip.stage) this.guard(() => clip._advance(), `timeline of ${clip.name}`);
    }
    this.broadcast(Event.ENTER_FRAME);
    this.broadcast(Event.FRAME_CONSTRUCTED);
    this.flushScripts();
    this.broadcast(Event.EXIT_FRAME);
  }

  private collectClips(): MovieClip[] {
    const out: MovieClip[] = [];
    const visit = (o: DisplayObject) => {
      if (o instanceof MovieClip) out.push(o);
      if (o instanceof DisplayObjectContainer) for (const c of o._children) visit(c);
      else if (o instanceof SimpleButton) { const s = o._current(); if (s) visit(s); }
    };
    visit(this.stage);
    return out;
  }

  private broadcast(type: string) {
    const set = this.frameListeners.get(type);
    if (!set?.size) return;
    for (const target of [...set]) if (set.has(target)) target.dispatchEvent(new Event(type));
  }

  queueFrameScript(clip: MovieClip) { this.scriptQueue.push(clip); }

  /** Run queued frame scripts (scripts may queue more: new children, gotos). */
  flushScripts() {
    for (let round = 0; round < 64 && this.scriptQueue.length; round++) {
      const queue = this.scriptQueue;
      this.scriptQueue = [];
      for (const clip of queue) clip._runFrameScript();
    }
  }

  frameEntered(clip: MovieClip, frame: Frame) {
    if (!frame || !this.audio) return;
    for (const ev of frame.events) {
      if (ev.kind !== 'sound' || ev.characterId == null) continue;
      if (/syncStop\s*[:=]?\s*true|\bstop\b/i.test(ev.detail)) { this.frameSounds.get(ev.characterId)?.stop(); continue; }
      const url = this.assets?.preview(ev.characterId, 'sound')?.url ?? null;
      const handle = this.audio.play(ev.characterId, url, 0, 0, 1);
      if (handle) this.frameSounds.set(ev.characterId, handle);
    }
    void clip;
  }

  soundLength(id: number) {
    const ch = this.doc.characters.get(id);
    const samples = Number(ch?.attrs.soundSampleCount ?? 0);
    const raw = String(ch?.attrs.soundRate ?? '3');
    const rate = /^\d$/.test(raw) ? [5512.5, 11025, 22050, 44100][Number(raw)] ?? 44100 : (parseFloat(raw) || 44) * 1000;
    return samples ? (samples / rate) * 1000 : 0;
  }

  failLoad(target: EventDispatcher, url: string, method = 'GET', payload?: string) {
    const requestId = `url-${++this.networkRequestSequence}`;
    const message = `URLLoader ${method} ${url}`;
    this.log('info', message, undefined, {
      source: 'network', kind: 'request', transport: 'url-loader', direction: 'outgoing', requestId, method, url, payload,
    });
    this.schedule(0, () => {
      const error = `Error #2032: Stream Error. URL: ${url}`;
      this.log('warn', error, undefined, {
        source: 'network', kind: 'response', transport: 'url-loader', direction: 'incoming', requestId, method, url,
        status: 'blocked offline', payload: error,
      });
      target.dispatchEvent(new IOErrorEvent(IOErrorEvent.IO_ERROR, false, false, error));
    }, false);
  }

  // ----------------------------------------------------------- timers --

  schedule(delay: number, fn: () => void, repeat: boolean): number {
    const id = this.nextTimerId++;
    const interval = Math.max(0, delay);
    this.scheduled.push({ id, due: this.time + Math.max(interval, repeat ? 1 : 0), interval, repeat, fn });
    return id;
  }
  cancel(id: number) { this.scheduled = this.scheduled.filter((s) => s.id !== id); }

  // ----------------------------------------------------- PlayerContext --

  listenerAdded(target: EventDispatcher, type: string) {
    if (type !== Event.ENTER_FRAME && type !== Event.EXIT_FRAME && type !== Event.FRAME_CONSTRUCTED) return;
    let set = this.frameListeners.get(type);
    if (!set) this.frameListeners.set(type, (set = new Set()));
    set.add(target);
  }
  listenerRemoved(target: EventDispatcher, type: string) { this.frameListeners.get(type)?.delete(target); }

  trace(message: string) { this.log('trace', message, undefined, { source: 'app' }); }

  recordNetwork(event: NetworkEvent) {
    const isFailure = event.status === 'error' || event.status === 'blocked offline';
    const fallback = `${event.direction === 'outgoing' ? '→' : '←'} ${event.method ?? event.transport} ${event.url ?? ''}`.trim();
    this.log(isFailure ? 'warn' : 'info', event.message ?? fallback, event.payload, {
      source: 'network', kind: event.kind, transport: event.transport, direction: event.direction,
      requestId: event.requestId, method: event.method, url: event.url, status: event.status, payload: event.payload,
    });
  }

  reportError(error: unknown, where: string, source: LogSource = 'app') {
    if (error instanceof ScriptAbort) throw error;
    this.errorCount++;
    const e = error instanceof Error ? error : new Error(String(error));
    if (this.errorCount <= 200) {
      this.log('error', `${e.name}: ${e.message}  (in ${where})`, e.stack, { source, kind: 'problem', context: where });
    } else if (this.errorCount === 201) {
      this.log('error', 'Too many errors; further errors are not logged.', undefined, { source, kind: 'problem', context: where });
    }
  }

  private log(level: LogLevel, message: string, detail?: string, metadata: LogMetadata = {}) {
    const entry: LogEntry = {
      level,
      message,
      detail,
      time: this.time,
      source: metadata.source ?? (level === 'trace' ? 'app' : 'engine'),
      kind: metadata.kind ?? (level === 'error' || level === 'warn' ? 'problem' : 'log'),
      ...metadata,
    };
    try { this.onLog(entry); }
    catch (error) { console.error('[flash engine] log handler failed', error); }
  }
  private guard<T>(fn: () => T, where: string, source: LogSource = 'app') { return runtime.guard(fn, where, source); }

  /** Make this the active player while game code runs. */
  private activate<T>(fn: () => T): T {
    const previous = runtime.player;
    runtime.player = this as unknown as typeof runtime.player;
    try { return fn(); } finally { runtime.player = previous ?? (this.disposed ? null : (this as unknown as typeof runtime.player)); }
  }

  /** Leave this player registered so game-code callbacks (e.g. a Promise) still reach it. */
  attach() { if (!this.disposed) runtime.player = this as unknown as typeof runtime.player; }

  dispose() {
    this.disposed = true;
    this.scheduled = [];
    this.scriptQueue = [];
    this.frameListeners.clear();
    for (const c of [...this.activeChannels]) c.stop();
    for (const h of this.frameSounds.values()) h.stop();
    this.frameSounds.clear();
    if (runtime.player === (this as unknown)) runtime.player = null;
  }

  // ------------------------------------------------------------ input --

  keyDown(e: { keyCode: number; key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; location?: number }) {
    this.key(KeyboardEvent.KEY_DOWN, e);
  }
  keyUp(e: { keyCode: number; key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; location?: number }) {
    this.key(KeyboardEvent.KEY_UP, e);
  }
  private key(type: string, e: { keyCode: number; key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; location?: number }) {
    if (!this.started || this.disposed) return;
    this.activate(() => {
      const target = this.stage.focus && this.stage.focus.stage ? this.stage.focus : this.stage;
      const charCode = e.key.length === 1 ? e.key.charCodeAt(0) : e.key === 'Enter' ? 13 : e.key === 'Backspace' ? 8 : 0;
      target.dispatchEvent(new KeyboardEvent(type, true, false, charCode, e.keyCode, e.location ?? 0, !!e.ctrlKey, !!e.altKey, !!e.shiftKey));
      if (type === KeyboardEvent.KEY_DOWN && target instanceof TextField) target._input(e.key);
      this.flushScripts();
    });
  }

  pointerMove(x: number, y: number) {
    if (!this.started || this.disposed) return;
    this.mouse.x = x; this.mouse.y = y;
    this.activate(() => {
      if (this.drag) this.updateDrag();
      const target = this.hitTarget(x, y);
      this.updateHover(target);
      this.mouseEvent(target ?? this.stage, MouseEvent.MOUSE_MOVE);
      this.flushScripts();
    });
  }

  pointerDown(x: number, y: number) {
    if (!this.started || this.disposed) return;
    this.mouse.x = x; this.mouse.y = y; this.mouse.down = true;
    this.activate(() => {
      const target = this.hitTarget(x, y);
      this.updateHover(target);
      this.pressed = target;
      if (target instanceof SimpleButton && target.enabled) target._state = 'down';
      if (target instanceof TextField && target.type === 'input') this.stage.focus = target;
      this.mouseEvent(target ?? this.stage, MouseEvent.MOUSE_DOWN);
      this.flushScripts();
    });
  }

  pointerUp(x: number, y: number) {
    if (!this.started || this.disposed) return;
    this.mouse.x = x; this.mouse.y = y; this.mouse.down = false;
    this.activate(() => {
      const target = this.hitTarget(x, y);
      if (this.pressed instanceof SimpleButton) this.pressed._state = this.pressed === target ? 'over' : 'up';
      this.mouseEvent(target ?? this.stage, MouseEvent.MOUSE_UP);
      if (target && target === this.pressed) this.mouseEvent(target, MouseEvent.CLICK);
      else if (this.pressed && this.pressed !== target) this.mouseEvent(this.pressed, MouseEvent.RELEASE_OUTSIDE, false);
      this.pressed = null;
      this.flushScripts();
    });
  }

  pointerLeave() {
    if (!this.started || this.disposed) return;
    this.activate(() => { this.updateHover(null); this.stage.dispatchEvent(new Event(Event.MOUSE_LEAVE)); this.flushScripts(); });
  }

  private mouseEvent(target: InteractiveObject, type: string, bubbles = true, related: InteractiveObject | null = null) {
    const local = target.globalToLocal(new Point(this.mouse.x, this.mouse.y));
    const ev = new MouseEvent(type, bubbles, false, local.x, local.y, related, false, false, false, this.mouse.down);
    ev._stageX = this.mouse.x; ev._stageY = this.mouse.y;
    target.dispatchEvent(ev);
  }

  private updateHover(target: InteractiveObject | null) {
    const prev = this.hover;
    if (prev === target) return;
    this.hover = target;
    if (prev instanceof SimpleButton) prev._state = 'up';
    if (target instanceof SimpleButton && target.enabled) target._state = this.mouse.down && this.pressed === target ? 'down' : 'over';
    const chain = (o: DisplayObject | null) => { const a: DisplayObject[] = []; for (let n = o; n && !(n instanceof Stage); n = n._parent) a.push(n); return a; };
    const oldChain = chain(prev), newChain = chain(target);
    if (prev && prev.stage) this.mouseEvent(prev, MouseEvent.MOUSE_OUT, true, target);
    for (const o of oldChain) if (!newChain.includes(o) && o instanceof InteractiveObject && o.stage) this.mouseEvent(o, MouseEvent.ROLL_OUT, false, target);
    for (const o of [...newChain].reverse()) if (!oldChain.includes(o) && o instanceof InteractiveObject) this.mouseEvent(o, MouseEvent.ROLL_OVER, false, prev);
    if (target) this.mouseEvent(target, MouseEvent.MOUSE_OVER, true, prev);
    this.cursor = target && ((target instanceof SimpleButton && target.useHandCursor) || this.handCursorFor(target)) ? 'pointer' : 'default';
  }

  private handCursorFor(target: DisplayObject) {
    for (let n: DisplayObject | null = target; n; n = n._parent) if (n instanceof Sprite && n.buttonMode && n.useHandCursor) return true;
    return false;
  }

  /** Topmost interactive object under a stage point (bounding-box picking). */
  hitTarget(x: number, y: number): InteractiveObject | null {
    const found = this.pick(this.stage, x, y);
    return found === this.stage ? null : found;
  }

  private pick(node: DisplayObject, x: number, y: number): InteractiveObject | null {
    if (!node.visible || node._isMaskFor > 0 || node._clipDepth != null) return null;
    if (node instanceof SimpleButton) {
      if (!node.stage) return null;
      const m = node._concatenatedMatrix();
      return transformRect(m, node._hitBounds()).contains(x, y) && node.mouseEnabled ? node : null;
    }
    if (node instanceof DisplayObjectContainer) {
      if (node instanceof Sprite && node.hitArea) {
        return node.hitArea.hitTestPoint(x, y) && node.mouseEnabled ? node : null;
      }
      for (let i = node._children.length - 1; i >= 0; i--) {
        const hit = this.pick(node._children[i], x, y);
        if (!hit) continue;
        if (!node.mouseChildren && !(node instanceof Stage)) return node.mouseEnabled ? node : null;
        return hit;
      }
      if (node instanceof Sprite && !node.graphics._getBounds().isEmpty()) {
        const r = transformRect(node._concatenatedMatrix(), node.graphics._getBounds());
        if (r.contains(x, y)) return node.mouseEnabled ? node : null;
      }
      return node instanceof Stage ? node : null;
    }
    // Leaf (Shape, Bitmap, TextField…): the hit goes to the nearest interactive ancestor.
    if (!node.getBounds(null).contains(x, y)) return null;
    if (node instanceof InteractiveObject && node.mouseEnabled) return node;
    for (let p = node._parent; p; p = p._parent) if (p.mouseEnabled || p instanceof Stage) return p;
    return null;
  }

  startDrag(target: Sprite, lockCenter: boolean, bounds: Rectangle | null) {
    const parent = target.parent;
    const local = parent ? parent.globalToLocal(new Point(this.mouse.x, this.mouse.y)) : new Point(this.mouse.x, this.mouse.y);
    this.drag = { target, dx: lockCenter ? 0 : target.x - local.x, dy: lockCenter ? 0 : target.y - local.y, bounds };
  }
  stopDrag() { this.drag = null; }
  private updateDrag() {
    const d = this.drag!;
    const parent = d.target.parent;
    const local = parent ? parent.globalToLocal(new Point(this.mouse.x, this.mouse.y)) : new Point(this.mouse.x, this.mouse.y);
    let x = local.x + d.dx, y = local.y + d.dy;
    if (d.bounds) { x = Math.max(d.bounds.left, Math.min(d.bounds.right, x)); y = Math.max(d.bounds.top, Math.min(d.bounds.bottom, y)); }
    d.target.x = x; d.target.y = y;
  }

  // ----------------------------------------------------------- render --

  /** Paint the stage. `scale`/`offsetX`/`offsetY` map stage pixels to canvas pixels. */
  render(ctx: CanvasRenderingContext2D, scale: number, offsetX: number, offsetY: number) {
    const base = new DOMMatrixLike(scale, 0, 0, scale, offsetX, offsetY);
    ctx.save();
    ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
    ctx.fillStyle = `#${this.stage.color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, this.stage.stageWidth, this.stage.stageHeight);
    ctx.beginPath();
    ctx.rect(0, 0, this.stage.stageWidth, this.stage.stageHeight);
    ctx.clip();
    this.activate(() => this.drawChildren(ctx, this.stage, 1, base));
    ctx.restore();
  }

  /** BitmapData.draw(displayObject): render into another canvas at identity. */
  drawTo(ctx: CanvasRenderingContext2D, obj: DisplayObject) {
    this.activate(() => this.drawObject(ctx, obj, 1, new DOMMatrixLike(1, 0, 0, 1, 0, 0), true));
  }

  private drawChildren(ctx: CanvasRenderingContext2D, container: DisplayObjectContainer, alpha: number, base: DOMMatrixLike) {
    let maskUntil: number | null = null;
    for (const child of container._children) {
      if (maskUntil != null && child._depth > maskUntil) { ctx.restore(); maskUntil = null; }
      if (child._clipDepth != null) {
        if (maskUntil != null) ctx.restore();
        ctx.save();
        const r = transformRect(child._matrix(), child._localBounds());
        ctx.beginPath(); ctx.rect(r.x, r.y, r.width, r.height); ctx.clip();
        maskUntil = child._clipDepth;
        continue;
      }
      this.drawObject(ctx, child, alpha, base);
    }
    if (maskUntil != null) ctx.restore();
  }

  private drawObject(ctx: CanvasRenderingContext2D, obj: DisplayObject, parentAlpha: number, base: DOMMatrixLike, ignoreOwnTransform = false) {
    if (!obj.visible || obj._isMaskFor > 0) return;
    const ct = obj._colorRef();
    const alpha = parentAlpha * Math.max(0, Math.min(1, ct.alphaMultiplier + ct.alphaOffset / 255));
    if (alpha <= 0) return;
    ctx.save();
    if (obj.mask && obj.mask.stage) {
      // Rectangular mask: clip to the mask's stage bounds.
      const b = obj.mask.getBounds(null);
      const current = ctx.getTransform?.();
      ctx.setTransform(base.a, base.b, base.c, base.d, base.e, base.f);
      ctx.beginPath(); ctx.rect(b.x, b.y, b.width, b.height); ctx.clip();
      if (current) ctx.setTransform(current);
    }
    if (!ignoreOwnTransform) { const m = obj._matrix(); ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty); }
    if (obj.scrollRect) {
      const r = obj.scrollRect;
      ctx.beginPath(); ctx.rect(0, 0, r.width, r.height); ctx.clip();
      ctx.translate(-r.x, -r.y);
    }
    ctx.globalAlpha = alpha;
    this.guard(() => obj._drawSelf(ctx, this), `drawing ${obj.name}`, 'engine');
    if (obj instanceof DisplayObjectContainer) this.drawChildren(ctx, obj, alpha, base);
    else if (obj instanceof SimpleButton) { const s = obj._current(); if (s) this.drawObject(ctx, s, alpha, base); }
    ctx.restore();
  }

  /** Draw a SWF character (shape/bitmap/static text) in its own TWIPS space. */
  drawCharacter(ctx: CanvasRenderingContext2D, characterId: number) {
    const ch = this.doc.characters.get(characterId);
    if (!ch || !this.assets) return;
    const a = this.assets.get(ch.id, ch.kind, ch.bounds);
    if (a.status === 'ready' && a.img && a.dest) {
      try { ctx.drawImage(a.img, a.dest.x, a.dest.y, a.dest.w, a.dest.h); } catch { /* image not decodable */ }
      return;
    }
    if (a.status === 'ready' && a.text != null && ch.bounds) {
      // texts/*.txt has no glyph geometry: draw the string inside its bounds.
      const b = ch.bounds;
      const size = Math.max(6 * TWIPS, Math.min(24 * TWIPS, (b.yMax - b.yMin) * 0.75));
      ctx.fillStyle = '#000';
      ctx.font = `${size}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(a.text.replace(/\s+/g, ' ').trim(), b.xMin, b.yMin, Math.max(TWIPS, b.xMax - b.xMin));
    }
  }

  characterImage(characterId: number): CanvasImageSource | null {
    const ch = this.doc.characters.get(characterId);
    if (!ch || !this.assets) return null;
    const a = this.assets.get(ch.id, ch.kind, ch.bounds);
    return a.status === 'ready' && a.img ? a.img : null;
  }
}

/** Tiny DOMMatrix stand-in (jsdom has no DOMMatrix). */
class DOMMatrixLike {
  constructor(public a: number, public b: number, public c: number, public d: number, public e: number, public f: number) {}
}

/** Default audio backend: HTMLAudioElement per sound (guarded for non-browser environments). */
export class HtmlAudioBackend implements AudioBackend {
  constructor(private readonly assets: AssetSource | null) {}
  play(characterId: number | null, url: string | null, startMs: number, loops: number, volume: number): AudioHandle | null {
    const src = url ?? (characterId != null ? this.assets?.preview(characterId, 'sound')?.url : undefined);
    if (!src || typeof Audio === 'undefined') return null;
    const el = new Audio(src);
    el.volume = Math.max(0, Math.min(1, volume));
    let remaining = Math.max(0, loops);
    const handle: AudioHandle = {
      onended: null,
      get position() { return el.currentTime * 1000; },
      stop() { el.pause(); el.src = ''; },
      setVolume(v) { el.volume = Math.max(0, Math.min(1, v)); },
    };
    el.addEventListener('ended', () => {
      if (remaining-- > 0) { el.currentTime = 0; void el.play()?.catch?.(() => {}); }
      else handle.onended?.();
    });
    el.currentTime = startMs / 1000;
    try { void el.play()?.catch?.(() => {}); } catch { return null; }
    return handle;
  }
}
