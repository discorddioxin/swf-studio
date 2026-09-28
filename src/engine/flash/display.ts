// flash.display: the display list and the timeline engine.
//
// Timeline model
// --------------
// The parser gives every timeline a per-frame *snapshot* of its display list
// (`frame.display`: depth, character, matrix, and `startFrame`, the frame
// the instance was placed on). A MovieClip reconciles its live children
// against the snapshot of the frame it enters. A child is kept when the same
// placement (depth + character + startFrame) is still present. Otherwise it
// is removed and new placements are instantiated. This single mechanism
// covers sequential playback, looping, and gotoAndStop/gotoAndPlay in both
// directions, and it keeps instance identity (and script state) across frames
// the same way Flash does.
//
// Instances are constructed the way AS3 constructs timeline children: the
// object is attached to its parent, named, and positioned *before* its class
// constructor body runs, so `this.parent`, `this.stage`, `this.name` and
// declared stage instances (`this.hero`) are usable inside constructors.

import type { Frame, SwfDocument, Timeline } from '../../types';
import { runtime, type PlayerContext } from './context';
import { Event, EventDispatcher } from './events';
import { ColorTransform, Matrix, Point, Rectangle, Transform } from './geom';

const TWIPS = 20;
/** Timeline depths sit below script depths, as in Flash (-16384 + depth). */
const TIMELINE_DEPTH_OFFSET = -16384;

export type SymbolRef = number | 'root';
type Ctor = abstract new (...args: never[]) => unknown;

/** What the display classes need from the running player. */
export interface DisplayHost extends PlayerContext {
  readonly doc: SwfDocument;
  readonly stage: Stage;
  readonly root: DisplayObject | null;
  readonly frameId: number;
  readonly mouse: { x: number; y: number; down: boolean };
  timelineFor(symbol: SymbolRef): Timeline | undefined;
  classForSymbol(id: number): Ctor | undefined;
  symbolForClass(ctor: Function): SymbolRef | undefined;
  queueFrameScript(clip: MovieClip): void;
  frameEntered(clip: MovieClip, frame: Frame): void;
  drawCharacter(ctx: CanvasRenderingContext2D, characterId: number): void;
  characterImage(characterId: number): CanvasImageSource | null;
}

export function host(): DisplayHost | null {
  return runtime.player as unknown as DisplayHost | null;
}

// --------------------------------------------------------- construction --

interface Pending {
  symbol?: SymbolRef;
  parent?: DisplayObjectContainer;
  depth?: number;
  name?: string;
  placedAt?: number;
  matrix?: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  color?: Frame['display'][number]['colorTransform'];
  clipDepth?: number;
}
let pending: Pending | null = null;
let instanceCounter = 1;

/** Construct `Cls` as if the player placed it: parent/name/matrix are set before the class body runs. */
export function constructPlaced<T>(Cls: new () => T, context: Pending): T | null {
  pending = context;
  let obj: T | null = null;
  try {
    obj = runtime.guard(() => new Cls(), `constructor of ${Cls.name || 'anonymous class'}`) ?? null;
  } finally {
    pending = null;
  }
  if (!(obj instanceof DisplayObject)) {
    // The constructor threw after pre-attaching: detach the half-built object.
    const parent = context.parent;
    if (parent) for (const child of [...parent._children]) if (child._depth === context.depth && !child._constructed) parent._detach(child);
    return obj;
  }
  finishConstruction(obj);
  return obj;
}

function finishConstruction(obj: DisplayObject) {
  obj._constructed = true;
  // TS/JS class fields may have been (re)initialised after super(): re-bind
  // declared stage instances so `this.hero` points at the timeline child.
  if (obj instanceof DisplayObjectContainer) obj._bindStageInstances();
  if (obj._parent && !obj._announced) {
    obj._announced = true;
    obj.dispatchEvent(new Event(Event.ADDED, true));
    if (obj.stage) dispatchStageEvent(obj, Event.ADDED_TO_STAGE);
  }
}

/** Instantiate a SWF character (as the timeline does), linked class first. */
export function instantiateCharacter(characterId: number, context: Pending): DisplayObject | null {
  const h = host();
  const ch = h?.doc.characters.get(characterId);
  if (!h || !ch) return null;
  const ctx: Pending = { ...context, symbol: characterId };
  const Linked = h.classForSymbol(characterId) as (new () => DisplayObject) | undefined;
  switch (ch.kind) {
    case 'sprite': return constructPlaced(Linked ?? MovieClip, ctx);
    case 'button': return constructPlaced(Linked ?? SimpleButton, ctx);
    case 'edittext': return constructPlaced(Linked ?? (textFieldClass as unknown as new () => DisplayObject) ?? Shape, ctx);
    case 'sound': case 'font': case 'binary': return null;
    default: return constructPlaced(Linked ?? Shape, ctx);
  }
}

/** TextField lives in text.ts; it registers itself here to avoid an import cycle. */
let textFieldClass: (new () => InteractiveObject) | null = null;
export function registerTextField(cls: new () => InteractiveObject) { textFieldClass = cls; }

function dispatchStageEvent(obj: DisplayObject, type: string) {
  obj.dispatchEvent(new Event(type, false));
  if (obj instanceof DisplayObjectContainer) for (const child of [...obj._children]) dispatchStageEvent(child, type);
  if (obj instanceof SimpleButton) for (const state of obj._states()) if (state) dispatchStageEvent(state, type);
}

// -------------------------------------------------------- DisplayObject --

