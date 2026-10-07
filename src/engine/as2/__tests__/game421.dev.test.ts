// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { AS2Player } from '@/engine/as2/player';
import { createExternalResolver, type ExternalSwf } from '@/engine/as2/externals';
import { phpSerialize, phpUnserialize, parseGatewayRequest } from '@/lib/gsiStub';
import { createMockServer } from '@/lib/gameServerStub';

const DIR = 'game-files/fish-full/swfs';
const NAMES = [
  'bassken_game4.21',
  'bassken_overview',
  'bassken_pier',
  'bassken_fish4.20',
  'bassken_scene',
  'game_chat',
  'gsecs2.9',
  'OmnitureActionSource',
];

async function load(name: string) {
  const buf = readFileSync(`${DIR}/${name}.swf`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { doc, files } = await parseSwfBinary(ab, `${name}.swf`);
  const chooserOverride = name === 'gsecs2.9'
    ? readFileSync('game-files/fish-full/external/gsecs2.9/scripts/frame_61/DoAction.as', 'utf8')
    : null;
  const sources: SourceInput[] = files
    .filter((f) => /\.as$/i.test(f.path))
    .map((f) => ({
      path: f.path,
      text: name === 'gsecs2.9' && f.path === 'scripts/frame_61/DoAction.as' && chooserOverride != null
        ? chooserOverride
        : new TextDecoder().decode(f.bytes),
    }));
  return { doc, files, sources };
}

it('php codec round trips', () => {
  const payload = 'a:1:{i:0;a:2:{i:0;s:2:"50";i:1;a:1:{i:0;s:1:"1";}}}';
  expect(phpUnserialize(payload)).toEqual([['50', ['1']]]);
  expect(parseGatewayRequest(`m=${encodeURIComponent(payload)}&v=phpobject&X=1`)).toEqual([['50', ['1']]]);
  expect(phpSerialize([[0, true, [{ ip: '127.0.0.1' }]]])).toBe(
    'a:1:{i:0;a:3:{i:0;i:0;i:1;b:1;i:2;a:1:{i:0;a:1:{s:2:"ip";s:9:"127.0.0.1";}}}}',
  );
});

it('runs the full 4-step multiplayer flow with MockServer and bundled OmnitureActionSource.swf', async () => {
  const main = await load(NAMES[0]);
  const ext = await Promise.all(NAMES.slice(1).map(async (n) => ({ n, ...(await load(n)) })));
  const build = buildAS2Program(main.sources);

  const sharedFrameModule = build.files.get('timelines/sprite_155.ts');
  const singleFrameModule = build.files.get('timelines/sprite_165.ts');
  expect(sharedFrameModule).toBeTruthy();
  expect(sharedFrameModule!.match(/BwA=/g)).toHaveLength(1);
  const sharedCallbacks = [1, 5, 10, 15].map((frame) => {
    const entry = sharedFrameModule!.split('\n').find((line) => line.trimStart().startsWith(`${frame}:`));
    return entry?.slice(entry.indexOf(':') + 1).trim().replace(/,$/, '');
  });
  expect(sharedCallbacks[0]?.startsWith('$sharedFrameAction')).toBe(true);
  expect(new Set(sharedCallbacks).size).toBe(1);
  expect(singleFrameModule).toBeTruthy();
  expect(singleFrameModule!.match(/BwA=/g)).toHaveLength(1);

  const builtSwfs: string[] = [];
  const externalBuildErrors: string[] = [];
  const externals: ExternalSwf[] = ext.map((e) => ({
    name: e.n,
    doc: e.doc,
    assets: null,
    sources: () => e.sources,
  }));
  const resolver = createExternalResolver(externals, {
    onBuild: (swf, externalBuild) => {
      builtSwfs.push(swf.name);
      if (swf.name === 'gsecs2.9') externalBuildErrors.push(...externalBuild.errors.map((issue) => issue.message));
    },
  });

  const mockServer = createMockServer();
  const player = new AS2Player({
    doc: main.doc,
    program: build.program,
    assets: null,
    audio: null,
    resolveExternal: resolver,
    missingExternal: 'empty',
    fetchText: (url, method, body) => mockServer.fetchText(url, method, body),
    gameServer: mockServer,
  });

  const stepTicks = async (count: number) => {
    for (let i = 0; i < count; i++) {
      player.tick();
      player.runQueue();
      await new Promise((r) => setTimeout(r, 2));
    }
  };

  player.start();
  await stepTicks(80);

  const root: any = player.root.obj;
  // 1. Verify OmnitureActionSource.swf loaded from bundled SWFs with 0 missing externals
  expect(builtSwfs).toContain('OmnitureActionSource');
  expect(player.missingExternals.size).toBe(0);
  expect(externalBuildErrors).toEqual([]);
  expect(root.gsecs?._currentframe).toBe(75);
  const serverList = root.gsecs?.mc_ServerChooser?.serverListing_lt;
  const joinButton = root.gsecs?.mc_ServerChooser?.join_btn;
  expect(serverList?.getLength?.()).toBe(2);

  // Join is disabled and its handler is guarded until a real server row is selected.
  const serverIPBeforeJoin = root.GSECS_SelectedServerIP;
  expect(joinButton?.enabled).toBe(false);
  expect(joinButton?._alpha).toBe(45);
  joinButton.onRelease();
  await stepTicks(10);
  expect(root.gsecs?._currentframe).toBe(75);
  expect(root.GSECS_SelectedServerIP).toBe(serverIPBeforeJoin);
  expect(joinButton.enabled).toBe(false);
  expect(mockServer.sushiServer.received).toHaveLength(0);

  // 2. Select a server row and click Join -> lands on Room Chooser (frame 45)
  serverList.selectRow(0);
  expect(serverList.getSelectedIndex()).toBe(0);
  expect(joinButton.enabled).toBe(true);
  expect(joinButton._alpha).toBe(100);
  joinButton.onRelease();
  await stepTicks(60);

  expect(root.gsecs?._currentframe).toBe(45);
  const roomList = root.gsecs?.mChooser?.gameListing_lt;
  expect(roomList?.getLength?.()).toBe(2);
  expect(roomList?.getItemAt(0)?.label).toBe("(1/6) dracogenius's Room");
  expect(roomList?.getItemAt(1)?.label).toBe("(5/6) Princess Lethe's Room");

  // 3. Select room 0 ("dracogenius's Room") and click Join -> enters game (frame 38)
  roomList.selectedIndex = 0;
  root.gsecs.mChooser.joinGame_btn.onRelease();
  await stepTicks(100);

  expect(root._currentframe).toBe(38);
  expect(player.missingExternals.size).toBe(0);
  expect(Number(root.selectBait?.baita_mc?.baita_txt)).toBe(95);
  expect(Number(root.selectBait?.baitd_mc?.baitd_txt)).toBe(0);
  expect(Number(root.selectBait?.baitf_mc?.baitf_txt)).toBe(2);
  expect(root.avatarGroup?.avatarp1).toBeDefined();

  // 4. Select Grade A bait -> rod appears in idle state, then cast & release into lake
  root.main.selectedBait('baita');
  await stepTicks(40);

  expect(root.main?.baitSelected).toBe('baita');
  expect(mockServer.sushiServer.fishState.baitA).toBe(94);
  expect(root.main?.rodPlacement?.char?._currentframe).toBe(9);

  // Start throw (water click 1)
  root.main.startThrow();
  await stepTicks(15);
  expect(root.main?.gameMode).toBe('moveBack');
  expect(root.main?.throwPower).toBeGreaterThan(0);

  // Release cast (water click 2)
  root.main.startRelease();
  await stepTicks(60);
  expect(root.main?.gameMode).toBe('fishing');
  expect(player.missingExternals.size).toBe(0);
  player.dispose();
}, 120000);
