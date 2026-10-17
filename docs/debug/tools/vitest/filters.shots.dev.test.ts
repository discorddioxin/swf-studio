// P-04 real-game check: corpus sprites whose art uses filters / blend modes,
// rendered by the Workbench renderer (src/lib/render.ts → src/lib/compositor.ts)
// with the SWF's own exported shapes and bitmaps, before / after side by side:
//
//   before — the same frame with every placement's filters and blend mode
//            dropped (what all three renderers drew before P-04)
//   after  — the frame as the SWF describes it
//
// Also times redrawing the frame with the layer cache and without it.
//
//   ./node_modules/.bin/vitest run --config vitest.debug.config.ts filters.shots
//   SWF=towns2 PICK=3 SCALE=2 OUT=/tmp/p04-shots  (defaults: the five heaviest census SWFs, 2 sprites each)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas, loadImage, type Canvas, type Image } from '@napi-rs/canvas';
import { parseSwfBinary } from '@/lib/swf/binary';
import { swfFilesToFiles } from '@/lib/bundled';
import { assetFor, guessId, ingestFiles, type AssetCache, type LoadedAsset } from '@/lib/assets';
import { compositeStats, invalidateLayers, setCanvasFactory } from '@/lib/compositor';
import { drawTimeline } from '@/lib/render';
import { corpusSwfs, readArrayBuffer } from '@/testing/corpusPaths';
import { itCorpus } from '@/testing/corpus';
import type { AssetBundle, DisplayItem, Matrix, Rect, SwfDocument, Timeline } from '@/types';

const DEFAULT = ['towns2', 'game', 'blackjack_game4.14', 'assets', 'wordbump_game1.4'];
const OUT = process.env.OUT ?? '/tmp/p04-shots';
const PICK = Number(process.env.PICK ?? 2);
const SCALE = Number(process.env.SCALE ?? 2);

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };

/** Decode every shape / bitmap / text image the doc's characters export, the way AssetCache places them. */
async function preload(doc: SwfDocument, bundle: AssetBundle) {
  const ready = new Map<number, { img: Image; dest: LoadedAsset['dest'] }>();
  const dataUri = async (ref: string) => {
    const name = ref.split('/').pop()!.toLowerCase();
    const id = guessId(name);
    const f = bundle.byPath.get(name) ?? (id != null ? assetFor(bundle, id, 'bitmap') : undefined);
    if (!f) return null;
    const ext = f.path.split('.').pop()!.toLowerCase();
    return `data:${MIME[ext] ?? 'image/png'};base64,${Buffer.from(await f.file.arrayBuffer()).toString('base64')}`;
  };
  for (const ch of doc.characters.values()) {
    const b = ch.bounds;
    if (!b || b.xMax - b.xMin <= 0) continue;
    const a = assetFor(bundle, ch.id, ch.kind);
    if (!a) continue;
    try {
      let bytes = Buffer.from(await a.file.arrayBuffer());
      if (/\.svg$/i.test(a.path)) {
        let text = bytes.toString('utf8');
        for (const m of [...text.matchAll(/(href|xlink:href)\s*=\s*["']([^"']+)["']/g)]) {
          if (m[2].startsWith('data:') || m[2].startsWith('#')) continue;
          const uri = await dataUri(m[2]);
          if (uri) text = text.replace(m[0], `${m[1]}="${uri}"`);
        }
        bytes = Buffer.from(text, 'utf8');
      }
      const img = await loadImage(bytes);
      ready.set(ch.id, { img, dest: { x: b.xMin, y: b.yMin, w: b.xMax - b.xMin, h: b.yMax - b.yMin } });
    } catch { /* not decodable here: drawn as nothing */ }
  }
  return {
    get(id: number): LoadedAsset {
      const r = ready.get(id);
      return r ? { status: 'ready', img: r.img as unknown as HTMLImageElement, dest: r.dest } : { status: 'error' };
    },
    preview: () => undefined,
  } as unknown as AssetCache;
}

const apply = (m: Matrix, r: Rect): Rect => {
  const pts = [[r.xMin, r.yMin], [r.xMax, r.yMin], [r.xMin, r.yMax], [r.xMax, r.yMax]].map(([x, y]) => [m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty]);
  return { xMin: Math.min(...pts.map((p) => p[0])), yMin: Math.min(...pts.map((p) => p[1])), xMax: Math.max(...pts.map((p) => p[0])), yMax: Math.max(...pts.map((p) => p[1])) };
};
const union = (a: Rect | null, b: Rect | null): Rect | null => !a ? b : !b ? a
  : { xMin: Math.min(a.xMin, b.xMin), yMin: Math.min(a.yMin, b.yMin), xMax: Math.max(a.xMax, b.xMax), yMax: Math.max(a.yMax, b.yMax) };

/** Frame 0's extent in the timeline's space (twips). */
function extent(doc: SwfDocument, tl: Timeline, depth = 0): Rect | null {
  let out: Rect | null = null;
  for (const d of tl.frames[0]?.display ?? []) {
    if (d.clipDepth != null && d.clipDepth > d.depth) continue;
    const ch = doc.characters.get(d.characterId);
    const child = ch?.timelineId ? doc.timelines.get(ch.timelineId) : undefined;
    const own = child && depth < 12 ? extent(doc, child, depth + 1) : ch?.bounds ?? null;
    if (own) out = union(out, apply(d.matrix, own));
  }
  return out;
}

