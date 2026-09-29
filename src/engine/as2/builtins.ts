// Flash 7 built-in classes and objects for the AS2 player. They are installed
// onto the (initially empty) classes exported by src/runtime/as2 so that the
// transpiled game code – which imports those classes – gets real behaviour.

import * as RT from '../../runtime/as2';
import type { ColorTransform, Rect } from '../../types';
import { identity, invert, apply as applyM, transformRect } from './geom';
import { DEPTH_OFFSET, NODE, TWIPS, nodeOf, type AS2Player, type DisplayNode, type DrawCmd, type Movie } from './player';

export interface BuiltinState {
  globalVolume: number;
  mouseListeners: any[];
  keyListeners: any[];
  duplicate(node: DisplayNode | null, name: string, depth: number, init?: Record<string, unknown> | null): DisplayNode | null;
  removeClip(node: DisplayNode | null): void;
  startDrag(node: DisplayNode | null, lock?: boolean, l?: number, t?: number, r?: number, b?: number): void;
  updateDrag(): void;
  loadMovie(url: string, node: DisplayNode | null, listener?: any, loader?: any): void;
  loadVariables(url: string, node: DisplayNode | null): void;
  unloadMovie(node: DisplayNode | null): void;
  typeInto(node: DisplayNode, code: number, key: string): void;
}

const def = (target: object, props: Record<string, { get?: (this: any) => any; set?: (this: any, v: any) => void } | ((this: any, ...a: any[]) => any)>) => {
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'function') Object.defineProperty(target, k, { value: v, writable: true, configurable: true, enumerable: false });
    // every accessor gets a setter: compiled TS is strict-mode, where writing a getter-only property throws
    else Object.defineProperty(target, k, { get: v.get, set: v.set ?? (() => {}), configurable: true, enumerable: false });
  }
};

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const hex = (n: number) => `#${(Math.max(0, Math.min(0xffffff, Math.floor(n))) >>> 0).toString(16).padStart(6, '0')}`;

