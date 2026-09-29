// @vitest-environment jsdom
// Runs a real FFDec export through parser → as2ts → AS2 player when
// AS2_GAME_DIR points at it (folder with <name>.xml and scripts/). Skipped otherwise.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseSwfXml } from '../../../lib/parser';
import { buildAS2Program } from '../program';
import { AS2Player } from '../player';

const dir = process.env.AS2_GAME_DIR ?? '';
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe.skipIf(!dir || !existsSync(dir))('real game export', () => {
  it('boots and reaches a stable state', async () => {
    const xml = readdirSync(dir).find((f) => f.endsWith('.xml'))!;
    let t = Date.now();
    const doc = parseSwfXml(readFileSync(join(dir, xml), 'utf8'), { fileName: xml });
    const sources = walk(join(dir, 'scripts')).filter((f) => f.endsWith('.as')).map((f) => ({ path: relative(dir, f), text: readFileSync(f, 'utf8') }));
    console.log('parse ms', Date.now() - t); t = Date.now();
    const build = buildAS2Program(sources);
    console.log('build ms', Date.now() - t); t = Date.now();
    console.log('build errors', build.errors.slice(0, 10));
    const logs: string[] = [];
    const player = new AS2Player({ doc, program: build.program, onLog: (e) => logs.push(`[${e.level}] ${e.message}`) });
    player.start();
    for (let i = 0; i < Number(process.env.AS2_TICKS ?? 48); i++) player.tick();
    const guest = process.env.AS2_GUEST;
    if (guest) {
      (player.root.obj as any).playAsGuest = true;
      player.guard('guest', () => (player.root.obj as any).startGameSingle?.());
      player.runQueue();
      for (let i = 0; i < Number(process.env.AS2_GUEST_TICKS ?? 240); i++) { player.tick(); await new Promise((r) => setTimeout(r, 0)); }
    }
    console.log('run ms', Date.now() - t);
    console.log(player.tree().join('\n'));
    console.log(logs.slice(0, Number(process.env.AS2_LOGS ?? 80)).join('\n'));
    expect(build.program).toBeTruthy();
  }, 300_000);
});