/** Placements on frame 0 with filters or a blend mode, this timeline and below. */
function effectCount(doc: SwfDocument, tl: Timeline, depth = 0): number {
  let n = 0;
  for (const d of tl.frames[0]?.display ?? []) {
    if (d.filters?.length || (d.blendMode && d.blendMode !== 'normal')) n++;
    const ch = doc.characters.get(d.characterId);
    const child = ch?.timelineId ? doc.timelines.get(ch.timelineId) : undefined;
    if (child && depth < 12) n += effectCount(doc, child, depth + 1);
  }
  return n;
}

function render(doc: SwfDocument, cache: AssetCache, tl: Timeline, box: Rect, w: number, h: number): Canvas {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  const s = SCALE / 20;
  ctx.setTransform(s, 0, 0, s, -box.xMin * s, -box.yMin * s);
  drawTimeline(ctx, {
    doc, cache, timeline: tl, frame: 0, view: { zoom: SCALE, panX: 0, panY: 0 },
    showOutlines: false, showMasks: false, background: '#ffffff', filterScale: SCALE,
  }, tl, 0, undefined, 0);
  return c;
}

/** Drop every placement's effects while `fn` runs. */
function withoutEffects<T>(doc: SwfDocument, fn: () => T): T {
  const saved: [DisplayItem, DisplayItem['filters'], DisplayItem['blendMode']][] = [];
  for (const tl of doc.timelines.values()) for (const fr of tl.frames) for (const d of fr.display) {
    if (d.filters || (d.blendMode && d.blendMode !== 'normal')) { saved.push([d, d.filters, d.blendMode]); d.filters = undefined; d.blendMode = 'normal'; }
  }
  try { return fn(); } finally { for (const [d, f, b] of saved) { d.filters = f; d.blendMode = b; } }
}

itCorpus('filters / blend modes in real game art: before vs after, and the cache', async () => {
  setCanvasFactory((w, h) => createCanvas(w, h) as never);
  mkdirSync(OUT, { recursive: true });
  const wanted = process.env.SWF ? [process.env.SWF] : DEFAULT;
  const lines: string[] = [];
  for (const swf of corpusSwfs()) {
    const base = swf.name.replace(/\.swf$/i, '');
    if (!wanted.includes(base)) continue;
    const { doc, files } = await parseSwfBinary(readArrayBuffer(swf.path), swf.name);
    const bundle = ingestFiles(swfFilesToFiles(files, base));
    const cache = await preload(doc, bundle);
    const picks = [...doc.timelines.values()]
      .filter((tl) => tl.kind !== 'button')
      .map((tl) => ({ tl, n: effectCount(doc, tl), box: extent(doc, tl) }))
      .filter((p) => p.n > 0 && p.box && p.box.xMax - p.box.xMin > 200 && p.box.yMax - p.box.yMin > 200)
      .sort((a, b) => b.n - a.n)
      .slice(0, PICK);
    for (const { tl, n, box } of picks) {
      const pad = 16 * 20 / SCALE * 2;
      const b = { xMin: box!.xMin - pad, yMin: box!.yMin - pad, xMax: box!.xMax + pad, yMax: box!.yMax + pad };
      const w = Math.min(1400, Math.ceil((b.xMax - b.xMin) / 20 * SCALE)), h = Math.min(1400, Math.ceil((b.yMax - b.yMin) / 20 * SCALE));
      const before = withoutEffects(doc, () => render(doc, cache, tl, b, w, h));
      invalidateLayers();
      let t = performance.now();
      const after = render(doc, cache, tl, b, w, h);
      const first = performance.now() - t;
      // redraws: cached, then with every layer invalidated
      const c0 = { ...compositeStats };
      t = performance.now();
      for (let i = 0; i < 10; i++) render(doc, cache, tl, b, w, h);
      const cached = (performance.now() - t) / 10;
      const reused = compositeStats.reused - c0.reused, painted = compositeStats.painted - c0.painted;
      t = performance.now();
      for (let i = 0; i < 10; i++) { invalidateLayers(); render(doc, cache, tl, b, w, h); }
      const uncached = (performance.now() - t) / 10;
      const plain = (() => { t = performance.now(); for (let i = 0; i < 10; i++) withoutEffects(doc, () => render(doc, cache, tl, b, w, h)); return (performance.now() - t) / 10; })();

      const pa = before.getContext('2d').getImageData(0, 0, w, h).data, pb = after.getContext('2d').getImageData(0, 0, w, h).data;
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 6) changed++;
      const side = createCanvas(w * 2 + 12, h);
      const sctx = side.getContext('2d');
      sctx.fillStyle = '#888888'; sctx.fillRect(0, 0, side.width, h);
      sctx.drawImage(before, 0, 0); sctx.drawImage(after, w + 12, 0);
      const file = `${OUT}/${swf.set}-${base}-${tl.id.replace(/[^\w-]+/g, '_')}.png`;
      writeFileSync(file, side.toBuffer('image/png'));
      const name = tl.characterId != null ? doc.characters.get(tl.characterId)?.exportName ?? '' : '';
      lines.push(`${swf.set}/${base} ${tl.id}${name ? ` (${name})` : ''}: ${n} placements with effects, ${w}×${h} px, ${(100 * changed / (w * h)).toFixed(1)}% of pixels changed → ${file}`);
      lines.push(`    frame: no effects ${plain.toFixed(1)} ms | first with effects ${first.toFixed(1)} ms | redraw cached ${cached.toFixed(1)} ms (${reused} layers reused, ${painted} painted) | redraw uncached ${uncached.toFixed(1)} ms`);
    }
  }
  console.log(`\n${lines.join('\n')}\n`);
}, 600_000);
