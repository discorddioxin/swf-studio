// Probe: what do the "Nonempty stack at control-flow join" blocks look like?
// Prints the decoder's own action trace (needs __AVM1_DBG) at each failure.
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { decodeAVM1Actions } from '@/../transpiler/as2/avm1';
import { SAMPLE_SWF_NAMES, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

it('join traces', async () => {
  (globalThis as any).__AVM1_DBG = true;
  for (const name of SAMPLE_SWF_NAMES) {
    const buf = readFileSync(sampleSwfPath(name));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { files } = await parseSwfBinary(ab, `${name}.swf`);
    const sources: SourceInput[] = files.filter((f) => /\.as$/i.test(f.path))
      .map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) }));
    const build = buildAS2Program(sources);
    let shown = 0;
    for (const [path, code] of build.files) {
      for (const m of code.matchAll(/\$rt\.avm1Actions\(([^,]+),\s*"([A-Za-z0-9+/=_-]+)"\)/g)) {
        const d = decodeAVM1Actions(m[2]);
        if (d.code !== null || !/Nonempty stack/.test(d.diagnostics[0]?.message ?? '')) continue;
        if (shown++ >= 2) continue;
        const bytes = Uint8Array.from(atob(m[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        console.error(`\n#### ${name} :: ${path} (${bytes.length} bytes, fail at byte ${d.diagnostics[0].offset})`);
      }
    }
  }
}, 240000);
