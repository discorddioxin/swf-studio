// AS2 player: runs the TypeScript produced by as2ts (src/transpiler/as2)
// against a parsed SWF document.
//
// This is a Flash-7-style (AVM1) player. Its behaviour is modelled on how the
// Flash Player / Ruffle execute AVM1 content:
//
//  * one tick per frame (doc frame rate). Per tick, every clip (pre-order)
//    queues its enterFrame handlers and then advances its timeline, which
//    queues the new frame's scripts and applies the frame's display ops;
//    afterwards the action queue runs. Scripts queued while running (goto
//    targets, freshly placed clips) run in the same tick.
//  * gotoAndStop / gotoAndPlay diff the display list against the target
//    frame's snapshot; intermediate frame scripts are skipped.
//  * a clip is fully built (display state, name, init object, first-frame
//    children) *before* its AS2 class constructor body runs.
//  * reading/writing through undefined values never throws: the transpiler
//    emits optional chaining and `$rt.sink` for that.
//
// Rendering and hit-testing use the exported assets (shape SVGs, images …)
// through the same AssetSource the Stage preview uses.

import * as RT from '../../runtime/as2';
import type { AS2Handler, AS2Program } from '../../runtime/as2';
import type { ColorTransform, DisplayItem, Frame, Matrix, PlaceOp, Rect, SwfCharacter, SwfDocument, Timeline } from '../../types';
import type { AssetSource, LogEntry, LogLevel } from '../flash/player';
import type { AudioBackend, AudioHandle } from '../flash/media';
import {
  apply, compose, concat, concatCT, decompose, identity, inRect, invert, isColorIdentity, transformRect, unionRect,
  type Components,
} from './geom';
import { installBuiltins, type BuiltinState } from './builtins';
import {
  cssFont, estimateWidth, layout, paragraphsToHtml, paragraphsToText, parseHtml, plainToParagraphs,
  type Line, type Paragraph, type TextStyle,
} from './text';

export const TWIPS = 20;
/** AS depth = SWF depth − DEPTH_OFFSET (timeline objects have negative AS depths) */
export const DEPTH_OFFSET = 16384;
export const NODE = Symbol.for('swf-studio.as2.node');

/** A loaded SWF: document + its compiled program + its assets. */
export interface Movie {
  doc: SwfDocument;
  program: AS2Program | null;
  assets: AssetSource | null;
  url: string;
}

export type NodeKind = 'clip' | 'button' | 'text' | 'graphic';

export interface TextState {
  paras: Paragraph[];
  html: boolean;
  variable: string | null;
  format: TextStyle;
  wordWrap: boolean;
  multiline: boolean;
  border: boolean;
  borderColor: string;
  background: boolean;
  backgroundColor: string;
  selectable: boolean;
  input: boolean;
  password: boolean;
  maxChars: number | null;
  autoSize: string;
  bounds: Rect;
  scroll: number;
  lines: Line[] | null;
  listeners: any[];
  embedFonts: boolean;
  restrict: string | null;
  fontId?: number;
  /** last HTML source assigned (htmlText round-trips through our own serializer otherwise) */
  source?: string;
}

export type DrawCmd =
  | { op: 'fill'; color: string | null; alpha: number }
  | { op: 'line'; width: number; color: string | null; alpha: number }
  | { op: 'move' | 'lineTo'; x: number; y: number }
  | { op: 'curve'; cx: number; cy: number; x: number; y: number }
  | { op: 'end' };

let nodeSeq = 0;

export class DisplayNode {
  readonly id = ++nodeSeq;
  obj: any = null;
  parent: DisplayNode | null = null;
  children: DisplayNode[] = [];
  /** AS depth (SWF depth − 16384) */
  depth = 0;
  name = '';
  matrix: Matrix = identity();
  comps: Components | null = null;
  ct: ColorTransform | undefined;
  visible = true;
  clipDepth = 0;
  ratio = 0;
  timeline: Timeline | null = null;
  frame = 0;
  playing = true;
  /** placed by the parent's timeline (vs. created by script) */
  fromTimeline = false;
  /** parent frame index the timeline placed this instance on */
  startFrame = -1;
  /** a script changed the transform: timeline moves no longer apply */
  scriptMoved = false;
  removed = false;
  bornTick = 0;
  handlers: AS2Handler[] = [];
  btnState: 'up' | 'over' | 'down' = 'up';
  text: TextState | null = null;
  drawing: DrawCmd[] | null = null;
  mask: DisplayNode | null = null;
  maskedBy: DisplayNode | null = null;
  url = '';
  constructor(
    readonly kind: NodeKind,
    public movie: Movie,
    public characterId: number,
  ) {}
  get character(): SwfCharacter | undefined { return this.movie.doc.characters.get(this.characterId); }
  get totalFrames(): number { return this.timeline?.frameCount || this.timeline?.frames.length || 1; }
  get swfDepth(): number { return this.depth + DEPTH_OFFSET; }
  childAtDepth(depth: number): DisplayNode | undefined { return this.children.find((c) => c.depth === depth); }
  childByName(name: string): DisplayNode | undefined {
    const n = name.toLowerCase();
    return this.children.find((c) => c.name && c.name.toLowerCase() === n);
  }
  path(): string {
    if (!this.parent) return this.url && this.url !== 'root' ? `_level0` : '_level0';
    return `${this.parent.path()}.${this.name}`;
  }
  slashPath(): string {
    if (!this.parent) return '/';
    const p = this.parent.slashPath();
    return `${p === '/' ? '' : p}/${this.name}`;
  }
}

export const nodeOf = (o: unknown): DisplayNode | null =>
  o && (typeof o === 'object' || typeof o === 'function') ? ((o as any)[NODE] as DisplayNode | undefined) ?? null : null;

interface QueuedAction { node: DisplayNode; run: () => void; label: string; always?: boolean }
interface Timer { id: number; fn: () => void; ms: number; next: number }

export interface AS2PlayerOptions {
  doc: SwfDocument;
  program: AS2Program | null;
  assets?: AssetSource | null;
  audio?: AudioBackend | null;
  onLog?: (entry: LogEntry) => void;
  /** Resolve a CSS font-family list for an embedded font character id / font name. */
  fontFamily?: (fontIdOrName: number | string) => string;
  /** Load another SWF (loadMovie / MovieClipLoader). null = not available. */
  resolveExternal?: (url: string) => Promise<Movie | null> | Movie | null;
  /** What to do when an external SWF can't be resolved: pretend it loaded empty, or report an error to the game. */
  missingExternal?: 'empty' | 'error';
  /** Network access for LoadVars / XML. Return null for "failed". */
  fetchText?: (url: string, method: string, body: string | null) => Promise<string | null>;
  /** Called after each tick (for UIs). */
  onTick?: (player: AS2Player) => void;
  /** FlashVars / query parameters, set on _root before the first frame. */
  flashVars?: Record<string, string>;
  /** Scripts to run on _root right after the first frame (e.g. automation / guest login). */
  afterStart?: (root: any, player: AS2Player) => void;
}

export class AS2Player {
  readonly doc: SwfDocument;
  readonly movie: Movie;
  readonly root: DisplayNode;
  readonly audio: AudioBackend | null;
  readonly opts: AS2PlayerOptions;
  readonly logs: LogEntry[] = [];
  tickCount = 0;
  frameRate: number;
  width: number;
  height: number;
  background: string;
  mouse = { x: 0, y: 0, down: false };
  hovered: DisplayNode | null = null;
  pressed: DisplayNode | null = null;
  focus: DisplayNode | null = null;
  drag: { node: DisplayNode; dx: number; dy: number; lock: boolean; bounds: Rect | null } | null = null;
  keys = new Set<number>();
  lastKey = { code: 0, ascii: 0 };
  readonly builtins: BuiltinState;
  private queue: QueuedAction[] = [];
  private running = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private timers = new Map<number, Timer>();
  private timerSeq = 0;
  private startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private measureCtx: CanvasRenderingContext2D | null | undefined;
  private channels = new Set<{ id: number | null; handle: AudioHandle }>();
  private started = false;
  private disposed = false;
  private hitCanvas: HTMLCanvasElement | null = null;
  private listeners: (() => void)[] = [];
  errors = 0;
  cursorHidden = false;
  /** external SWFs the game asked for that could not be resolved */
  readonly missingExternals = new Set<string>();

