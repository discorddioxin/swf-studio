// Dump the exported symbols (ExportAssets / SymbolClass linkage names) of every
// bundled SWF, using the studio's own SWF parser. This is the authoritative view
// of what `attachMovie`/`createClassObject` can resolve inside each document.
//
//   SWF=<name> [PAT=<export name>] npx vitest run debug/tools/vitest/__symbols.dev.test.ts
//
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { SAMPLE_SWF_NAMES, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

it('lists exported symbols per SWF', async () => {
  const only = process.env.SWF;
  const pat = process.env.PAT ? new RegExp(process.env.PAT) : null;
  const names = only ? [`${only}.swf`] : SAMPLE_SWF_NAMES.map((n) => `${n}.swf`).filter((f) => f.endsWith('.swf'));
  for (const swf of names) {
    const buf = readFileSync(sampleSwfPath(swf.replace(/\.swf$/i, '')));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { doc } = await parseSwfBinary(ab, swf);
    const exported = [...doc.characters.values()].filter((c) => c.exportName);
    const classes = doc.symbolClasses ?? new Map<number, string>();
    console.error(`\n== ${swf}: ${exported.length} export(s), ${classes.size} symbol class(es)`);
    for (const c of exported) {
      const line = `   ${String(c.id).padStart(5)}  ${String(c.kind).padEnd(11)} ${c.exportName}`;
      if (!pat || pat.test(c.exportName!)) console.error(line);
    }
    for (const [id, cls] of classes) {
      const line = `   ${String(id).padStart(5)}  symbolClass  ${cls}`;
      if (!pat || pat.test(cls)) console.error(line);
    }
  }
}, 120000);
