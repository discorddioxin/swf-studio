import fs from 'node:fs';
import { parseSwf } from 'swf-parser';
for (const name of ['bassken_game4.21', 'gsecs2.9', 'game_chat']) {
  const buf = fs.readFileSync(`/home/user/swf-studio/game-files/fish-full/swfs/${name}.swf`);
  try {
    const swf = parseSwf(new Uint8Array(buf));
    const counts = {};
    for (const t of swf.tags) counts[t.type] = (counts[t.type] ?? 0) + 1;
    console.log(name, 'OK tags:', swf.tags.length, 'types:', Object.keys(counts).length);
  } catch (e) {
    console.log(name, 'FAILED:', e.message);
  }
}