  constructor(opts: AS2PlayerOptions) {
    this.opts = opts;
    this.doc = opts.doc;
    this.movie = { doc: opts.doc, program: opts.program, assets: opts.assets ?? null, url: 'root' };
    this.audio = opts.audio ?? null;
    const h = opts.doc.header;
    this.frameRate = h.frameRate > 0 ? h.frameRate : 24;
    const b = h.stage;
    this.width = b && b.xMax > b.xMin ? (b.xMax - b.xMin) / TWIPS : 550;
    this.height = b && b.yMax > b.yMin ? (b.yMax - b.yMin) / TWIPS : 400;
    this.background = h.backgroundColor != null ? `#${h.backgroundColor.toString(16).padStart(6, '0')}` : '#ffffff';

    RT.resetRuntime();
    RT.installHost(this.host());
    this.builtins = installBuiltins(this);
    // AS2 classes live on _global (e.g. _global.com.rawfishsoftware.sushi.SushiAPI)
    for (const [name, cls] of Object.entries(opts.program?.classes ?? {})) RT.$rt.registerClass(name, cls);

    // _level0
    this.root = new DisplayNode('clip', this.movie, 0);
    this.root.timeline = opts.doc.root;
    this.root.name = '_level0';
    this.root.url = 'root';
    RT.MovieClip.__construct = (o) => this.bind(o, this.root);
    new RT.MovieClip();
  }

