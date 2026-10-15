import fs from 'node:fs';
import { parseSwf } from 'swf-parser';
import { SAMPLE_MAIN, SAMPLE_SERVICE, SAMPLE_CHAT, sampleSwfPath } from '../../sample.ts';
for (const name of [SAMPLE_MAIN, SAMPLE_SERVICE, SAMPLE_CHAT]) {
  const buf = fs.readFileSync(sampleSwfPath(name));
  try {
    const swf = parseSwf(new Uint8Array(buf));
    const counts = {};
    for (const t of swf.tags) counts[t.type] = (counts[t.type] ?? 0) + 1;
    console.log(name, 'OK tags:', swf.tags.length, 'types:', Object.keys(counts).length);
  } catch (e) {
    console.log(name, 'FAILED:', e.message);
  }
}
