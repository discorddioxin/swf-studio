// Lift one method (SWF_FILE, SWF_NAME=<regex on Class::trait>) and print its diagnostics.
// It sets globalThis.__liftTrace while lifting, so a temporary trace point added to
// lift.ts (`if ((globalThis as any).__liftTrace) console.log(…)`) prints only for it.
import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'vitest';
import { parseSwfBinary } from '@/../decompiler/swf/binary';
import { parseAbc, type AbcFile } from '@/../decompiler/swf/abc';
import { liftMethod } from '@/../transpiler/avm2/lift';

const FILE = process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf';
describe.skipIf(!existsSync(FILE) || !process.env.SWF_NAME)('lift trace', () => {
  it('lifts one method with tracing', async () => {
    const raw = readFileSync(FILE);
    const { doc } = await parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, FILE);
    const re = new RegExp(process.env.SWF_NAME!);
    for (const entry of doc.abc ?? []) {
      const bytes = (entry as { data?: Uint8Array }).data ?? (entry as unknown as Uint8Array);
      let abc: AbcFile | null = null;
      for (let o = 0; o < 512 && !abc; o++) { try { abc = parseAbc(bytes.subarray(o)); } catch { /* next */ } }
      if (!abc) continue;
      for (const cls of abc.classes) for (const t of [...cls.instance.traits, ...cls.traits]) {
        if (t.method == null || !re.test(`${cls.instance.name}::${t.name}`)) continue;
        const body = abc.bodies.find((b) => b.method === t.method);
        if (!body) continue;
        (globalThis as { __liftTrace?: boolean }).__liftTrace = true;
        const result = liftMethod({ abc, body, target: 'instance', globals: new Set(), memberNames: new Set(), ownTraits: cls.instance.traits });
        (globalThis as { __liftTrace?: boolean }).__liftTrace = false;
        console.log(`${cls.instance.name}::${t.name} lifted=${!!result.stmts} ${JSON.stringify(result.diagnostics)}`);
        return;
      }
    }
  }, 120_000);
});
