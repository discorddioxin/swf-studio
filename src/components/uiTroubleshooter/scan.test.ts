// @vitest-environment jsdom
// UI troubleshooter checks: driven by a stub player so every rule can be
// exercised without booting a game. The regression these pin down is the one
// the Execute tab actually hit: a List whose data provider holds the servers
// while `__rowCount` is NaN — every row clip stays uncreated and the stage
// shows a white rectangle.
import { describe, expect, it } from 'vitest';
import type { Matrix, Rect } from '../../types';
import { identity } from '../../engine/as2/geom';
import type { DisplayNode, Movie } from '../../engine/as2/player';
import { DisplayNode as Node } from '../../engine/as2/player';
import { analyzePoint, canvasToStage, countBySeverity, looksLikeComponent, reportToText, scanStage, snapshotStage, stageRect, type InspectablePlayer } from './scan';

// ------------------------------------------------------------------ stubs

const movie = () => ({
  doc: { characters: new Map(), timelines: new Map(), header: { fileName: 'test.swf' } },
  program: null, assets: null, url: 'root',
}) as unknown as Movie;

function clip(name: string, characterId = 1, kind: ConstructorParameters<typeof Node>[0] = 'clip'): DisplayNode {
  const node = new Node(kind, movie(), characterId);
  node.name = name;
  return node;
}

/** Minimal stand-in for AS2Player: explicit local bounds + a hit-test map. */
function stubPlayer(root: DisplayNode, rects: Map<DisplayNode, Rect>, mouseTarget?: (x: number, y: number) => DisplayNode | null): InspectablePlayer {
  const player: InspectablePlayer = {
    root,
    width: 550,
    height: 400,
    background: '#ffffff',
    localBounds: (node) => rects.get(node) ?? null,
    // Matrices carry twips translations; the stubs leave them at zero unless a
    // test sets one, so the rect map below is read directly as stage pixels.
    globalMatrix: (node): Matrix => ({ ...identity(), tx: node.matrix.tx, ty: node.matrix.ty }),
    describe: (node) => (node === root ? '_root' : node.path()),
  };
  if (mouseTarget) player.mouseTarget = mouseTarget;
  return player;
}

/**
 * Minimal 2D canvas stand-in for the pixel checks: jsdom has no canvas, so the
 * scan's probes would silently skip. `fillRect` paints into an RGBA buffer that
 * `getImageData` hands back; returns a restore function.
 */
function fakeCanvas(): () => void {
  const original = document.createElement.bind(document);
  const create = (tag: string) => {
    if (tag !== 'canvas') return original(tag);
    const buf = new Uint8ClampedArray(256 * 256 * 4).fill(255);
    const ctx = {
      canvas: null as unknown,
      fillStyle: '#ffffff',
      setTransform() {}, clearRect() {}, translate() {}, save() {}, restore() {},
      beginPath() {}, rect() {}, clip() {}, transform() {},
      fillRect(x: number, y: number, w: number, h: number) {
        const black = String(this.fillStyle).toLowerCase() === '#000000';
        for (let yy = Math.max(0, Math.round(y)); yy < Math.min(256, Math.round(y + h)); yy++) {
          for (let xx = Math.max(0, Math.round(x)); xx < Math.min(256, Math.round(x + w)); xx++) {
            const i = (yy * 256 + xx) * 4;
            buf[i] = buf[i + 1] = buf[i + 2] = black ? 0 : 255;
            buf[i + 3] = 255;
          }
        }
      },
      getImageData(x: number, y: number, w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            const src = ((y + yy) * 256 + (x + xx)) * 4;
            const dst = (yy * w + xx) * 4;
            data.set(buf.subarray(src, src + 4), dst);
          }
        }
        return { data, width: w, height: h, colorSpace: 'srgb' } as unknown as ImageData;
      },
    };
    const el = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    ctx.canvas = el;
    return el;
  };
  document.createElement = create as typeof document.createElement;
  return () => { document.createElement = original as typeof document.createElement; };
}

const px = (x: number, y: number, w: number, h: number): Rect => ({ xMin: x * 20, yMin: y * 20, xMax: (x + w) * 20, yMax: (y + h) * 20 });

