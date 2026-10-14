// UI troubleshooter — inspection + diagnosis for the AS2 Execute stage.
//
// The Execute tab plays a Flash game on our own AVM1 engine, so "the UI is
// broken" almost always means: a clip exists, holds data, and still draws
// nothing. This module answers *why* in one pass:
//
//   snapshotStage()  live, serialisable picture of the display list (bounds in
//                    stage px, visibility, text, MX component internals)
//   scanStage()      a battery of checks over that picture + the live player,
//                    producing findings with evidence and a suggested cause
//   probeRegion()    renders a screen region into an offscreen canvas and
//                    measures whether anything was actually painted there
//   analyzePoint()   "what is at these canvas coordinates, and why is it blank?"
//
// Everything is read-only and defensive: AS2 objects are dynamic, their
// getters are game code, so every property read is guarded and no check may
// throw. The module works without a DOM (pixel probes are skipped).

import { describeDependency, type DependencyTracker } from '../../engine/flash/dependencies';
import type { Matrix, Rect } from '../../types';
import type { DisplayNode } from '../../engine/as2/player';
import { transformRect } from '../../engine/as2/geom';
import { TWIPS } from '../../engine/as2/constants';

export type Severity = 'error' | 'warn' | 'info' | 'pass';
export type FindingArea = 'stage' | 'display' | 'layout' | 'text' | 'render' | 'input' | 'component' | 'data';

export interface Finding {
  /** stable key (path + check) — used to dedupe console entries and re-runs */
  id: string;
  severity: Severity;
  area: FindingArea;
  title: string;
  detail: string;
  /** what to do about it / the most likely cause */
  hint?: string;
  /** display-list path of the node this finding is about ("_root.ui.panel.list…") */
  path?: string;
  nodeId?: number;
  evidence?: Record<string, string | number | boolean | null>;
}

export interface PxRect { x: number; y: number; w: number; h: number }

export interface TextSnapshot {
  chars: number;
  preview: string;
  color: string;
  size: number;
  font: string;
  embedFonts: boolean;
  fontId: number | null;
  input: boolean;
}

export interface RowSnapshot {
  index: number;
  name: string;
  label: string;
  y: number;
  height: number;
  visible: boolean;
}

/** MX (Flash 8 v2 component) internals read off the live AS2 object. */
export interface ComponentState {
  className: string;
  itemCount: number | null;
  dataProvider: number | null;
  rowHeight: number | null;
  /** `__rowCount`: rows the component believes it has (NaN is a red flag) */
  rowCount: number | null;
  rowCountNaN: boolean;
  /** length of the live `rows` array */
  rows: number | null;
  rowsNaN?: never;
  viewMetrics: { left: number | null; right: number | null; top: number | null; bottom: number | null } | null;
  /** metric values that came back undefined/NaN — an unbound skin is the usual cause */
  brokenMetrics: string[];
  border: { name: string | null; className: string | null; metrics: boolean } | null;
  scroll: { className: string | null; position: number | null; maxPos: number | null } | null;
  dirty: {
    invalidateFlag: boolean;
    invLayoutContent: boolean;
    invUpdateControl: boolean;
    invScrollProps: boolean;
    hasBeenLayedOut: boolean;
  };
  rowDetail: RowSnapshot[];
  /** every row clip position seen (stage px), for "rows exist off the content box" checks */
  contentChildren: number;
}

export interface NodeSnapshot {
  id: number;
  name: string;
  path: string;
  kind: string;
  characterId: number;
  exportName: string | null;
  depth: number;
  frame: number;
  totalFrames: number;
  /** position in paint order (parents before children, siblings in depth order) */
  order: number;
  visible: boolean;
  /** the engine would route a click here (button mode / input field) */
  interactive: boolean;
  alpha: number;
  /** a `setMask()` mask clips this node */
  masked: boolean;
  /** bounds in stage px, or null when the clip draws nothing measurable */
  rect: PxRect | null;
  children: NodeSnapshot[];
  childCount: number;
  text?: TextSnapshot;
  component?: ComponentState;
  /** nearest hidden node (the node itself when it is hidden) */
  hiddenBy?: string;
  /** nearest hidden *ancestor* — absent when this node is a hidden-subtree root */
  hiddenByAncestor?: string;
  /** who last wrote `_visible`: `'script'` = the movie's own ActionScript */
  visibleSource: 'swf' | 'script';
  /**
   * This clip is used as a `setMask()` mask by another clip. A mask clothes
   * nothing: Flash never paints it, so its own invisibility is structural, not
   * a UI problem.
   */
  usedAsMask: boolean;
  /**
   * Why this node is not drawn, taken from the nearest hidden node (`hiddenBy`).
   * `'script'` = that node's `_visible = false` was assigned by the movie's own
   * ActionScript — a deliberate state the game asked for (a loading bar that is
   * done, a hover skin, a tracking clip hiding itself); `'mask'` = it is (or is
   * inside) a `setMask()` mask, which Flash never paints. Absent = nothing in
   * the movie explains the invisibility. See `reportHiddenSubtree`.
   */
  hiddenReason?: 'script' | 'mask';
  /** drawing-API commands on this clip (vector UI drawn at runtime) */
  drawingCommands: number;
}

export interface PixelStats {
  /** region size in the probe canvas (downscaled for speed) */
  width: number;
  height: number;
  /** fraction of pixels that differ from the region's dominant colour */
  inkRatio: number;
  /** distinct packed RGB colours (capped) */
  colors: number;
  dominant: string;
  background: string;
}

export interface StageStats {
  nodes: number;
  probed: number;
  durationMs: number;
  /** the first list-like component found, if any */
  primaryComponent: { path: string; nodeId: number } | null;
  /**
   * Hidden clips whose invisibility is explained — the movie's own script
   * wrote `_visible = false` (deliberate state) or the clip is a `setMask()`
   * mask. These are not findings; the number is reported so a scan never
   * silently drops them.
   */
  explainedHidden: number;
}

export interface ScanResult {
  findings: Finding[];
  root: NodeSnapshot | null;
  nodes: NodeSnapshot[];
  stats: StageStats;
  pixel: PixelStats | null;
  scannedAt: number;
}

/**
 * The slice of `AS2Player` the troubleshooter uses. `AS2Player` satisfies it
 * structurally, and tests can drive the checks with a small stub.
 */
export interface InspectablePlayer {
  root: DisplayNode;
  width: number;
  height: number;
  background: string;
  localBounds(node: DisplayNode, forHit?: boolean): Rect | null;
  globalMatrix(node: DisplayNode): Matrix;
  describe(node: DisplayNode): string;
  /** true when the engine would route a click to this node (button mode) */
  isMouseTarget?(node: DisplayNode): boolean;
  mouseTarget?(x: number, y: number): DisplayNode | null;
  renderTo?(ctx: CanvasRenderingContext2D, scale: number, ox: number, oy: number): void;
  highlightedIds?: Set<number> | null;
  errors?: number;
  /** files the movies requested that nothing supplied (see engine/flash/dependencies) */
  dependencies?: Pick<DependencyTracker, 'files' | 'services'>;
  logs?: readonly { level: string; message: string }[];
}