export class DisplayObject extends EventDispatcher {
  /** @internal */ _parent: DisplayObjectContainer | null = null;
  /** @internal */ _symbol: SymbolRef | undefined = undefined;
  /** @internal */ _depth = 0;
  /** @internal timeline placement identity (undefined = created by script) */ _placedAt: number | undefined = undefined;
  /** @internal */ _clipDepth: number | undefined = undefined;
  /** @internal once a script moves a timeline object, the timeline stops driving it */ _scriptTransformed = false;
  /** @internal */ _constructed = false;
  /** @internal */ _announced = false;
  /** @internal */ _createdFrame = 0;
  /** @internal */ _isMaskFor = 0;
  private _name: string;
  private _x = 0; private _y = 0;
  private _sx = 1; private _sy = 1;
  private _skewX = 0; private _skewY = 0;
  private _color = new ColorTransform();
  private _visible = true;
  private _mask: DisplayObject | null = null;
  cacheAsBitmap = false;
  filters: unknown[] = [];
  blendMode = 'normal';
  opaqueBackground: number | null = null;
  scrollRect: Rectangle | null = null;
  scale9Grid: Rectangle | null = null;
  z = 0; rotationX = 0; rotationY = 0; rotationZ = 0; scaleZ = 1;
  accessibilityProperties: unknown = null;

  constructor() {
    super();
    const p = pending;
    pending = null; // consumed by the outermost (first-run) base constructor only
    this._createdFrame = host()?.frameId ?? 0;
    if (p) {
      this._symbol = p.symbol;
      this._name = p.name ?? `instance${instanceCounter++}`;
      this._placedAt = p.placedAt;
      if (p.matrix) this._setRawMatrix(p.matrix.a, p.matrix.b, p.matrix.c, p.matrix.d, p.matrix.tx / TWIPS, p.matrix.ty / TWIPS);
      if (p.color) this._color = toColorTransform(p.color);
      if (p.clipDepth != null) this._clipDepth = p.clipDepth + TIMELINE_DEPTH_OFFSET;
      if (p.parent) p.parent._attachAtDepth(this, (p.depth ?? 0) + TIMELINE_DEPTH_OFFSET);
    } else {
      this._name = `instance${instanceCounter++}`;
      this._symbol = host()?.symbolForClass(new.target);
    }
  }

  // -- hierarchy
  get parent(): DisplayObjectContainer | null { return this._parent; }
  /** @internal event propagation path */ get _eventParent(): EventDispatcher | null { return this._parent; }
  get stage(): Stage | null {
    let node: DisplayObject | null = this;
    while (node) { if (node instanceof Stage) return node; node = node._parent; }
    return null;
  }
  get root(): DisplayObject | null {
    const h = host();
    if (this.stage && h?.root) return h.root;
    let node: DisplayObject = this;
    while (node._parent && !(node._parent instanceof Stage)) node = node._parent;
    return node;
  }
  get loaderInfo(): LoaderInfo | null { return host() ? loaderInfoSingleton() : null; }
  get name() { return this._name; }
  set name(v: string) { this._name = String(v); }

  // -- transform
  get x() { return this._x; }
  set x(v: number) { this._x = num(v); this._scriptTransformed = true; }
  get y() { return this._y; }
  set y(v: number) { this._y = num(v); this._scriptTransformed = true; }
  get scaleX() { return this._sx; }
  set scaleX(v: number) { this._sx = num(v); this._scriptTransformed = true; }
  get scaleY() { return this._sy; }
  set scaleY(v: number) { this._sy = num(v); this._scriptTransformed = true; }
  get rotation() { return normDeg(this._skewY * 180 / Math.PI); }
  set rotation(v: number) {
    const target = normDeg(num(v)) * Math.PI / 180;
    const delta = target - this._skewY;
    this._skewY += delta; this._skewX += delta;
    this._scriptTransformed = true;
  }
  get alpha() { return this._color.alphaMultiplier; }
  set alpha(v: number) { this._color.alphaMultiplier = Math.max(0, Math.min(1, num(v))); this._scriptTransformed = true; }
  get visible() { return this._visible; }
  set visible(v: boolean) { this._visible = !!v; }
  get mask() { return this._mask; }
  set mask(m: DisplayObject | null) {
    if (this._mask) this._mask._isMaskFor--;
    this._mask = m;
    if (m) m._isMaskFor++;
  }
  get transform(): Transform { return new Transform(this); }
  set transform(t: Transform) { this._setMatrix(t.matrix); this._setColor(t.colorTransform); }

  get width() { const r = this.getBounds(this._parent ?? this); return r.width; }
  set width(v: number) {
    const local = this._localBounds();
    if (local.width > 0) { this._sx = num(v) / local.width * Math.sign(this._sx || 1); this._scriptTransformed = true; }
  }
  get height() { const r = this.getBounds(this._parent ?? this); return r.height; }
  set height(v: number) {
    const local = this._localBounds();
    if (local.height > 0) { this._sy = num(v) / local.height * Math.sign(this._sy || 1); this._scriptTransformed = true; }
  }

  get mouseX() { return this.globalToLocal(new Point(host()?.mouse.x ?? 0, host()?.mouse.y ?? 0)).x; }
  get mouseY() { return this.globalToLocal(new Point(host()?.mouse.x ?? 0, host()?.mouse.y ?? 0)).y; }