function attach(parent: DisplayNode, child: DisplayNode) {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

const byTitle = (findings: ReturnType<typeof scanStage>['findings'], needle: string) => findings.filter((f) => f.title.includes(needle));

// ------------------------------------------------------------------ checks

describe('display-list diagnosis', () => {
  it('reports the broken List: items in the data provider, NaN row count, no rows', () => {
    const root = clip('_root', 0);
    const chooser = attach(root, clip('mc_ServerChooser'));
    const list = attach(chooser, clip('serverListing_lt', 150));
    const border = attach(list, clip('depthChild0', 32));
    const content = attach(list, clip('content_mc', 151));
    void content;
    // a List whose skin class never bound: metrics undefined → NaN row count
    (list.obj as Record<string, unknown>) = {
      className: 'List',
      getLength: () => 3,
      __dataProvider: { length: 3 },
      __rowHeight: 20,
      __rowCount: Number.NaN,
      rows: undefined,
      border_mc: border.obj,
      getViewMetrics: () => ({ left: undefined, right: Number.NaN, top: undefined, bottom: undefined }),
    };
    border.obj = { _name: 'depthChild0' }; // plain MovieClip: no borderMetrics, no className

    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [chooser, px(20, 300, 240, 100)],
      [list, px(40, 300, 238, 203)],
      [border, px(40, 300, 238, 203)],
    ]);
    const player = stubPlayer(root, rects);
    const result = scanStage(player, { probe: false });

    expect(byTitle(result.findings, 'row count is NaN')).toHaveLength(1);
    expect(byTitle(result.findings, 'item(s) but no row clips')).toHaveLength(1);
    expect(byTitle(result.findings, 'layout metrics are broken')[0].severity).toBe('error');

    const noRows = byTitle(result.findings, 'item(s) but no row clips')[0];
    expect(noRows.severity).toBe('error');
    expect(noRows.path).toBe(list.path());
    expect(noRows.hint).toMatch(/Layout never created the rows/);
    expect(noRows.evidence).toMatchObject({ itemCount: 3, rowHeight: 20, rows: -1 });
    expect(countBySeverity(result.findings).error).toBeGreaterThanOrEqual(3);
    expect(result.stats.primaryComponent?.path).toBe(list.path());
    expect(reportToText(result)).toContain('row count is NaN');
  });

  it('marks the same list as provisional while its invalidation is pending', () => {
    const root = clip('_root', 0);
    const list = attach(root, clip('serverListing_lt', 150));
    (list.obj as Record<string, unknown>) = {
      className: 'List', getLength: () => 2, __dataProvider: { length: 2 }, __rowHeight: 20,
      __rowCount: undefined, rows: undefined, invLayoutContent: true, invalidateFlag: true,
      listContent: {},
      getViewMetrics: () => ({ left: 2, right: 18, top: 2, bottom: 2 }),
    };
    const player = stubPlayer(root, new Map<DisplayNode, Rect>([[root, px(0, 0, 550, 400)], [list, px(10, 10, 238, 203)]]));
    const result = scanStage(player, { probe: false });
    const pending = byTitle(result.findings, 'item(s) but no row clips')[0];
    expect(pending.severity).toBe('error'); // no rows is still an error …
    expect(pending.hint).toMatch(/still dirty/); // … but the hint explains it may resolve next frame
  });

  it('passes a List that laid out its rows and filled the labels', () => {
    const root = clip('_root', 0);
    const list = attach(root, clip('serverListing_lt', 150));
    const rows = [0, 1, 2].map((i) => {
      const row = clip(`listRow1${i}`, 72);
      return { _name: row.name, _y: 2 + i * 20, _height: 20, _visible: true, label: `Server ${i}`, item: { label: `Server ${i}` } };
    });
    (list.obj as Record<string, unknown>) = {
      className: 'List', getLength: () => 3, __dataProvider: { length: 3 }, __rowHeight: 20,
      __rowCount: 10, rows, border_mc: { className: 'RectBorder', borderMetrics: { left: 2, right: 2, top: 2, bottom: 2 } },
      vScroller: { className: 'VScrollBar', scrollPosition: 0, maxPos: 0 },
      getViewMetrics: () => ({ left: 2, right: 18, top: 2, bottom: 2 }),
    };
    for (const row of rows) attach(list, clip(row._name, 72));
    const player = stubPlayer(root, new Map<DisplayNode, Rect>([[root, px(0, 0, 550, 400)], [list, px(10, 10, 238, 203)]]));
    const result = scanStage(player, { probe: false });
    expect(result.findings.find((f) => f.id.endsWith('/rows-ok'))?.severity).toBe('pass');
    expect(byTitle(result.findings, 'no row clips')).toHaveLength(0);
    expect(byTitle(result.findings, 'row count is NaN')).toHaveLength(0);
    // 3 items do not fill 10 row slots, so the scrollbar staying at 0 is fine
    expect(byTitle(result.findings, 'scrollbar cannot move')).toHaveLength(0);
  });

  it('reports a hidden subtree once at its root — never once per descendant', () => {
    const root = clip('_root', 0);
    const panel = attach(root, clip('panel'));
    panel.visible = false;
    const label = attach(panel, clip('title', 12));
    const deeper = attach(label, clip('icon', 4, 'graphic'));
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [panel, px(0, 0, 200, 100)],
      [label, px(5, 5, 100, 20)],
      [deeper, px(6, 6, 10, 10)],
    ]);
    const result = scanStage(stubPlayer(root, rects), { probe: false });
    const hidden = byTitle(result.findings, 'is hidden (_visible = false)');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].path).toBe(panel.path());
    expect(hidden[0].severity).toBe('info'); // nothing interactive inside
    expect(hidden[0].evidence).toMatchObject({ clips: 1, descendants: 2 });
    // the visible label inside the hidden panel is not reported on its own
    expect(byTitle(result.findings, label.name)).toHaveLength(0);
  });

  it('warns when a hidden clip traps an interactive control', () => {
    const root = clip('_root', 0);
    const bar = attach(root, clip('bar'));
    const lock = attach(bar, clip('mc_LockButon'));
    lock.visible = false;
    const button = attach(lock, clip('instance103', 236, 'button'));
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [bar, px(0, 0, 640, 22)],
      [lock, px(530, 4, 14, 14)],
      [button, px(530, 4, 14, 14)],
    ]);
    const player = stubPlayer(root, rects);
    player.isMouseTarget = (n) => n.kind === 'button' || n.name === 'mc_LockButon';
    const result = scanStage(player, { probe: false });
    const hidden = byTitle(result.findings, 'is hidden (_visible = false)');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].severity).toBe('warn');
    expect(hidden[0].hint).toMatch(/can never be clicked/);
  });

  it('accepts a clip the movie’s own script hid — and says so once instead of warning', () => {
    const root = clip('_root', 0);
    const bar = attach(root, clip('bar'));
    const lock = attach(bar, clip('mc_LockButon'));
    const button = attach(lock, clip('instance103', 236, 'button'));
    // `initGSECS()`/`creationCheck()` in the movie: bar.mc_LockButon._visible = false
    lock.visible = false;
    lock.visibleSource = 'script';
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [bar, px(0, 0, 640, 22)],
      [lock, px(530, 4, 14, 14)],
      [button, px(530, 4, 14, 14)],
    ]);
    const player = stubPlayer(root, rects);
    player.isMouseTarget = (n) => n.kind === 'button' || n.name === 'mc_LockButon';
    const result = scanStage(player, { probe: false });

    // the game's own state is not a problem: no warning, no info finding …
    expect(byTitle(result.findings, 'is hidden (_visible = false)')).toHaveLength(0);
    // … and the state is still stated, once, with the count
    const state = result.findings.filter((f) => f.id === 'stage/hidden-state');
    expect(state).toHaveLength(1);
    expect(state[0].severity).toBe('pass');
    expect(state[0].evidence).toMatchObject({ clips: 1, hiddenByScript: 1, masks: 0 });
    expect(result.stats.explainedHidden).toBe(1);

    // the snapshot carries the attribution, so the panel can show it
    const snap = snapshotStage(player);
    expect(snap.root?.children[0].children[0].hiddenReason).toBe('script');
    expect(snap.root?.children[0].children[0].visibleSource).toBe('script');
    // the button *inside* the hidden clip is invisible for the same reason
    expect(snap.root?.children[0].children[0].children[0].hiddenReason).toBe('script');
  });

  it('does not report a setMask() mask as hidden UI', () => {
    const root = clip('_root', 0);
    const list = attach(root, clip('serverListing_lt', 150));
    const content = attach(list, clip('content_mc', 151));
    const mask = attach(list, clip('mask_mc', 32));
    // ScrollView: mask_mc._visible = false; listContent.setMask(mask_mc)
    mask.visible = false;
    mask.visibleSource = 'script';
    content.maskedBy = mask;
    mask.mask = content;
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [list, px(20, 20, 238, 203)],
      [content, px(22, 22, 219, 180)],
      [mask, px(22, 22, 219, 180)],
    ]);
    const result = scanStage(stubPlayer(root, rects), { probe: false });
    expect(byTitle(result.findings, 'mask_mc is hidden')).toHaveLength(0);
    expect(result.stats.explainedHidden).toBe(1);
    const state = result.findings.find((f) => f.id === 'stage/hidden-state');
    // the mask is the one hidden clip, and its reason is structural: a mask is
    // never painted, so it is counted as a mask, not as hidden game state
    expect(state?.evidence).toMatchObject({ clips: 1, masks: 1, hiddenByScript: 0 });

    const snap = snapshotStage(stubPlayer(root, rects));
    const maskSnap = snap.root?.children[0].children[1];
    expect(maskSnap?.usedAsMask).toBe(true);
    expect(maskSnap?.masked).toBe(false);
    expect(snap.root?.children[0].children[0].masked).toBe(true);
  });

  it('reports a masked clip that sits outside its mask, never the mask itself', () => {
    const root = clip('_root', 0);
    const content = attach(root, clip('content_mc', 151));
    const mask = attach(root, clip('mask_mc', 32));
    content.maskedBy = mask;
    mask.mask = content;
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [content, px(10, 10, 40, 40)],
      [mask, px(200, 200, 40, 40)],
    ]);
    const result = scanStage(stubPlayer(root, rects), { probe: false });
    const miss = byTitle(result.findings, 'lies outside its mask');
    expect(miss).toHaveLength(1);
    expect(miss[0].path).toBe(content.path());
    expect(miss[0].severity).toBe('warn');

    // an unmasked sibling is not compared against the mask's box
    const other = attach(root, clip('join_btn', 288));
    rects.set(other, px(300, 10, 40, 20));
    const second = scanStage(stubPlayer(root, rects), { probe: false });
    expect(byTitle(second.findings, 'lies outside its mask')).toHaveLength(1);
  });

  it('groups repeated sibling skins into one finding', () => {
    const root = clip('_root', 0);
    const content = attach(root, clip('content_mc'));
    for (let i = 0; i < 11; i++) {
      const row = attach(content, clip(`listRow1${i % 10}`, 72));
      attach(row, clip('tran_mc')).visible = false;
    }
    const rects = new Map<DisplayNode, Rect>([[root, px(0, 0, 550, 400)], [content, px(10, 10, 200, 200)]]);
    const result = scanStage(stubPlayer(root, rects), { probe: false });
    const hidden = byTitle(result.findings, 'named tran_mc are hidden');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].evidence).toMatchObject({ clips: 11 });
  });

  it('does not report a click that lands on the button under a label', () => {
    const root = clip('_root', 0);
    const button = attach(root, clip('createGame_btn', 286, 'button'));
    const label = attach(button, clip('create_txt', 293));
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [button, px(233, 348, 80, 20)],
      [label, px(236, 350, 74, 16)],
    ]);
    const player = stubPlayer(root, rects, () => button);
    player.isMouseTarget = (n) => n.kind === 'button';
    const result = scanStage(player, { probe: false });
    expect(byTitle(result.findings, 'Clicks on')).toHaveLength(0);
  });

  it('warns only when the click goes to a control painted *below* the node', () => {
    const root = clip('_root', 0);
    const behind = attach(root, clip('behind', 204, 'button'));
    const front = attach(root, clip('front', 288, 'button'));
    behind.obj = { enabled: true };
    front.obj = { enabled: true };
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [behind, px(10, 10, 20, 20)],
      [front, px(10, 10, 20, 20)],
    ]);
    // both are controls; the engine sends the click to the one painted first
    const player = stubPlayer(root, rects, () => behind);
    player.isMouseTarget = (n) => n.kind === 'button';
    const result = scanStage(player, { probe: false });
    const blocked = byTitle(result.findings, 'Clicks on');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].severity).toBe('warn');
    expect(blocked[0].path).toBe(front.path());
    expect(blocked[0].title).toContain('behind it');
  });

  it('flags a covering sibling only when pixels prove it paints over the control', () => {
    const root = clip('_root', 0);
    const button = attach(root, clip('join_btn', 288, 'button'));
    button.obj = { enabled: true };
    const overlay = attach(root, clip('overlay'));
    root.children = [button, overlay]; // overlay is the later sibling
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [button, px(330, 348, 80, 20)],
      [overlay, px(320, 340, 100, 40)],
    ]);
    const player = stubPlayer(root, rects);
    player.isMouseTarget = (n) => n.kind === 'button';
    // probes off → the check must stay silent rather than guess from boxes
    expect(byTitle(scanStage(player, { probe: false }).findings, 'is covered by')).toHaveLength(0);
    // probes on but no renderer → still silent
    expect(byTitle(scanStage(player).findings, 'is covered by')).toHaveLength(0);

    // Render the overlay as a solid block: measuring the button's region with
    // the overlay on vs off shows it paints 100% of the control.
    const restore = fakeCanvas();
    let mode: 'block' | 'frame' | 'none' = 'block';
    player.renderTo = (c) => {
      if (!overlay.visible || mode === 'none') return;
      c.fillStyle = '#000000';
      if (mode === 'block') c.fillRect(0, 0, 999, 999);
      else { c.fillRect(0, 0, 999, 2); c.fillRect(0, 0, 2, 999); } // hollow frame
    };
    try {
      const covered = byTitle(scanStage(player).findings, 'is covered by overlay');
      expect(covered).toHaveLength(1);
      expect(covered[0].evidence).toMatchObject({ coveredPercent: 100 });

      // A frame shares the bounding box but paints ~13% of the region: silent.
      mode = 'frame';
      expect(byTitle(scanStage(player).findings, 'is covered by overlay')).toHaveLength(0);

      // Nothing painted at all → silent too.
      mode = 'none';
      expect(byTitle(scanStage(player).findings, 'is covered by overlay')).toHaveLength(0);
    } finally { restore(); }
  });

  it('reports missing external SWFs and engine errors', () => {
    const root = clip('_root', 0);
    const player = stubPlayer(root, new Map<DisplayNode, Rect>([[root, px(0, 0, 550, 400)]]));
    player.errors = 2;
    player.missingExternals = new Set(['scene.swf']);
    const result = scanStage(player, { probe: false });
    expect(byTitle(result.findings, 'runtime error(s) hit the engine')[0].severity).toBe('error');
    expect(byTitle(result.findings, 'external SWF(s) were never loaded')[0].severity).toBe('warn');
  });
});