export interface ScanOptions {
  /** pixel probes need a DOM canvas; skipped automatically when unavailable */
  probe?: boolean;
  /** embedded font ids registered for the main movie (for text/font checks) */
  fontIds?: Set<number>;
  /** scan only this subtree (defaults to the whole stage) */
  scope?: DisplayNode;
  maxNodes?: number;
  maxProbes?: number;
}

// --------------------------------------------------------------------- reads

/** Read a property without ever letting a game getter break the scan. */
function read<T>(obj: unknown, key: string): T | undefined {
  try {
    const value = (obj as Record<string, unknown> | null | undefined)?.[key];
    return value as T | undefined;
  } catch {
    return undefined;
  }
}

function num(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : Number.NaN;
}

/** numeric property, `null` when absent; NaN is preserved (it *is* the finding) */
function numProp(obj: unknown, key: string): number | null {
  return num(read<unknown>(obj, key));
}

function strProp(obj: unknown, key: string): string | null {
  const v = read<unknown>(obj, key);
  return typeof v === 'string' ? v : null;
}

const isNaNValue = (v: number | null): boolean => v !== null && Number.isNaN(v);

/** px-rect of a node in stage space, or null when nothing measurable is drawn. */
export function stageRect(player: InspectablePlayer, node: DisplayNode): PxRect | null {
  const local = player.localBounds(node);
  if (!local) return null;
  const global = transformRect(player.globalMatrix(node), local);
  const rect = {
    x: global.xMin / TWIPS,
    y: global.yMin / TWIPS,
    w: (global.xMax - global.xMin) / TWIPS,
    h: (global.yMax - global.yMin) / TWIPS,
  };
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) return null;
  return rect;
}

function inset(rect: PxRect, by = 1): PxRect {
  return { x: rect.x + by, y: rect.y + by, w: Math.max(1, rect.w - by * 2), h: Math.max(1, rect.h - by * 2) };
}

const contains = (outer: PxRect, inner: PxRect): boolean =>
  outer.x <= inner.x + 0.5 && outer.y <= inner.y + 0.5 &&
  outer.x + outer.w >= inner.x + inner.w - 0.5 && outer.y + outer.h >= inner.y + inner.h - 0.5;

const overlaps = (a: PxRect, b: PxRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const rectText = (r: PxRect): string => `x ${Math.round(r.x)} y ${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}`;

/**
 * Would the engine route a click to this node? Mirrors `AS2Player.isMouseTarget`
 * so the scan agrees with hit testing: buttons, clips with `on(..)`/`onPress`
 * handlers and input text fields qualify. Everything else (labels, skin parts,
 * decorative shapes) is *not* a control, and a click landing on the clip behind
 * it is correct behaviour — not a finding.
 */
export function interactiveNode(player: InspectablePlayer, node: DisplayNode): boolean {
  if (player.isMouseTarget) {
    try { return player.isMouseTarget(node); } catch { return false; }
  }
  if (node.kind === 'button') return node.obj?.enabled !== false;
  if (node.kind === 'text') return !!node.text?.input;
  if (node.kind !== 'clip' || node.obj?.enabled === false) return false;
  if (node.handlers?.some((h) => h.kind === 'on' && h.events.some((e) => !e.startsWith('keyPress')))) return true;
  const o = node.obj as Record<string, unknown> | null | undefined;
  return ['onPress', 'onRelease', 'onReleaseOutside', 'onRollOver', 'onRollOut', 'onDragOver', 'onDragOut']
    .some((k) => typeof o?.[k] === 'function');
}

/** Does this subtree hold anything a user could see or use? */
function subtreeCounts(snap: NodeSnapshot): { descendants: number; controls: number; texts: number; components: number } {
  const out = { descendants: 0, controls: 0, texts: 0, components: 0 };
  const walk = (n: NodeSnapshot) => {
    for (const c of n.children) {
      out.descendants += 1;
      if (c.interactive) out.controls += 1;
      if (c.text) out.texts += 1;
      if (c.component) out.components += 1;
      walk(c);
    }
  };
  walk(snap);
  return out;
}

function alphaOf(node: DisplayNode): number {
  const ct = node.ct;
  const a = ct ? Math.max(0, Math.min(1, ct.am + ct.aa / 255)) : 1;
  return Number.isFinite(a) ? a : 1;
}

// --------------------------------------------------------------- component

const MX_MARKERS = ['getViewMetrics', 'getRowCount', 'rows', '__rowHeight', '__dataProvider', 'setDataProvider', 'listContent', 'content_mc'];

/** Is this clip an MX (Flash 8 v2) component instance we can inspect? */
export function looksLikeComponent(obj: unknown): boolean {
  if (!obj) return false;
  for (const key of MX_MARKERS) if (read<unknown>(obj, key) !== undefined) return true;
  const className = strProp(obj, 'className');
  return !!className && /^(List|ScrollSelectList|ScrollView|SelectableRow|DataProvider|DataSelector|ComboBox|Tree|DataGrid|View|TextArea|TextInput)$/.test(className);
}

function componentState(node: DisplayNode): ComponentState | undefined {
  const obj = node.obj;
  if (!looksLikeComponent(obj)) return undefined;
  const className = strProp(obj, 'className') ?? node.character?.exportName ?? 'component';
  const dataProviderLen = numProp(read<unknown>(obj, '__dataProvider'), 'length');
  const rows = read<unknown>(obj, 'rows');
  const rowsLen = Array.isArray(rows) ? rows.length : null;

  let itemCount: number | null = null;
  try {
    const getLength = read<(this: unknown) => unknown>(obj, 'getLength');
    if (typeof getLength === 'function') itemCount = num(getLength.call(obj));
    if (itemCount === null && dataProviderLen !== null) itemCount = dataProviderLen;
  } catch { /* game getter threw — leave null */ }

  // getViewMetrics() is the MX layout contract: undefined/NaN values there are
  // exactly what stops a List from ever creating its row clips.
  let viewMetrics: ComponentState['viewMetrics'] = null;
  const broken: string[] = [];
  try {
    const fn = read<(this: unknown) => unknown>(obj, 'getViewMetrics');
    if (typeof fn === 'function') {
      const m = fn.call(obj) as Record<string, unknown> | undefined;
      if (m && typeof m === 'object') {
        const next = {
          left: num(m.left) ?? null, right: num(m.right) ?? null,
          top: num(m.top) ?? null, bottom: num(m.bottom) ?? null,
        };
        for (const key of ['left', 'right', 'top', 'bottom'] as const) {
          const value = m[key];
          if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) broken.push(`viewMetrics.${key}=${value === undefined ? 'undefined' : 'NaN'}`);
        }
        viewMetrics = next;
      } else {
        broken.push('getViewMetrics() returned nothing (View.init/ScrollView.init never ran)');
      }
    }
  } catch (e) {
    broken.push(`getViewMetrics() threw: ${e instanceof Error ? e.message : String(e)}`);
  }

  const borderMc = read<unknown>(obj, 'border_mc');
  const border = borderMc ? {
    name: strProp(borderMc, '_name'),
    className: strProp(borderMc, 'className'),
    metrics: read<unknown>(borderMc, 'borderMetrics') != null,
  } : null;
  if (border && !border.metrics) broken.push('border_mc.borderMetrics is undefined (the skin clip lost its class)');

  const scrollMc = read<unknown>(obj, 'vScroller');
  const scroll = scrollMc ? {
    className: strProp(scrollMc, 'className'),
    position: numProp(scrollMc, 'scrollPosition'),
    maxPos: numProp(scrollMc, 'maxPos'),
  } : null;

  const rowObjects = Array.isArray(rows) ? rows : [];
  const rowDetail: RowSnapshot[] = [];
  for (let i = 0; i < rowObjects.length && i < 40; i++) {
    const row = rowObjects[i] as Record<string, unknown> | undefined;
    if (!row) { rowDetail.push({ index: i, name: '', label: '(empty slot)', y: 0, height: 0, visible: false }); continue; }
    const item = read<Record<string, unknown>>(row, 'item');
    const label = strProp(row, 'label')
      ?? (item ? strProp(item, 'label') : null)
      ?? (typeof item === 'string' ? item : null)
      ?? '';
    rowDetail.push({
      index: i,
      name: strProp(row, '_name') ?? '',
      label,
      y: numProp(row, '_y') ?? 0,
      height: numProp(row, '_height') ?? 0,
      visible: read<boolean>(row, '_visible') !== false,
    });
  }

  const rowCount = numProp(obj, '__rowCount');
  return {
    className,
    itemCount,
    dataProvider: dataProviderLen,
    rowHeight: numProp(obj, '__rowHeight'),
    rowCount,
    rowCountNaN: isNaNValue(rowCount),
    rows: rowsLen,
    viewMetrics,
    brokenMetrics: broken,
    border,
    scroll,
    dirty: {
      invalidateFlag: !!read(obj, 'invalidateFlag'),
      invLayoutContent: !!read(obj, 'invLayoutContent'),
      invUpdateControl: !!read(obj, 'invUpdateControl'),
      invScrollProps: !!read(obj, 'invScrollProps'),
      hasBeenLayedOut: !!read(obj, 'hasBeenLayedOut'),
    },
    rowDetail,
    contentChildren: node.children.length,
  };
}