  /** @internal */ _matrix(): Matrix {
    return new Matrix(
      this._sx * Math.cos(this._skewY), this._sx * Math.sin(this._skewY),
      -this._sy * Math.sin(this._skewX), this._sy * Math.cos(this._skewX),
      this._x, this._y,
    );
  }
  /** @internal */ _getMatrix() { return this._matrix(); }
  /** @internal */ _setMatrix(m: Matrix) { this._setRawMatrix(m.a, m.b, m.c, m.d, m.tx, m.ty); this._scriptTransformed = true; }
  /** @internal */ _setRawMatrix(a: number, b: number, c: number, d: number, tx: number, ty: number) {
    this._x = tx; this._y = ty;
    this._sx = Math.hypot(a, b); this._sy = Math.hypot(c, d);
    this._skewY = Math.atan2(b, a); this._skewX = Math.atan2(-c, d);
  }
  /** @internal */ _getColor() { return this._color.clone(); }
  /** @internal */ _setColor(c: ColorTransform) { this._color = c.clone(); this._scriptTransformed = true; }
  /** @internal */ _colorRef() { return this._color; }
  /** @internal */ _concatenatedMatrix(): Matrix {
    const m = this._matrix();
    for (let p = this._parent; p && !(p instanceof Stage); p = p._parent) m.concat(p._matrix());
    return m;
  }

  /** @internal timeline update for an existing placement */
  _applyTimeline(item: Frame['display'][number]) {
    if (this._scriptTransformed) return;
    const m = item.matrix;
    this._setRawMatrix(m.a, m.b, m.c, m.d, m.tx / TWIPS, m.ty / TWIPS);
    this._color = item.colorTransform ? toColorTransform(item.colorTransform) : new ColorTransform();
    this._clipDepth = item.clipDepth != null ? item.clipDepth + TIMELINE_DEPTH_OFFSET : undefined;
  }

  // -- coordinates and bounds
  localToGlobal(p: Point): Point { return this._concatenatedMatrix().transformPoint(p); }
  globalToLocal(p: Point): Point { const m = this._concatenatedMatrix(); m.invert(); return m.transformPoint(p); }
  /** @internal bounds in own coordinate space */
  _localBounds(): Rectangle { return new Rectangle(); }
  getBounds(space: DisplayObject | null): Rectangle {
    const local = this._localBounds();
    if (local.isEmpty() && !(this instanceof DisplayObjectContainer)) return new Rectangle(this.x, this.y, 0, 0);
    const toGlobal = this._concatenatedMatrix();
    const m = toGlobal.clone();
    if (space) { const inv = space._concatenatedMatrix(); inv.invert(); m.concat(inv); }
    return transformRect(m, local);
  }
  getRect(space: DisplayObject | null) { return this.getBounds(space); }
  hitTestPoint(x: number, y: number, _shapeFlag = false): boolean {
    if (!this.stage && !(this instanceof Stage)) return false;
    return this.getBounds(null).contains(x, y);
  }
  hitTestObject(other: DisplayObject): boolean {
    const a = this.getBounds(null), b = other.getBounds(null);
    return a.intersects(b);
  }

  /** @internal drawn by the player before children */
  _drawSelf(_ctx: CanvasRenderingContext2D, _h: DisplayHost) {}

  toString() { return `[object ${this.constructor.name || 'DisplayObject'}]`; }
}

export class InteractiveObject extends DisplayObject {
  mouseEnabled = true;
  doubleClickEnabled = false;
  tabEnabled = false;
  tabIndex = -1;
  focusRect: unknown = null;
  contextMenu: unknown = null;
}

// ------------------------------------------------- DisplayObjectContainer --

export class DisplayObjectContainer extends InteractiveObject {
  /** @internal */ _children: DisplayObject[] = [];
  mouseChildren = true;
  tabChildren = true;

  get numChildren() { return this._children.length; }

  addChild<T extends DisplayObject>(child: T): T {
    return this.addChildAt(child, this._children.length - (child._parent === this ? 1 : 0));
  }

  addChildAt<T extends DisplayObject>(child: T, index: number): T {
    if (!(child instanceof DisplayObject)) throw new TypeError('addChild: parameter child must be a DisplayObject.');
    if (child === (this as DisplayObject) || (child instanceof DisplayObjectContainer && child.contains(this))) {
      throw new ArgumentErrorImpl('An object cannot be added as a child of itself or one of its children.');
    }
    if (index < 0 || index > this._children.length) throw new RangeError(`addChildAt: index ${index} is out of bounds.`);
    if (child._parent === this) { this.setChildIndex(child, Math.min(index, this._children.length - 1)); return child; }
    if (child._parent) child._parent.removeChild(child);
    const maxDepth = this._children.reduce((m, c) => Math.max(m, c._depth), -1);
    child._depth = Math.max(0, maxDepth + 1);
    this._children.splice(index, 0, child);
    child._parent = this;
    child._announced = true;
    child.dispatchEvent(new Event(Event.ADDED, true));
    if (this.stage) dispatchStageEvent(child, Event.ADDED_TO_STAGE);
    return child;
  }

  removeChild<T extends DisplayObject>(child: T): T {
    if (child._parent !== this) throw new ArgumentErrorImpl('The supplied DisplayObject must be a child of the caller.');
    child.dispatchEvent(new Event(Event.REMOVED, true));
    if (this.stage) dispatchStageEvent(child, Event.REMOVED_FROM_STAGE);
    this._detach(child);
    return child;
  }

  removeChildAt(index: number): DisplayObject {
    const child = this._children[index];
    if (!child) throw new RangeError(`removeChildAt: index ${index} is out of bounds.`);
    return this.removeChild(child);
  }

