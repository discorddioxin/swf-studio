// @vitest-environment jsdom
// Pinball's "PLAY NOW" (the instructions screen's startButton), clicked the way
// the Execute tab does it — pointer events at the button's stage position — on
// the real game.swf.
//
// `Pinball.resumeNewGame` runs `for (el in this)` over the document class and
// traces each value. Pinball is declared `dynamic` but adds nothing to itself, so
// in Flash the loop prints nothing; it printed every declared field and engine
// internal. Starting a game builds the table, whose LCD digits are text fields
// with initial text "0" — read with the STRING's NUL, "0\0".
//
// One error remains, and it is the movie's own: PinballMarketKickBack's frame 1
// calls `init()`, which no class on its chain nor any script defines (Flash:
// ReferenceError #1065, "Variable init is not defined").
import { expect, it } from 'vitest';
import { AssetCache, ingestFiles } from '@/lib/assets';
import { swfFilesToFiles } from '@/lib/bundled';
import { parseSwfBinary } from '@/lib/swf/binary';
import { corpusFile, describeCorpus, readArrayBuffer } from '@/testing/corpus';
import { abcSources } from '../abc';
import { DisplayObjectContainer, type DisplayObject } from '../display';
import { compileSources, linkProgram } from '../loader';
import { FlashPlayer, type LogEntry } from '../player';
import { runtime } from '../context';
import { TextField } from '../text';

function all(o: DisplayObject, out: DisplayObject[] = []): DisplayObject[] {
  out.push(o);
  if (o instanceof DisplayObjectContainer) for (const c of o._children) all(c, out);
  return out;
}

describeCorpus('Pinball: PLAY NOW', () => {
  it('starts a game: no field dump, the table is built, its digits carry no NUL', async () => {
    const { doc, files } = await parseSwfBinary(readArrayBuffer(corpusFile('pinball-swfs', 'game.swf')!), 'game.swf');
    const program = linkProgram(compileSources(abcSources(doc.abc ?? []).sources));
    const logs: LogEntry[] = [];
    const player = new FlashPlayer({ doc, program, assets: new AssetCache(ingestFiles(swfFilesToFiles(files, 'pinball')), () => {}), onLog: (e) => logs.push(e) });
    try {
      player.start();
      for (let i = 0; i < 120; i++) player.step();
      const button = all(player.stage).find((d) => d.name === 'startButton');
      expect(button, 'the instructions screen shows PLAY NOW').toBeTruthy();
      const b = button!.getBounds(player.stage);
      const before = logs.length;
      player.pointerDown(b.x + b.width / 2, b.y + b.height / 2);
      player.pointerUp(b.x + b.width / 2, b.y + b.height / 2);
      for (let i = 0; i < 60; i++) player.step();

      const after = logs.slice(before);
      const messages = after.map((e) => e.message);
      expect(messages.some((m) => m.includes('Table Iteration should only have happened once'))).toBe(true);
      expect(messages.filter((m) => m.includes('el is '))).toEqual([]);
      expect(after.filter((e) => e.level === 'error').map((e) => e.message.replace(/\s+\(.*$/, '')))
        .toEqual(['TypeError: this.init is not a function']);

      const shown = all(player.stage);
      expect(shown.some((d) => d.constructor.name === 'mcPinballTable')).toBe(true);
      const digits = shown.filter((d): d is TextField => d instanceof TextField && d.name === 'txt_number');
      expect(digits.length).toBeGreaterThan(0);
      for (const t of digits) expect(t.text).not.toContain('\u0000');
    } finally {
      player.dispose();
      runtime.player = null;
    }
  }, 300_000);
});
