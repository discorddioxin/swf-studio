// Offline Puppeteer reproduction of the bundled fishing game's active bite/fight state.
// All game HTTP/socket services are supplied by the app's in-process MockServer;
// browser requests to non-local hosts are blocked before they can leave the sandbox.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch as launchBrowser } from './browser.dev.mjs';

const url = process.env.APP_URL || 'http://127.0.0.1:5173/';
const outDir = process.argv[2] || '/tmp/rod-fight';
await fs.mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const logs = [];
const blockedRequests = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
const appOrigin = new URL(url).origin;
await page.setRequestInterception(true);
page.on('request', (request) => {
  let allowed = false;
  try {
    const parsed = new URL(request.url());
    allowed = ['data:', 'blob:'].includes(parsed.protocol) || parsed.origin === appOrigin;
  } catch { /* not a URL */ }
  if (allowed) void request.continue().catch(() => {});
  else {
    blockedRequests.push(request.url());
    void request.abort('blockedbyclient').catch(() => {});
  }
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluate(() => localStorage.removeItem('swf-studio.as2.boot'));
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => /use bundled swfs/i.test(b.textContent || ''))?.click();
});
await pause(3500);
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => /^\s*Execute\s*$/i.test(b.textContent || ''))?.click();
});
await page.waitForFunction(() => !!globalThis.__as2player, { timeout: 30000 });
await pause(1500);