  removeChildren(begin = 0, end = 0x7fffffff) {
    for (const child of this._children.slice(begin, end + 1)) this.removeChild(child);
  }

  getChildAt(index: number): DisplayObject {
    const child = this._children[index];
    if (!child) throw new RangeError(`getChildAt: index ${index} is out of bounds.`);
    return child;
  }
  getChildByName(name: string): DisplayObject | null { return this._children.find((c) => c.name === name) ?? null; }
  getChildIndex(child: DisplayObject): number {
    const i = this._children.indexOf(child);
    if (i < 0) throw new ArgumentErrorImpl('The supplied DisplayObject must be a child of the caller.');
    return i;
  }
  setChildIndex(child: DisplayObject, index: number) {
    const i = this.getChildIndex(child);
    if (index < 0 || index >= this._children.length) throw new RangeError(`setChildIndex: index ${index} is out of bounds.`);
    this._children.splice(i, 1);
    this._children.splice(index, 0, child);
  }
  swapChildren(a: DisplayObject, b: DisplayObject) { this.swapChildrenAt(this.getChildIndex(a), this.getChildIndex(b)); }
  swapChildrenAt(i: number, j: number) {
    const c = this._children;
    if (!c[i] || !c[j]) throw new RangeError('swapChildrenAt: index out of bounds.');
    [c[i], c[j]] = [c[j], c[i]];
    [c[i]._depth, c[j]._depth] = [c[j]._depth, c[i]._depth];
  }
  contains(child: DisplayObject | null): boolean {
    for (let n: DisplayObject | null = child; n; n = n._parent) if (n === this) return true;
    return false;
  }
  getObjectsUnderPoint(p: Point): DisplayObject[] {
    const out: DisplayObject[] = [];
    const visit = (o: DisplayObject) => {
      if (!(o instanceof DisplayObjectContainer)) { if (o.hitTestPoint(p.x, p.y)) out.push(o); return; }
      o._children.forEach(visit);
    };
    this._children.forEach(visit);
    return out;
  }
  areInaccessibleObjectsUnderPoint() { return false; }

  /** @internal insert a timeline child by depth, without events */
  _attachAtDepth(child: DisplayObject, depth: number) {
    child._depth = depth;
    child._parent = this;
    const i = this._children.findIndex((c) => c._depth > depth);
    if (i < 0) this._children.push(child); else this._children.splice(i, 0, child);
  }
  /** @internal remove without events */
  _detach(child: DisplayObject) {
    const i = this._children.indexOf(child);
    if (i >= 0) this._children.splice(i, 1);
    child._parent = null;
    child._announced = false;
    const self = this as unknown as Record<string, unknown>;
    if (child._placedAt != null && self[child.name] === child && isPlainSlot(this, child.name)) self[child.name] = null;
  }
  /** @internal declared stage instances become properties of the parent */
  _bindStageInstances() {
    const self = this as unknown as Record<string, unknown>;
    for (const child of this._children) {
      if (child._placedAt == null || !child.name || child.name.startsWith('instance')) continue;
      if (isPlainSlot(this, child.name)) self[child.name] = child;
    }
  }

  /** @internal */
  _localBounds(): Rectangle {
    let r = this._ownBounds();
    for (const child of this._children) {
      if (child._isMaskFor > 0 || child._clipDepth != null) continue;
      const cb = child._localBounds();
      if (cb.isEmpty()) continue;
      r = r.union(transformRect(child._matrix(), cb));
    }
    return r;
  }
  /** @internal content drawn by the container itself (graphics) */
  _ownBounds(): Rectangle { return new Rectangle(); }
}

/** True when obj[name] may be assigned without clobbering a method/accessor. */
function isPlainSlot(obj: object, name: string) {
  let proto: object | null = Object.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc) return false;
    proto = Object.getPrototypeOf(proto);
  }
  return true;
}

// ---------------------------------------------------------------- Graphics --

