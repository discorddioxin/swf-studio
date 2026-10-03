// Dump font code tables and the static-text / EditText characters of a bundled
// SWF, to explain "static text renders nothing" (missing codeTable entries).
//
//   SWF=gsecs2.9 npx vitest run debug/tools/vitest/__fonts.dev.test.ts
// @vitest-environment node
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSwfBinary } from '@/lib/swf/binary';

it('dumps font code tables and text characters', async () => {
  const name = process.env.SWF ?? 'gsecs2.9';
  const bytes = readFileSync(`game-files/fish-full/swfs/${name}.swf`);
  const { doc } = await parseSwfBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, `${name}.swf`);
  console.log('parse warnings:', doc.warnings.length);
  for (const w of doc.warnings.slice(0, 12)) console.log('  !', w.slice(0, 160));
  const fonts = [...doc.characters.values()].filter((c) => c.kind === 'font');
  console.log(`fonts: ${fonts.length}`);
  for (const f of fonts.slice(0, 40)) {
    console.log(`  font ${f.id} "${f.attrs.fontName}" codes=${f.codeTable?.length ?? 'none'}`,
      (f.codeTable ?? []).slice(0, 12).map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : '.')).join(''));
  }
  const texts = [...doc.characters.values()].filter((c) => c.kind === 'text' || c.kind === 'edittext');
  console.log(`text chars: ${texts.length} (text=${texts.filter((c) => c.kind === 'text').length} edittext=${texts.filter((c) => c.kind === 'edittext').length})`);
  const ets = [...doc.characters.values()].filter((c) => c.kind === 'edittext');
  for (const e of ets) console.log(`  edittext ${e.id} var="${e.attrs.variableName ?? ''}" bounds=${JSON.stringify(e.bounds)}`);
  for (const t of texts.slice(0, 40)) {
    const recs = t.textRecords ?? [];
    // a record without fontId keeps the previous record's font (sticky style), so
    // carry it over exactly like the player's drawStaticText does
    let fontId: number | undefined;
    const s = recs.map((r) => {
      if (r.fontId != null) fontId = r.fontId;
      const ct = fontId != null ? doc.characters.get(fontId)?.codeTable ?? [] : [];
      return r.glyphs.map((g) => { const v = ct[g.index]; return v === undefined ? '?' : String.fromCharCode(v); }).join('');
    }).join(' | ');
    console.log(`  ${t.id} ${t.kind} fonts=${[...new Set(recs.map((r) => r.fontId))].join(',')} text="${s}"`,
      t.kind === 'edittext' ? `var="${t.attrs.variableName ?? ''}"` : '');
  }
});