const centerOf = async (expr) => page.evaluate((source) => {
  const p = globalThis.__as2player;
  const obj = new Function('p', 'root', `return (${source});`)(p, p.root.obj);
  if (!obj) return null;
  let target = null;
  const walk = (node) => {
    if (node.obj === obj) { target = node; return; }
    for (const child of node.children) if (!target) walk(child);
  };
  walk(p.root);
  const b = target && p.boundsIn(target, null);
  return b && { path: p.describe(target), x: Math.round((b.xMin + b.xMax) / 40), y: Math.round((b.yMin + b.yMax) / 40) };
}, expr);
const clickStage = async (x, y, label) => {
  const hit = await page.evaluate(({ x, y }) => {
    const p = globalThis.__as2player;
    const target = p.mouseTarget(x, y);
    p.pointerMove(x, y);
    p.pointerDown(x, y);
    p.pointerUp(x, y);
    return target && p.describe(target);
  }, { x, y });
  console.log(`click ${label}: (${x}, ${y}) -> ${hit}`);
};
const shot = async (name) => {
  const data = await page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png') ?? null);
  if (data) await fs.writeFile(path.join(outDir, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
};

try {
  await page.waitForFunction(() => !!globalThis.__as2player?.root?.obj?.gsecs, { timeout: 30000 });
  const server = await centerOf('root.gsecs.mc_ServerChooser.serverListing_lt.content_mc.listRow10.bG_mc');
  const serverJoin = await centerOf('root.gsecs.mc_ServerChooser.join_btn');
  if (!server || !serverJoin) throw new Error('server chooser did not initialize');
  await clickStage(server.x, server.y, 'select mock server');
  await pause(300);
  await clickStage(serverJoin.x, serverJoin.y, 'join mock server');
  await page.waitForFunction(() => !!globalThis.__as2player?.root?.obj?.gsecs?.mChooser, { timeout: 20000 });
  const room = await centerOf('root.gsecs.mChooser.gameListing_lt.content_mc.listRow10.bG_mc');
  const roomJoin = await centerOf('root.gsecs.mChooser.joinGame_btn');
  if (!room || !roomJoin) throw new Error('mock room chooser did not initialize');
  await clickStage(room.x, room.y, 'select mock room');
  await pause(300);
  await clickStage(roomJoin.x, roomJoin.y, 'join mock room');
  await page.waitForFunction(() => !!globalThis.__as2player?.root?.obj?.selectBait, { timeout: 30000 });
  await pause(1200);
  const bait = await centerOf('root.selectBait.baita_mc.baita_btn');
  if (!bait) throw new Error('Grade A bait button did not initialize');
  await clickStage(bait.x, bait.y, 'select Grade A bait');
  await page.waitForFunction(() => globalThis.__as2player?.root?.obj?.main?.baitSelected === 'baita', { timeout: 10000 });
  await pause(500);
  await shot('01-bait-selected');

  // Cast using the same interactive buttons as the reference flow.
  await clickStage(420, 290, 'start cast');
  await pause(550);
  await clickStage(420, 290, 'release cast');
  await page.waitForFunction(() => globalThis.__as2player?.root?.obj?.main?.gameMode === 'fishing', { timeout: 10000 });
  const initial = await page.evaluate(() => {
    const p = globalThis.__as2player;
    const root = p.root.obj;
    const main = root.main;
    return {
      rootFrame: root._currentframe,
      gameMode: main?.gameMode,
      throwPower: main?.throwPower,
      releasePower: main?.releasePower,
      fishLevel: main?.fishLevel,
      fishAvailable: main?.fishAvailable,
      fCount: main?.fCount,
      checkForBite: typeof main?.checkForBite,
      doFishingLoop: typeof main?.doFishingLoop,
      randomNumber: Math.random.toString(),
      rodCharFrame: main?.rodPlacement?.char?._currentframe,
      bobZ: main?.bobWpos?.z,
      errors: p.logs.filter((l) => l.level === 'error').map((l) => l.message),
    };
  });
  console.log('cast state:', JSON.stringify(initial));
  await shot('02-fishing-before-bite');

  // Make the local fish-picker deterministic: a low random value selects an
  // available fish at the current bobber distance. This changes no network or
  // game-server code; it only removes randomness from the offline repro.
  await page.evaluate(() => {
    globalThis.__rodOriginalRandom = Math.random;
    Math.random = () => 0.01;
    const main = globalThis.__as2player.root.obj.main;
    if (Number.isFinite(main.fCount)) main.fCount = 49; // check on the next fishing tick
  });
  await page.waitForFunction(() => {
    const main = globalThis.__as2player?.root?.obj?.main;
    return main?.gameMode === 'pullFish' || main?.gameMode === 'paused' || main?.gameMode === 'none';
  }, { timeout: 12000, polling: 50 }).catch(() => {});
  const biteResult = await page.evaluate(() => {
    const p = globalThis.__as2player;
    const main = p.root.obj.main;
    const nodes = [];
    const walk = (n) => {
      if (n.characterId === 179 || /rodPlacement|guidelines|rod_3/.test(p.describe(n))) nodes.push({
        path: p.describe(n), kind: n.kind, characterId: n.characterId,
        frame: n.frame + 1, totalFrames: n.totalFrames,
        visible: n.visible, removed: n.removed, childCount: n.children.length,
      });
      for (const child of n.children) walk(child);
    };
    walk(p.root);
    return {
      gameMode: main?.gameMode,
      fCount: main?.fCount,
      fishLevel: main?.fishLevel,
      fishAvailable: main?.fishAvailable,
      hookedFishType: main?.hookedFishType,
      fishPull: main?.fishPull,
      bobWpos: main?.bobWpos,
      rodCharFrame: main?.rodPlacement?.char?._currentframe,
      guidelinesVisible: main?.rodPlacement?.guidelines?._visible,
      nodeStates: nodes,
      errors: p.logs.filter((l) => l.level === 'error').map((l) => ({ message: l.message, detail: l.detail })),
    };
  });
  console.log('bite trigger state:', JSON.stringify(biteResult));
  await shot('03-bite-trigger');

  const samples = [];
  let sawFight = biteResult.gameMode === 'pullFish';
  const start = Date.now();
  for (let i = 0; i < 180; i++) {
    const state = await page.evaluate((i) => {
      const p = globalThis.__as2player;
      const main = p.root.obj.main;
      const rod = main?.rodPlacement;
      const findNode = (obj) => {
        let found = null;
        const walk = (n) => { if (n.obj === obj) { found = n; return; } for (const c of n.children) if (!found) walk(c); };
        walk(p.root);
        return found;
      };
      const rodNode = findNode(rod);
      const compact = (obj) => {
        const n = findNode(obj);
        return obj && n ? {
          path: p.describe(n), characterId: n.characterId, kind: n.kind,
          frame: obj._currentframe, totalFrames: n.totalFrames,
          visible: obj._visible, nodeVisible: n.visible, removed: n.removed,
          childCount: n.children.length, x: obj._x, y: obj._y,
        } : null;
      };
      return {
        tick: p.tickCount, clock: p.clock, gameMode: main?.gameMode,
        rodFrame: rod?.char?._currentframe,
        guidelinesVisible: rod?.guidelines?._visible,
        bob: compact(rod?.bob),
        rod: compact(rod), char: compact(rod?.char), line: compact(rod?.lin),
        bobWpos: main?.bobWpos, fishPull: main?.fishPull,
        FISH_ENDURANCE: main?.FISH_ENDURANCE,
        targetFish: main?.ft && { name: main.ft.fishName, speed: main.ft.speed, aggressiveness: main.ft.aggressiveness },
        errors: p.logs.filter((l) => l.level === 'error').map((l) => l.message),
      };
    }, i);
    samples.push({ wallMs: Date.now() - start, ...state });
    if (state.gameMode === 'pullFish') sawFight = true;

    // Active gameplay input: sweep the stage pointer laterally through the guide
    // corridor while the fish fight runs, matching the in-game instruction.
    if (sawFight && state.gameMode === 'pullFish') {
      const x = 390 + Math.round(100 * Math.sin(i / 5));
      await page.evaluate(({ x, y }) => globalThis.__as2player.pointerMove(x, y), { x, y: 350 });
    }
    if ([10, 25, 50, 75, 100, 125, 150, 179].includes(i)) await shot(`fight-${String(i).padStart(3, '0')}`);
    if (state.gameMode === 'none' && sawFight) break;
    await pause(50);
  }
  await fs.writeFile(path.join(outDir, 'fight-state.json'), JSON.stringify({ initial, biteResult, sawFight, samples }, null, 2));
  await fs.writeFile(path.join(outDir, 'browser-logs.txt'), logs.join('\n'));
  await fs.writeFile(path.join(outDir, 'blocked-requests.json'), JSON.stringify(blockedRequests, null, 2));
  console.log('fight summary:', JSON.stringify({ sawFight, sampleCount: samples.length, first: samples[0], last: samples.at(-1), blockedRequests: blockedRequests.length }));
  if (!sawFight) throw new Error('Mocked cast did not reach the active fish-fight state');
  if (blockedRequests.length) throw new Error(`Blocked external request(s): ${blockedRequests.join(', ')}`);
} finally {
  await page.evaluate(() => {
    if (globalThis.__rodOriginalRandom) Math.random = globalThis.__rodOriginalRandom;
  }).catch(() => {});
  await browser.close();
}