// ---------------------------------------------------------------- snapshot

export interface SnapshotResult { root: NodeSnapshot | null; nodes: NodeSnapshot[]; byId: Map<number, DisplayNode> }

/** Serialisable snapshot of the live display list, plus a node-id → node map. */
export function snapshotStage(player: InspectablePlayer, scope?: DisplayNode, maxNodes = 4000): SnapshotResult {
  const nodes: NodeSnapshot[] = [];
  const byId = new Map<number, DisplayNode>();
  let budget = Math.max(1, maxNodes);

  let order = 0;
  const visit = (node: DisplayNode, hiddenBy: string | undefined, inheritedReason: 'script' | 'mask' | undefined): NodeSnapshot | null => {
    if (budget <= 0) return null;
    budget -= 1;
    const rect = stageRect(player, node);
    const ch = node.character;
    const text = node.text ? {
      chars: textLength(player, node),
      preview: textPreview(player, node),
      color: node.text.format.color,
      size: node.text.format.size,
      font: node.text.format.font,
      embedFonts: !!node.text.embedFonts,
      fontId: node.text.fontId ?? null,
      input: !!node.text.input,
    } : undefined;
    // A hidden node answers for itself; a visible node inside a hidden one is
    // invisible for the ancestor's reason (the flag the game set lives there).
    const ownReason: 'script' | 'mask' | undefined = !node.visible
      ? (node.mask != null ? 'mask' : node.visibleSource === 'script' ? 'script' : undefined)
      : undefined;
    const snap: NodeSnapshot = {
      id: node.id,
      name: node === player.root ? '_root' : (node.name || ch?.exportName || `${node.kind} ${node.characterId}`),
      path: player.describe(node),
      kind: node.kind,
      characterId: node.characterId,
      exportName: ch?.exportName ?? null,
      depth: node.depth,
      frame: node.frame + 1,
      totalFrames: node.totalFrames,
      order: order++,
      visible: node.visible,
      interactive: interactiveNode(player, node),
      alpha: Math.round(alphaOf(node) * 100) / 100,
      masked: node.maskedBy != null,
      rect,
      children: [],
      childCount: 0,
      text,
      component: componentState(node),
      hiddenBy: node.visible ? hiddenBy : (hiddenBy ?? player.describe(node)),
      hiddenByAncestor: hiddenBy,
      visibleSource: node.visibleSource,
      usedAsMask: node.mask != null,
      hiddenReason: node.visible ? (hiddenBy ? inheritedReason : undefined) : ownReason,
      drawingCommands: node.drawing?.length ?? 0,
    };
    nodes.push(snap);
    byId.set(node.id, node);
    for (const child of node.children) {
      if (child.removed) continue;
      const childSnap = visit(child, snap.hiddenBy, snap.hiddenReason);
      if (childSnap) snap.children.push(childSnap);
    }
    snap.childCount = snap.children.length;
    return snap;
  };

  const root = visit(scope ?? player.root, undefined, undefined);
  return { root, nodes, byId };
}

function textLength(player: InspectablePlayer, node: DisplayNode): number {
  try {
    const obj = node.obj as { length?: unknown } | null;
    const len = read<unknown>(obj, 'length');
    if (typeof len === 'number' && Number.isFinite(len)) return len;
  } catch { /* fall through */ }
  void player;
  return node.text?.paras.reduce((sum, p) => sum + p.runs.reduce((s, r) => s + r.text.length, 0), 0) ?? 0;
}

function textPreview(player: InspectablePlayer, node: DisplayNode): string {
  try {
    const text = read<unknown>(node.obj, 'text');
    if (typeof text === 'string') return text.slice(0, 60);
  } catch { /* fall through */ }
  void player;
  return (node.text?.paras ?? []).map((p) => p.runs.map((r) => r.text).join('')).join('\n').slice(0, 60);
}

// ------------------------------------------------------------------- probe

const pack = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;
const hex = (n: number): string => `#${(n >>> 0).toString(16).padStart(6, '0')}`;

/**
 * Render a stage-pixel region into an offscreen canvas and measure what was
 * painted. This is the difference between "the clip exists" and "the pixels
 * are there": an all-white, uniform region with a full data provider is the
 * signature of a component that laid out nothing.
 */
