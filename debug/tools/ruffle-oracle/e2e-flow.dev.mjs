// End-to-end 4-step Puppeteer verification of the fishing game flow:
//   1. Click a server in CHOOSE A SERVER -> click JOIN
//   2. Click a room in CHOOSE A LOCATION -> click JOIN
//   3. Choose bait in Select Bait
//   4. Click on the water to start fishing (cast + release + hook)
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch as launchBrowser } from './browser.dev.mjs';

const url = process.env.APP_URL || 'http://127.0.0.1:5173/';
const outDir = process.argv[2] || '/tmp/e2e-flow';
await fs.mkdir(outDir, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluate(() => localStorage.removeItem('swf-studio.as2.boot'));

// 1. Load bundled SWFs
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((el) => /bundled/i.test(el.textContent || ''));
  b?.click();
});
await new Promise((r) => setTimeout(r, 3500));

// 2. Switch to Execute tab
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((el) => /^\s*Execute\s*$/i.test(el.textContent || ''));
  b?.click();
});
await new Promise((r) => setTimeout(r, 2000));

const shot = async (name) => {
  const dataUrl = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? c.toDataURL('image/png') : null;
  });
  if (dataUrl) {
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    await fs.writeFile(path.join(outDir, `${name}.png`), buf);
  }
};

const clickStage = async (x, y, label) => {
  const res = await page.evaluate(({ x, y }) => {
    const p = globalThis.__as2player;
    const hit = p.mouseTarget(x, y);
    const desc = hit ? p.describe(hit) : null;
    p.pointerMove(x, y);
    p.pointerDown(x, y);
    p.pointerUp(x, y);
    return { x, y, hit: desc };
  }, { x, y });
  console.log(`click [${label}]:`, JSON.stringify(res));
  return res;
};

const centerOf = async (expr) => {
  return page.evaluate((expr) => {
    const p = globalThis.__as2player;
    const fn = new Function('p', 'root', `return (${expr});`);
    const obj = fn(p, p.root.obj);
    if (!obj) return null;
    // Find DisplayNode for obj (or if button child inside clip)
    let targetNode = null;
    const walk = (n) => {
      if (n.obj === obj) { targetNode = n; return; }
      for (const c of n.children) { if (!targetNode) walk(c); }
    };
    walk(p.root);
    if (!targetNode) return null;
    const b = p.boundsIn(targetNode, null);
    if (!b) return { path: p.describe(targetNode), noBounds: true };
    return {
      path: p.describe(targetNode),
      x: Math.round(((b.xMin + b.xMax) / 2) / 20),
      y: Math.round(((b.yMin + b.yMax) / 2) / 20),
      w: Math.round((b.xMax - b.xMin) / 20),
      h: Math.round((b.yMax - b.yMin) / 20),
    };
  }, expr);
};

// Wait for CHOOSE A SERVER screen
await new Promise((r) => setTimeout(r, 1500));
await shot('01-server-screen');

console.log('--- STEP 1: CHOOSE A SERVER ---');
const serverRow0 = await centerOf('root.gsecs.mc_ServerChooser.serverListing_lt.content_mc.listRow10.bG_mc');
const serverRow1 = await centerOf('root.gsecs.mc_ServerChooser.serverListing_lt.content_mc.listRow11.bG_mc');
const serverJoinBtn = await centerOf('root.gsecs.mc_ServerChooser.join_btn');
console.log('serverRow0:', serverRow0, 'serverRow1:', serverRow1, 'serverJoinBtn:', serverJoinBtn);

if (serverRow1?.x) {
  await clickStage(serverRow1.x, serverRow1.y, 'server row 1 (Demonic fishing)');
}
await new Promise((r) => setTimeout(r, 400));
await shot('02-server-selected');

if (serverJoinBtn?.x) {
  await clickStage(serverJoinBtn.x, serverJoinBtn.y, 'server JOIN button');
}
await new Promise((r) => setTimeout(r, 1500));
await shot('03-room-screen');

console.log('--- STEP 2: CHOOSE A LOCATION (ROOM) ---');
const roomInfo = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const g = p.root.obj.gsecs;
  const rlb = g?.mChooser?.gameListing_lt;
  return {
    gsecsFrame: g?._currentframe,
    title: g?.bar?.maintitle,
    selectedServer: p.root.obj.GSECS_SelectedServerName,
    roomItems: [0, 1].map((i) => rlb?.getItemAt?.(i)),
  };
});
console.log('roomInfo:', JSON.stringify(roomInfo));

