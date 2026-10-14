// Dev harness: build a TrueType font from every embedded SWF font of a corpus and
// write them out for an external validator (OTS / fontTools).
//   SWF_CORPUS=/tmp/swf-forge2/games-swfs FONT_OUT=/tmp/swffonts vitest run debug/tools/vitest/zz_fonts.dev.test.ts
import { it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseSwfBinary } from '../../../decompiler/swf/binary';
import { swfFontFiles } from '../../../src/lib/swfFont';

const corpus = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';
const outDir = process.env.FONT_OUT ?? '/tmp/swffonts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.swf$/i.test(n) ? [p] : [];
  });
}

it.skipIf(!existsSync(corpus))('builds every embedded font', async () => {
  mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const file of walk(corpus)) {
    const b = readFileSync(file);
    const parsed = await parseSwfBinary(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), basename(file));
    const chars = parsed.doc.characters;
    const fonts = swfFontFiles(chars.values());
    for (const [id, bytes] of fonts) {
      const c = chars.get(id)!;
      const name = `${basename(file, '.swf')}__${id}_${(c.font!.name || 'font').replace(/[^\w]+/g, '_')}.ttf`;
      writeFileSync(join(outDir, name), bytes);
      total++;
    }
    const outlined = [...chars.values()].filter((c) => c.kind === 'font');
    for (const c of outlined) if (!fonts.has(c.id)) console.log(`  not built: ${c.id} ${c.tagType} ${c.attrs.fontName ?? ''} glyphs=${c.font?.glyphs.length ?? '-'}`);
    console.log(`${basename(file)}: ${outlined.length} font chars, ${fonts.size} built`);
  }
  console.log(`TOTAL ${total}`);
}, 300_000);