type GraphicsCommand =
  | { op: 'fill'; color: number; alpha: number }
  | { op: 'line'; width: number; color: number; alpha: number }
  | { op: 'end' }
  | { op: 'move'; x: number; y: number }
  | { op: 'lineTo'; x: number; y: number }
  | { op: 'curve'; cx: number; cy: number; x: number; y: number }
  | { op: 'cubic'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { op: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { op: 'ellipse'; x: number; y: number; w: number; h: number };

export class Graphics {
  /** @internal */ _cmds: GraphicsCommand[] = [];
  private _bounds = new Rectangle();
  private _lineWidth = 0;

  clear() { this._cmds = []; this._bounds = new Rectangle(); this._lineWidth = 0; }
  beginFill(color = 0, alpha = 1) { this._cmds.push({ op: 'fill', color, alpha }); }
  beginGradientFill(_type: string, colors: number[], alphas: number[]) { this._cmds.push({ op: 'fill', color: colors?.[0] ?? 0, alpha: alphas?.[0] ?? 1 }); }
  beginBitmapFill() { this._cmds.push({ op: 'fill', color: 0x808080, alpha: 1 }); }
  endFill() { this._cmds.push({ op: 'end' }); }
  lineStyle(thickness?: number, color = 0, alpha = 1) {
    this._lineWidth = thickness == null || Number.isNaN(thickness) ? 0 : Math.max(thickness, 0.05);
    this._cmds.push({ op: 'line', width: this._lineWidth, color, alpha: thickness == null ? 0 : alpha });
  }
  lineGradientStyle() {}
  moveTo(x: number, y: number) { this._cmds.push({ op: 'move', x, y }); this._grow(x, y); }
  lineTo(x: number, y: number) { this._cmds.push({ op: 'lineTo', x, y }); this._grow(x, y); }
  curveTo(cx: number, cy: number, x: number, y: number) { this._cmds.push({ op: 'curve', cx, cy, x, y }); this._grow(cx, cy); this._grow(x, y); }
  cubicCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    this._cmds.push({ op: 'cubic', c1x, c1y, c2x, c2y, x, y }); this._grow(c1x, c1y); this._grow(c2x, c2y); this._grow(x, y);
  }
  drawRect(x: number, y: number, w: number, h: number) { this._cmds.push({ op: 'rect', x, y, w, h, r: 0 }); this._grow(x, y); this._grow(x + w, y + h); }
  drawRoundRect(x: number, y: number, w: number, h: number, ew: number, _eh?: number) {
    this._cmds.push({ op: 'rect', x, y, w, h, r: (ew ?? 0) / 2 }); this._grow(x, y); this._grow(x + w, y + h);
  }
  drawCircle(x: number, y: number, r: number) { this.drawEllipse(x - r, y - r, r * 2, r * 2); }
  drawEllipse(x: number, y: number, w: number, h: number) { this._cmds.push({ op: 'ellipse', x, y, w, h }); this._grow(x, y); this._grow(x + w, y + h); }
  copyFrom(other: Graphics) { this._cmds = [...other._cmds]; this._bounds = other._bounds.clone(); }

  private _grow(x: number, y: number) {
    const pad = this._lineWidth / 2;
    this._bounds = this._bounds.union(new Rectangle(x - pad, y - pad, pad * 2 || 0.0001, pad * 2 || 0.0001));
  }
  /** @internal */ _getBounds() { return this._cmds.length ? this._bounds.clone() : new Rectangle(); }

  /** @internal */ _draw(ctx: CanvasRenderingContext2D) {
    if (!this._cmds.length) return;
    let fill: string | null = null;
    let stroke: { style: string; width: number } | null = null;
    let open = false;
    const flush = () => {
      if (!open) return;
      if (fill) { ctx.fillStyle = fill; ctx.fill('evenodd'); }
      if (stroke) { ctx.strokeStyle = stroke.style; ctx.lineWidth = stroke.width; ctx.stroke(); }
      open = false;
    };
    const begin = () => { if (!open) { ctx.beginPath(); open = true; } };
    for (const c of this._cmds) {
      switch (c.op) {
        case 'fill': flush(); fill = rgba(c.color, c.alpha); break;
        case 'end': flush(); fill = null; break;
        case 'line': flush(); stroke = c.alpha > 0 ? { style: rgba(c.color, c.alpha), width: c.width } : null; break;
        case 'move': begin(); ctx.moveTo(c.x, c.y); break;
        case 'lineTo': begin(); ctx.lineTo(c.x, c.y); break;
        case 'curve': begin(); ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y); break;
        case 'cubic': begin(); ctx.bezierCurveTo(c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y); break;
        case 'rect':
          begin();
          if (c.r > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(c.x, c.y, c.w, c.h, c.r);
          else ctx.rect(c.x, c.y, c.w, c.h);
          break;
        case 'ellipse':
          begin();
          ctx.moveTo(c.x + c.w, c.y + c.h / 2);
          ctx.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
          break;
      }
    }
    flush();
  }
}

// ------------------------------------------------------------ Shape & co --

/** A SWF shape/bitmap/static-text character, or a script-drawn Shape. */
export class Shape extends DisplayObject {
  readonly graphics = new Graphics();
  /** @internal */ _localBounds(): Rectangle {
    const own = characterBounds(this._symbol);
    return own.union(this.graphics._getBounds());
  }
  /** @internal */ _drawSelf(ctx: CanvasRenderingContext2D, h: DisplayHost) {
    if (typeof this._symbol === 'number') {
      ctx.save();
      ctx.scale(1 / TWIPS, 1 / TWIPS);
      h.drawCharacter(ctx, this._symbol);
      ctx.restore();
    }
    this.graphics._draw(ctx);
  }
}

export class StaticText extends Shape {
  get text(): string { return ''; }
}

export class Sprite extends DisplayObjectContainer {
  readonly graphics = new Graphics();
  buttonMode = false;
  useHandCursor = true;
  hitArea: Sprite | null = null;
  soundTransform: unknown = null;
  /** @internal */ _timeline: Timeline | undefined = undefined;

  constructor() {
    super();
    // Sprites linked to a symbol get their (single) frame's contents; a
    // MovieClip does the same from its own constructor with playback added.
    if (!this._isMovieClip && this._symbol != null) {
      this._timeline = host()?.timelineFor(this._symbol);
      if (this._timeline) reconcileTimeline(this, this._timeline, 0);
    }
  }

  /** @internal */ get _isMovieClip() { return false; }

  get dropTarget(): DisplayObject | null { return null; }
  startDrag(lockCenter = false, bounds: Rectangle | null = null) {
    (host() as unknown as { startDrag?: (o: Sprite, l: boolean, b: Rectangle | null) => void } | null)?.startDrag?.(this, lockCenter, bounds);
  }
  stopDrag() { (host() as unknown as { stopDrag?: () => void } | null)?.stopDrag?.(); }

  /** @internal */ _ownBounds() { return this.graphics._getBounds(); }
  /** @internal */ _drawSelf(ctx: CanvasRenderingContext2D) { this.graphics._draw(ctx); }
}

// --------------------------------------------------------------- MovieClip --

export class FrameLabel extends EventDispatcher {
  constructor(readonly name: string, readonly frame: number) { super(); }
}

export class Scene {
  constructor(readonly name: string, readonly labels: FrameLabel[], readonly numFrames: number) {}
}

export class MovieClip extends Sprite {
  enabled = true;
  trackAsMenu = false;
  /** @internal 0-based */ _frame = 0;
  /** @internal */ _playing = true;
  /** @internal */ _scripts = new Map<number, () => unknown>();
  /** @internal */ _slots = new Map<number, { obj: DisplayObject | null; placedAt: number; characterId: number }>();
  private _gotoDepth = 0;

  constructor() {
    super();
    const h = host();
    if (this._symbol != null && h) this._timeline = h.timelineFor(this._symbol);
    if (this._timeline) {
      reconcileTimeline(this, this._timeline, 0);
      h?.frameEntered(this, this._timeline.frames[0]);
    }
    h?.queueFrameScript(this);
  }

  /** @internal */ get _isMovieClip() { return true; }

  get currentFrame() { return this._frame + 1; }
  get totalFrames() { return Math.max(1, this._timeline?.frameCount ?? 1); }
  get framesLoaded() { return this.totalFrames; }
  get isPlaying() { return this._playing; }
  get currentFrameLabel(): string | null { return this._timeline?.frames[this._frame]?.label ?? null; }
  get currentLabel(): string | null {
    const frames = this._timeline?.frames ?? [];
    for (let i = this._frame; i >= 0; i--) if (frames[i]?.label) return frames[i].label!;
    return null;
  }
  get currentLabels(): FrameLabel[] {
    return (this._timeline?.frames ?? []).filter((f) => f.label).map((f) => new FrameLabel(f.label!, f.index + 1));
  }
  get currentScene() { return new Scene('Scene 1', this.currentLabels, this.totalFrames); }
  get scenes() { return [this.currentScene]; }

  play() { this._playing = true; }
  stop() { this._playing = false; }
  gotoAndPlay(frame: number | string, _scene?: string) { this._playing = true; this._goto(frame); }
  gotoAndStop(frame: number | string, _scene?: string) { this._playing = false; this._goto(frame); }
  nextFrame() { this._playing = false; if (this._frame + 1 < this.totalFrames) this._goto(this._frame + 2); }
  prevFrame() { this._playing = false; if (this._frame > 0) this._goto(this._frame); }
  nextScene() {}
  prevScene() {}

  /** addFrameScript(frameIndex0, fn, frameIndex1, fn, …); a null fn removes the script. */
  addFrameScript(...args: unknown[]) {
    for (let i = 0; i + 1 < args.length; i += 2) {
      const index = Number(args[i]);
      const fn = args[i + 1];
      if (typeof fn === 'function') this._scripts.set(index, fn as () => unknown);
      else this._scripts.delete(index);
    }
  }

  /** @internal resolve a 1-based frame number or a label to a 0-based index */
  _resolveFrame(frame: number | string): number {
    if (typeof frame === 'number' || (typeof frame === 'string' && /^\s*\d+\s*$/.test(frame) && !this._labelIndex(frame))) {
      const n = Math.floor(Number(frame));
      return Math.max(0, Math.min(this.totalFrames - 1, n - 1));
    }
    const i = this._labelIndex(String(frame));
    if (i == null) throw new ArgumentErrorImpl(`Frame label ${String(frame)} not found in scene Scene 1.`);
    return i;
  }
  private _labelIndex(label: string): number | undefined {
    const f = this._timeline?.frames.find((fr) => fr.label === label);
    return f?.index;
  }

  /** @internal */
  _goto(frame: number | string) {
    const target = this._resolveFrame(frame);
    if (target === this._frame) return;
    this._enterFrame(target);
    // AS3 runs the destination frame's script as part of the goto.
    if (this._gotoDepth < 16) {
      this._gotoDepth++;
      try { this._runFrameScript(); } finally { this._gotoDepth--; }
    }
  }

  /** @internal advance one frame (called by the player for playing clips) */
  _advance(): boolean {
    if (!this._playing || this.totalFrames <= 1) return false;
    this._enterFrame((this._frame + 1) % this.totalFrames);
    host()?.queueFrameScript(this);
    return true;
  }

  /** @internal */
  _enterFrame(index: number) {
    this._frame = index;
    if (!this._timeline) return;
    reconcileTimeline(this, this._timeline, index);
    host()?.frameEntered(this, this._timeline.frames[index]);
  }

  /** @internal run the script attached to the current frame, if any */
  _runFrameScript() {
    const fn = this._scripts.get(this._frame);
    if (fn) runtime.guard(() => fn.call(this), `frame ${this._frame + 1} script of ${this.name}`);
  }
}

/** Reconcile a container's timeline children with the snapshot of `index`. */
function reconcileTimeline(clip: Sprite, timeline: Timeline, index: number) {
  const frame = timeline.frames[Math.max(0, Math.min(index, timeline.frames.length - 1))];
  if (!frame) return;
  const slots = clip instanceof MovieClip ? clip._slots : new Map<number, { obj: DisplayObject | null; placedAt: number; characterId: number }>();
  const wanted = new Map(frame.display.map((item) => [item.depth, item]));

  for (const [depth, slot] of [...slots]) {
    const item = wanted.get(depth);
    if (item && item.startFrame === slot.placedAt && item.characterId === slot.characterId) continue;
    slots.delete(depth);
    const obj = slot.obj;
    if (obj && obj._parent === clip && obj._placedAt === slot.placedAt) clip.removeChild(obj);
  }

  for (const item of frame.display) {
    const slot = slots.get(item.depth);
    if (slot) {
      if (slot.obj && slot.obj._parent === clip) slot.obj._applyTimeline(item);
      continue;
    }
    const obj = instantiateCharacter(item.characterId, {
      parent: clip, depth: item.depth, name: item.name, placedAt: item.startFrame,
      matrix: item.matrix, color: item.colorTransform, clipDepth: item.clipDepth,
    });
    slots.set(item.depth, { obj, placedAt: item.startFrame, characterId: item.characterId });
    if (obj && item.name && isPlainSlot(clip, item.name)) (clip as unknown as Record<string, unknown>)[item.name] = obj;
  }
}

// ------------------------------------------------------------ SimpleButton --

export class SimpleButton extends InteractiveObject {
  upState: DisplayObject | null = null;
  overState: DisplayObject | null = null;
  downState: DisplayObject | null = null;
  hitTestState: DisplayObject | null = null;
  enabled = true;
  useHandCursor = true;
  trackAsMenu = false;
  soundTransform: unknown = null;
  /** @internal 'up' | 'over' | 'down' */ _state: 'up' | 'over' | 'down' = 'up';

  constructor(upState: DisplayObject | null = null, overState: DisplayObject | null = null, downState: DisplayObject | null = null, hitTestState: DisplayObject | null = null) {
    super();
    const tl = this._symbol != null ? host()?.timelineFor(this._symbol) : undefined;
    if (tl) {
      const build = (i: number) => {
        const holder = new Sprite();
        if (tl.frames[i]) reconcileTimeline(holder, tl, i);
        return holder;
      };
      this.upState = build(0); this.overState = build(1); this.downState = build(2); this.hitTestState = build(3);
    }
    if (upState) this.upState = upState;
    if (overState) this.overState = overState;
    if (downState) this.downState = downState;
    if (hitTestState) this.hitTestState = hitTestState;
  }

  /** @internal */ _states() { return [this.upState, this.overState, this.downState, this.hitTestState]; }
  /** @internal */ _current(): DisplayObject | null {
    return (this._state === 'down' ? this.downState : this._state === 'over' ? this.overState : this.upState) ?? this.upState;
  }
  /** @internal */ _localBounds(): Rectangle {
    const s = this._current();
    return s ? transformRect(s._matrix(), s._localBounds()) : new Rectangle();
  }
  /** @internal */ _hitBounds(): Rectangle {
    const s = this.hitTestState ?? this.upState;
    return s ? transformRect(s._matrix(), s._localBounds()) : new Rectangle();
  }
}

// ---------------------------------------------------------- Bitmap / data --

export class BitmapData {
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  /** @internal */ _canvas: HTMLCanvasElement | null = null;
  /** @internal */ _image: CanvasImageSource | null = null;
  /** @internal */ _symbol: number | undefined;

  constructor(width = 0, height = 0, transparent = true, fillColor = 0xffffffff) {
    const h = host();
    const symbol = h?.symbolForClass(new.target);
    this._symbol = typeof symbol === 'number' ? symbol : undefined;
    const b = this._symbol != null ? characterBounds(this._symbol) : null;
    this.width = b && !b.isEmpty() ? b.width : width;
    this.height = b && !b.isEmpty() ? b.height : height;
    this.transparent = transparent;
    if (this._symbol == null && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, this.width); canvas.height = Math.max(1, this.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = rgba(fillColor & 0xffffff, transparent ? ((fillColor >>> 24) & 255) / 255 : 1);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this._canvas = canvas;
      }
    }
  }
  get rect() { return new Rectangle(0, 0, this.width, this.height); }
  /** @internal */ _source(): CanvasImageSource | null {
    if (this._canvas) return this._canvas;
    if (this._symbol != null) return host()?.characterImage(this._symbol) ?? null;
    return this._image;
  }
  fillRect(r: Rectangle, color: number) {
    const ctx = this._canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(r.x, r.y, r.width, r.height);
    ctx.fillStyle = rgba(color & 0xffffff, this.transparent ? ((color >>> 24) & 255) / 255 : 1);
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  getPixel(x: number, y: number) { return this.getPixel32(x, y) & 0xffffff; }
  getPixel32(x: number, y: number) {
    const d = this._canvas?.getContext('2d')?.getImageData(x, y, 1, 1).data;
    return d ? ((d[3] << 24) | (d[0] << 16) | (d[1] << 8) | d[2]) >>> 0 : 0;
  }
  setPixel(x: number, y: number, color: number) { this.fillRect(new Rectangle(x, y, 1, 1), 0xff000000 | color); }
  setPixel32(x: number, y: number, color: number) { this.fillRect(new Rectangle(x, y, 1, 1), color); }
  copyPixels(source: BitmapData, rect: Rectangle, dest: Point) {
    const src = source._source();
    if (src) this._canvas?.getContext('2d')?.drawImage(src, rect.x, rect.y, rect.width, rect.height, dest.x, dest.y, rect.width, rect.height);
  }
  draw(source: BitmapData | DisplayObject) {
    const ctx = this._canvas?.getContext('2d');
    if (!ctx) return;
    if (source instanceof BitmapData) { const s = source._source(); if (s) ctx.drawImage(s, 0, 0); return; }
    (host() as unknown as { drawTo?: (c: CanvasRenderingContext2D, o: DisplayObject) => void } | null)?.drawTo?.(ctx, source);
  }
  clone() { const c = new BitmapData(this.width, this.height, this.transparent, 0); c.copyPixels(this, this.rect, new Point()); return c; }
  lock() {}
  unlock() {}
  dispose() { this._canvas = null; }
}

export class Bitmap extends DisplayObject {
  bitmapData: BitmapData | null;
  pixelSnapping: string;
  smoothing: boolean;
  constructor(bitmapData: BitmapData | null = null, pixelSnapping = 'auto', smoothing = false) {
    super();
    this.bitmapData = bitmapData;
    this.pixelSnapping = pixelSnapping;
    this.smoothing = smoothing;
  }
  /** @internal */ _localBounds() { return this.bitmapData ? new Rectangle(0, 0, this.bitmapData.width, this.bitmapData.height) : new Rectangle(); }
  /** @internal */ _drawSelf(ctx: CanvasRenderingContext2D) {
    const src = this.bitmapData?._source();
    if (src) { try { ctx.drawImage(src, 0, 0, this.bitmapData!.width, this.bitmapData!.height); } catch { /* not decoded yet */ } }
  }
}

// -------------------------------------------------------------------- Stage --

export class Stage extends DisplayObjectContainer {
  scaleMode = 'showAll';
  align = '';
  quality = 'high';
  displayState = 'normal';
  showDefaultContextMenu = true;
  stageFocusRect = true;
  color = 0xffffff;
  /** @internal */ _width: number;
  /** @internal */ _height: number;
  /** @internal */ _frameRate: number;
  /** @internal */ _focus: InteractiveObject | null = null;
  /** @internal */ _onFrameRate: ((fps: number) => void) | null = null;

  constructor(width = 550, height = 400, frameRate = 24) {
    super();
    this._width = width; this._height = height; this._frameRate = frameRate;
    this.name = 'stage';
  }
  get stageWidth() { return this._width; }
  get stageHeight() { return this._height; }
  get fullScreenWidth() { return this._width; }
  get fullScreenHeight() { return this._height; }
  get frameRate() { return this._frameRate; }
  set frameRate(v: number) { this._frameRate = Math.max(0.01, Math.min(1000, num(v))); this._onFrameRate?.(this._frameRate); }
  get focus() { return this._focus; }
  set focus(o: InteractiveObject | null) { this._focus = o; }
  invalidate() {}
  /** @internal */ get _eventParent(): EventDispatcher | null { return null; }
}

// --------------------------------------------------------------- LoaderInfo --

export class LoaderInfo extends EventDispatcher {
  readonly parameters: Record<string, string> = {};
  readonly url = 'file:///game.swf';
  readonly loaderURL = 'file:///game.swf';
  readonly contentType = 'application/x-shockwave-flash';
  get bytesLoaded() { return 1; }
  get bytesTotal() { return 1; }
  get frameRate() { return host()?.stage.frameRate ?? 24; }
  get width() { return host()?.stage.stageWidth ?? 0; }
  get height() { return host()?.stage.stageHeight ?? 0; }
  get content() { return host()?.root ?? null; }
  get swfVersion() { return 10; }
  get actionScriptVersion() { return 3; }
  get applicationDomain() { return { getDefinition: (n: string) => resolveDefinition(n), hasDefinition: (n: string) => resolveDefinition(n) != null }; }
}
let loaderInfoInstance: LoaderInfo | null = null;
let loaderInfoOwner: unknown = null;
function loaderInfoSingleton() {
  if (loaderInfoOwner !== runtime.player) { loaderInfoInstance = new LoaderInfo(); loaderInfoOwner = runtime.player; }
  return loaderInfoInstance!;
}
function resolveDefinition(name: string) {
  return (runtime.player as unknown as { getDefinition?: (n: string) => unknown } | null)?.getDefinition?.(name);
}

// ------------------------------------------------------------------ helpers --

export class ArgumentErrorImpl extends Error {
  constructor(message = '') { super(message); this.name = 'ArgumentError'; }
}

function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function normDeg(d: number) { let r = d % 360; if (r > 180) r -= 360; if (r <= -180) r += 360; return r; }
function rgba(color: number, alpha: number) {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${Math.max(0, Math.min(1, alpha))})`;
}
function toColorTransform(c: NonNullable<Frame['display'][number]['colorTransform']>) {
  return new ColorTransform(c.rm, c.gm, c.bm, c.am, c.ra, c.ga, c.ba, c.aa);
}
export function characterBounds(symbol: SymbolRef | undefined): Rectangle {
  if (typeof symbol !== 'number') return new Rectangle();
  const b = host()?.doc.characters.get(symbol)?.bounds;
  return b ? new Rectangle(b.xMin / TWIPS, b.yMin / TWIPS, (b.xMax - b.xMin) / TWIPS, (b.yMax - b.yMin) / TWIPS) : new Rectangle();
}
export function transformRect(m: Matrix, r: Rectangle): Rectangle {
  if (r.isEmpty()) return new Rectangle(m.tx, m.ty, 0, 0);
  const pts = [[r.x, r.y], [r.right, r.y], [r.right, r.bottom], [r.x, r.bottom]]
    .map(([x, y]) => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return new Rectangle(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
}