const roomRow0 = await centerOf('root.gsecs.mChooser.gameListing_lt.content_mc.listRow10.bG_mc');
const roomJoinBtn = await centerOf('root.gsecs.mChooser.joinGame_btn');
console.log('roomRow0:', roomRow0, 'roomJoinBtn:', roomJoinBtn);

if (roomRow0?.x) {
  await clickStage(roomRow0.x, roomRow0.y, 'room row 0 (dracogenius Room)');
}
await new Promise((r) => setTimeout(r, 400));
await shot('04-room-selected');

if (roomJoinBtn?.x) {
  await clickStage(roomJoinBtn.x, roomJoinBtn.y, 'room JOIN button');
}
await new Promise((r) => setTimeout(r, 3000));
await shot('05-select-bait-screen');

console.log('--- STEP 3: SELECT BAIT ---');
const baitABtn = await centerOf('root.selectBait.baita_mc.baita_btn');
console.log('baitABtn:', baitABtn);
if (baitABtn?.x) {
  await clickStage(baitABtn.x, baitABtn.y, 'Grade A bait (baita_btn)');
} else {
  await clickStage(373, 278, 'Grade A bait (373, 278)');
}
await new Promise((r) => setTimeout(r, 1500));
await shot('06-after-bait-selected');

console.log('--- STEP 4: CLICK ON WATER TO START FISHING ---');
const afterBaitState = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const r = p.root.obj;
  const listButtons = [];
  const walk = (n) => {
    if (!n.visible || n.removed) return;
    if (n.kind === 'button' || p.isMouseTarget(n)) {
      const b = p.boundsIn(n, null);
      if (b) {
        listButtons.push({
          desc: p.describe(n),
          charId: n.characterId,
          x: Math.round(((b.xMin + b.xMax) / 2) / 20),
          y: Math.round(((b.yMin + b.yMax) / 2) / 20),
          w: Math.round((b.xMax - b.xMin) / 20),
          h: Math.round((b.yMax - b.yMin) / 20),
        });
      }
    }
    for (const c of n.children) walk(c);
  };
  walk(p.root);
  return {
    rootFrame: r._currentframe,
    gameMode: r.main?.gameMode,
    curBait: r.main?.curBait,
    rodCharFrame: r.main?.rodPlacement?.char?._currentframe,
    rodNameTxt: r.main?.rodselect?.nameTxt,
    buttons: listButtons,
  };
});
console.log('afterBaitState:', JSON.stringify(afterBaitState, null, 2));

// Map movement is only enabled before a cast begins, so test it before the water clicks.
const mapBefore = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const r = p.root.obj;
  const map = r.mapOverview?.map;
  const coast = map?.coast;
  let coastNode = null;
  const walk = (n) => { if (n.obj === coast) coastNode = n; for (const c of n.children) if (!coastNode) walk(c); };
  walk(p.root);
  return {
    previousPoint: map?.previousPoint,
    selectPoint: map?.selectPoint,
    moveMarker: map?.moveMarker,
    coastEnabled: coast?.enabled,
    coastIsMouseTarget: !!coastNode && p.isMouseTarget(coastNode),
  };
});
console.log('mapBefore:', JSON.stringify(mapBefore));
await clickStage(205, 300, 'overview map coast before cast');
await page.waitForFunction(() => {
  const map = globalThis.__as2player?.root.obj.mapOverview?.map;
  return !!map && !map.moveMarker;
}, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 250));
await shot('07-map-click-moved');
const mapAfter = await page.evaluate(() => {
  const r = globalThis.__as2player.root.obj;
  const map = r.mapOverview?.map;
  return {
    previousPoint: map?.previousPoint,
    selectPoint: map?.selectPoint,
    markedPoint: map?.markedPoint,
    moveMarker: map?.moveMarker,
    coastEnabled: map?.coast?.enabled,
    viewX: r.view?._x,
    mapP1: { x: r.mapOverview?.map?.p1?._x, y: r.mapOverview?.map?.p1?._y },
  };
});
console.log('mapAfter:', JSON.stringify(mapAfter));
if (mapAfter.previousPoint === mapBefore.previousPoint || mapAfter.markedPoint !== mapAfter.selectPoint || mapAfter.moveMarker) {
  throw new Error(`Overview map click did not move the player to its selected point: ${JSON.stringify(mapAfter)}`);
}