export function probeRegion(player: InspectablePlayer, region: PxRect, maxSide = 120): PixelStats | null {
  const shot = renderRegion(player, region, maxSide);
  if (!shot) return null;
  const { width, height, data } = shot;
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = pack(data[i], data[i + 1], data[i + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let dominant = 0;
  let dominantCount = -1;
  for (const [color, count] of counts) if (count > dominantCount) { dominant = color; dominantCount = count; }
  const pixels = width * height;
  const ink = pixels - dominantCount;
  return {
    width,
    height,
    inkRatio: pixels ? ink / pixels : 0,
    colors: counts.size,
    dominant: hex(dominant),
    background: player.background,
  };
}

/** Rasterise a stage-pixel region; null when there is no DOM canvas or renderer. */
function renderRegion(player: InspectablePlayer, region: PxRect, maxSide = 120): { width: number; height: number; data: Uint8ClampedArray } | null {
  if (typeof document === 'undefined' || typeof player.renderTo !== 'function') return null;
  const clipped = clipToStage(player, region);
  if (!clipped) return null;
  const width = Math.max(1, Math.min(maxSide, Math.round(clipped.w)));
  const height = Math.max(1, Math.min(maxSide, Math.round(clipped.h)));
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } catch { return null; }
  if (!ctx) return null;

  const scale = Math.max(width / Math.max(1, clipped.w), height / Math.max(1, clipped.h));
  const savedHighlight = player.highlightedIds ?? null;
  try {
    player.highlightedIds = null; // the inspector's glow must not count as content
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    player.renderTo(ctx, scale, -clipped.x * scale, -clipped.y * scale);
  } catch {
    return null;
  } finally {
    player.highlightedIds = savedHighlight;
  }
  try { return { width, height, data: ctx.getImageData(0, 0, width, height).data }; } catch { return null; }
}

/**
 * How much of the control's own region does this sibling actually paint over?
 * A bounding-box overlap proves nothing: every skin part of a component shares
 * the bounding box of the thing it decorates (a hollow border "covers" every
 * button inside the bar). Rendering the region with the sibling hidden vs
 * visible measures the real contribution: ratio of pixels that changed, or null
 * when pixels are unavailable (the check then stays silent instead of guessing).
 */
function overlayPaintRatio(player: InspectablePlayer, region: PxRect, sibling: DisplayNode): number | null {
  const withSibling = renderRegion(player, region, 96);
  if (!withSibling) return null;
  const saved = sibling.visible;
  let without: ReturnType<typeof renderRegion> = null;
  sibling.visible = false;
  try { without = renderRegion(player, region, 96); } finally { sibling.visible = saved; }
  if (!without || without.data.length !== withSibling.data.length) return null;
  const total = withSibling.data.length / 4;
  let changed = 0;
  for (let i = 0; i < withSibling.data.length; i += 4) {
    if (
      Math.abs(withSibling.data[i] - without.data[i]) > 8 ||
      Math.abs(withSibling.data[i + 1] - without.data[i + 1]) > 8 ||
      Math.abs(withSibling.data[i + 2] - without.data[i + 2]) > 8
    ) changed += 1;
  }
  return total ? changed / total : 0;
}

function clipToStage(player: InspectablePlayer, region: PxRect): PxRect | null {
  const x = Math.max(0, region.x);
  const y = Math.max(0, region.y);
  const xMax = Math.min(player.width, region.x + region.w);
  const yMax = Math.min(player.height, region.y + region.h);
  if (!(xMax > x) || !(yMax > y)) return null;
  return { x, y, w: xMax - x, h: yMax - y };
}

// ---------------------------------------------------------------- findings

const finding = (
  severity: Severity, area: FindingArea, id: string, title: string, detail: string,
  extra: Omit<Finding, 'id' | 'severity' | 'area' | 'title' | 'detail'> = {},
): Finding => ({ id, severity, area, title, detail, ...extra });

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2, pass: 3 };

export function sortFindings(list: Finding[]): Finding[] {
  return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title));
}

export interface ScanContext {
  player: InspectablePlayer;
  options: ScanOptions;
  byId: Map<number, DisplayNode>;
  /** snapshot index — paint order and visibility of every visited node */
  snapById: Map<number, NodeSnapshot>;
  probesLeft: number;
  /** stage-pixel rects already reported so a finding is not duplicated per child */
  reportedFlat: Set<number>;
}

/**
 * Run every check. Stage-wide checks and, for each collected node, the
 * per-node checks; MX components additionally get their layout checks.
 */
export function scanStage(player: InspectablePlayer, options: ScanOptions = {}): ScanResult {
  const startedAt = Date.now();
  const { root, nodes, byId } = snapshotStage(player, options.scope, options.maxNodes);
  const findings: Finding[] = [];
  const ctx: ScanContext = {
    player,
    options,
    byId,
    snapById: new Map(nodes.map((n) => [n.id, n])),
    probesLeft: options.maxProbes ?? 6,
    reportedFlat: new Set(),
  };

  const stats: StageStats = { nodes: nodes.length, probed: 0, durationMs: 0, primaryComponent: null, explainedHidden: 0 };
  const componentNodes = nodes.filter((n) => n.component);
  stats.primaryComponent = componentNodes[0] ? { path: componentNodes[0].path, nodeId: componentNodes[0].id } : null;

  // --- stage-level health
  if (player.errors) {
    findings.push(finding('error', 'stage', 'stage/errors', `${player.errors} runtime error(s) hit the engine`,
      'The player caught exceptions in frame/event callbacks; later UI updates may never have run.',
      { hint: 'Open the Console → Problems tab for the stack traces.', evidence: { errors: player.errors } }));
  }
  const missingFiles = player.dependencies?.files().filter((d) => !d.optional) ?? [];
  if (missingFiles.length) {
    findings.push(finding('warn', 'data', 'stage/missing-dependencies', `Missing Dependencies: ${missingFiles.length} requested file(s) are not in the load`,
      missingFiles.slice(0, 6).map((d) => describeDependency(d)).join('; ') + (missingFiles.length > 6 ? '; …' : ''),
      { hint: 'Upload each file together with the SWF (any type: SWF, MP3, XML, CSS, image, …) so that part of the game exists.',
        evidence: { files: missingFiles.length, kinds: [...new Set(missingFiles.map((d) => d.kind))].join(', ') } }));
  }
  const services = player.dependencies?.services() ?? [];
  if (services.length) {
    findings.push(finding('info', 'data', 'stage/unanswered-services', `${services.length} service endpoint(s) were not answered`,
      services.slice(0, 4).map((d) => `${d.url} (${d.apis.join(', ')})`).join('; '),
      { hint: 'These are server calls, not files: they need the live server or a game adapter that answers them offline.' }));
  }

  const stageProbe = options.probe === false ? null : probeStage(ctx);
  if (stageProbe && stageProbe.inkRatio < 0.002) {
    findings.push(finding('error', 'render', 'stage/blank', 'Nothing is painted anywhere on the stage',
      `The whole stage probe is uniform (${stageProbe.colors} colour(s), ${(stageProbe.inkRatio * 100).toFixed(2)}% non-background pixels).`,
      { hint: 'The movie is probably stuck before its UI frame — check the HUD frame number and any errors in the Console.' }));
  }

  // --- hidden subtrees: one finding per (parent, name) group, never per leaf
  const hiddenGroups = new Map<string, NodeSnapshot[]>();
  const explainedHidden: NodeSnapshot[] = [];
  for (const snap of nodes) {
    if (snap.visible || snap.hiddenByAncestor) continue;
    // A `setMask()` mask is never painted by definition — the movie did not hide
    // anything, and reporting it as a finding would only teach the reader to
    // ignore the list.
    if (snap.usedAsMask) { explainedHidden.push(snap); continue; }  // never painted
    // Group siblings-of-siblings too: the 11 rows of a List each carry the same
    // hidden hover skin (`tran_mc`), and one line "tran_mc ×11" is the useful
    // statement, not eleven findings.
    const parts = snap.path.split('.');
    const key = `${parts.slice(0, -2).join('.')}/${snap.name}`;
    const group = hiddenGroups.get(key);
    if (group) group.push(snap); else hiddenGroups.set(key, [snap]);
  }
  const groups = [...hiddenGroups.values()];
  for (const group of groups) {
    for (const snap of group) if (snap.hiddenReason) explainedHidden.push(snap);
    reportHiddenSubtree(group, findings, `node:${group[0].path}`);
  }
  stats.explainedHidden = explainedHidden.length;
  if (explainedHidden.length) findings.push(explainedHiddenState(explainedHidden));

  // --- per-node checks
  for (const snap of nodes) {
    const node = byId.get(snap.id);
    if (!node) continue;
    const scope = `node:${snap.path}`;
    // An invisible node has nothing to say about geometry, content, overlap or
    // input, and reporting every descendant of a hidden clip buries the real
    // findings: the hidden subtree is reported once, at its root.
    if (!snap.visible || snap.hiddenByAncestor) continue;
    checkTransparency(snap, findings, scope);
    checkGeometry(ctx, snap, findings, scope);
    checkContent(snap, node, findings, scope);
    checkOcclusion(ctx, node, snap, findings, scope);
    checkMask(ctx, node, snap, findings, scope);
    checkText(ctx, snap, findings, scope);
    checkInput(ctx, node, snap, findings, scope);
    if (snap.component) checkComponent(snap, findings, scope);
  }

  // --- region probe on the primary component (the "servers are not showing" case)
  if (options.probe !== false && componentNodes.length) {
    for (const snap of componentNodes.slice(0, 2)) {
      if (byId.has(snap.id)) checkRenderedRegion(ctx, snap, findings);
    }
  }

  stats.probed = (options.maxProbes ?? 6) - ctx.probesLeft;
  stats.durationMs = Date.now() - startedAt;
  return {
    findings: sortFindings(findings),
    root,
    nodes,
    stats,
    pixel: stageProbe,
    scannedAt: Date.now(),
  };
}

