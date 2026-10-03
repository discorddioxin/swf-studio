// Scratch: search the constant pools of every bundled SWF's action bytecode.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';

const DIR = 'game-files/fish-full/swfs';
const NAMES = ['bassken_game4.21', 'gsecs2.9', 'game_chat', 'bassken_overview', 'bassken_pier', 'bassken_scene', 'bassken_fish4.20'];
const NEEDLE = process.env.NEEDLE ?? 'serverListing_lt';

it('finds a string in the action constant pools', async () => {
  for (const n of NAMES) {
    const buf = readFileSync(`${DIR}/${n}.swf`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { files } = await parseSwfBinary(ab, `${n}.swf`);
    const srcs = files.filter((f) => /\.as$/i.test(f.path));
    let hits = 0;
    for (const f of srcs) {
      const text = new TextDecoder().decode(f.bytes);
      const m = /avm1Actions\("([A-Za-z0-9+/=]+)"\)/.exec(text);
      if (!m) continue;
      const raw = Buffer.from(m[1], 'base64');
      if (!raw.includes(NEEDLE)) continue;
      hits++;
      if (hits <= 4) {
        console.log(`--- ${n} :: ${f.path}`);
        let i = -1;
        let shown = 0;
        while ((i = raw.indexOf(NEEDLE, i + 1)) >= 0 && shown < 3) {
          const chunk = raw.subarray(Math.max(0, i - 70), i + 90).toString('latin1');
          console.log('   ', chunk.replace(/[^\x20-\x7e]/g, '.'));
          shown++;
        }
      }
    }
    console.log(`${n}: ${srcs.length} sources, ${hits} containing "${NEEDLE}"`);
  }
}, 60000);
