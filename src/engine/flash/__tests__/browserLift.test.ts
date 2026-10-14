// The lifter runs in the browser, where Node's `process` global does not exist.
// Debug switches reading `process.env` once made every AVM2 movie (pinball's
// game.swf and gameShell.swf) fail in the app with "process is not defined",
// while every Node test passed. Lift here with `process` removed, as in a browser.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { abcSources } from '../abc';
import { compileSources, linkProgram } from '../loader';
import { FlashPlayer, type LogEntry } from '../player';
import { AssetCache, ingestFiles } from '@/lib/assets';
import { swfFilesToFiles } from '@/lib/bundled';
import { deckAbcPayload } from './abcFixture';

function withoutProcess<T>(run: () => T): T {
  const g = globalThis as { process?: unknown };
  const saved = g.process;
  delete g.process;
  try {
    expect(typeof (globalThis as { process?: unknown }).process).toBe('undefined');
    return run();
  } finally {
    g.process = saved;
  }
}

const CORPUS = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';

describe('lifting AVM2 code without Node globals', () => {
  it('lifts and compiles an ABC payload', () => {
    const lifted = withoutProcess(() => abcSources([deckAbcPayload()]));
    expect(lifted.sources.length).toBeGreaterThan(0);
    expect(lifted.refusals.filter((r) => /process/.test(r.message))).toEqual([]);
    expect(withoutProcess(() => compileSources(lifted.sources)).modules.filter((m) => m.error).map((m) => m.path)).toEqual([]);
  });

  for (const file of ['game.swf', 'gameShell.swf']) {
    const path = `${CORPUS}/pinball-swfs/${file}`;
    it.skipIf(!existsSync(path))(`lifts pinball's ${file}`, async () => {
      const raw = readFileSync(path);
      const { doc, files } = await parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, file);
      // The Execute tab's whole path: lift, compile, link, boot and play 2 s.
      const logs: LogEntry[] = [];
      withoutProcess(() => {
        const lifted = abcSources(doc.abc ?? []);
        expect(lifted.sources.length).toBeGreaterThan(100);
        expect(lifted.refusals).toEqual([]);
        const compiled = compileSources(lifted.sources);
        expect(compiled.modules.filter((m) => m.error).map((m) => m.path)).toEqual([]);
        const player = new FlashPlayer({
          doc, program: linkProgram(compiled), assets: new AssetCache(ingestFiles(swfFilesToFiles(files, file)), () => {}),
          onLog: (e) => logs.push(e), parameters: { game: 'pinball' },
        });
        player.start();
        for (let i = 0; i < 48; i++) player.step();
        player.dispose();
      });
      expect(logs.filter((e) => e.level === 'error').map((e) => e.message)).toEqual([]);
    }, 120_000);
  }
});