// Return P1 to reference point zero so the fishing checks use the original cast area.
const mapResetPoint = await page.evaluate(() => {
  const map = globalThis.__as2player.root.obj.mapOverview?.map;
  if (!map?.refPoint?.[0]) return null;
  const point = { x: map.refPoint[0][0], y: map.refPoint[0][1] };
  map.localToGlobal(point);
  return { x: Math.round(point.x), y: Math.round(point.y) };
});
if (!mapResetPoint) throw new Error('Could not compute the overview map home-point coordinates');
console.log('mapResetPoint:', JSON.stringify(mapResetPoint));
await clickStage(mapResetPoint.x, mapResetPoint.y, 'overview map home point');
await page.waitForFunction(() => {
  const map = globalThis.__as2player?.root.obj.mapOverview?.map;
  return !!map && !map.moveMarker && Math.min(Math.abs(map.previousPoint), Math.abs(12 - map.previousPoint)) < 0.02;
}, { timeout: 15000 });

// Click on the water (charId 65 startThrow button at center of lake ~420, 290)
await clickStage(420, 290, 'water click 1 (startThrow)');
await new Promise((r) => setTimeout(r, 600));
await shot('08-throwing-power-bar');

const throwingState = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const r = p.root.obj;
  return {
    gameMode: r.main?.gameMode,
    throwPower: r.main?.throwPower,
    rodCharFrame: r.main?.rodPlacement?.char?._currentframe,
  };
});
console.log('throwingState:', JSON.stringify(throwingState));

// Click on the water again to release cast (charId 66 startRelease button).
await clickStage(420, 290, 'water click 2 (startRelease)');
await new Promise((r) => setTimeout(r, 800));
await shot('09-cast-in-air');
await new Promise((r) => setTimeout(r, 1500));
await shot('10-fishing-in-water');

const fishingState = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const r = p.root.obj;
  return {
    gameMode: r.main?.gameMode,
    throwPower: r.main?.throwPower,
    releasePower: r.main?.releasePower,
    rodCharFrame: r.main?.rodPlacement?.char?._currentframe,
    line: (() => {
      const rod = r.main?.rodPlacement;
      const line = rod?.lin;
      let n = null;
      const walk = (node) => { if (node.obj === line) { n = node; return; } for (const c of node.children) if (!n) walk(c); };
      walk(p.root);
      const b = n && p.boundsIn(n, null);
      return line && {
        x: line._x, y: line._y, xscale: line._xscale, yscale: line._yscale,
        width: line._width, height: line._height, visible: line._visible, alpha: line._alpha,
        currentFrame: line._currentframe, bounds: b && { xMin: b.xMin / 20, xMax: b.xMax / 20, yMin: b.yMin / 20, yMax: b.yMax / 20 },
      };
    })(),
    bobber: (() => {
      const bob = r.main?.rodPlacement?.bob;
      return bob && { x: bob._x, y: bob._y, xscale: bob._xscale, yscale: bob._yscale, visible: bob._visible, frame: bob._currentframe };
    })(),
    missingExternals: [...p.missingExternals],
    playerLogs: p.logs.map((l) => `[${l.level}] ${l.message}`),
  };
});
console.log('fishingState:', JSON.stringify(fishingState, null, 2));
if (fishingState.gameMode !== 'fishing' || !(fishingState.releasePower > 0)) {
  throw new Error(`Cast did not enter fishing mode: ${JSON.stringify(fishingState)}`);
}

// The in-game Instructions control must open a local guide, never a remote tab.
const helpButton = await centerOf('root.mLoginHolder.bar.instance91');
if (!helpButton?.x) throw new Error('Could not locate the in-game Instructions button');
await clickStage(helpButton.x, helpButton.y, 'Instructions button');
const helpText = await page.$eval('[role="dialog"]', (el) => el.textContent || '').catch(() => '');
if (!helpText.includes('Fishing instructions')) throw new Error('Instructions did not open the offline guide');
console.log('offline instructions:', helpText.replace(/\s+/g, ' ').trim());
await page.screenshot({ path: path.join(outDir, '11-offline-instructions.png') });
await page.click('[aria-label="Close fishing instructions"]');

await fs.writeFile(path.join(outDir, 'logs.txt'), logs.join('\n'));
await browser.close();