function probeStage(ctx: ScanContext): PixelStats | null {
  if (ctx.probesLeft <= 0) return null;
  const stage: PxRect = { x: 0, y: 0, w: ctx.player.width, h: ctx.player.height };
  ctx.probesLeft -= 1;
  return probeRegion(ctx.player, stage, 96);
}

// ------------------------------------------------------------ node checks

function checkTransparency(snap: NodeSnapshot, out: Finding[], scope: string) {
  if (snap.alpha <= 0.02 && snap.kind !== 'graphic' && snap.rect) {
    out.push(finding('warn', 'display', `${scope}/alpha`, `${snap.name} is fully transparent`,
      `${snap.path} has alpha ${snap.alpha}.`,
      { path: snap.path, nodeId: snap.id }));
  }
}

/**
 * One finding for a hidden subtree, at its root. Hiding a clip hides everything
 * inside it, so a per-descendant finding is the same fact repeated N times —
 * that is what made the first version of this report unusable.
 *
 * Invisibility is only a problem when nothing in the movie explains it. Flash
 * cannot hide a placement in the SWF itself, so a clip that is invisible while
 * the movie's own ActionScript never wrote `_visible` was hidden by the engine
 * — the one thing this check can legitimately call a bug. Everything else is
 * the state the game asked for and is at most reported as such (that is what
 * `mode.state` is for: point interrogation asks "why is this blank?" and
 * deserves an answer even when the answer is "the game hid it"):
 *
 *   `_visible = false` written by game/component code — a loading bar that is
 *   done, the `tran_mc` hover skin of a row in its normal state, the Omniture
 *   tracker hiding itself, the lock button that only the multiplayer room
 *   shows; a `setMask()` mask — never painted as content in the first place.
 *
 * `scanStage` therefore reports unexplained groups (as `warn` when a *control*
 * is trapped in there, otherwise `info`) plus one `pass` line counting what the
 * game's own state explains, so nothing is silently dropped.
 */
function reportHiddenSubtree(group: NodeSnapshot[], out: Finding[], scope: string, mode: { state?: boolean } = {}) {
  const snap = group[0];
  const explained = group.every((member) => member.hiddenReason != null);
  if (explained && !mode.state) return; // deliberate state — nothing to fix
  const counts = { descendants: 0, controls: 0, texts: 0, components: 0 };
  for (const member of group) {
    const c = subtreeCounts(member);
    counts.descendants += c.descendants;
    counts.controls += c.controls + (member.interactive ? 1 : 0);
    counts.texts += c.texts + (member.text ? 1 : 0);
    counts.components += c.components + (member.component ? 1 : 0);
  }
  const parts: string[] = [];
  if (counts.descendants) parts.push(`${counts.descendants} descendant node(s)${counts.controls ? `, ${counts.controls} of them interactive` : ''}${counts.texts ? `, ${counts.texts} text field(s)` : ''}`);
  if (counts.components) parts.push(`${counts.components} component(s)`);
  const trapped = counts.controls > 0 || counts.components > 0;
  const what = group.length === 1 ? `${snap.name} is hidden (_visible = false)`
    : `${group.length} sibling clips named ${snap.name} are hidden (_visible = false)`;
  const where = `${snap.path} is in the display list but not drawn${parts.length ? `; it contains ${parts.join(' and ')}` : ''}`;
  const evidence = { clips: group.length, descendants: counts.descendants, controls: counts.controls, texts: counts.texts, components: counts.components };

  if (explained) {
    const why = group.every((member) => member.hiddenReason === 'mask')
      ? 'it is a setMask() mask, and masks are never painted as content'
      : group.every((member) => member.hiddenReason === 'script')
        ? "the movie's own ActionScript set _visible = false (a deliberate state, not something the engine got wrong)"
        : "each clip in the group is either a setMask() mask or was hidden by the movie's own ActionScript";
    out.push(finding('info', 'display', `${scope}/hidden-state`, what, `${where} — ${why}.`, {
      path: snap.path, nodeId: snap.id,
      hint: 'Nothing is broken here: move the game to the frame/state that shows this clip and it appears. The engine is showing exactly what the movie asked for.',
      evidence,
    }));
    return;
  }

  out.push(finding(trapped ? 'warn' : 'info', 'display', `${scope}/hidden-subtree`, what,
    `${where}.`,
    {
      path: snap.path, nodeId: snap.id,
      hint: trapped
        ? 'No script in the movie ever hid this clip and it is not a mask, yet a control inside it can never be clicked — the engine hid it. Check the engine’s visibility handling (a stale place flag, a duplicate instance name).'
        : 'No script in the movie ever hid this clip and it is not a mask — the engine hid it. If this UI should be on screen, the engine’s visibility handling is the suspect.',
      evidence,
    }));
}

/**
 * One `pass` line for the hidden clips that are *not* problems, so the report
 * states the current UI state (and the count) instead of leaving the reader to
 * wonder why the hidden clips are no longer listed.
 */
