// @vitest-environment jsdom
// P-17: URL-encoded variables (LoadVars.load, loadVariables) are decoded the way
// Flash decodes them — tolerantly. `+` is a space, valid %XX runs decode (as
// UTF-8), and a `%` that starts no valid escape stays as it is instead of
// aborting the load.
import { describe, expect, it } from 'vitest';
import { parseSwfXml } from '../../../lib/parser';
import { buildAS2Program } from '../program';
import { AS2Player } from '../player';
import { decodeFormComponent } from '../builtins';
import { DependencyFiles } from '../../flash/dependencies';
import type { LogEntry } from '../../flash/player';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="8" frameRate="12" frameCount="1">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="8000" Ymax="6000"/>
  <tags><item type="DoActionTag"/><item type="ShowFrameTag"/><item type="EndTag"/></tags>
</swf>`;

const SCRIPT = `
var lv = new LoadVars();
lv.onLoad = function (ok) { _root.lvOk = ok; _root.lvA = this.a; _root.lvB = this.b; };
lv.load("vars.txt");
var h = this.createEmptyMovieClip("holder", 1);
h.onData = function () { _root.dataA = this.a; _root.dataB = this.b; };
loadVariables("vars.txt", h);
stop();
`;

async function run(vars: string) {
  const doc = parseSwfXml(XML, { fileName: 'vars.xml' });
  const { program } = buildAS2Program([{ path: 'scripts/frame_1/DoAction.as', text: SCRIPT }]);
  const logs: LogEntry[] = [];
  const player = new AS2Player({
    doc, program, assets: null, audio: null,
    dependencyFiles: new DependencyFiles([{ path: 'game/vars.txt', file: new File([vars], 'vars.txt') }]),
    onLog: (entry) => logs.push(entry),
  });
  player.start();
  for (let i = 0; i < 10; i++) {
    player.advanceTime();
    player.runQueue();
    await new Promise((r) => setTimeout(r, 2));
  }
  const root = player.root.obj as Record<string, unknown>;
  player.dispose();
  return { root, errors: logs.filter((l) => l.level === 'error').map((l) => l.message) };
}

describe('URL-encoded variables', () => {
  it('a stray % stays literal: LoadVars.onLoad(true) and the clip data event both get the values', async () => {
    const { root, errors } = await run('a=100%&b=2');
    expect(errors).toEqual([]);
    expect([root.lvOk, root.lvA, root.lvB]).toEqual([true, '100%', '2']);
    expect([root.dataA, root.dataB]).toEqual(['100%', '2']);
  });

  it('decodes + and %XX (UTF-8) in names and values', async () => {
    const { root } = await run('a=caf%C3%A9+au+lait&b=50%25+off');
    expect([root.lvA, root.lvB]).toEqual(['café au lait', '50% off']);
    expect([root.dataA, root.dataB]).toEqual(['café au lait', '50% off']);
  });
});

describe('decodeFormComponent', () => {
  it.each([
    ['100%', '100%'],
    ['a+b%20c', 'a b c'],
    ['%zz%4', '%zz%4'],
    ['%41%42c', 'ABc'],
    ['%E2%82%AC5', '€5'],
    ['%%41', '%A'],
  ])('%s → %s', (input, output) => {
    expect(decodeFormComponent(input)).toBe(output);
  });
});
