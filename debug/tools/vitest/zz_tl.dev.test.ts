// Dump the frame-1 display list of the sprites linked to classes matching SWF_CLASS.
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { parseSwfBinary } from '@/../decompiler/swf/binary';

const FILE = process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/towns2-swfs/towns2.swf';
describe.skipIf(!existsSync(FILE))('timeline probe', () => {
  it('dumps', async () => {
    const raw = readFileSync(FILE);
    const { doc } = await parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, FILE);
    const table = new Map(doc.symbolClasses ?? []);
    const re = new RegExp(process.env.SWF_CLASS ?? 'HistorySettings');
    for (const [id, cls] of table) {
      if (!re.test(cls)) continue;
      const ch = doc.characters.get(id);
      const tl = ch?.timelineId ? doc.timelines.get(ch.timelineId) : doc.timelines.get(`sprite:${id}`);
      console.log(`== ${cls} id=${id} kind=${ch?.kind} frames=${tl?.frameCount}`);
      for (const f of tl?.frames.slice(0, Number(process.env.SWF_FRAMES ?? 1)) ?? []) {
        for (const d of f.display) {
          const c = doc.characters.get(d.characterId);
          console.log(`  f${f.index} depth=${d.depth} char=${d.characterId} kind=${c?.kind} name=${d.name ?? ''} class=${table.get(d.characterId) ?? ''} start=${d.startFrame}`);
        }
      }
    }
  }, 120_000);
});