describe('snapshot + geometry', () => {
  it('walks the tree with stage-pixel bounds and marks hidden subtrees', () => {
    const root = clip('_root', 0);
    const hidden = attach(root, clip('popup'));
    hidden.visible = false;
    const child = attach(hidden, clip('inner'));
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [hidden, px(100, 100, 50, 50)],
      [child, px(110, 110, 10, 10)],
    ]);
    // a node whose matrix translates it by 10px (200 twips) on top of its own bounds
    const shifted = clip('shifted');
    shifted.matrix = { ...identity(), tx: 200, ty: 100 };
    rects.set(shifted, px(0, 0, 10, 10));

    const player = stubPlayer(root, rects);
    const snap = snapshotStage(player);
    expect(snap.root?.children[0].name).toBe('popup');
    expect(snap.root?.children[0].hiddenBy).toBe('_level0.popup');
    expect(snap.root?.children[0].hiddenByAncestor).toBeUndefined();
    expect(snap.root?.children[0].children[0].hiddenBy).toBe('_level0.popup');
    expect(snap.root?.children[0].children[0].hiddenByAncestor).toBe('_level0.popup');
    expect(stageRect(player, child)).toEqual({ x: 110, y: 110, w: 10, h: 10 });
    expect(stageRect(player, shifted)).toEqual({ x: 10, y: 5, w: 10, h: 10 }); // twips → stage px
  });

  it('detects component-shaped AS2 objects', () => {
    expect(looksLikeComponent({ className: 'List', rows: [] })).toBe(true);
    expect(looksLikeComponent({ __rowHeight: 20 })).toBe(true);
    expect(looksLikeComponent({ _x: 0 })).toBe(false);
    expect(looksLikeComponent(null)).toBe(false);
  });
});

