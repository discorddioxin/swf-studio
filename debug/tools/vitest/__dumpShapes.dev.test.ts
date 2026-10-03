// scratch: dump the shape SVGs the app rasterizes for the main movie
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';

it('dumps shape assets', async () => {
  const buf = readFileSync('game-files/fish-full/swfs/bassken_game4.21.swf');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { files, doc } = await parseSwfBinary(ab, 'bassken_game4.21.swf');
  const byCat: Record<string, number> = {};
  for (const f of files) byCat[f.category] = (byCat[f.category] ?? 0) + 1;
  console.log('files by category:', JSON.stringify(byCat));
  const warns = (doc as any).warnings ?? [];
  const uniq = new Map<string, number>();
  for (const w of warns) uniq.set(String(w).slice(0, 80), (uniq.get(String(w).slice(0, 80)) ?? 0) + 1);
  console.log('doc warnings:', uniq.size);
  for (const [w, n] of [...uniq].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`   ${n}x ${w}`);
  console.log('characters:', doc.characters.size, 'root bg:', doc.header.background);
  const root = doc.root;
  const bg = doc.characters.get(171);
  console.log('bg char 171:', JSON.stringify({ kind: bg?.kind, bounds: bg?.bounds, recs: (bg as any)?.records?.length, subpaths: (bg as any)?.records?.slice?.(0, 3) }));
  const sizes = doc.header.stage ?? (doc as any).stage;
  console.log('stage:', JSON.stringify(sizes));
  mkdirSync('/tmp/shapes', { recursive: true });
  mkdirSync('/tmp/images', { recursive: true });
  for (const f of files) {
    if (!/\.(png|jpg|jpeg|gif|bmp)$/i.test(f.path)) continue;
    writeFileSync(`/tmp/images/${f.path.replace(/\//g, '_')}`, f.bytes);
    console.log('image', f.path, f.bytes.length);
  }
  console.log('root frames:', doc.root.frames.length, 'frame0 items:', doc.root.frames[0]?.display?.length);
  for (const d of doc.root.frames[0]?.display ?? []) {
    const ch = doc.characters.get(d.characterId);
    console.log('  f0 depth', d.depth, 'char', d.characterId, ch?.kind, ch?.exportName ?? '', d.name ?? '');
  }
  let n = 0;
  for (const f of files) {
    if (!/\.svg$/i.test(f.path)) continue;
    writeFileSync(`/tmp/shapes/${f.path.replace(/\//g, '_')}`, new TextDecoder().decode(f.bytes));
    n++;
  }
  console.log('svg assets:', n);
  console.log('sample shape svg:', files.find((f) => /\.svg$/i.test(f.path))?.path);
  const g = files.find((f) => /gradient/i.test(new TextDecoder().decode(f.bytes)));
  if (g) console.log('gradient svg:', g.path, new TextDecoder().decode(g.bytes).slice(0, 600));
}, 120000);