function explainedHiddenState(explained: NodeSnapshot[]): Finding {
  const names = new Map<string, number>();
  for (const snap of explained) names.set(snap.name, (names.get(snap.name) ?? 0) + 1);
  const masks = explained.filter((snap) => snap.hiddenReason === 'mask').length;
  const hiddenByScript = explained.filter((snap) => snap.hiddenReason === 'script').length;
  const summary = [...names].slice(0, 6).map(([name, clips]) => `${name} ×${clips}`).join(', ');
  return finding('pass', 'display', 'stage/hidden-state',
    `${explained.length} hidden clip(s) are the movie's own state`,
    `${explained.length} clip(s) are invisible because the movie put them in that state: ` +
    `${hiddenByScript} got \`_visible = false\` from the movie's own ActionScript` +
    `${masks ? `, ${masks} are setMask() masks (never painted as content)` : ''}` +
    `${summary ? `: ${summary}${names.size > 6 ? ', …' : ''}` : ''}.`,
    {
      hint: 'No action needed — each of these is exactly what the movie asked for. The Node tab shows them with their state.',
      evidence: { clips: explained.length, hiddenByScript, masks },
    });
}
function checkGeometry(ctx: ScanContext, snap: NodeSnapshot, out: Finding[], scope: string) {
  const rect = snap.rect;
  if (!rect) return;
  if (rect.w <= 0.5 || rect.h <= 0.5) {
    if (snap.childCount > 0 || snap.text) {
      out.push(finding('warn', 'layout', `${scope}/zero-size`, `${snap.name} measures ${rectText(rect)}`,
        'Content exists but the clip has (almost) no size, so nothing is painted.',
        { path: snap.path, nodeId: snap.id, hint: 'A layout pass probably ran before the clip got its final size.' }));
    }
    return;
  }
  const stage: PxRect = { x: 0, y: 0, w: ctx.player.width, h: ctx.player.height };
  if (!overlaps(stage, rect) && snap.kind !== 'graphic') {
    out.push(finding('warn', 'layout', `${scope}/off-stage`, `${snap.name} is outside the stage`,
      `${snap.path} at ${rectText(rect)} does not overlap the ${Math.round(stage.w)}×${Math.round(stage.h)} stage.`,
      { path: snap.path, nodeId: snap.id, hint: 'Usually the placement/layout has not run yet or a coordinate is NaN-ish.' }));
  }
}

function checkContent(snap: NodeSnapshot, node: DisplayNode, out: Finding[], scope: string) {
  const empty = node.children.length === 0 && !snap.text && snap.drawingCommands === 0 &&
    !node.character?.bounds && node.kind === 'clip';
  if (empty && snap.component) return; // component check covers this with better context
  if (empty && snap.rect && snap.rect.w > 1 && snap.rect.h > 1) {
    out.push(finding('warn', 'render', `${scope}/no-content`, `${snap.name} has no content to draw`,
      `${snap.path} has no children, no text, no drawing commands and no shape bounds, but measures ${rectText(snap.rect)}.`,
      { path: snap.path, nodeId: snap.id, hint: 'Its children were removed or never created (look at the frame timeline / gotoAndStop).' }));
  }
}

/**
 * A later sibling that really paints over a *control*. Bounding boxes alone are
 * useless here (a hollow frame shares its box with every button inside it), so
 * the claim is verified with pixels: render the control's region with the
 * sibling hidden and count changed pixels. Without a renderer the check stays
 * silent rather than guessing.
 */
function checkOcclusion(ctx: ScanContext, node: DisplayNode, snap: NodeSnapshot, out: Finding[], scope: string) {
  if (!snap.rect || snap.rect.w < 2 || snap.rect.h < 2) return;
  if (!interactiveNode(ctx.player, node)) return; // decorative overlap is normal
  if (ctx.options.probe === false || !ctx.player.renderTo) return; // needs verified pixels
  const parent = node.parent;
  if (!parent) return;
  const index = parent.children.indexOf(node);
  if (index < 0) return;
  for (let i = index + 1; i < parent.children.length; i++) {
    const sibling = parent.children[i];
    if (sibling.removed || !sibling.visible || alphaOf(sibling) < 0.95) continue;
    // Masks (setMask or a timeline clipDepth mask) clip, they do not cover.
    if (sibling.mask || sibling.maskedBy || sibling.clipDepth) continue;
    const rect = stageRect(ctx.player, sibling);
    if (!rect || rect.w < 2 || rect.h < 2) continue;
    if (!contains(rect, snap.rect)) continue;
    if (ctx.probesLeft < 2) return;
    ctx.probesLeft -= 2;
    const ratio = overlayPaintRatio(ctx.player, inset(snap.rect, 1), sibling);
    if (ratio === null || ratio < 0.6) continue;
    const siblingName = sibling.name || sibling.character?.exportName || `${sibling.kind} ${sibling.characterId}`;
    out.push(finding('warn', 'render', `${scope}/occluded`, `${snap.name} is covered by ${siblingName}`,
      `${snap.path} sits inside ${rectText(rect)} of the later sibling ${siblingName}, which paints over ${Math.round(ratio * 100)}% of it.`,
      { path: snap.path, nodeId: snap.id, hint: 'A control the player cannot see or click: check depths (_depth / swapDepths) — this is often an overlay left on top.',
        evidence: { coveredPercent: Math.round(ratio * 100), by: siblingName, rect: rectText(rect) } }));
    return;
  }
}

function checkMask(ctx: ScanContext, node: DisplayNode, snap: NodeSnapshot, out: Finding[], scope: string) {
  // Only a *masked* clip can sit outside its mask: `maskedBy` is the mask.
  // (`node.mask` is the opposite direction — this clip is the mask of another
  // clip, is never painted, and its own position relative to that clip means
  // nothing.)
  const maskNode = node.maskedBy;
  if (!maskNode) return;
  const own = snap.rect ?? stageRect(ctx.player, node);
  if (!own) return;
  const maskRect = stageRect(ctx.player, maskNode);
  if (!maskRect || maskRect.w < 1 || maskRect.h < 1) {
    out.push(finding('warn', 'render', `${scope}/mask-empty`, `${snap.name} is masked by an empty shape`,
      `${snap.path} is masked by a clip that measures ${maskRect ? rectText(maskRect) : 'nothing'}.`,
      { path: snap.path, nodeId: snap.id }));
    return;
  }
  if (!overlaps(own, maskRect)) {
    out.push(finding('warn', 'render', `${scope}/mask-miss`, `${snap.name} lies outside its mask`,
      `${snap.path} at ${rectText(own)} does not overlap its mask at ${rectText(maskRect)}.`,
      { path: snap.path, nodeId: snap.id }));
  }
}

function checkText(ctx: ScanContext, snap: NodeSnapshot, out: Finding[], scope: string) {
  if (!snap.text) return;
  const t = snap.text;
  if (t.chars === 0 && snap.visible && snap.rect && snap.rect.w > 4 && snap.rect.h > 4) {
    out.push(finding('warn', 'text', `${scope}/empty-text`, `${snap.name} is an empty text field`,
      `${snap.path} (${t.font} ${t.size}px) exists at ${rectText(snap.rect)} but holds no characters.`,
      { path: snap.path, nodeId: snap.id, hint: 'The label assignment (setText/`text = …`/variable binding) never ran or wrote an empty value.' }));
  }
  if (t.embedFonts && t.fontId != null && ctx.options.fontIds && !ctx.options.fontIds.has(t.fontId)) {
    out.push(finding('warn', 'text', `${scope}/font-missing`, `${snap.name} uses an unregistered embedded font`,
      `${snap.path} has embedFonts=true with font id ${t.fontId}, which is not among the registered fonts.`,
      { path: snap.path, nodeId: snap.id, hint: 'Load the SWF’s exported font files (FFDec fonts folder) or the field falls back to a system font.' }));
  }
}