describe('point interrogation', () => {
  it('finds the deepest node covering a point and reports what the mouse hits', () => {
    const root = clip('_root', 0);
    const list = attach(root, clip('serverListing_lt', 150));
    const row = attach(list, clip('listRow10', 72));
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [list, px(20, 20, 238, 203)],
      [row, px(22, 22, 219, 20)],
    ]);
    const player = stubPlayer(root, rects, () => root);
    const report = analyzePoint(player, 100, 30, { probe: false });
    expect(report.node?.path).toBe(row.path());
    expect(report.hit?.path).toBe('_root');
    // the deepest drawn node is not the hit target → explain it
    expect(report.findings.some((f) => f.title.startsWith('Mouse input goes to'))).toBe(true);
  });

  it('answers “why is this blank?” with the game’s own state, not a warning', () => {
    const root = clip('_root', 0);
    const panel = attach(root, clip('mc_loading_bar'));
    panel.visible = false;
    panel.visibleSource = 'script'; // removeLoadingBar()
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [panel, px(20, 20, 200, 20)],
    ]);
    const player = stubPlayer(root, rects, () => root);
    const report = analyzePoint(player, 100, 30, { probe: false });
    expect(report.node?.path).toBe(panel.path());
    const hidden = byTitle(report.findings, 'is hidden (_visible = false)');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].severity).toBe('info'); // never a warn for a deliberate state
    expect(hidden[0].id).toContain('/hidden-state');
    expect(hidden[0].hint).toMatch(/Nothing is broken here/);
  });

  it('attributes a point inside a hidden clip to the clip that the game hid', () => {
    const root = clip('_root', 0);
    const bar = attach(root, clip('bar'));
    const lock = attach(bar, clip('mc_LockButon'));
    const glyph = attach(lock, clip('instance103', 233, 'graphic'));
    lock.visible = false;
    lock.visibleSource = 'script'; // bar.mc_LockButon._visible = false — the glyph itself was never written
    const rects = new Map<DisplayNode, Rect>([
      [root, px(0, 0, 550, 400)],
      [bar, px(0, 0, 640, 22)],
      [lock, px(530, 4, 14, 14)],
      [glyph, px(534, 8, 5, 6)],
    ]);
    const player = stubPlayer(root, rects, () => null);
    const report = analyzePoint(player, 536, 10, { probe: false });
    expect(report.node?.path).toBe(glyph.path());
    expect(report.node?.hiddenReason).toBe('script');
    const hidden = byTitle(report.findings, 'is hidden (_visible = false)');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].severity).toBe('info');
    expect(hidden[0].detail).toMatch(/ActionScript set _visible = false/);
    expect(hidden[0].hint).toMatch(/Nothing is broken here/);
  });

  it('explains a point that no clip covers', () => {
    const root = clip('_root', 0);
    const player = stubPlayer(root, new Map<DisplayNode, Rect>([[root, px(0, 0, 550, 400)]]));
    const report = analyzePoint(player, 600, 500, { probe: false }); // letterbox area, outside the stage rect
    expect(report.node).toBeNull();
    expect(report.findings[0].title).toMatch(/No display-list node covers this point/);
  });
});

describe('canvas mapping', () => {
  it('maps client coordinates to stage pixels including the letterbox offset', () => {
    const canvas = {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 1100, height: 800 }) as DOMRect,
    } as HTMLCanvasElement;
    // stage 550×400 into 1100×800 → scale 2, no letterbox
    expect(canvasToStage(canvas, { width: 550, height: 400 }, 10 + 100, 20 + 100)).toEqual({ x: 50, y: 50 });
    // points outside the stage are rejected
    expect(canvasToStage(canvas, { width: 550, height: 400 }, 0, 0)).toBeNull();
  });
});
