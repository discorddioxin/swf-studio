// Missing Dependencies on the real AVM2 games (the uploaded corpus; skipped when it
// is not checked out — see docs/GAME_CHECKLIST.md). The movies ask for files the
// upload does not have: they are listed by path, type, API and requester. Upload a
// file of that path and `URLLoader` is answered with it instead.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AssetCache, ingestFiles } from '@/lib/assets';
import { swfFilesToFiles } from '@/lib/bundled';
import { parseSwfBinary } from '@/lib/swf/binary';
import { abcSources } from '../abc';
import { compileSources, linkProgram } from '../loader';
import { FlashPlayer, type LogEntry } from '../player';
import { DependencyFiles } from '../dependencies';
import { corpusRoot, describeCorpus } from '@/testing/corpus';


async function boot(set: string, entry: string, parameters: Record<string, string>, uploads: { path: string; text: string }[] = []) {
  const dir = join(corpusRoot()!, set);
  const raw = readFileSync(join(dir, entry));
  const { doc, files } = await parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, entry);
  const program = linkProgram(compileSources(abcSources(doc.abc ?? []).sources));
  const logs: LogEntry[] = [];
  const player = new FlashPlayer({
    doc, program, assets: new AssetCache(ingestFiles(swfFilesToFiles(files, entry)), () => {}), onLog: (e) => logs.push(e), parameters,
    dependencyFiles: new DependencyFiles(uploads.map((u) => ({ path: `${set}/${u.path}`, file: new File([u.text], u.path.split('/').pop()!) }))),
    externalSwfs: [],
  });
  player.start();
  for (let i = 0; i < 60; i++) {
    player.step();
    await new Promise((r) => setTimeout(r, 1));
  }
  return { player, logs };
}

describeCorpus('Missing Dependencies (AVM2 corpus)', () => {
  it('Pinball lists its gameConfig.xml and gateway; an uploaded gameConfig.xml is served', async () => {
    const { player } = await boot('pinball-swfs', 'gameShell.swf', { game: 'pinball' });
    const config = player.dependencies.files().find((d) => d.path === 'games/pinball/gameConfig.xml');
    expect(config).toMatchObject({ kind: 'xml', apis: ['URLLoader.load'], requestedBy: ['gameShell.swf'], optional: false });
    expect(player.dependencies.services().map((d) => d.path)).toContain('chat/gsi/gateway.php');

    const served = await boot('pinball-swfs', 'gameShell.swf', { game: 'pinball' }, [{ path: 'games/pinball/gameConfig.xml', text: '<config/>' }]);
    expect(served.player.dependencies.has('games/pinball/gameConfig.xml')).toBe(false);
    expect(served.logs.some((e) => e.message.includes('gameConfig.xml: served from the uploaded file'))).toBe(true);
  }, 300_000);

  it('Towns 2 lists navPages/phone.css as a missing CSS file', async () => {
    const { player } = await boot('towns2-swfs', 'towns2.swf', {});
    expect(player.dependencies.files().map((d) => [d.kind, d.path])).toContainEqual(['css', 'navPages/phone.css']);
  }, 300_000);
});