/**
 * Input routing, only for actual controls. A click on a label must reach the
 * button under it, and a click on a clip *inside* another control belongs to
 * that control — neither is a finding. What is worth reporting: the engine
 * routes the click to a control that is painted *below* this one, which cannot
 * be right (paint order and hit order disagree).
 */
function checkInput(ctx: ScanContext, node: DisplayNode, snap: NodeSnapshot, out: Finding[], scope: string) {
  if (!snap.rect || !ctx.player.mouseTarget) return;
  if (!snap.interactive) return;
  if (!node.obj || read<unknown>(node.obj, 'enabled') === false) return;
  const x = snap.rect.x + snap.rect.w / 2;
  const y = snap.rect.y + snap.rect.h / 2;
  let target: DisplayNode | null = null;
  try { target = ctx.player.mouseTarget(x, y); } catch { return; }
  if (!target || target === node) return;
  for (let p: DisplayNode | null = target.parent; p; p = p.parent) if (p === node) return; // target is inside this control
  for (let p: DisplayNode | null = node.parent; p; p = p.parent) if (p === target) return; // this control is inside the target
  const order = ctx.snapById.get(target.id)?.order;
  if (order === undefined || order > snap.order) return; // painted above: normal layering
  const targetName = target.name || target.character?.exportName || `${target.kind} ${target.characterId}`;
  out.push(finding('warn', 'input', `${scope}/input-blocked`, `Clicks on ${snap.name} go to ${targetName} behind it`,
    `The point ${Math.round(x)},${Math.round(y)} (centre of ${snap.path}) hit-tests to ${ctx.player.describe(target)}, which is painted *before* the control.`,
    { path: snap.path, nodeId: snap.id, hint: 'Paint order and hit order disagree: the engine should route clicks to the control that is drawn on top.' }));
}

// --------------------------------------------------------- component checks

/**
 * MX component diagnosis. A List whose data provider holds items but whose row
 * count is NaN is the canonical case: the row clips are only created by
 * `layoutContent`, which is driven by `getViewMetrics()`, so one undefined
 * metric (an unbound skin class) leaves the list an empty white rectangle.
 */
function checkComponent(snap: NodeSnapshot, out: Finding[], scope: string) {
  const c = snap.component;
  if (!c) return;
  const items = c.itemCount ?? c.dataProvider;
  const rows = c.rows;
  const base = { path: snap.path, nodeId: snap.id };

  if (c.brokenMetrics.length) {
    out.push(finding('error', 'component', `${scope}/metrics-broken`, `${c.className}: layout metrics are broken`,
      `getViewMetrics()/skin reported ${c.brokenMetrics.join(', ')}.`,
      {
        ...base,
        hint: 'The component’s skin/subelement is missing its class — usually because the SWF’s DoInitAction `Object.registerClass(...)` for that symbol never ran (loaded externals must run their init actions).',
        evidence: { metrics: c.brokenMetrics.join('; '), rowHeight: c.rowHeight, border: c.border?.className ?? null },
      }));
  }

  if (isNaNValue(c.rowCount)) {
    out.push(finding('error', 'component', `${scope}/rowcount-nan`, `${c.className}: row count is NaN`,
      `__rowCount = NaN with ${items ?? '?'} item(s) and row height ${c.rowHeight ?? '?'}.`,
      {
        ...base,
        hint: 'A NaN here comes from the layout maths (height ÷ rowHeight) receiving an undefined metric; no row clip is ever created.',
        evidence: { rowHeight: c.rowHeight, itemCount: items, invalidateFlag: c.dirty.invalidateFlag },
      }));
  }

  if (items != null && items > 0 && (rows == null || rows === 0)) {
    const expected = c.rowHeight && snap.rect ? Math.ceil((snap.rect.h - 4) / c.rowHeight) : null;
    out.push(finding('error', 'component', `${scope}/items-but-no-rows`, `${c.className}: ${items} item(s) but no row clips`,
      `${snap.path} holds ${items} item(s) in its data provider; the live \`rows\` array is ${rows == null ? 'undefined' : `${rows} entries`}` +
      `${expected ? ` (≈${expected} rows fit in ${Math.round(snap.rect?.h ?? 0)}px)` : ''}.`,
      {
        ...base,
        hint: c.dirty.invLayoutContent || c.dirty.invalidateFlag || c.dirty.invUpdateControl
          ? 'The component is still dirty (invalidation pending) — let one more frame run before deciding it is broken.'
          : 'Layout never created the rows: check the metrics finding above, then the rowHeight / dataProvider values.',
        evidence: {
          itemCount: items, rows: rows ?? -1, rowCount: c.rowCount ?? -1, rowHeight: c.rowHeight ?? -1,
          invLayoutContent: c.dirty.invLayoutContent, invalidateFlag: c.dirty.invalidateFlag,
        },
      }));
    return;
  }

  if (rows != null && rows > 0 && snap.rect) {
    if (snap.childCount === 0) {
      out.push(finding('error', 'component', `${scope}/rows-detached`, `${c.className}: row objects exist but are not on screen`,
        `${rows} row object(s) are in \`rows\`, but the component has no child clips.`,
        { ...base, hint: 'The rows were removeMovieClip’d or attached to another parent; re-run the layout (Restart).' }));
    }

    const labels = c.rowDetail.filter((r) => r.label.trim().length > 0).length;
    const visibleRows = c.rowDetail.filter((r) => r.visible).length;
    if (labels < Math.min(rows, items ?? rows)) {
      out.push(finding('error', 'component', `${scope}/rows-empty`, `${c.className}: rows exist but their labels are empty`,
        `${c.rowDetail.filter((r) => !r.label.trim()).length} of ${rows} row(s) report an empty label (data provider has ${items ?? '?'} item(s)).`,
        { ...base, hint: 'The cell renderer did not receive the item (drawRow/labelField mismatch) — compare with the data provider values in the evidence.' }));
    } else if (rows > 0) {
      out.push(finding('pass', 'component', `${scope}/rows-ok`, `${c.className}: ${rows} row clip(s) for ${items ?? '?'} item(s)`,
        `First labels: ${c.rowDetail.slice(0, 3).map((r) => JSON.stringify(r.label)).join(', ')}.`,
        { ...base, evidence: { visibleRows, labels } }));
    }

  }

  if (c.scroll && items != null && rows != null && c.rowHeight) {
    const fits = snap.rect ? Math.max(1, Math.floor((snap.rect.h - 4) / c.rowHeight)) : 0;
    if (items > fits && (c.scroll.maxPos == null || c.scroll.maxPos === 0)) {
      out.push(finding('warn', 'component', `${scope}/scroll-stuck`, `${c.className}: ${items} item(s) but the scrollbar cannot move`,
        `Only ~${fits} row(s) fit in ${Math.round(snap.rect?.h ?? 0)}px and vScroller.maxPos is ${c.scroll.maxPos ?? 'undefined'}.`,
        { ...base, hint: 'The scrollbar never got its range (setScrollProperties with a NaN row count).' }));
    }
  }

  if (c.border && !c.border.metrics && !c.brokenMetrics.length) {
    out.push(finding('warn', 'component', `${scope}/skin-unbound`, `${c.className}: border skin has no metrics`,
      `border_mc (${c.border.name ?? '?'}) has no borderMetrics / class.`,
      { ...base, hint: 'The skin symbol was instantiated without its class (Object.registerClass did not run for it).' }));
  }
}