export function installBuiltins(p: AS2Player): BuiltinState {
  const N = (o: any): DisplayNode | null => nodeOf(o);
  const state: BuiltinState = {
    globalVolume: 1,
    mouseListeners: [],
    keyListeners: [],
    duplicate, removeClip, startDrag, updateDrag, loadMovie, loadVariables, unloadMovie, typeInto,
  };

  const missingWarned = new Set<string>();

  // ------------------------------------------------------------ helpers
  function nextDepth(node: DisplayNode) {
    let max = -1;
    for (const c of node.children) if (c.depth > max) max = c.depth;
    return max + 1;
  }

  function place(parent: DisplayNode, depth: number) {
    const old = parent.childAtDepth(depth);
    if (old) p.removeNode(old);
  }

  function attachMovie(parent: DisplayNode, linkage: string, name: string, depth: number, init?: Record<string, unknown> | null) {
    const movie = parent.movie;
    let ch = [...movie.doc.characters.values()].find((c) => c.exportName === linkage);
    if (!ch) ch = [...p.movie.doc.characters.values()].find((c) => c.exportName === linkage);
    if (!ch) { p.log('warn', `attachMovie: no symbol exported as "${linkage}"`); return undefined; }
    place(parent, num(depth));
    const node = p.instantiate(movie, ch.id, parent, num(depth), String(name), { initObject: init ?? null });
    p.runQueue();
    return node.obj;
  }

  function createEmpty(parent: DisplayNode, name: string, depth: number) {
    place(parent, num(depth));
    const node = p.instantiate(parent.movie, -1, parent, num(depth), String(name), { kind: 'clip' });
    return node;
  }

  function duplicate(node: DisplayNode | null, name: string, depth: number, init?: Record<string, unknown> | null) {
    if (!node || !node.parent || node === p.root) return null;
    const parent = node.parent;
    place(parent, num(depth));
    const dup = p.instantiate(node.movie, node.characterId, parent, num(depth), String(name), {
      matrix: node.matrix, ct: node.ct, handlers: node.handlers.filter((h) => h.kind === 'onClipEvent' || h.kind === 'on'), initObject: init ?? null,
    });
    dup.visible = node.visible;
    if (node.drawing) dup.drawing = [...node.drawing];
    p.runQueue();
    return dup;
  }

  function removeClip(node: DisplayNode | null) {
    if (!node || node === p.root) return;
    if (node.depth < 0 || node.depth > 2130690045) return; // Flash refuses to remove timeline instances
    p.removeNode(node);
  }

  function startDrag(node: DisplayNode | null, lock?: boolean, l?: number, t?: number, r?: number, b?: number) {
    if (!node) return;
    const parent = node.parent;
    const local = parent ? p.toLocal(parent, p.mouse.x, p.mouse.y) : { x: p.mouse.x * TWIPS, y: p.mouse.y * TWIPS };
    const bounds = l != null && t != null && r != null && b != null ? { xMin: l * TWIPS, yMin: t * TWIPS, xMax: r * TWIPS, yMax: b * TWIPS } : null;
    p.drag = { node, lock: !!lock, dx: lock ? 0 : node.matrix.tx - local.x, dy: lock ? 0 : node.matrix.ty - local.y, bounds };
    node.scriptMoved = true;
    updateDrag();
  }

  function updateDrag() {
    const d = p.drag;
    if (!d || d.node.removed) { p.drag = null; return; }
    const parent = d.node.parent;
    const local = parent ? p.toLocal(parent, p.mouse.x, p.mouse.y) : { x: p.mouse.x * TWIPS, y: p.mouse.y * TWIPS };
    let x = local.x + d.dx, y = local.y + d.dy;
    if (d.bounds) { x = Math.max(d.bounds.xMin, Math.min(d.bounds.xMax, x)); y = Math.max(d.bounds.yMin, Math.min(d.bounds.yMax, y)); }
    d.node.matrix = { ...d.node.matrix, tx: x, ty: y };
  }

  /** loadMovie / MovieClipLoader.loadClip */
  function loadMovie(url: string, node: DisplayNode | null, listeners?: any[], loader?: any) {
    if (!node) return;
    const fire = (name: string, ...args: unknown[]) => {
      for (const l of listeners ?? []) {
        const f = l?.[name];
        if (typeof f === 'function') p.guard(`MovieClipLoader ${name}`, () => f.call(l, node.obj, ...args));
      }
      p.runQueue();
    };
    const u = String(url);
    if (/\.(jpe?g|png|gif)(\?|$)/i.test(u)) {
      p.log('warn', `loadMovie("${u}"): external images are not supported offline`);
    }
    const resolved = p.opts.resolveExternal ? Promise.resolve(p.opts.resolveExternal(u)) : Promise.resolve(null);
    const target = node;
    setTimeout(() => {
      resolved.then((movie) => {
        if (target.removed || p.isDisposedFor(target)) return;
        if (movie) {
          fire('onLoadStart');
          replaceContent(target, movie, u);
          fire('onLoadProgress', 1, 1);
          fire('onLoadComplete', 200);
          p.enqueue(target, `onLoadInit ${u}`, () => fire('onLoadInit'));
          p.runQueue();
          return;
        }
        if ((p.opts.missingExternal ?? 'empty') === 'error') {
          p.log('error', `loadMovie: "${u}" is not available (external SWF missing)`);
          fire('onLoadError', 'URLNotFound', 404);
          return;
        }
        if (!missingWarned.has(u)) {
          missingWarned.add(u);
          p.log('warn', `loadMovie: "${u}" is not available – continuing as if it loaded empty. Add its FFDec export to play this part of the game.`);
        }
        p.missingExternals.add(u);
        fire('onLoadStart');
        replaceContent(target, null, u);
        fire('onLoadProgress', 0, 0);
        fire('onLoadComplete', 200);
        fire('onLoadInit');
      }, (e) => p.log('error', `loadMovie("${u}") failed: ${(e as Error).message}`));
    }, 0);
    void loader;
  }

  /** A loaded movie replaces the clip's content but keeps the clip (and its name / transform). */
  function replaceContent(node: DisplayNode, movie: Movie | null, url: string) {
    for (const c of [...node.children]) p.removeNode(c);
    for (const k of Object.keys(node.obj)) {
      if (!node.children.some((c) => c.name === k)) { try { delete node.obj[k]; } catch { /* ignore */ } }
    }
    node.url = url;
    node.handlers = node.handlers.filter((h) => h.kind === 'onClipEvent');
    node.drawing = null;
    if (!movie) { node.timeline = null; node.frame = 0; return; }
    node.movie = movie;
    node.characterId = 0;
    node.timeline = movie.doc.root;
    node.playing = true;
    const prog = movie.program;
    if (prog) {
      for (const [n, fn] of Object.entries(prog.initByName ?? {})) p.guard(`init action "${n}" (${url})`, () => fn.call(node.obj));
      for (const [id, mod] of Object.entries(prog.timelines)) if (mod.init) p.guard(`init action ${id} (${url})`, () => mod.init!.call(node.obj));
    }
    p.enterFirstFrame(node);
  }

  function unloadMovie(node: DisplayNode | null) {
    if (!node) return;
    for (const c of [...node.children]) p.removeNode(c);
    node.timeline = null;
    node.frame = 0;
  }

  function loadVariables(url: string, node: DisplayNode | null) {
    fetchText(url, 'GET', null).then((txt) => {
      if (txt == null || !node || node.removed) return;
      decodeVars(node.obj, txt);
      p.dispatchClipEvent(node, 'data');
      p.runQueue();
    });
  }

  function fetchText(url: string, method: string, body: string | null): Promise<string | null> {
    if (p.opts.fetchText) return p.opts.fetchText(url, method, body).catch(() => null);
    p.log('warn', `network request not available offline: ${method} ${url}`);
    return Promise.resolve(null);
  }

  function decodeVars(target: any, txt: string) {
    for (const part of txt.split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
      if (k) target[k] = v;
    }
  }

  function typeInto(node: DisplayNode, code: number, key: string) {
    const t = node.text;
    if (!t) return;
    let s = p.getText(t);
    if (code === 8) s = s.slice(0, -1);
    else if (code === 13) { if (!t.multiline) return; s += '\r'; }
    else if (key.length === 1) {
      if (t.maxChars && s.length >= t.maxChars) return;
      if (t.restrict && !new RegExp(`[${t.restrict.replace(/\\/g, '\\\\').replace(/]/g, '\\]')}]`).test(key)) return;
      s += key;
    } else return;
    p.setText(t, s, false);
    if (t.variable) { const { owner, key: k } = p.varTarget(node, t.variable); if (owner) owner[k] = s; }
    const f = node.obj?.onChanged;
    if (typeof f === 'function') p.guard('TextField.onChanged', () => f.call(node.obj, node.obj));
    for (const l of t.listeners) if (typeof l?.onChanged === 'function') p.guard('TextField listener onChanged', () => l.onChanged(node.obj));
    p.runQueue();
  }

  // ------------------------------------------------------------ display object properties
  const px = (v: number) => Math.round(v / TWIPS * 100) / 100;
  const display = {
    _x: { get(this: any) { const n = N(this); return n ? px(n.matrix.tx) : 0; }, set(this: any, v: any) { const n = N(this); if (n && Number.isFinite(+v)) { n.matrix = { ...n.matrix, tx: +v * TWIPS }; n.scriptMoved = true; } } },
    _y: { get(this: any) { const n = N(this); return n ? px(n.matrix.ty) : 0; }, set(this: any, v: any) { const n = N(this); if (n && Number.isFinite(+v)) { n.matrix = { ...n.matrix, ty: +v * TWIPS }; n.scriptMoved = true; } } },
    _xscale: { get(this: any) { const n = N(this); return n ? p.comps(n).xs * 100 : 100; }, set(this: any, v: any) { const n = N(this); if (n && Number.isFinite(+v)) p.setComps(n, { xs: +v / 100 }); } },
    _yscale: { get(this: any) { const n = N(this); return n ? p.comps(n).ys * 100 : 100; }, set(this: any, v: any) { const n = N(this); if (n && Number.isFinite(+v)) p.setComps(n, { ys: +v / 100 }); } },
    _rotation: {
      get(this: any) { const n = N(this); return n ? (p.comps(n).rx * 180) / Math.PI : 0; },
      set(this: any, v: any) {
        const n = N(this); if (!n || !Number.isFinite(+v)) return;
        let deg = +v % 360; if (deg > 180) deg -= 360; if (deg < -180) deg += 360;
        const c = p.comps(n); const r = (deg * Math.PI) / 180;
        p.setComps(n, { rx: r, ry: c.ry + (r - c.rx) });
      },
    },
    _alpha: {
      get(this: any) { const n = N(this); return n?.ct ? n.ct.am * 100 : 100; },
      set(this: any, v: any) { const n = N(this); if (!n || !Number.isFinite(+v)) return; n.ct = { ...(n.ct ?? { rm: 1, gm: 1, bm: 1, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 }), am: +v / 100 }; n.scriptMoved = true; },
    },
    _visible: { get(this: any) { return N(this)?.visible ?? true; }, set(this: any, v: any) { const n = N(this); if (n) n.visible = !!v && v !== 'false' && v !== 0; } },
    _width: {
      get(this: any) { const n = N(this); const b = n ? p.boundsIn(n, n.parent) : null; return b ? px(b.xMax - b.xMin) : 0; },
      set(this: any, v: any) {
        const n = N(this); if (!n || !Number.isFinite(+v)) return;
        if (n.kind === 'text' && n.text) { n.text.bounds = { ...n.text.bounds, xMax: n.text.bounds.xMin + +v * TWIPS }; n.text.lines = null; return; }
        const lb = p.localBounds(n); if (!lb) return;
        const w = lb.xMax - lb.xMin; if (w <= 0) return;
        const c = p.comps(n); const cur = Math.abs(transformRect({ ...identity(), a: c.xs }, lb).xMax - transformRect({ ...identity(), a: c.xs }, lb).xMin);
        p.setComps(n, { xs: cur > 0 ? (c.xs * (+v * TWIPS)) / cur : (+v * TWIPS) / w });
      },
    },
    _height: {
      get(this: any) { const n = N(this); const b = n ? p.boundsIn(n, n.parent) : null; return b ? px(b.yMax - b.yMin) : 0; },
      set(this: any, v: any) {
        const n = N(this); if (!n || !Number.isFinite(+v)) return;
        if (n.kind === 'text' && n.text) { n.text.bounds = { ...n.text.bounds, yMax: n.text.bounds.yMin + +v * TWIPS }; n.text.lines = null; return; }
        const lb = p.localBounds(n); if (!lb) return;
        const h = lb.yMax - lb.yMin; if (h <= 0) return;
        const c = p.comps(n);
        p.setComps(n, { ys: (c.ys ? c.ys : 1) * (+v * TWIPS) / (h * (c.ys || 1)) });
      },
    },
    _name: {
      get(this: any) { const n = N(this); return n === p.root ? '' : n?.name ?? ''; },
      set(this: any, v: any) { const n = N(this); if (!n || n === p.root) return; p.unpublishName(n); n.name = String(v); p.publishName(n); },
    },
    _parent: { get(this: any) { return N(this)?.parent?.obj; } },
    _root: { get() { return p.root.obj; } },
    _level0: { get() { return p.root.obj; } },
    _global: { get() { return RT._global; } },
    _target: { get(this: any) { return N(this)?.slashPath() ?? ''; } },
    _url: { get(this: any) { const n = N(this); return n?.url && n.url !== 'root' ? n.url : p.doc.header.fileName; } },
    _xmouse: { get(this: any) { const n = N(this); return n ? px(p.toLocal(n, p.mouse.x, p.mouse.y).x) : 0; } },
    _ymouse: { get(this: any) { const n = N(this); return n ? px(p.toLocal(n, p.mouse.x, p.mouse.y).y) : 0; } },
    _quality: { get() { return 'HIGH'; } },
    _highquality: { get() { return 1; } },
    _focusrect: { get() { return true; } },
    _soundbuftime: { get() { return 5; } },
    getDepth(this: any) { return N(this)?.depth ?? 0; },
    toString(this: any) { return N(this)?.path() ?? '[object Object]'; },
  };

  // ------------------------------------------------------------ MovieClip
  const mc = RT.MovieClip.prototype as any;
  def(mc, display);
  def(mc, {
    _currentframe: { get(this: any) { return (N(this)?.frame ?? 0) + 1; } },
    _totalframes: { get(this: any) { return N(this)?.totalFrames ?? 1; } },
    _framesloaded: { get(this: any) { return N(this)?.totalFrames ?? 1; } },
    _droptarget: { get() { const t = p.mouseTarget(p.mouse.x, p.mouse.y); return t ? t.slashPath() : ''; } },
    _lockroot: { get() { return false; } },
    play(this: any) { const n = N(this); if (n) n.playing = true; },
    stop(this: any) { const n = N(this); if (n) n.playing = false; },
    nextFrame(this: any) { const n = N(this); if (n) { n.playing = false; p.gotoFrame(n, n.frame + 1); } },
    prevFrame(this: any) { const n = N(this); if (n) { n.playing = false; p.gotoFrame(n, n.frame - 1); } },
    gotoAndStop(this: any, f: any) { const n = N(this); if (!n) return; n.playing = false; const i = p.frameOf(n, f); if (i != null) p.gotoFrame(n, i); },
    gotoAndPlay(this: any, f: any) { const n = N(this); if (!n) return; n.playing = true; const i = p.frameOf(n, f); if (i != null) p.gotoFrame(n, i); },
    attachMovie(this: any, id: any, name: any, depth: any, init?: any) { const n = N(this); return n ? attachMovie(n, String(id), name, depth, init) : undefined; },
    createEmptyMovieClip(this: any, name: any, depth: any) { const n = N(this); return n ? createEmpty(n, name, depth).obj : undefined; },
    createTextField(this: any, name: any, depth: any, x: any, y: any, w: any, h: any) {
      const n = N(this); if (!n) return undefined;
      place(n, num(depth));
      const t = p.instantiate(n.movie, -2, n, num(depth), String(name), { kind: 'text' });
      return makeTextField(t, num(x), num(y), num(w), num(h));
    },
    duplicateMovieClip(this: any, name: any, depth: any, init?: any) { return duplicate(N(this), name, depth, init)?.obj; },
    removeMovieClip(this: any) { removeClip(N(this)); },
    unloadMovie(this: any) { unloadMovie(N(this)); },
    loadMovie(this: any, url: any) { loadMovie(String(url), N(this)); },
    loadVariables(this: any, url: any) { loadVariables(String(url), N(this)); },
    swapDepths(this: any, t: any) {
      const n = N(this); if (!n || !n.parent) return;
      const parent = n.parent;
      let depth: number;
      const other = typeof t === 'number' || typeof t === 'string' && /^-?\d+$/.test(t) ? parent.childAtDepth(num(t)) : N(t);
      if (typeof t === 'number' || (typeof t === 'string' && /^-?\d+$/.test(t))) depth = num(t);
      else if (other && other.parent === parent) depth = other.depth; else return;
      const o = other && other.parent === parent ? other : parent.childAtDepth(depth);
      if (o === n) return;
      parent.children = parent.children.filter((c) => c !== n && c !== o);
      if (o) { o.depth = n.depth; o.scriptMoved = true; o.fromTimeline = o.fromTimeline && o.depth < 0; insertByDepth(parent, o); }
      n.depth = depth; n.scriptMoved = true; if (depth >= 0) n.fromTimeline = false;
      insertByDepth(parent, n);
    },
    getNextHighestDepth(this: any) { const n = N(this); return n ? Math.max(0, nextDepth(n)) : 0; },
    getInstanceAtDepth(this: any, d: any) { return N(this)?.childAtDepth(num(d))?.obj ?? undefined; },
    getBounds(this: any, space?: any) {
      const n = N(this); if (!n) return undefined;
      const b = p.boundsIn(n, space ? N(space) : n);
      return b ? { xMin: px(b.xMin), xMax: px(b.xMax), yMin: px(b.yMin), yMax: px(b.yMax) } : { xMin: 6710886.4, xMax: 6710886.4, yMin: 6710886.4, yMax: 6710886.4 };
    },
    getRect(this: any, space?: any) { return mc.getBounds.call(this, space); },
    localToGlobal(this: any, pt: any) {
      const n = N(this); if (!n || !pt) return;
      const q = applyM(p.globalMatrix(n), num(pt.x) * TWIPS, num(pt.y) * TWIPS); pt.x = px(q.x); pt.y = px(q.y);
    },
    globalToLocal(this: any, pt: any) {
      const n = N(this); if (!n || !pt) return;
      const q = applyM(invert(p.globalMatrix(n)), num(pt.x) * TWIPS, num(pt.y) * TWIPS); pt.x = px(q.x); pt.y = px(q.y);
    },
    hitTest(this: any, a: any, b?: any, shape?: any) {
      const n = N(this); if (!n) return false;
      if (typeof a === 'number' || (b !== undefined && typeof a !== 'object')) return p.hitTestPoint(n, num(a), num(b), !!shape);
      const o = N(a); if (!o) return false;
      const r1 = p.boundsIn(n, null), r2 = p.boundsIn(o, null);
      return !!r1 && !!r2 && r1.xMin <= r2.xMax && r2.xMin <= r1.xMax && r1.yMin <= r2.yMax && r2.yMin <= r1.yMax;
    },
    startDrag(this: any, lock?: any, l?: any, t?: any, r?: any, b?: any) { startDrag(N(this), !!lock, l, t, r, b); },
    stopDrag() { p.drag = null; },
    setMask(this: any, m: any) {
      const n = N(this); if (!n) return;
      if (n.maskedBy) n.maskedBy.mask = null;
      const mn = N(m);
      n.maskedBy = mn; if (mn) mn.mask = n;
    },
    getURL(this: any, url: any, win?: any, method?: any) { RT.getURL(String(url), win, method); },
    getBytesLoaded() { return 1; },
    getBytesTotal() { return 1; },
    getSWFVersion(this: any) { return Number(N(this)?.movie.doc.header.version ?? 7); },
    attachAudio() { /* not supported */ },
    getTextSnapshot() { return undefined; },
    // drawing API
    clear(this: any) { const n = N(this); if (n) n.drawing = []; },
    beginFill(this: any, color: any, alpha?: any) { draw(this, { op: 'fill', color: color == null ? null : hex(num(color)), alpha: alpha == null ? 1 : num(alpha, 100) / 100 }); },
    beginGradientFill(this: any, _t: any, colors: any, alphas: any) { const c = Array.isArray(colors) ? colors[0] : 0; const a = Array.isArray(alphas) ? alphas[0] : 100; draw(this, { op: 'fill', color: hex(num(c)), alpha: num(a, 100) / 100 }); },
    lineStyle(this: any, w?: any, color?: any, alpha?: any) { draw(this, { op: 'line', width: w == null ? 0 : num(w) * TWIPS, color: w == null ? null : hex(num(color)), alpha: alpha == null ? 1 : num(alpha, 100) / 100 }); },
    moveTo(this: any, x: any, y: any) { draw(this, { op: 'move', x: num(x) * TWIPS, y: num(y) * TWIPS }); },
    lineTo(this: any, x: any, y: any) { draw(this, { op: 'lineTo', x: num(x) * TWIPS, y: num(y) * TWIPS }); },
    curveTo(this: any, cx: any, cy: any, x: any, y: any) { draw(this, { op: 'curve', cx: num(cx) * TWIPS, cy: num(cy) * TWIPS, x: num(x) * TWIPS, y: num(y) * TWIPS }); },
    endFill(this: any) { draw(this, { op: 'end' }); },
  });
  for (const [k, v] of Object.entries({ enabled: true, useHandCursor: true, tabEnabled: undefined, focusEnabled: undefined, trackAsMenu: false })) {
    Object.defineProperty(mc, k, { value: v, writable: true, configurable: true, enumerable: false });
  }

  function draw(o: any, cmd: DrawCmd) { const n = N(o); if (n) (n.drawing ??= []).push(cmd); }
  function insertByDepth(parent: DisplayNode, n: DisplayNode) {
    const i = parent.children.findIndex((c) => c.depth > n.depth);
    if (i < 0) parent.children.push(n); else parent.children.splice(i, 0, n);
  }

  // ------------------------------------------------------------ Button
  const bt = RT.Button.prototype as any;
  def(bt, display);
  for (const [k, v] of Object.entries({ enabled: true, useHandCursor: true, trackAsMenu: false, tabEnabled: undefined })) {
    Object.defineProperty(bt, k, { value: v, writable: true, configurable: true, enumerable: false });
  }

  // ------------------------------------------------------------ TextField
  function makeTextField(n: DisplayNode, x: number, y: number, w: number, h: number) {
    n.matrix = { ...identity(), tx: x * TWIPS, ty: y * TWIPS };
    n.text = {
      paras: [], html: false, variable: null,
      format: { font: 'Times New Roman', size: 12, color: '#000000', bold: false, italic: false, underline: false, align: 'left' },
      wordWrap: false, multiline: false, border: false, borderColor: '#000000', background: false, backgroundColor: '#ffffff',
      selectable: true, input: false, password: false, maxChars: null, autoSize: 'none',
      bounds: { xMin: 0, yMin: 0, xMax: w * TWIPS, yMax: h * TWIPS }, scroll: 1, lines: null, listeners: [], embedFonts: false, restrict: null,
    };
    return n.obj;
  }
  const T = (o: any) => N(o)?.text ?? null;
  const tfProp = (key: 'wordWrap' | 'multiline' | 'border' | 'background' | 'selectable' | 'password' | 'embedFonts') => ({
    get(this: any) { return T(this)?.[key] ?? false; },
    set(this: any, v: any) { const t = T(this); if (t) { t[key] = !!v; t.lines = null; } },
  });
  const tf = RT.TextField.prototype as any;
  def(tf, display);
  def(tf, {
    text: {
      get(this: any) { const t = T(this); return t ? p.getText(t) : ''; },
      set(this: any, v: any) { const t = T(this); if (!t) return; p.setText(t, v == null ? '' : String(v), false); t.source = undefined; syncVar(this, v); },
    },
    htmlText: {
      get(this: any) { const t = T(this); return t ? (t.html ? t.source ?? p.getHtml(t) : p.getText(t)) : ''; },
      set(this: any, v: any) { const t = T(this); if (!t) return; const s = v == null ? '' : String(v); p.setText(t, s, t.html); t.source = s; syncVar(this, s); },
    },
    html: { get(this: any) { return T(this)?.html ?? false; }, set(this: any, v: any) { const t = T(this); if (t) t.html = !!v; } },
    type: { get(this: any) { return T(this)?.input ? 'input' : 'dynamic'; }, set(this: any, v: any) { const t = T(this); if (t) t.input = String(v) === 'input'; } },
    variable: { get(this: any) { return T(this)?.variable ?? null; }, set(this: any, v: any) { const t = T(this); if (t) t.variable = v == null ? null : String(v); } },
    textColor: {
      get(this: any) { const t = T(this); return t ? parseInt(t.format.color.slice(1), 16) : 0; },
      set(this: any, v: any) { const t = T(this); if (!t) return; t.format.color = hex(num(v)); for (const pa of t.paras) for (const r of pa.runs) r.color = t.format.color; t.lines = null; },
    },
    borderColor: { get(this: any) { const t = T(this); return t ? parseInt(t.borderColor.slice(1), 16) : 0; }, set(this: any, v: any) { const t = T(this); if (t) t.borderColor = hex(num(v)); } },
    backgroundColor: { get(this: any) { const t = T(this); return t ? parseInt(t.backgroundColor.slice(1), 16) : 0xffffff; }, set(this: any, v: any) { const t = T(this); if (t) t.backgroundColor = hex(num(v)); } },
    wordWrap: tfProp('wordWrap'), multiline: tfProp('multiline'), border: tfProp('border'), background: tfProp('background'),
    selectable: tfProp('selectable'), password: tfProp('password'), embedFonts: tfProp('embedFonts'),
    autoSize: { get(this: any) { return T(this)?.autoSize ?? 'none'; }, set(this: any, v: any) { const t = T(this); if (t) t.autoSize = v === true ? 'left' : v === false ? 'none' : String(v); } },
    maxChars: { get(this: any) { return T(this)?.maxChars ?? null; }, set(this: any, v: any) { const t = T(this); if (t) t.maxChars = v == null ? null : num(v); } },
    restrict: { get(this: any) { return T(this)?.restrict ?? null; }, set(this: any, v: any) { const t = T(this); if (t) t.restrict = v == null ? null : String(v); } },
    length: { get(this: any) { const t = T(this); return t ? p.getText(t).length : 0; } },
    textWidth: { get(this: any) { const t = T(this); return t ? Math.max(0, ...p.textLines(t).map((l) => l.width)) : 0; } },
    textHeight: { get(this: any) { const t = T(this); return t ? p.textLines(t).reduce((s, l) => s + l.height, 0) : 0; } },
    scroll: { get(this: any) { return T(this)?.scroll ?? 1; }, set(this: any, v: any) { const t = T(this); if (t) t.scroll = Math.max(1, Math.min(maxScroll(t), Math.floor(num(v, 1)))); } },
    maxscroll: { get(this: any) { const t = T(this); return t ? maxScroll(t) : 1; } },
    bottomScroll: { get(this: any) { const t = T(this); return t ? Math.min(p.textLines(t).length, t.scroll + visibleLines(t) - 1) : 1; } },
    condenseWhite: { get() { return false; } },
    setTextFormat(this: any, a: any, b?: any, c?: any) {
      const t = T(this); if (!t) return;
      const fmt = [a, b, c].find((x) => x && typeof x === 'object'); if (!fmt) return;
      applyFormat(t.format, fmt);
      for (const pa of t.paras) { if (fmt.align) pa.align = fmt.align; for (const r of pa.runs) applyFormat(r, fmt); }
      t.lines = null;
    },
    setNewTextFormat(this: any, fmt: any) { const t = T(this); if (t && fmt) { applyFormat(t.format, fmt); t.lines = null; } },
    getTextFormat(this: any) { const t = T(this); return toTextFormat(t?.format); },
    getNewTextFormat(this: any) { const t = T(this); return toTextFormat(t?.format); },
    replaceSel(this: any, s: any) { const t = T(this); if (t) p.setText(t, p.getText(t) + String(s ?? ''), false); },
    removeTextField(this: any) { removeClip(N(this)); },
    addListener(this: any, l: any) { const t = T(this); if (t && !t.listeners.includes(l)) t.listeners.push(l); return true; },
    removeListener(this: any, l: any) { const t = T(this); if (!t) return false; const i = t.listeners.indexOf(l); if (i >= 0) t.listeners.splice(i, 1); return i >= 0; },
    getFontList() { return ['Arial', 'Comic Sans MS', 'Times New Roman', 'Verdana']; },
  });
  function syncVar(o: any, v: unknown) {
    const n = N(o); const t = n?.text; if (!n || !t?.variable) return;
    const { owner, key } = p.varTarget(n, t.variable); if (owner) owner[key] = v;
  }
  function visibleLines(t: NonNullable<DisplayNode['text']>) {
    const lines = p.textLines(t); const h = (t.bounds.yMax - t.bounds.yMin) / TWIPS - 4;
    let acc = 0, n = 0; for (const l of lines) { acc += l.height; if (acc > h) break; n++; } return Math.max(1, n);
  }
  function maxScroll(t: NonNullable<DisplayNode['text']>) { return Math.max(1, p.textLines(t).length - visibleLines(t) + 1); }
  function applyFormat(dst: any, fmt: any) {
    if (fmt.font != null) dst.font = String(fmt.font);
    if (fmt.size != null) dst.size = num(fmt.size, dst.size);
    if (fmt.color != null) dst.color = hex(num(fmt.color));
    if (fmt.bold != null) dst.bold = !!fmt.bold;
    if (fmt.italic != null) dst.italic = !!fmt.italic;
    if (fmt.underline != null) dst.underline = !!fmt.underline;
    if (fmt.align != null && 'align' in dst) dst.align = String(fmt.align);
    if (fmt.url != null) dst.url = fmt.url;
  }
  function toTextFormat(f: any) {
    const tfm = new RT.TextFormat(f?.font, f?.size, f ? parseInt(String(f.color).slice(1), 16) : 0, f?.bold, f?.italic, f?.underline);
    tfm.align = f?.align ?? 'left';
    return tfm;
  }

  // ------------------------------------------------------------ broadcaster helper
  const broadcaster = (o: any, list: any[]) => {
    o._listeners = list;
    o.addListener = (l: any) => { if (!list.includes(l)) list.push(l); return true; };
    o.removeListener = (l: any) => { const i = list.indexOf(l); if (i >= 0) list.splice(i, 1); return i >= 0; };
    o.broadcastMessage = (m: string, ...args: unknown[]) => { for (const l of [...list]) if (typeof l?.[m] === 'function') l[m](...args); };
    return o;
  };
  Object.assign(RT.AsBroadcaster, {
    initialize(o: any) { if (o) broadcaster(o, []); },
  });

  // ------------------------------------------------------------ Key / Mouse / Stage / Selection
  broadcaster(RT.Key, state.keyListeners);
  Object.assign(RT.Key, {
    isDown: (c: any) => p.keys.has(num(c)),
    isToggled: () => false,
    getCode: () => p.lastKey.code,
    getAscii: () => p.lastKey.ascii,
  });
  broadcaster(RT.Mouse, state.mouseListeners);
  Object.assign(RT.Mouse, { show: () => { p.cursorHidden = false; return 1; }, hide: () => { p.cursorHidden = true; return 1; } });
  const stageListeners: any[] = [];
  broadcaster(RT.Stage, stageListeners);
  def(RT.Stage, { width: { get: () => p.width }, height: { get: () => p.height } });
  RT.Stage.scaleMode = 'showAll';
  RT.Stage.align = '';
  const selListeners: any[] = [];
  broadcaster(RT.Selection, selListeners);
  Object.assign(RT.Selection, {
    getFocus: () => (p.focus ? p.focus.path() : null),
    setFocus: (t: any) => {
      const n = typeof t === 'string' ? p.resolveTarget(p.root, t) : N(t);
      p.focus = n && n.kind === 'text' ? n : null;
      return true;
    },
    getBeginIndex: () => (p.focus?.text ? p.getText(p.focus.text).length : -1),
    getEndIndex: () => (p.focus?.text ? p.getText(p.focus.text).length : -1),
    getCaretIndex: () => (p.focus?.text ? p.getText(p.focus.text).length : -1),
    setSelection: () => {},
  });

  // ------------------------------------------------------------ System / SharedObject
  Object.assign(RT.System, {
    useCodepage: false,
    showSettings: () => {},
    setClipboard: (s: string) => { try { void navigator.clipboard?.writeText(String(s)); } catch { /* no clipboard */ } },
    capabilities: {
      version: 'WIN 7,0,19,0', os: 'Windows XP', manufacturer: 'Macromedia Windows', playerType: 'PlugIn', language: 'en',
      screenResolutionX: typeof screen !== 'undefined' ? screen.width : 1280, screenResolutionY: typeof screen !== 'undefined' ? screen.height : 1024,
      hasAudio: true, hasMP3: true, isDebugger: false, localFileReadDisable: false, serverString: '',
    },
    security: { allowDomain: () => {}, allowInsecureDomain: () => {}, loadPolicyFile: () => {} },
  });
  Object.assign(RT.SharedObject, {
    getLocal(name: string) {
      const key = `swf-studio.so.${p.doc.header.fileName}.${name}`;
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(globalThis.localStorage?.getItem(key) ?? '{}'); } catch { data = {}; }
      return {
        data,
        flush() { try { globalThis.localStorage?.setItem(key, JSON.stringify(this.data)); return true; } catch { return false; } },
        clear() { for (const k of Object.keys(this.data)) delete (this.data as any)[k]; try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ } },
        getSize() { return JSON.stringify(this.data).length; },
        onStatus: undefined,
      };
    },
  });

  // ------------------------------------------------------------ Sound
  def(RT.Sound.prototype, {
    attachSound(this: any, id: any) {
      const ch = [...p.doc.characters.values()].find((c) => c.kind === 'sound' && c.exportName === String(id));
      if (!ch) p.log('warn', `Sound.attachSound: no sound exported as "${id}"`);
      this.__sound = ch?.id ?? null;
      this.__url = null;
    },
    loadSound(this: any, url: any, _stream?: any) {
      this.__url = null;
      p.log('warn', `Sound.loadSound("${url}"): external sounds are not available offline`);
      setTimeout(() => { if (typeof this.onLoad === 'function') p.guard('Sound.onLoad', () => this.onLoad(false)); p.runQueue(); }, 0);
    },
    start(this: any, offset?: any, loops?: any) {
      if (this.__sound == null && !this.__url) return;
      const vol = (this.__volume ?? 100) / 100 * volumeOf(this.target);
      const h = p.playSound(this.__sound ?? null, this.__url ?? null, num(offset) * 1000, Math.max(1, num(loops, 1)), vol);
      if (h) {
        (this.__handles ??= new Set()).add(h);
        const prev = h.onended;
        h.onended = () => { prev?.(); this.__handles?.delete(h); if (typeof this.onSoundComplete === 'function') { p.guard('Sound.onSoundComplete', () => this.onSoundComplete()); p.runQueue(); } };
      }
    },
    stop(this: any, id?: any) {
      if (id != null) { const ch = [...p.doc.characters.values()].find((c) => c.exportName === String(id)); p.stopSound(ch?.id ?? -1); return; }
      if (this.target == null && this.__sound == null) { p.stopAllSounds(); return; }
      for (const h of this.__handles ?? []) h.stop();
      this.__handles?.clear();
    },
    setVolume(this: any, v: any) {
      this.__volume = num(v, 100);
      if (this.__sound == null) setTargetVolume(this.target, this.__volume);
      for (const h of this.__handles ?? []) h.setVolume((this.__volume / 100) * volumeOf(this.target) * state.globalVolume);
    },
    getVolume(this: any) { return this.__volume ?? 100; },
    setPan(this: any, v: any) { this.__pan = num(v); },
    getPan(this: any) { return this.__pan ?? 0; },
    setTransform(this: any, t: any) { this.__transform = t; },
    getTransform(this: any) { return this.__transform ?? { ll: 100, lr: 0, rl: 0, rr: 100 }; },
    getBytesLoaded() { return 1; },
    getBytesTotal() { return 1; },
    duration: { get(this: any) { const ch = this.__sound != null ? p.doc.characters.get(this.__sound) : null; return ch ? Math.round((Number(ch.attrs.soundSampleCount ?? 0) / soundRate(ch.attrs.soundRate)) * 1000) : 0; } },
    position: { get(this: any) { const h = [...(this.__handles ?? [])][0]; return h ? Math.round(h.position) : 0; } },
  });
  const targetVolumes = new WeakMap<object, number>();
  function setTargetVolume(target: any, v: number) {
    if (target == null) state.globalVolume = v / 100;
    else targetVolumes.set(target, v / 100);
  }
  function volumeOf(target: any) { return target != null && targetVolumes.has(target) ? targetVolumes.get(target)! : 1; }
  const soundRate = (r: unknown) => [5512.5, 11025, 22050, 44100][num(r)] ?? 22050;

  // ------------------------------------------------------------ Color
  def(RT.Color.prototype, {
    setRGB(this: any, rgb: any) {
      const n = N(this.target); if (!n) return;
      const v = num(rgb);
      n.ct = { rm: 0, gm: 0, bm: 0, am: n.ct?.am ?? 1, ra: (v >> 16) & 255, ga: (v >> 8) & 255, ba: v & 255, aa: n.ct?.aa ?? 0 };
    },
    getRGB(this: any) { const c = N(this.target)?.ct; return c ? ((c.ra & 255) << 16) | ((c.ga & 255) << 8) | (c.ba & 255) : 0; },
    setTransform(this: any, t: any) {
      const n = N(this.target); if (!n || !t) return;
      const cur: ColorTransform = n.ct ?? { rm: 1, gm: 1, bm: 1, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 };
      n.ct = {
        rm: t.ra != null ? num(t.ra) / 100 : cur.rm, gm: t.ga != null ? num(t.ga) / 100 : cur.gm,
        bm: t.ba != null ? num(t.ba) / 100 : cur.bm, am: t.aa != null ? num(t.aa) / 100 : cur.am,
        ra: t.rb != null ? num(t.rb) : cur.ra, ga: t.gb != null ? num(t.gb) : cur.ga,
        ba: t.bb != null ? num(t.bb) : cur.ba, aa: t.ab != null ? num(t.ab) : cur.aa,
      };
    },
    getTransform(this: any) {
      const c = N(this.target)?.ct ?? { rm: 1, gm: 1, bm: 1, am: 1, ra: 0, ga: 0, ba: 0, aa: 0 };
      return { ra: c.rm * 100, ga: c.gm * 100, ba: c.bm * 100, aa: c.am * 100, rb: c.ra, gb: c.ga, bb: c.ba, ab: c.aa };
    },
  });

  // ------------------------------------------------------------ LoadVars
  def(RT.LoadVars.prototype, {
    toString(this: any) {
      return Object.keys(this).filter((k) => !k.startsWith('__') && typeof this[k] !== 'function' && k !== 'loaded' && k !== 'contentType')
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(this[k]))}`).join('&');
    },
    decode(this: any, s: any) { decodeVars(this, String(s ?? '')); },
    load(this: any, url: any) { return lvRequest(this, String(url), 'GET', null, this); },
    send(this: any, url: any, win?: any, method?: any) { p.log('info', `LoadVars.send(${url}${win ? `, ${win}` : ''}, ${method ?? 'POST'}) – not sent (offline)`); return true; },
    sendAndLoad(this: any, url: any, target: any, method?: any) { return lvRequest(this, String(url), String(method ?? 'POST').toUpperCase(), this.toString(), target); },
    getBytesLoaded(this: any) { return this.loaded ? 1 : 0; },
    getBytesTotal() { return 1; },
    addRequestHeader() {},
  });
  function lvRequest(src: any, url: string, method: string, body: string | null, target: any) {
    if (target == null) return false;
    target.loaded = false;
    fetchText(url, method, body).then((txt) => {
      const done = () => {
        if (typeof target.onData === 'function' && Object.prototype.hasOwnProperty.call(target, 'onData')) { target.onData(txt ?? undefined); return; }
        if (txt != null) { decodeVars(target, txt); target.loaded = true; }
        if (typeof target.onLoad === 'function') target.onLoad(txt != null);
      };
      p.guard(`LoadVars ${method} ${url}`, done);
      p.runQueue();
    });
    void src;
    return true;
  }

  // ------------------------------------------------------------ MovieClipLoader
  def(RT.MovieClipLoader.prototype, {
    addListener(this: any, l: any) { (this.__listeners ??= [this]).includes(l) || this.__listeners.push(l); return true; },
    removeListener(this: any, l: any) { const a = this.__listeners ?? []; const i = a.indexOf(l); if (i >= 0) a.splice(i, 1); return i >= 0; },
    loadClip(this: any, url: any, target: any) {
      const n = typeof target === 'number' ? p.root : typeof target === 'string' ? p.resolveTarget(p.root, target) : N(target);
      if (!n) { p.log('warn', `MovieClipLoader.loadClip("${url}"): target not found`); return false; }
      loadMovie(String(url), n, this.__listeners ?? [this], this);
      return true;
    },
    unloadClip(this: any, target: any) { unloadMovie(N(target)); return true; },
    getProgress() { return { bytesLoaded: 1, bytesTotal: 1 }; },
  });

  // ------------------------------------------------------------ LocalConnection / XMLSocket / XML / ContextMenu
  def(RT.LocalConnection.prototype, {
    connect() { return true; },
    send(this: any) { setTimeout(() => { if (typeof this.onStatus === 'function') p.guard('LocalConnection.onStatus', () => this.onStatus({ level: 'error' })); }, 0); return true; },
    close() {},
    domain() { return typeof location !== 'undefined' ? location.hostname : 'localhost'; },
  });
  def(RT.XMLSocket.prototype, {
    connect(this: any, host: any, port: any) {
      p.log('warn', `XMLSocket.connect(${host}, ${port}): socket servers are not available offline`);
      setTimeout(() => { if (typeof this.onConnect === 'function') { p.guard('XMLSocket.onConnect', () => this.onConnect(false)); p.runQueue(); } }, 0);
      return true;
    },
    send() {},
    close() {},
  });
  def(RT.XML.prototype, {
    parseXML(this: any, s: any) { parseXmlInto(this, String(s ?? '')); },
    load(this: any, url: any) {
      this.loaded = false;
      fetchText(String(url), 'GET', null).then((txt) => {
        if (txt != null) { parseXmlInto(this, txt); this.loaded = true; }
        if (typeof this.onLoad === 'function') p.guard('XML.onLoad', () => this.onLoad(txt != null));
        p.runQueue();
      });
      return true;
    },
    sendAndLoad(this: any, url: any, target: any) {
      fetchText(String(url), 'POST', String(this)).then((txt) => {
        if (txt != null && target) { parseXmlInto(target, txt); target.loaded = true; }
        if (typeof target?.onLoad === 'function') p.guard('XML.onLoad', () => target.onLoad(txt != null));
        p.runQueue();
      });
    },
    send() { return true; },
    createElement(n: any) { const x = new RT.XMLNode(); Object.assign(x, { nodeType: 1, nodeName: String(n), attributes: {}, childNodes: [] }); return x; },
    createTextNode(v: any) { const x = new RT.XMLNode(); Object.assign(x, { nodeType: 3, nodeName: null, nodeValue: String(v), attributes: {}, childNodes: [] }); return x; },
  });
  def(RT.XMLNode.prototype, {
    firstChild: { get(this: any) { return this.childNodes?.[0] ?? null; } },
    lastChild: { get(this: any) { return this.childNodes?.[this.childNodes.length - 1] ?? null; } },
    hasChildNodes(this: any) { return !!this.childNodes?.length; },
    appendChild(this: any, c: any) { (this.childNodes ??= []).push(c); c.parentNode = this; },
    toString(this: any) { return serializeXml(this); },
  });
  function parseXmlInto(target: any, src: string) {
    target.childNodes = [];
    target.status = 0;
    if (typeof DOMParser === 'undefined') { target.status = -1; return; }
    const doc = new DOMParser().parseFromString(`<__root>${src}</__root>`, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) { target.status = -10; return; }
    const convert = (el: Node, parent: any): any => {
      const x = new RT.XMLNode();
      x.parentNode = parent;
      if (el.nodeType === 3) { if (target.ignoreWhite && !el.nodeValue?.trim()) return null; Object.assign(x, { nodeType: 3, nodeName: null, nodeValue: el.nodeValue, attributes: {}, childNodes: [] }); return x; }
      const e = el as Element;
      const attrs: Record<string, string> = {};
      for (const a of Array.from(e.attributes)) attrs[a.name] = a.value;
      Object.assign(x, { nodeType: 1, nodeName: e.tagName, nodeValue: null, attributes: attrs, childNodes: [] });
      for (const c of Array.from(e.childNodes)) { const k = convert(c, x); if (k) x.childNodes.push(k); }
      return x;
    };
    for (const c of Array.from(doc.documentElement.childNodes)) { const k = convert(c, target); if (k) target.childNodes.push(k); }
  }
  function serializeXml(x: any): string {
    if (x.nodeType === 3) return String(x.nodeValue ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const inner = (x.childNodes ?? []).map(serializeXml).join('');
    if (!x.nodeName) return inner;
    const attrs = Object.entries(x.attributes ?? {}).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
    return inner ? `<${x.nodeName}${attrs}>${inner}</${x.nodeName}>` : `<${x.nodeName}${attrs} />`;
  }
  def(RT.ContextMenu.prototype, {
    hideBuiltInItems(this: any) { this.builtInItems = {}; },
    copy(this: any) { const c = new RT.ContextMenu(); c.customItems = [...(this.customItems ?? [])]; return c; },
  });

  return state;
}

/** Helper for UIs: stage-space bounds (px) of a node. */
export function stageBounds(p: AS2Player, n: DisplayNode): Rect | null {
  const b = p.boundsIn(n, null);
  return b ? { xMin: b.xMin / TWIPS, yMin: b.yMin / TWIPS, xMax: b.xMax / TWIPS, yMax: b.yMax / TWIPS } : null;
}

export { NODE, DEPTH_OFFSET };
