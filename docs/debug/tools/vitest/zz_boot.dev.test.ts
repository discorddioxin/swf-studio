// Boot one movie and print every log entry *with its stack*, so a runtime failure
// can be traced to the lifted line that caused it:
//
//   SWF_FILE=/tmp/swf-forge2/games-swfs/towns2-swfs/towns2.swf \
//   SWF_MATCH="Class is not defined" npx vitest run docs/debug/tools/vitest/zz_boot.dev.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { AssetCache, ingestFiles } from '@/../src/lib/assets';
import { swfFilesToFiles } from '@/../src/lib/bundled';
import { parseSwfBinary } from '@/../transcom/decompiler/swf/binary';
import { abcSources } from '@/../src/engine/flash/abc';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';
import { FlashPlayer, type LogEntry } from '@/../src/engine/flash/player';

const FILE = process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/towns2-swfs/towns2.swf';
const CORPUS_OK = existsSync(FILE);

describe.skipIf(!CORPUS_OK)('corpus harness', () => {
  it('boots a movie and prints its errors with stacks', async () => {
    const raw = readFileSync(FILE);
    const { doc, files } = await parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, FILE);
    const lifted = abcSources(doc.abc ?? []);
    const module = process.env.SWF_MODULE;
    if (module) {
      const file = lifted.sources.find((f) => f.path.includes(module));
      if (!file) { console.log(`no module matching ${module}`); return; }
      const from = Number(process.env.SWF_FROM ?? 1), to = Number(process.env.SWF_TO ?? 1e9);
      console.log(`=== ${file.path}`);
      file.text.split('\n').forEach((line, index) => { if (index + 1 >= from && index + 1 <= to) console.log(`${String(index + 1).padStart(4)}| ${line}`); });
      return;
    }
    const compiled = compileSources(lifted.sources);
    const program = linkProgram(compiled);
    const bundle = ingestFiles(swfFilesToFiles(files, FILE.split('/').pop()));
    const cache = new AssetCache(bundle, () => {});
    const logs: LogEntry[] = [];
    const player = new FlashPlayer({ doc, program, assets: cache, onLog: (entry) => logs.push(entry), parameters: Object.fromEntries(new URLSearchParams(process.env.SWF_VARS ?? '')) });
    try {
      player.start();
      for (let i = 0; i < Number(process.env.SWF_FRAMES ?? 120); i += 1) player.step();
    } catch (e) {
      console.log(`boot threw: ${(e as Error).message}`);
    }
    const match = process.env.SWF_MATCH;
    let shown = 0;
    for (const entry of logs) {
      if (match && !entry.message.includes(match)) continue;
      if (shown++ >= Number(process.env.SWF_LIMIT ?? 3)) break;
      console.log(`[${entry.level}] ${entry.message}`);
      const detail = (entry.detail ?? '').split('\n');
      for (const line of detail.slice(0, 12)) console.log(`    ${line}`);
      // The stack names the module and line of the *compiled* JavaScript; show it, so
      // an error in a lifted method can be read against the code that ran.
      if (process.env.SWF_RAW) console.log(`RAW ${JSON.stringify(entry.detail ?? null).slice(0, 600)}`);
      const frame = /swf-code:\/{1,3}([^:]+):(\d+):(\d+)/.exec(detail.slice(0, 4).join('\n'));
      if (frame) {
        const modules = compiled.modules.filter((m) => m.path === frame[1]);
        if (process.env.SWF_RAW) console.log(`    (${modules.length} module(s) named ${frame[1]})`);
        const module = modules.find((m) => m.code?.split('\n').length > Number(frame[2])) ?? modules[0];
        // `new Function` puts two header lines (`function anonymous(…` and `) {`) before the body.
        const line = Number(frame[2]) - 2;
        if (module?.code) {
          const total = module.code.split('\n').length;
          console.log(`    -- ${frame[1]} (compiled, ${total} lines) around line ${line}`);
          module.code.split('\n').slice(Math.max(0, line - 3), line + 2).forEach((text, index) => console.log(`    ${Math.max(1, line - 2) + index}| ${text}`));
        }
      }
    }
    console.log(`(${shown} shown of ${logs.length} entries)`);
    // What is on stage after the run: proof the movie did something, not just that it was quiet.
    const count = (o: unknown): number => {
      const kids = (o as { _children?: unknown[] })._children ?? [];
      return 1 + kids.reduce<number>((n, k) => n + count(k), 0);
    };
    const root = player.root as unknown as { constructor: { name: string }; _children?: unknown[] } | null;
    console.log(`document=${player.documentClassName} root=${root?.constructor.name ?? 'none'} rootChildren=${root?._children?.length ?? 0} displayObjects=${root ? count(root) : 0}`);
  }, 600_000);
});