  // ------------------------------------------------------------ logging
  log(level: LogLevel, message: string, detail?: string) {
    const entry: LogEntry = { level, message, detail, time: this.time() };
    this.logs.push(entry);
    if (this.logs.length > 2000) this.logs.splice(0, this.logs.length - 2000);
    if (level === 'error') this.errors++;
    this.opts.onLog?.(entry);
  }
  time() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) - this.startTime; }

  /** Run game code; errors are logged instead of stopping the player (like Flash). */
  guard(label: string, fn: () => void) {
    try { fn(); } catch (e) {
      const err = e as Error;
      this.log('error', `${label}: ${err?.message ?? String(e)}`, err?.stack?.split('\n').slice(0, 6).join('\n'));
    }
  }

  // ------------------------------------------------------------ lifecycle
  /** Initialise: DoInitAction scripts, flashvars, then root frame 1. */
  start() {
    if (this.started) return;
    this.started = true;
    const prog = this.movie.program;
    if (prog) {
      for (const [name, fn] of Object.entries(prog.initByName ?? {})) this.guard(`init action "${name}"`, () => fn.call(this.root.obj));
      for (const [id, mod] of Object.entries(prog.timelines)) {
        if (mod.init && Number(id) !== 0) this.guard(`init action of sprite ${id}`, () => mod.init!.call(this.root.obj));
      }
      prog.timelines[0]?.init && this.guard('init action of the main timeline', () => prog.timelines[0].init!.call(this.root.obj));
    }
    for (const [k, v] of Object.entries(this.opts.flashVars ?? {})) this.root.obj[k] = v;
    this.enterFirstFrame(this.root);
    this.runQueue();
    if (this.opts.afterStart) {
      this.guard('start script', () => this.opts.afterStart!(this.root.obj, this));
      this.runQueue();
    }
    this.syncTexts();
  }

  /** Attach to a canvas and start the frame loop. */
  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.start();
    this.render();
    this.play();
  }

  play() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.last = this.time();
    const loop = () => {
      if (!this.running) return;
      this.step(this.time());
      this.raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(loop) : (setTimeout(loop, 1000 / this.frameRate) as unknown as number);
    };
    this.raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(loop) : (setTimeout(loop, 16) as unknown as number);
  }

  pause() {
    this.running = false;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf); else clearTimeout(this.raf);
  }

  get isRunning() { return this.running; }
  isDisposedFor(_node: DisplayNode) { return this.disposed; }

  /** Advance by real time: timers + as many ticks as are due. */
  step(now: number) {
    const dt = Math.min(250, now - this.last);
    this.last = now;
    this.acc += dt;
    this.runTimers(now);
    const frameMs = 1000 / this.frameRate;
    let ticks = 0;
    while (this.acc >= frameMs && ticks < 4) { this.acc -= frameMs; this.tick(); ticks++; }
    if (this.acc > frameMs * 4) this.acc = 0;
    if (ticks) this.render();
  }

  dispose() {
    this.pause();
    this.disposed = true;
    this.stopAllSounds();
    this.timers.clear();
    for (const off of this.listeners) off();
    this.listeners = [];
    if (RT.currentHost() && (RT.currentHost() as any).__player === this) RT.installHost(null);
  }

  // ------------------------------------------------------------ the frame loop
  tick() {
    if (!this.started) this.start();
    this.tickCount++;
    const list: DisplayNode[] = [];
    const walk = (n: DisplayNode) => {
      if (n.kind === 'clip') list.push(n);
      for (const c of n.children) if (c.kind === 'clip') walk(c);
    };
    walk(this.root);
    for (const n of list) {
      if (n.removed) continue;
      this.queueClipEvent(n, 'enterFrame');
      if (n.bornTick !== this.tickCount) this.advance(n);
    }
    this.runQueue();
    this.syncTexts();
    this.opts.onTick?.(this);
  }

  private runTimers(now: number) {
    for (const t of [...this.timers.values()]) {
      if (!this.timers.has(t.id)) continue;
      if (now >= t.next) {
        t.next = now + Math.max(10, t.ms);
        this.guard('interval', t.fn);
        this.runQueue();
      }
    }
  }

  /** Queue an action; runs at the end of the current tick (or immediately if the queue is idle and `now`). */
  enqueue(node: DisplayNode, label: string, run: () => void, always = false) {
    this.queue.push({ node, run, label, always });
  }

  private draining = false;
  runQueue() {
    if (this.draining) return;
    this.draining = true;
    try {
      let guard = 0;
      while (this.queue.length) {
        const a = this.queue.shift()!;
        if (a.node.removed && !a.always) continue;
        this.guard(a.label, a.run);
        if (++guard > 200000) { this.log('error', 'action queue overflow – aborting this tick'); this.queue.length = 0; }
      }
    } finally { this.draining = false; }
  }

  // ------------------------------------------------------------ timelines
  private frameScript(node: DisplayNode, frameIndex: number) {
    const mod = node.movie.program?.timelines[node.characterId];
    return mod?.frames?.[frameIndex + 1];
  }

  private queueFrame(node: DisplayNode, frameIndex: number) {
    const fn = this.frameScript(node, frameIndex);
    if (fn) this.enqueue(node, `${this.describe(node)} frame ${frameIndex + 1}`, () => fn.call(node.obj));
    const frame = node.timeline?.frames[frameIndex];
    if (frame) this.frameSounds(frame);
  }

  private frameSounds(frame: Frame) {
    for (const e of frame.events) {
      if (e.kind !== 'sound' || e.characterId == null || !/^StartSound/.test(e.tagType)) continue;
      const stop = /\bstop\b/.test(e.detail);
      const loops = Number(/loop ×(\d+)/.exec(e.detail)?.[1] ?? 1);
      if (stop) this.stopSound(e.characterId);
      else if (!(/noMultiple/.test(e.detail) && [...this.channels].some((c) => c.id === e.characterId))) this.playSound(e.characterId, null, 0, loops, 1);
    }
  }

  /** First frame of a newly created clip: children + its frame-1 script. */
  enterFirstFrame(node: DisplayNode) {
    node.frame = 0;
    if (!node.timeline) return;
    this.queueFrame(node, 0);
    const f = node.timeline.frames[0];
    if (f) this.applyOps(node, f, 0);
  }

  advance(node: DisplayNode) {
    if (!node.playing || !node.timeline) return;
    const total = node.totalFrames;
    if (total <= 1) return;
    const next = node.frame + 1;
    if (next >= total) { this.gotoFrame(node, 0, true); return; }
    node.frame = next;
    this.queueFrame(node, next);
    const f = node.timeline.frames[next];
    if (f) this.applyOps(node, f, next);
  }

  private applyOps(node: DisplayNode, frame: Frame, index: number) {
    for (const op of frame.ops) this.applyOp(node, op, index);
  }

  private applyOp(parent: DisplayNode, op: PlaceOp, frameIndex: number) {
    const depth = op.depth - DEPTH_OFFSET;
    const existing = parent.childAtDepth(depth);
    if (op.op === 'remove') {
      if (existing && existing.fromTimeline) this.removeNode(existing);
      return;
    }
    if (op.op === 'place' || (op.op === 'move' && !existing && op.characterId != null)) {
      if (op.characterId == null) return;
      if (existing) this.removeNode(existing);
      this.placeFromTimeline(parent, {
        depth: op.depth, characterId: op.characterId, matrix: op.matrix ?? identity(), colorTransform: op.colorTransform,
        ratio: op.ratio ?? 0, name: op.name, clipDepth: op.clipDepth, startFrame: frameIndex,
      });
      return;
    }
    if (!existing) return;
    if (op.characterId != null && op.characterId !== existing.characterId && existing.kind === 'graphic') {
      existing.characterId = op.characterId; // shape swap keeps the instance
    }
    if (!existing.scriptMoved) {
      if (op.matrix) { existing.matrix = { ...op.matrix }; existing.comps = null; }
      if (op.colorTransform) existing.ct = op.colorTransform;
    }
    if (op.ratio != null) existing.ratio = op.ratio;
    if (op.clipDepth != null) existing.clipDepth = op.clipDepth - DEPTH_OFFSET;
  }

  private placeFromTimeline(parent: DisplayNode, item: DisplayItem) {
    const handlers = parent.movie.program?.timelines[parent.characterId]?.placements?.[`${item.startFrame + 1}:${item.depth}`] ?? [];
    const node = this.instantiate(parent.movie, item.characterId, parent, item.depth - DEPTH_OFFSET, item.name ?? '', {
      matrix: item.matrix, ct: item.colorTransform, ratio: item.ratio, clipDepth: item.clipDepth,
      fromTimeline: true, startFrame: item.startFrame, handlers,
    });
    return node;
  }

  /** gotoAndStop / gotoAndPlay (0-based frame). */
  gotoFrame(node: DisplayNode, target: number, loop = false) {
    if (!node.timeline) return;
    const total = node.totalFrames;
    target = Math.max(0, Math.min(total - 1, Math.floor(target)));
    if (target === node.frame && !loop) return;
    if (target === node.frame + 1 && !loop) {
      node.frame = target;
      this.queueFrame(node, target);
      const f = node.timeline.frames[target];
      if (f) this.applyOps(node, f, target);
      return;
    }
    const snapshot = node.timeline.frames[target]?.display ?? [];
    const want = new Map(snapshot.map((d) => [d.depth - DEPTH_OFFSET, d]));
    for (const c of [...node.children]) {
      if (!c.fromTimeline || c.depth >= 0) continue;
      const d = want.get(c.depth);
      if (!d || d.characterId !== c.characterId || d.startFrame !== c.startFrame) this.removeNode(c);
    }
    node.frame = target;
    this.queueFrame(node, target);
    for (const d of snapshot) {
      const depth = d.depth - DEPTH_OFFSET;
      const c = node.childAtDepth(depth);
      if (c && c.fromTimeline && c.characterId === d.characterId && c.startFrame === d.startFrame) {
        if (!c.scriptMoved) { c.matrix = { ...d.matrix }; c.comps = null; if (d.colorTransform) c.ct = d.colorTransform; }
        c.ratio = d.ratio;
        continue;
      }
      if (c) { if (c.fromTimeline) this.removeNode(c); else continue; }
      this.placeFromTimeline(node, d);
    }
  }

  frameOf(node: DisplayNode, f: unknown): number | null {
    if (typeof f === 'number' || (typeof f === 'string' && /^\s*\d+\s*$/.test(f))) return Number(f) - 1;
    if (typeof f === 'string' && node.timeline) {
      const s = f.toLowerCase();
      const i = node.timeline.frames.findIndex((fr) => fr.label?.toLowerCase() === s);
      if (i >= 0) return i;
      this.log('warn', `${this.describe(node)}: frame label "${f}" not found`);
      return null;
    }
    const n = Number(f);
    return Number.isFinite(n) ? n - 1 : null;
  }

  // ------------------------------------------------------------ instances
  /** Create a display node for a character and run its construction sequence. */
  instantiate(movie: Movie, characterId: number, parent: DisplayNode, depth: number, name: string, o: {
    matrix?: Matrix; ct?: ColorTransform; ratio?: number; clipDepth?: number; fromTimeline?: boolean; startFrame?: number;
    handlers?: AS2Handler[]; initObject?: Record<string, unknown> | null; cls?: unknown; kind?: NodeKind;
  } = {}): DisplayNode {
    const ch = movie.doc.characters.get(characterId);
    const kind: NodeKind = o.kind ? o.kind : !ch ? 'graphic' : ch.kind === 'sprite' ? 'clip' : ch.kind === 'button' ? 'button' : ch.kind === 'edittext' ? 'text' : 'graphic';
    const node = new DisplayNode(kind, movie, characterId);
    node.depth = depth;
    node.matrix = o.matrix ? { ...o.matrix } : identity();
    node.ct = o.ct;
    node.ratio = o.ratio ?? 0;
    node.clipDepth = o.clipDepth ? o.clipDepth - DEPTH_OFFSET : 0;
    node.fromTimeline = !!o.fromTimeline;
    node.startFrame = o.startFrame ?? -1;
    node.handlers = o.handlers ?? [];
    node.bornTick = this.tickCount;
    if (kind === 'clip') node.timeline = movie.doc.timelines.get(`sprite:${characterId}`) ?? null;
    if (kind === 'button') node.timeline = movie.doc.timelines.get(`button:${characterId}`) ?? null;
    if (kind === 'text' && ch) node.text = this.textFromCharacter(ch);
    if (kind === 'graphic') {
      this.attach(parent, node);
      return node;
    }
    node.name = name || `instance${node.id}`;
    this.attach(parent, node);

    const build = (obj: any) => {
      this.bind(obj, node);
      if (o.initObject) for (const [k, v] of Object.entries(o.initObject)) obj[k] = v;
      if (kind === 'clip') this.enterFirstFrame(node);
      if (kind === 'button') this.buildButtonState(node);
    };
    if (kind === 'clip') {
      const cls = (o.cls ?? (ch?.exportName ? RT.$rt.linkedClass(ch.exportName) : undefined)) as (new () => any) | undefined;
      const Ctor = typeof cls === 'function' ? cls : RT.MovieClip;
      RT.MovieClip.__construct = build;
      this.runHandlers(node, 'construct');
      try { new Ctor(); } catch (e) {
        this.log('error', `constructor of ${this.describe(node)}: ${(e as Error).message}`, (e as Error).stack?.split('\n').slice(0, 6).join('\n'));
        if (!node.obj) { RT.MovieClip.__construct = null; build(Object.create(RT.MovieClip.prototype)); }
      }
      RT.MovieClip.__construct = null;
      this.queueClipEvent(node, 'initialize');
      this.enqueue(node, `${this.describe(node)} load`, () => this.dispatchClipEvent(node, 'load'));
    } else if (kind === 'button') {
      RT.Button.__construct = build;
      new RT.Button();
    } else {
      RT.TextField.__construct = build;
      new RT.TextField();
      this.initTextVariable(node);
    }
    return node;
  }

  /** Link a script object and a display node. */
  bind(obj: any, node: DisplayNode) {
    Object.defineProperty(obj, NODE, { value: node, enumerable: false, configurable: true });
    node.obj = obj;
    if (node.parent && node.name) this.publishName(node);
  }

  attach(parent: DisplayNode, node: DisplayNode) {
    node.parent = parent;
    const i = parent.children.findIndex((c) => c.depth > node.depth);
    if (i < 0) parent.children.push(node); else parent.children.splice(i, 0, node);
    if (node.name && node.obj) this.publishName(node);
  }

  /** Make the child reachable as parent.name (AS2 resolves instance names as properties). */
  publishName(node: DisplayNode) {
    const p = node.parent?.obj;
    if (!p || !node.name || !node.obj) return;
    try { p[node.name] = node.obj; } catch { /* read-only property on parent */ }
  }

  unpublishName(node: DisplayNode) {
    const p = node.parent?.obj;
    if (!p || !node.name) return;
    if (Object.prototype.hasOwnProperty.call(p, node.name) && p[node.name] === node.obj) {
      delete p[node.name];
      const other = node.parent!.children.find((c) => c !== node && c.name === node.name && c.obj);
      if (other) p[node.name] = other.obj;
    }
  }

  removeNode(node: DisplayNode) {
    if (node.removed) return;
    if (node.kind === 'clip') this.dispatchClipEvent(node, 'unload');
    const kill = (n: DisplayNode) => {
      n.removed = true;
      for (const c of n.children) kill(c);
      if (this.focus === n) this.focus = null;
      if (this.hovered === n) this.hovered = null;
      if (this.pressed === n) this.pressed = null;
      if (this.drag?.node === n) this.drag = null;
    };
    kill(node);
    const p = node.parent;
    if (p) {
      p.children = p.children.filter((c) => c !== node);
      this.unpublishName(node);
    }
  }

  describe(node: DisplayNode): string {
    if (node === this.root) return '_root';
    const ch = node.character;
    const what = ch?.exportName ? `"${ch.exportName}"` : `${ch?.kind ?? 'clip'} ${node.characterId}`;
    return `${node.path()} (${what})`;
  }

  // ------------------------------------------------------------ events
  queueClipEvent(node: DisplayNode, event: string) {
    const hs = node.handlers.filter((h) => h.kind === 'onClipEvent' && h.events.includes(event));
    const prop = event === 'enterFrame' ? 'onEnterFrame' : null;
    for (const h of hs) this.enqueue(node, `${this.describe(node)} onClipEvent(${event})`, () => h.run.call(node.obj));
    if (prop) this.enqueue(node, `${this.describe(node)} ${prop}`, () => { const f = node.obj?.[prop]; if (typeof f === 'function') f.call(node.obj); });
  }

  /** Run onClipEvent(x) handlers and the matching onX method now. */
  dispatchClipEvent(node: DisplayNode, event: string, ...args: unknown[]) {
    this.runHandlers(node, event);
    const prop = `on${event[0].toUpperCase()}${event.slice(1)}`;
    const f = node.obj?.[prop];
    if (typeof f === 'function') this.guard(`${this.describe(node)} ${prop}`, () => f.apply(node.obj, args));
  }

  private runHandlers(node: DisplayNode, event: string) {
    for (const h of node.handlers) {
      if (h.kind === 'onClipEvent' && h.events.includes(event)) this.guard(`${this.describe(node)} onClipEvent(${event})`, () => h.run.call(node.obj));
    }
  }

  /** Clips with on(...) mouse handlers or onPress/onRelease… behave like buttons. */
  isMouseTarget(node: DisplayNode): boolean {
    if (node.removed || !node.obj) return false;
    if (node.kind === 'button') return node.obj.enabled !== false;
    if (node.kind === 'text') return !!node.text && (node.text.input || node.text.selectable) && false;
    if (node.kind !== 'clip' || node.obj.enabled === false) return false;
    if (node.handlers.some((h) => h.kind === 'on' && h.events.some((e) => !e.startsWith('keyPress')))) return true;
    const o = node.obj;
    return ['onPress', 'onRelease', 'onReleaseOutside', 'onRollOver', 'onRollOut', 'onDragOver', 'onDragOut']
      .some((k) => typeof o[k] === 'function');
  }

  /** Fire a button-style event (press, release, rollOver …) on a clip or button. */
  buttonEvent(node: DisplayNode, event: 'press' | 'release' | 'releaseOutside' | 'rollOver' | 'rollOut' | 'dragOver' | 'dragOut') {
    const self = node.kind === 'button' ? node.parent?.obj ?? node.obj : node.obj;
    const hs = [...node.handlers, ...(node.kind === 'button' ? node.movie.program?.buttons[node.characterId] ?? [] : [])];
    for (const h of hs) {
      if (h.kind === 'on' && h.events.includes(event)) this.enqueue(node, `${this.describe(node)} on(${event})`, () => h.run.call(self));
    }
    const prop = `on${event[0].toUpperCase()}${event.slice(1)}`;
    const f = node.obj?.[prop];
    if (typeof f === 'function') this.enqueue(node, `${this.describe(node)} ${prop}`, () => f.call(node.obj));
    this.runQueue();
  }

  /** Broadcast to all clips (onClipEvent(mouseDown)… and the onMouseDown methods), then to listeners. */
  broadcast(event: 'mouseDown' | 'mouseUp' | 'mouseMove' | 'keyDown' | 'keyUp', listeners: any[]) {
    const all: DisplayNode[] = [];
    const walk = (n: DisplayNode) => { if (n.kind === 'clip') all.push(n); n.children.forEach(walk); };
    walk(this.root);
    for (const n of all.reverse()) {
      if (n.removed) continue;
      const hs = n.handlers.filter((h) => h.kind === 'onClipEvent' && h.events.includes(event));
      for (const h of hs) this.enqueue(n, `${this.describe(n)} onClipEvent(${event})`, () => h.run.call(n.obj));
      if (event.startsWith('mouse')) {
        const prop = `on${event[0].toUpperCase()}${event.slice(1)}`;
        const f = n.obj?.[prop];
        if (typeof f === 'function' && n !== this.root) this.enqueue(n, `${this.describe(n)} ${prop}`, () => f.call(n.obj));
        else if (typeof f === 'function' && n === this.root) this.enqueue(n, `_root ${prop}`, () => f.call(n.obj));
      }
    }
    const prop = `on${event[0].toUpperCase()}${event.slice(1)}`;
    for (const l of [...listeners]) {
      const f = l?.[prop];
      if (typeof f === 'function') this.enqueue(this.root, `listener ${prop}`, () => f.call(l), true);
    }
    this.runQueue();
  }

  // ------------------------------------------------------------ buttons
  buildButtonState(node: DisplayNode) {
    const idx = node.btnState === 'up' ? 0 : node.btnState === 'over' ? 1 : 2;
    const frame = node.timeline?.frames[idx];
    for (const c of [...node.children]) this.removeNode(c);
    if (!frame) return;
    for (const d of frame.display) {
      this.instantiate(node.movie, d.characterId, node, d.depth - DEPTH_OFFSET, '', {
        matrix: d.matrix, ct: d.colorTransform, fromTimeline: true, startFrame: idx,
      });
    }
    this.runQueue();
  }

  setButtonState(node: DisplayNode, state: 'up' | 'over' | 'down') {
    if (node.kind === 'button') {
      if (node.btnState === state) return;
      node.btnState = state;
      this.buildButtonState(node);
      return;
    }
    // clips used as buttons: _up/_over/_down frame labels
    if (node.kind === 'clip' && node.timeline && node.obj?.enabled !== false) {
      const label = `_${state}`;
      const i = node.timeline.frames.findIndex((f) => f.label === label);
      if (i >= 0) { node.playing = false; this.gotoFrame(node, i); this.runQueue(); }
    }
  }

  // ------------------------------------------------------------ geometry
  globalMatrix(node: DisplayNode): Matrix {
    let m = node.matrix;
    for (let p = node.parent; p; p = p.parent) m = concat(p.matrix, m);
    return m;
  }

  /** Bounds of a node in its own coordinate space (TWIPS). */
  localBounds(node: DisplayNode, forHit = false): Rect | null {
    if (node.kind === 'graphic') {
      const ch = node.character;
      return ch?.bounds ?? null;
    }
    if (node.kind === 'text') return node.text?.bounds ?? null;
    let r: Rect | null = null;
    if (node.kind === 'button' && forHit) {
      const hit = node.timeline?.frames[3]?.display ?? [];
      for (const d of hit) {
        const ch = node.movie.doc.characters.get(d.characterId);
        const b = ch?.bounds ?? (ch?.kind === 'sprite' ? this.spriteBounds(node.movie, d.characterId) : null);
        if (b) r = unionRect(r, transformRect(d.matrix, b));
      }
      if (r) return r;
    }
    for (const c of node.children) {
      if (c.removed || c.clipDepth) continue;
      const b = this.localBounds(c, forHit);
      if (b) r = unionRect(r, transformRect(c.matrix, b));
    }
    if (node.drawing?.length) r = unionRect(r, this.drawingBounds(node.drawing));
    return r;
  }

  private spriteBounds(movie: Movie, id: number): Rect | null {
    const tl = movie.doc.timelines.get(`sprite:${id}`);
    let r: Rect | null = null;
    for (const d of tl?.frames[0]?.display ?? []) {
      const ch = movie.doc.characters.get(d.characterId);
      const b = ch?.bounds ?? (ch?.kind === 'sprite' ? this.spriteBounds(movie, d.characterId) : null);
      if (b) r = unionRect(r, transformRect(d.matrix, b));
    }
    return r;
  }

  private drawingBounds(cmds: DrawCmd[]): Rect | null {
    let r: Rect | null = null;
    for (const c of cmds) {
      if (c.op === 'move' || c.op === 'lineTo' || c.op === 'curve') {
        const pts = c.op === 'curve' ? [[c.cx, c.cy], [c.x, c.y]] : [[c.x, c.y]];
        for (const [x, y] of pts) r = unionRect(r, { xMin: x, xMax: x, yMin: y, yMax: y });
      }
    }
    return r;
  }

  boundsIn(node: DisplayNode, space: DisplayNode | null): Rect | null {
    const b = this.localBounds(node);
    if (!b) return null;
    const g = this.globalMatrix(node);
    const m = space ? concat(invert(this.globalMatrix(space)), g) : g;
    return transformRect(m, b);
  }

  /** Stage point (px) → node-local (TWIPS). */
  toLocal(node: DisplayNode, x: number, y: number) {
    return apply(invert(this.globalMatrix(node)), x * TWIPS, y * TWIPS);
  }

  /** Is the stage point (px) inside the node's shape? */
  hitTestPoint(node: DisplayNode, x: number, y: number, shape: boolean, forButton = false): boolean {
    if (node.removed || !node.visible) return false;
    const p = this.toLocal(node, x, y);
    if (node.kind === 'button' || (forButton && node.kind === 'clip' && node.obj?.hitArea)) {
      if (node.kind === 'clip') { const h = nodeOf(node.obj.hitArea); return !!h && this.hitTestPoint(h, x, y, true, false); }
      return inRect(this.localBounds(node, true), p.x, p.y) && (!shape || this.buttonShapeHit(node, x, y));
    }
    if (node.kind === 'graphic' || node.kind === 'text') {
      if (!inRect(this.localBounds(node), p.x, p.y)) return false;
      return !shape || node.kind === 'text' || this.pixelHit(node, p.x, p.y);
    }
    if (!shape) return inRect(this.localBounds(node), p.x, p.y);
    if (node.drawing?.length && inRect(this.drawingBounds(node.drawing), p.x, p.y)) return true;
    return node.children.some((c) => !c.clipDepth && this.hitTestPoint(c, x, y, true, forButton));
  }

  private buttonShapeHit(node: DisplayNode, x: number, y: number): boolean {
    const hit = node.timeline?.frames[3]?.display ?? [];
    if (!hit.length) return node.children.some((c) => this.hitTestPoint(c, x, y, true));
    const g = this.globalMatrix(node);
    const p = apply(invert(g), x * TWIPS, y * TWIPS);
    for (const d of hit) {
      const ch = node.movie.doc.characters.get(d.characterId);
      const b = ch?.bounds ?? (ch?.kind === 'sprite' ? this.spriteBounds(node.movie, d.characterId) : null);
      if (!b) continue;
      const q = apply(invert(d.matrix), p.x, p.y);
      if (inRect(b, q.x, q.y)) return true;
    }
    return false;
  }

  /** Alpha test against the rendered asset (falls back to bounds when pixels are unavailable). */
  private pixelHit(node: DisplayNode, lx: number, ly: number): boolean {
    const ch = node.character;
    const assets = node.movie.assets;
    if (!ch || !assets || typeof document === 'undefined') return true;
    const a = assets.get(ch.id, ch.kind, ch.bounds);
    if (a.status !== 'ready' || !a.img || !a.dest) return true;
    try {
      if (!this.hitCanvas) { this.hitCanvas = document.createElement('canvas'); this.hitCanvas.width = 1; this.hitCanvas.height = 1; }
      const hc = this.hitCanvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
      if (!hc) return true;
      hc.clearRect(0, 0, 1, 1);
      const sx = (a.img.naturalWidth || a.img.width) / a.dest.w;
      const sy = (a.img.naturalHeight || a.img.height) / a.dest.h;
      hc.drawImage(a.img, -(lx - a.dest.x) * sx, -(ly - a.dest.y) * sy);
      return hc.getImageData(0, 0, 1, 1).data[3] > 8;
    } catch { return true; }
  }

  /** Topmost mouse-enabled node under the stage point. */
  mouseTarget(x: number, y: number): DisplayNode | null {
    const visit = (n: DisplayNode): DisplayNode | null => {
      if (n.removed || !n.visible) return null;
      if (n !== this.root && this.isMouseTarget(n)) return this.hitTestPoint(n, x, y, true, true) ? n : null;
      if (n.kind === 'text' && n.text?.input && this.hitTestPoint(n, x, y, false)) return n;
      for (let i = n.children.length - 1; i >= 0; i--) {
        const c = n.children[i];
        if (c.clipDepth) continue;
        const r = visit(c);
        if (r) return r;
      }
      return null;
    };
    return visit(this.root);
  }

  // ------------------------------------------------------------ transform props
  comps(node: DisplayNode): Components {
    if (!node.comps) node.comps = decompose(node.matrix);
    return node.comps;
  }
  setComps(node: DisplayNode, c: Partial<Components>) {
    const cur = { ...this.comps(node), ...c };
    node.comps = cur;
    node.matrix = compose(cur, node.matrix.tx, node.matrix.ty);
    node.scriptMoved = true;
  }

  // ------------------------------------------------------------ text fields
  fontFamily(fontIdOrName: number | string | undefined): string {
    if (fontIdOrName == null) return 'Times New Roman, serif';
    if (this.opts.fontFamily) return this.opts.fontFamily(fontIdOrName);
    if (typeof fontIdOrName === 'number') {
      const name = this.doc.characters.get(fontIdOrName)?.attrs.fontName?.replace(/\u0000/g, '');
      return name ? `"${name}", sans-serif` : 'sans-serif';
    }
    return `"${fontIdOrName}", sans-serif`;
  }

  private fontNameOf(id: number | undefined): string {
    if (id == null) return 'Times New Roman';
    const ch = this.doc.characters.get(id);
    return (ch?.attrs.fontName ?? '').replace(/\u0000/g, '') || `font${id}`;
  }

  textFromCharacter(ch: SwfCharacter): TextState {
    const a = ch.attrs;
    const bool = (k: string) => a[k] === 'true';
    const fontId = a.fontId != null ? Number(a.fontId) : undefined;
    const alignN = Number(a.align ?? 0);
    const format: TextStyle = {
      font: this.fontNameOf(fontId), size: Number(a.fontHeight ?? 240) / TWIPS, color: a.textColor ?? '#000000',
      bold: this.doc.characters.get(fontId ?? -1)?.attrs.fontFlagsBold === 'true',
      italic: this.doc.characters.get(fontId ?? -1)?.attrs.fontFlagsItalic === 'true', underline: false,
      align: (['left', 'right', 'center', 'justify'] as const)[alignN] ?? 'left',
    };
    const t: TextState = {
      paras: [], html: bool('html'), variable: a.variableName || null, format,
      wordWrap: bool('wordWrap'), multiline: bool('multiline'), border: bool('border'), borderColor: '#000000',
      background: bool('border'), backgroundColor: '#ffffff', selectable: !bool('noSelect'), input: !bool('readOnly'),
      password: bool('password'), maxChars: a.maxLength ? Number(a.maxLength) : null, autoSize: bool('autoSize') ? 'left' : 'none',
      bounds: ch.bounds ?? { xMin: 0, yMin: 0, xMax: 100 * TWIPS, yMax: 20 * TWIPS }, scroll: 1, lines: null, listeners: [],
      embedFonts: bool('useOutlines'), restrict: null, fontId,
    };
    this.setText(t, a.initialText ?? '', t.html);
    return t;
  }

  setText(t: TextState, value: string, html: boolean) {
    t.paras = html ? parseHtml(value, t.format) : plainToParagraphs(value, t.format);
    t.lines = null;
  }
  getText(t: TextState) { return paragraphsToText(t.paras); }
  getHtml(t: TextState) { return t.html ? paragraphsToHtml(t.paras) : this.getText(t); }

  private initTextVariable(node: DisplayNode) {
    const t = node.text;
    if (!t?.variable) return;
    const { owner, key } = this.varTarget(node, t.variable);
    if (!owner) return;
    if (owner[key] === undefined) { const v = this.getText(t); if (v !== '') owner[key] = v; }
    else this.setText(t, String(owner[key]), t.html);
  }

  varTarget(node: DisplayNode, variable: string): { owner: any; key: string } {
    const base = node.parent?.obj;
    const cut = Math.max(variable.lastIndexOf('.'), variable.lastIndexOf(':'));
    if (cut < 0) return { owner: base, key: variable };
    const owner = base ? RT.resolvePath(base, variable.slice(0, cut)) : undefined;
    return { owner, key: variable.slice(cut + 1) };
  }

  /** Pull bound variables into their text fields (Flash does this every frame). */
  syncTexts() {
    const walk = (n: DisplayNode) => {
      if (n.kind === 'text' && n.text?.variable) {
        const { owner, key } = this.varTarget(n, n.text.variable);
        const v = owner?.[key];
        const s = v === undefined ? '' : String(v);
        const cur = n.text.html ? n.text.source ?? '' : this.getText(n.text);
        if (s !== cur) { this.setText(n.text, s, n.text.html); if (n.text.html) n.text.source = s; }
      }
      n.children.forEach(walk);
    };
    walk(this.root);
  }

  measure(text: string, r: { font: string; size: number; bold: boolean; italic: boolean }): number {
    if (this.measureCtx === undefined) {
      try { this.measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { this.measureCtx = null; }
    }
    const c = this.measureCtx;
    if (!c || typeof c.measureText !== 'function') return estimateWidth(text, { ...r, text, color: '', underline: false });
    c.font = cssFont(r, (f) => this.fontFamily(f));
    return c.measureText(text).width;
  }

  textLines(t: TextState): Line[] {
    if (!t.lines) {
      const w = (t.bounds.xMax - t.bounds.xMin) / TWIPS - 4;
      t.lines = layout(t.paras, Math.max(1, w), t.wordWrap && t.multiline !== false ? t.wordWrap : t.wordWrap, (s, r) => this.measure(s, r));
    }
    return t.lines;
  }

  // ------------------------------------------------------------ sounds
  playSound(characterId: number | null, url: string | null, startMs: number, loops: number, volume: number): AudioHandle | null {
    if (!this.audio) return null;
    const handle = this.audio.play(characterId, url, startMs, Math.max(0, loops - 1), volume * this.builtins.globalVolume);
    if (handle) {
      const entry = { id: characterId, handle };
      this.channels.add(entry);
      const prev = handle.onended;
      handle.onended = () => { this.channels.delete(entry); prev?.(); };
    }
    return handle;
  }
  stopSound(characterId: number | null) {
    for (const c of [...this.channels]) if (characterId == null || c.id === characterId) { c.handle.stop(); this.channels.delete(c); }
  }
  stopAllSounds() { this.stopSound(null); }

  // ------------------------------------------------------------ timers / host
  setTimer(fn: () => void, ms: number): number {
    const id = ++this.timerSeq;
    this.timers.set(id, { id, fn, ms: Number(ms) || 0, next: this.time() + Math.max(10, Number(ms) || 0) });
    return id;
  }
  clearTimer(id: number) { this.timers.delete(Number(id)); }

  /** target argument → node (clip object, path string or level number) */
  resolveTarget(from: DisplayNode, target: unknown): DisplayNode | null {
    if (typeof target === 'number') return target === 0 ? this.root : null;
    if (typeof target === 'string') {
      const m = /^_level(\d+)$/.exec(target);
      if (m) return Number(m[1]) === 0 ? this.root : null;
      const o = RT.resolvePath(from.obj, target);
      return nodeOf(o);
    }
    return nodeOf(target);
  }

  private host(): RT.AS2Host & { __player: AS2Player } {
    const p = this;
    return {
      __player: p,
      get root() { return p.root.obj; },
      level: (n) => (n === 0 ? p.root.obj : undefined),
      trace: (m) => p.log('trace', m),
      getTimer: () => Math.floor(p.time()),
      setInterval: (fn, ms) => p.setTimer(fn, ms),
      clearInterval: (id) => p.clearTimer(id),
      getURL: (url, win) => {
        if (/^javascript:/i.test(url)) { p.log('info', `getURL(${url}) ignored`); return; }
        p.log('info', `getURL("${url}"${win ? `, "${win}"` : ''})`);
        if (win && typeof window !== 'undefined' && /^https?:/i.test(url)) window.open(url, '_blank', 'noopener');
      },
      fscommand: (c, a) => p.log('info', `fscommand("${c}", "${a ?? ''}")`),
      stopAllSounds: () => p.stopAllSounds(),
      updateAfterEvent: () => p.render(),
      duplicateMovieClip: (t, name, depth) => p.builtins.duplicate(nodeOf(t), name, depth)?.obj,
      removeMovieClip: (t) => p.builtins.removeClip(nodeOf(t)),
      startDrag: (t, lock, l, tp, r, b) => p.builtins.startDrag(nodeOf(t), lock, l, tp, r, b),
      stopDrag: () => { p.drag = null; },
      loadMovie: (url, t) => p.builtins.loadMovie(url, typeof t === 'number' ? p.root : nodeOf(t)),
      loadVariables: (url, t) => p.builtins.loadVariables(url, typeof t === 'number' ? p.root : nodeOf(t)),
      unloadMovie: (t) => p.builtins.unloadMovie(typeof t === 'number' ? p.root : nodeOf(t)),
    };
  }

  // ------------------------------------------------------------ input
  /** Stage coordinates in px. */
  pointerMove(x: number, y: number) {
    this.mouse.x = x; this.mouse.y = y;
    if (this.drag) this.builtins.updateDrag();
    const target = this.mouseTarget(x, y);
    if (target !== this.hovered) {
      const old = this.hovered;
      this.hovered = target;
      if (old && !old.removed) {
        if (this.mouse.down && this.pressed === old) { this.setButtonState(old, 'over'); this.buttonEvent(old, 'dragOut'); }
        else { this.setButtonState(old, 'up'); this.buttonEvent(old, 'rollOut'); }
      }
      if (target) {
        if (this.mouse.down && this.pressed === target) { this.setButtonState(target, 'down'); this.buttonEvent(target, 'dragOver'); }
        else if (!this.mouse.down) { this.setButtonState(target, 'over'); this.buttonEvent(target, 'rollOver'); }
      }
    }
    this.broadcast('mouseMove', this.builtins.mouseListeners);
  }

  pointerDown(x: number, y: number) {
    this.pointerMove(x, y);
    this.mouse.down = true;
    const target = this.hovered;
    if (target?.kind === 'text' && target.text?.input) this.focus = target;
    else if (target) {
      this.focus = null;
      this.pressed = target;
      this.setButtonState(target, 'down');
      this.buttonEvent(target, 'press');
    } else this.focus = null;
    this.broadcast('mouseDown', this.builtins.mouseListeners);
    this.render();
  }

  pointerUp(x: number, y: number) {
    this.mouse.x = x; this.mouse.y = y;
    this.mouse.down = false;
    const pressed = this.pressed;
    this.pressed = null;
    if (pressed && !pressed.removed) {
      const over = this.mouseTarget(x, y) === pressed;
      this.setButtonState(pressed, over ? 'over' : 'up');
      this.buttonEvent(pressed, over ? 'release' : 'releaseOutside');
    }
    this.broadcast('mouseUp', this.builtins.mouseListeners);
    this.pointerMove(x, y);
    this.render();
  }

  keyDown(code: number, key: string) {
    this.keys.add(code);
    const ascii = key.length === 1 ? key.charCodeAt(0) : code === 13 ? 13 : code === 8 ? 8 : 0;
    this.lastKey = { code, ascii };
    if (this.focus?.text?.input) this.builtins.typeInto(this.focus, code, key);
    this.broadcast('keyDown', this.builtins.keyListeners);
    // on(keyPress "<Space>") on buttons / clips
    const name = KEY_NAMES[code];
    const walk = (n: DisplayNode) => {
      const hs = [...n.handlers, ...(n.kind === 'button' ? n.movie.program?.buttons[n.characterId] ?? [] : [])];
      for (const h of hs) {
        if (h.kind !== 'on') continue;
        for (const e of h.events) {
          const m = /^keyPress\s+"?(.+?)"?$/.exec(e);
          if (!m) continue;
          const want = m[1];
          if (want === key || (name && want.toLowerCase() === `<${name}>`.toLowerCase())) {
            const self = n.kind === 'button' ? n.parent?.obj : n.obj;
            this.enqueue(n, `${this.describe(n)} on(${e})`, () => h.run.call(self));
          }
        }
      }
      n.children.forEach(walk);
    };
    walk(this.root);
    this.runQueue();
  }

  keyUp(code: number) {
    this.keys.delete(code);
    this.broadcast('keyUp', this.builtins.keyListeners);
  }

  /** Bind DOM events of a canvas (returns an unbind function). */
  bindInput(canvas: HTMLCanvasElement): () => void {
    const pos = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const sx = r.width ? this.width / r.width : 1;
      const sy = r.height ? this.height / r.height : 1;
      return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    };
    const move = (e: MouseEvent) => { const p = pos(e); this.pointerMove(p.x, p.y); canvas.style.cursor = this.hovered && this.hovered.obj?.useHandCursor !== false && this.hovered.kind !== 'text' ? 'pointer' : this.hovered?.kind === 'text' ? 'text' : 'default'; };
    const down = (e: MouseEvent) => { const p = pos(e); canvas.focus?.(); this.pointerDown(p.x, p.y); };
    const up = (e: MouseEvent) => { const p = pos(e); this.pointerUp(p.x, p.y); };
    const kd = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; this.keyDown(e.keyCode, e.key); if (this.focus || [32, 37, 38, 39, 40, 8].includes(e.keyCode)) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => this.keyUp(e.keyCode);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('keydown', kd);
    canvas.addEventListener('keyup', ku);
    const off = () => {
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      canvas.removeEventListener('keydown', kd);
      canvas.removeEventListener('keyup', ku);
    };
    this.listeners.push(off);
    return off;
  }

  // ------------------------------------------------------------ rendering
  /** Draw into the mounted canvas (fills it). */
  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const scale = Math.min(canvas.width / this.width, canvas.height / this.height) || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.renderTo(ctx, scale, (canvas.width - this.width * scale) / 2, (canvas.height - this.height * scale) / 2);
  }

  /** Draw the stage at `scale` (device px per stage px) with its top-left corner at (ox, oy). */
  renderTo(ctx: CanvasRenderingContext2D, scale: number, ox: number, oy: number) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    ctx.clip();
    ctx.scale(1 / TWIPS, 1 / TWIPS);
    this.drawNode(ctx, this.root, 1, undefined);
    ctx.restore();
  }

  /** Advance by `dt` ms of game time (timers + due frames). For hosts that run their own loop. */
  advanceBy(dt: number) {
    if (!this.started) this.start();
    this.last = this.time() - dt;
    this.step(this.time());
  }

  private drawNode(ctx: CanvasRenderingContext2D, node: DisplayNode, alpha: number, ct: ColorTransform | undefined) {
    if (!node.visible || node.removed) return;
    const m = node.matrix;
    ctx.save();
    ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    const myCT = concatCT(ct, node.ct);
    const a = alpha * (node.ct ? Math.max(0, Math.min(1, node.ct.am + node.ct.aa / 255)) : 1);
    if (a <= 0.001) { ctx.restore(); return; }
    ctx.globalAlpha = a;
    if (node.maskedBy && !node.maskedBy.removed) this.clipTo(ctx, node, node.maskedBy);
    if (node.kind === 'graphic') this.drawGraphic(ctx, node, myCT);
    else if (node.kind === 'text') this.drawText(ctx, node);
    else {
      if (node.drawing?.length) this.drawVector(ctx, node.drawing);
      this.drawChildren(ctx, node, a, myCT);
    }
    ctx.restore();
  }

  private drawChildren(ctx: CanvasRenderingContext2D, node: DisplayNode, alpha: number, ct: ColorTransform | undefined) {
    const kids = node.children;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c.clipDepth) {
        // timeline mask: clip children up to clipDepth to the mask's bounds
        const b = this.localBounds(c);
        const masked: DisplayNode[] = [];
        let j = i + 1;
        while (j < kids.length && kids[j].depth <= c.clipDepth) masked.push(kids[j++]);
        ctx.save();
        if (b) {
          const m = c.matrix;
          ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
          ctx.beginPath();
          ctx.rect(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
          const inv = invert(m);
          ctx.transform(inv.a, inv.b, inv.c, inv.d, inv.tx, inv.ty);
          ctx.clip();
        }
        for (const k of masked) this.drawNode(ctx, k, alpha, ct);
        ctx.restore();
        i = j - 1;
        continue;
      }
      if (c.mask) { continue; /* a node used as setMask() target is not drawn */ }
      this.drawNode(ctx, c, alpha, ct);
    }
  }

  private clipTo(ctx: CanvasRenderingContext2D, node: DisplayNode, mask: DisplayNode) {
    const b = this.localBounds(mask);
    if (!b) return;
    const m = concat(invert(this.globalMatrix(node)), this.globalMatrix(mask));
    ctx.save();
    ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    ctx.beginPath();
    ctx.rect(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
    ctx.restore();
    ctx.clip();
  }

  private drawGraphic(ctx: CanvasRenderingContext2D, node: DisplayNode, ct: ColorTransform | undefined) {
    const ch = node.character;
    if (!ch) return;
    if (ch.kind === 'text' && ch.textRecords?.length) { this.drawStaticText(ctx, ch, ct); return; }
    const assets = node.movie.assets;
    if (!assets) return;
    const a = assets.get(ch.id, ch.kind, ch.bounds);
    if (a.status === 'ready' && a.img && a.dest) {
      try {
        if (!isColorIdentity(ct)) this.drawTinted(ctx, a.img, a.dest, ct!);
        else ctx.drawImage(a.img, a.dest.x, a.dest.y, a.dest.w, a.dest.h);
      } catch { /* not decodable */ }
    }
  }

  private tintCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();
  private drawTinted(ctx: CanvasRenderingContext2D, img: HTMLImageElement, d: { x: number; y: number; w: number; h: number }, ct: ColorTransform) {
    const key = [ct.rm, ct.gm, ct.bm, ct.ra, ct.ga, ct.ba].map((v) => v.toFixed(3)).join(',');
    let per = this.tintCache.get(img);
    if (!per) { per = new Map(); this.tintCache.set(img, per); }
    let c = per.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width || 1;
      c.height = img.naturalHeight || img.height || 1;
      const x = c.getContext('2d');
      if (!x) { ctx.drawImage(img, d.x, d.y, d.w, d.h); return; }
      x.drawImage(img, 0, 0);
      try {
        const data = x.getImageData(0, 0, c.width, c.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          px[i] = px[i] * ct.rm + ct.ra;
          px[i + 1] = px[i + 1] * ct.gm + ct.ga;
          px[i + 2] = px[i + 2] * ct.bm + ct.ba;
        }
        x.putImageData(data, 0, 0);
      } catch { /* tainted */ }
      if (per.size > 16) per.clear();
      per.set(key, c);
    }
    ctx.drawImage(c, d.x, d.y, d.w, d.h);
  }

  private drawStaticText(ctx: CanvasRenderingContext2D, ch: SwfCharacter, ct: ColorTransform | undefined) {
    const m = ch.textMatrix;
    ctx.save();
    if (m) ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    ctx.textBaseline = 'alphabetic';
    let font: number | undefined, height = 240, color = '#000000', x = 0, y = 0;
    for (const r of ch.textRecords ?? []) {
      if (r.fontId != null) font = r.fontId;
      if (r.height != null) height = r.height;
      if (r.color) color = r.color;
      if (r.x != null) x = r.x;
      if (r.y != null) y = r.y;
      const fch = font != null ? this.doc.characters.get(font) : undefined;
      const table = fch?.codeTable ?? [];
      ctx.font = `${fch?.attrs.fontFlagsItalic === 'true' ? 'italic ' : ''}${fch?.attrs.fontFlagsBold === 'true' ? 'bold ' : ''}${height}px ${this.fontFamily(font)}`;
      ctx.fillStyle = ct && !isColorIdentity(ct) ? tint(color, ct) : color;
      for (const g of r.glyphs) {
        const code = table[g.index];
        if (code != null && code !== 32) ctx.fillText(String.fromCharCode(code), x, y);
        x += g.advance;
      }
    }
    ctx.restore();
  }

  private drawText(ctx: CanvasRenderingContext2D, node: DisplayNode) {
    const t = node.text;
    if (!t) return;
    const b = t.bounds;
    ctx.save();
    ctx.scale(TWIPS, TWIPS);
    const x0 = b.xMin / TWIPS, y0 = b.yMin / TWIPS, w = (b.xMax - b.xMin) / TWIPS, h = (b.yMax - b.yMin) / TWIPS;
    if (t.background) { ctx.fillStyle = t.backgroundColor; ctx.fillRect(x0, y0, w, h); }
    if (t.border) { ctx.strokeStyle = t.borderColor; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1); }
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    const lines = this.textLines(t);
    let y = y0 + 2;
    const first = Math.max(0, t.scroll - 1);
    for (let i = first; i < lines.length; i++) {
      const line = lines[i];
      if (y > y0 + h) break;
      const free = w - 4 - line.width;
      const off = line.align === 'center' ? free / 2 : line.align === 'right' ? free : 0;
      for (const r of line.runs) {
        ctx.font = cssFont(r, (f) => this.fontFamily(f));
        ctx.fillStyle = r.color;
        ctx.textBaseline = 'alphabetic';
        const s = t.password ? '*'.repeat(r.text.length) : r.text;
        ctx.fillText(s, x0 + 2 + off + r.x, y + line.ascent);
        if (r.underline) ctx.fillRect(x0 + 2 + off + r.x, y + line.ascent + 1, r.width, 1);
      }
      y += line.height;
    }
    if (this.focus === node && Math.floor(this.time() / 500) % 2 === 0) {
      const last = lines[lines.length - 1];
      const cx = x0 + 2 + (last?.width ?? 0);
      const cy = y0 + 2 + Math.max(0, lines.length - 1 - first) * (last?.height ?? t.format.size * 1.15);
      ctx.fillStyle = t.format.color;
      ctx.fillRect(cx, cy, 1, last?.height ?? t.format.size * 1.15);
    }
    ctx.restore();
  }

  private drawVector(ctx: CanvasRenderingContext2D, cmds: DrawCmd[]) {
    let fill: { color: string | null; alpha: number } | null = null;
    let line: { width: number; color: string | null; alpha: number } | null = null;
    const base = ctx.globalAlpha;
    let open = false;
    const finish = () => {
      if (!open) return;
      if (fill?.color) { ctx.globalAlpha = base * fill.alpha; ctx.fillStyle = fill.color; ctx.fill(); }
      if (line?.color) { ctx.globalAlpha = base * line.alpha; ctx.strokeStyle = line.color; ctx.lineWidth = Math.max(TWIPS, line.width); ctx.stroke(); }
      ctx.globalAlpha = base;
      open = false;
    };
    for (const c of cmds) {
      if (c.op === 'fill') { finish(); fill = c; ctx.beginPath(); open = true; }
      else if (c.op === 'line') { line = c; }
      else if (c.op === 'move') { if (!open) { ctx.beginPath(); open = true; } ctx.moveTo(c.x, c.y); }
      else if (c.op === 'lineTo') { if (!open) { ctx.beginPath(); open = true; ctx.moveTo(0, 0); } ctx.lineTo(c.x, c.y); }
      else if (c.op === 'curve') { if (!open) { ctx.beginPath(); open = true; ctx.moveTo(0, 0); } ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y); }
      else if (c.op === 'end') { if (fill) ctx.closePath(); finish(); fill = null; }
    }
    finish();
  }

  // ------------------------------------------------------------ inspection
  /** Snapshot of the display list (for the UI / tests). */
  tree(node: DisplayNode = this.root, depth = 0, out: string[] = []): string[] {
    const ch = node.character;
    const label = node === this.root ? '_root' : node.name || `(${ch?.kind ?? node.kind} ${node.characterId})`;
    const extra = node.timeline && node.totalFrames > 1 ? ` [${node.frame + 1}/${node.totalFrames}${node.playing ? ' ▶' : ''}]` : '';
    const vis = node.visible ? '' : ' (hidden)';
    const ex = ch?.exportName ? ` "${ch.exportName}"` : '';
    out.push(`${'  '.repeat(depth)}${label}${ex} d=${node.depth}${extra}${vis}`);
    for (const c of node.children) if (c.kind !== 'graphic' || depth < 1) this.tree(c, depth + 1, out);
    return out;
  }
}

const KEY_NAMES: Record<number, string> = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 27: 'Escape', 32: 'Space', 33: 'PageUp', 34: 'PageDown', 35: 'End', 36: 'Home',
  37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down', 45: 'Insert', 46: 'Delete',
};

function tint(hex: string, ct: ColorTransform): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number, m: number, a: number) => Math.max(0, Math.min(255, Math.round(v * m + a)));
  return `rgb(${c((n >> 16) & 255, ct.rm, ct.ra)},${c((n >> 8) & 255, ct.gm, ct.ga)},${c(n & 255, ct.bm, ct.ba)})`;
}
