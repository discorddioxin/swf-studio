// Print the TypeScript the AS2 transpiler makes for one SWF's scripts, filtered:
//   P=path.swf F=<module path substring> [G=<regex>] npx vitest run debug/tools/vitest/zz_as2ts.dev.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/../decompiler/swf/binary';
import { buildAS2Program } from '@/../src/engine/as2/program';
it.skipIf(!process.env.P || !existsSync(process.env.P))('as2 ts', async () => {
  const p = process.env.P!; const r = readFileSync(p);
  const { files } = await parseSwfBinary(r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength) as ArrayBuffer, p.split('/').pop()!);
  const b = buildAS2Program(files.filter((f) => /\.as$/i.test(f.path)).map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) })));
  for (const [path, text] of b.files) {
    if (process.env.F && !path.includes(process.env.F)) continue;
    if (process.env.G && !new RegExp(process.env.G).test(String(text))) continue;
    console.log(`==== ${path}\n${text}`);
  }
});