/**
 * Render the component's region and look at the pixels. A region that is a
 * single flat colour while the data provider is full is the "white rectangle"
 * everyone is staring at.
 */
function checkRenderedRegion(ctx: ScanContext, snap: NodeSnapshot, out: Finding[]) {
  if (!snap.rect || snap.rect.w < 4 || snap.rect.h < 4) return;
  if (ctx.probesLeft <= 0) return;
  const region = inset(snap.rect, 1);
  if (ctx.reportedFlat.has(snap.id)) return;
  ctx.probesLeft -= 1;
  const stats = probeRegion(ctx.player, region, 96);
  if (!stats) return;
  const items = snap.component?.itemCount ?? snap.component?.dataProvider ?? null;
  const flat = stats.inkRatio < 0.01;
  ctx.reportedFlat.add(snap.id);
  if (flat && (items ?? 0) > 0) {
    out.push(finding('error', 'render', `node:${snap.path}/flat`, `${snap.name} is a flat block of ${stats.dominant}`,
      `Rendering ${rectText(region)} gives ${stats.colors} colour(s); ${(100 - stats.inkRatio * 100).toFixed(1)}% is ${stats.dominant}. ` +
      `The data provider holds ${items} item(s), so the list content was never painted.`,
      {
        path: snap.path, nodeId: snap.id,
        hint: 'This is what an unlaid-out component looks like: the skin is drawn, the rows are not. Fix the layout findings above.',
        evidence: { dominant: stats.dominant, colors: stats.colors, inkPercent: Math.round(stats.inkRatio * 1000) / 10, items },
      }));
  } else if (!flat) {
    out.push(finding('pass', 'render', `node:${snap.path}/painted`, `${snap.name} paints content`,
      `${rectText(region)}: ${stats.colors} colours, ${(stats.inkRatio * 100).toFixed(1)}% non-background pixels.`,
      { path: snap.path, nodeId: snap.id, evidence: { dominant: stats.dominant, colors: stats.colors } }));
  }
}

// ------------------------------------------------------------ canvas ↔ stage

/** Map a pointer event's client coordinates to stage pixels (mirrors Execute's view transform). */
export function canvasToStage(
  canvas: HTMLCanvasElement,
  player: { width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const scale = Math.min(rect.width / player.width, rect.height / player.height) || 1;
  const ox = (rect.width - player.width * scale) / 2;
  const oy = (rect.height - player.height * scale) / 2;
  const x = (clientX - rect.left - ox) / scale;
  const y = (clientY - rect.top - oy) / scale;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > player.width || y > player.height) return null;
  return { x, y };
}

// ------------------------------------------------------ point interrogation

export interface PointReport {
  point: { x: number; y: number };
  /** deepest display-list node whose bounds contain the point */
  node: NodeSnapshot | null;
  /** what the player would send mouse events to at this point */
  hit: { id: number; path: string; node: NodeSnapshot | null } | null;
  pixel: PixelStats | null;
  findings: Finding[];
}

/** "What is under this canvas point, and why is it blank?" */
export function analyzePoint(player: InspectablePlayer, x: number, y: number, options: ScanOptions = {}): PointReport {
  const { nodes, byId } = snapshotStage(player, options.scope, options.maxNodes);
  const containsPoint = (rect: PxRect | null) => !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  let deepest: NodeSnapshot | null = null;
  for (const snap of nodes) {
    if (!containsPoint(snap.rect)) continue;
    if (!deepest || snap.rect!.w * snap.rect!.h <= deepest.rect!.w * deepest.rect!.h) deepest = snap;
  }

  let hit: PointReport['hit'] = null;
  try {
    const target = player.mouseTarget?.(x, y) ?? null;
    if (target) hit = { id: target.id, path: player.describe(target), node: nodes.find((n) => n.id === target.id) ?? null };
  } catch { /* hit testing is best-effort */ }

  const findings: Finding[] = [];
  const ctx: ScanContext = { player, options, byId, snapById: new Map(nodes.map((n) => [n.id, n])), probesLeft: 2, reportedFlat: new Set() };
  const scope = deepest ? `point:${deepest.path}` : 'point';
  if (deepest) {
    const node = byId.get(deepest.id);
    if (node) {
      // The reader clicked this exact point and asked "why is nothing here?":
      // an explained state is still the answer they need.
      if (!deepest.visible || deepest.hiddenByAncestor) reportHiddenSubtree([deepest], findings, scope, { state: true });
      else checkTransparency(deepest, findings, scope);
      checkGeometry(ctx, deepest, findings, scope);
      checkContent(deepest, node, findings, scope);
      checkOcclusion(ctx, node, deepest, findings, scope);
      checkMask(ctx, node, deepest, findings, scope);
      checkText(ctx, deepest, findings, scope);
      if (deepest.component) checkComponent(deepest, findings, scope);
      checkRenderedRegion(ctx, deepest, findings);
    }
  } else {
    findings.push(finding('info', 'stage', `${scope}/nothing`, 'No display-list node covers this point',
      'Clicking hit no clip — the area is the stage background.',
      { hint: 'If you expected UI here, the clip is either off-stage, hidden, or was never created (see the Report tab for the component checks).' }));
  }

  // deepest may be invisible while an ancestor/overlay wins the hit test
  if (deepest && hit && hit.id !== deepest.id) {
    findings.push(finding('info', 'input', `${scope}/hit-differs`, `Mouse input goes to ${hit.path}`,
      `The topmost drawn node here is ${deepest.path}, but the player hit-tests to ${hit.path}.`,
      { path: hit.path, nodeId: hit.id, hint: 'Invisible/hidden clips are skipped by the hit test; overlays win it.' }));
  }

  return {
    point: { x, y },
    node: deepest,
    hit,
    pixel: probeRegion(player, { x: x - 60, y: y - 40, w: 120, h: 80 }, 120),
    findings: sortFindings(findings),
  };
}

/** All findings as a plain-text report (clipboard / download). */
export function reportToText(result: ScanResult): string {
  const lines: string[] = [
    `UI troubleshooter report — ${new Date(result.scannedAt).toISOString()}`,
    `checked ${result.stats.nodes} node(s) in ${result.stats.durationMs} ms, ${result.stats.probed} pixel probe(s)`,
    '',
  ];
  for (const severity of ['error', 'warn', 'info', 'pass'] as const) {
    const list = result.findings.filter((f) => f.severity === severity);
    if (!list.length) continue;
    lines.push(`## ${severity.toUpperCase()} (${list.length})`);
    for (const f of list) {
      lines.push(`- [${f.area}] ${f.title}`);
      lines.push(`  ${f.detail}`);
      if (f.hint) lines.push(`  → ${f.hint}`);
      if (f.path) lines.push(`  at ${f.path}`);
      if (f.evidence) lines.push(`  evidence: ${JSON.stringify(f.evidence)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0, pass: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}
