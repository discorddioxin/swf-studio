// End-to-end 4-step Puppeteer verification of the fishing game flow:
//   1. Click a server in CHOOSE A SERVER -> click JOIN
//   2. Click a room in CHOOSE A LOCATION -> click JOIN
//   3. Choose bait in Select Bait
//   4. Click on the water to cast, sample the no-input interval, and verify recasting
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
const blockedRequests = [];
const avm1ConsoleWarnings = new Map();
page.on('console', (m) => {
  const text = m.text();
  if (text.includes('[avm1] script ran too long')) {
    avm1ConsoleWarnings.set(text, (avm1ConsoleWarnings.get(text) ?? 0) + 1);
    return;
  }
  logs.push(`[${m.type()}] ${text}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));

// The game SWFs and all service responses are local mocks. Block any accidental
// browser-facing request outside the local app so this diagnostic never contacts
// Gaia or any other remote host.
const appOrigin = new URL(url).origin;
await page.setRequestInterception(true);
page.on('request', (request) => {
  const requestUrl = request.url();
  let allowed = false;
  try {
    const parsed = new URL(requestUrl);
    allowed = ['data:', 'blob:'].includes(parsed.protocol) || parsed.origin === appOrigin;
  } catch {
    allowed = false;
  }
  if (allowed) void request.continue().catch(() => {});
  else {
    blockedRequests.push(requestUrl);
    void request.abort('blockedbyclient').catch(() => {});
  }
});

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluate(() => {
  localStorage.removeItem('swf-studio.as2.boot');
  const originalWarn = console.warn;
  const capture = { total: 0, stacks: [] };
  console.warn = function (...args) {
    const message = args.map(String).join(' ');
    if (message.includes('[avm1] script ran too long')) {
      capture.total++;
      if (capture.total <= 100) {
        const stack = new Error().stack;
        if (!capture.stacks.some((entry) => entry.message === message && entry.stack === stack)
            && capture.stacks.length < 20) {
          capture.stacks.push({ message, stack, performanceMs: Math.round(performance.now()) });
        }
      }
    }
    return originalWarn.apply(this, args);
  };
  globalThis.__avm1ConsoleCapture = capture;
});

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

const snapshotFishing = async () => page.evaluate(() => {
  const p = globalThis.__as2player;
  if (!p) return { error: 'AS2 player unavailable' };
  const root = p.root?.obj;
  const main = root?.main;
  const rod = main?.rodPlacement;
  const findNode = (obj) => {
    if (!obj) return null;
    let found = null;
    const walk = (n) => {
      if (n.obj === obj) { found = n; return; }
      for (const c of n.children) if (!found) walk(c);
    };
    walk(p.root);
    return found;
  };
  const box = (node) => {
    try {
      const b = node && p.boundsIn(node, null);
      return b && {
        xMin: b.xMin / 20, xMax: b.xMax / 20,
        yMin: b.yMin / 20, yMax: b.yMax / 20,
      };
    } catch (error) {
      return { error: String(error) };
    }
  };
  const inspect = (label, obj) => {
    if (!obj) return null;
    const node = findNode(obj);
    const ancestors = [];
    for (let n = node; n; n = n.parent) {
      ancestors.push({
        path: p.describe(n), kind: n.kind, characterId: n.characterId,
        visible: n.visible, alpha: n.alpha, removed: n.removed,
        frame: n.frame + 1, totalFrames: n.totalFrames, playing: n.playing,
        objVisible: n.obj?._visible, objAlpha: n.obj?._alpha,
      });
    }
    return {
      label,
      path: node && p.describe(node),
      kind: node?.kind,
      characterId: node?.characterId,
      frame: obj._currentframe,
      totalFrames: node?.totalFrames,
      playing: node?.playing,
      visible: obj._visible,
      alpha: obj._alpha,
      x: obj._x, y: obj._y,
      xscale: obj._xscale, yscale: obj._yscale,
      rotation: obj._rotation,
      width: obj._width, height: obj._height,
      removed: node?.removed,
      childCount: node?.children?.length,
      bounds: box(node),
      ancestors,
    };
  };
  const subtree = (node, depth = 0) => node && ({
    path: p.describe(node), kind: node.kind, characterId: node.characterId,
    visible: node.visible, alpha: node.alpha, removed: node.removed,
    frame: node.frame + 1, totalFrames: node.totalFrames, playing: node.playing,
    bounds: box(node),
    children: depth < 3 ? node.children.map((child) => subtree(child, depth + 1)) : [],
  });
  const errors = p.logs.filter((l) => l.level === 'error').map((l) => ({
    message: l.message, context: l.context, detail: l.detail,
  }));
  return {
    capturedAt: new Date().toISOString(),
    performanceMs: Math.round(performance.now()),
    tickCount: p.tickCount,
    gameClockMs: p.clock,
    frameRate: p.frameRate,
    rootFrame: root?._currentframe,
    gameMode: main?.gameMode,
    throwPower: main?.throwPower,
    releasePower: main?.releasePower,
    rodFrame: rod?.char?._currentframe,
    rod: inspect('rodPlacement', rod),
    rodTree: subtree(findNode(rod)),
    character: inspect('rodPlacement.char', rod?.char),
    line: inspect('rodPlacement.lin', rod?.lin),
    bobber: inspect('rodPlacement.bob', rod?.bob),
    missingExternals: [...p.missingExternals],
    errors,
  };
});

const installActionTrace = async () => page.evaluate(async () => {
  const p = globalThis.__as2player;
  const runtime = await import('/src/runtime/as2/index.ts');
  const main = p?.root?.obj?.main;
  if (!p || !main || !runtime.$rt?.avm1Actions) throw new Error('Cannot install AVM1 trace on the fishing player');

  const readState = () => {
    const rod = main.rodPlacement;
    const line = rod?.lin;
    const bobber = rod?.bob;
    return {
      gameMode: main.gameMode,
      rodFrame: rod?.char?._currentframe,
      rodCharX: rod?.char?._x,
      rodCharY: rod?.char?._y,
      lineX: line?._x, lineY: line?._y,
      lineXScale: line?._xscale, lineYScale: line?._yscale,
      lineVisible: line?._visible, lineAlpha: line?._alpha,
      bobberX: bobber?._x, bobberY: bobber?._y,
      bobberFrame: bobber?._currentframe,
      bobberVisible: bobber?._visible,
    };
  };
  const describe = (obj) => {
    let found = null;
    const walk = (node) => {
      if (node.obj === obj) { found = p.describe(node); return; }
      for (const child of node.children) if (!found) walk(child);
    };
    walk(p.root);
    return found ?? obj?._target ?? obj?._name ?? '<unknown target>';
  };
  const functions = ['startThrow', 'startRelease'].map((name) => {
    const fn = main[name];
    const def = fn?.avm1;
    return {
      name, type: typeof fn,
      avm1: def ? {
        name: def.name, flags: def.flags, registerCount: def.registerCount,
        params: def.params, code: Array.from(def.code ?? []),
      } : null,
    };
  });
  const trace = {
    initialWarnings: runtime.takeAvm1Diagnostics(),
    functions,
    calls: [],
    transitions: [],
  };
  const originalActions = runtime.$rt.avm1Actions;
  runtime.$rt.avm1Actions = function (from, base64) {
    const before = readState();
    const tick = p.tickCount;
    const clock = p.clock;
    const result = originalActions.call(this, from, base64);
    const after = readState();
    const warnings = runtime.takeAvm1Diagnostics();
    if (warnings.length || JSON.stringify(before) !== JSON.stringify(after)) {
      if (trace.calls.length < 1000) trace.calls.push({ tick, clock, target: describe(from), base64, before, after, warnings });
    }
    return result;
  };
  let priorState = readState();
  const priorOnTick = p.opts.onTick;
  p.opts.onTick = (player) => {
    if (typeof priorOnTick === 'function') priorOnTick(player);
    const next = readState();
    if (JSON.stringify(priorState) !== JSON.stringify(next) && trace.transitions.length < 1000) {
      trace.transitions.push({ tick: player.tickCount, clock: player.clock, before: priorState, after: next });
    }
    priorState = next;
  };
  globalThis.__rodActionTrace = trace;
  return { installed: true, functions, initialWarnings: trace.initialWarnings };
});

const advanceSimulation = async (milliseconds) => page.evaluate((milliseconds) => {
  const p = globalThis.__as2player;
  if (!p) throw new Error('AS2 player unavailable during deterministic time advance');
  p.pause();
  const startClock = p.clock;
  const startTick = p.tickCount;
  const originalRender = p.render;
  const frameMs = 1000 / p.frameRate;
  const frames = Math.ceil(milliseconds / frameMs);
  p.acc = 0;
  p.render = () => {};
  try {
    for (let i = 0; i < frames; i++) p.step(p.last + frameMs + 0.001);
  } finally {
    p.render = originalRender;
    p.render();
  }
  return {
    requestedMs: milliseconds,
    advancedMs: p.clock - startClock,
    ticks: p.tickCount - startTick,
    gameClockMs: p.clock,
    tickCount: p.tickCount,
  };
}, milliseconds);

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
await page.waitForFunction(
  () => !!globalThis.__as2player?.root?.obj?.selectBait,
  { timeout: 20000 },
).catch(async (error) => {
  const state = await page.evaluate(() => {
    const p = globalThis.__as2player;
    const root = p?.root?.obj;
    return {
      rootFrame: root?._currentframe,
      gameMode: root?.main?.gameMode,
      mainFrame: root?.main?._currentframe,
      playerLogs: p?.logs?.slice(-40).map((l) => `[${l.level}] ${l.message}`),
    };
  });
  throw new Error(`Game did not reach Select Bait: ${JSON.stringify(state)}; ${error.message}`);
});
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
const traceSetup = await installActionTrace();
console.log('AVM1 trace installed:', JSON.stringify({
  installed: traceSetup.installed,
  functions: traceSetup.functions.map(({ name, type, avm1 }) => ({ name, type, avm1Bytes: avm1?.code?.length ?? null })),
  initialWarnings: traceSetup.initialWarnings,
}));

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
const simulationOrigin = await page.evaluate(() => {
  const p = globalThis.__as2player;
  p.pause();
  p.acc = 0;
  return { gameClockMs: p.clock, tickCount: p.tickCount };
});
console.log('simulation origin after release:', JSON.stringify(simulationOrigin));

// Advance the player on exact game frames rather than relying on wall time.
// This also lets timers and timeline callbacks run deterministically even if a
// headless canvas frame takes longer than its nominal 41.7 ms budget.
const longSamples = [];
let previousTargetMs = 0;
for (const [targetMs, name] of [
  [800, '09-cast-in-air'],
  [2300, '10-fishing-in-water'],
  [4500, '11-fishing-4s'],
  [7000, '12-fishing-7s'],
  [10000, '13-fishing-10s'],
  [14000, '14-fishing-14s'],
]) {
  const advance = await advanceSimulation(targetMs - previousTargetMs);
  await shot(name);
  const state = await snapshotFishing();
  const sample = {
    targetMs,
    elapsedGameMs: state.gameClockMs - simulationOrigin.gameClockMs,
    tickDelta: state.tickCount - simulationOrigin.tickCount,
    screenshot: `${name}.png`,
    advance,
    state,
  };
  longSamples.push(sample);
  console.log(`rod visibility @ ${sample.elapsedGameMs}ms game time:`, JSON.stringify({
    targetMs,
    tickDelta: sample.tickDelta,
    gameMode: state.gameMode,
    rodFrame: state.rodFrame,
    rodVisible: state.rod?.visible,
    rodAlpha: state.rod?.alpha,
    characterVisible: state.character?.visible,
    lineVisible: state.line?.visible,
    lineAlpha: state.line?.alpha,
    bobberVisible: state.bobber?.visible,
    errors: state.errors,
  }));
  previousTargetMs = targetMs;
}
await fs.writeFile(path.join(outDir, 'rod-visibility.json'), JSON.stringify(longSamples, null, 2));

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
if (!(fishingState.releasePower > 0)) {
  throw new Error(`Cast did not record release power: ${JSON.stringify(fishingState)}`);
}
const hiddenSamples = longSamples.filter(({ state }) =>
  state.rod?.visible === false || !(state.rod?.alpha > 0)
  || state.line?.visible === false || !(state.line?.alpha > 0)
  || state.character?.visible === false || !(state.character?.alpha > 0),
);
if (hiddenSamples.length) {
  throw new Error(`A rod/line display object was explicitly hidden during the cast: ${JSON.stringify(hiddenSamples)}`);
}
const runtimeErrors = longSamples.flatMap(({ state }) => state.errors ?? []);
if (runtimeErrors.length) {
  throw new Error(`Runtime errors during the 14-second cast: ${JSON.stringify(runtimeErrors)}`);
}
const actionTrace = await page.evaluate(() => globalThis.__rodActionTrace);
await fs.writeFile(path.join(outDir, 'rod-action-trace.json'), JSON.stringify(actionTrace, null, 2));
const warningCounts = new Map();
for (const call of actionTrace.calls) {
  for (const warning of call.warnings ?? []) warningCounts.set(warning.message, (warningCounts.get(warning.message) ?? 0) + 1);
}
console.log('AVM1 action trace summary:', JSON.stringify({
  actionCallsWithChangesOrWarnings: actionTrace.calls.length,
  stateTransitions: actionTrace.transitions.length,
  warningCounts: [...warningCounts.entries()],
  functions: actionTrace.functions.map(({ name, avm1 }) => ({ name, avm1Bytes: avm1?.code?.length ?? null })),
}));
const actionDiagnostics = await page.evaluate(async () => {
  const runtime = await import('/src/runtime/as2/index.ts');
  const main = globalThis.__as2player.root.obj.main;
  return {
    functions: ['startThrow', 'startRelease'].map((name) => {
      const fn = main?.[name];
      const def = fn?.avm1;
      return {
        name,
        type: typeof fn,
        source: typeof fn === 'function' ? Function.prototype.toString.call(fn) : null,
        avm1: def ? {
          name: def.name, flags: def.flags, registerCount: def.registerCount,
          params: def.params, code: Array.from(def.code ?? []),
        } : null,
      };
    }),
    warnings: runtime.takeAvm1Diagnostics(),
  };
});
await fs.writeFile(path.join(outDir, 'action-diagnostics.json'), JSON.stringify(actionDiagnostics, null, 2));
console.log('AVM1 diagnostics:', JSON.stringify({
  warnings: actionDiagnostics.warnings,
  functions: actionDiagnostics.functions.map(({ name, type, avm1 }) => ({ name, type, avm1: !!avm1 })),
}));

// If the no-input path returned to the normal idle state, test a second cast.
// This distinguishes an expected fish escape/reset from a game that is actually
// stuck after the first cast.
let recastCheck = { attempted: false, gameMode: longSamples.at(-1)?.state.gameMode };
if (recastCheck.gameMode === 'none') {
  const firstClick = await clickStage(420, 290, 'water click 3 (recast startThrow)');
  const powerAdvance = await advanceSimulation(600);
  await shot('15-recast-power-bar');
  const afterPower = await snapshotFishing();
  const secondClick = await clickStage(420, 290, 'water click 4 (recast release)');
  const castAdvance = await advanceSimulation(1000);
  await shot('16-recast-cast');
  const afterCast = await snapshotFishing();
  recastCheck = {
    attempted: true,
    gameModeBefore: 'none',
    firstClick, powerAdvance, afterPower: {
      gameMode: afterPower.gameMode, rodFrame: afterPower.rodFrame,
      rodVisible: afterPower.rod?.visible, lineVisible: afterPower.line?.visible,
      bobberVisible: afterPower.bobber?.visible,
    },
    secondClick, castAdvance, afterCast: {
      gameMode: afterCast.gameMode, rodFrame: afterCast.rodFrame,
      rodVisible: afterCast.rod?.visible, lineVisible: afterCast.line?.visible,
      bobberVisible: afterCast.bobber?.visible, errors: afterCast.errors,
    },
  };
}
console.log('recast check:', JSON.stringify(recastCheck));
await fs.writeFile(path.join(outDir, 'recast-check.json'), JSON.stringify(recastCheck, null, 2));

// The in-game Instructions control must open a local guide, never a remote tab.
const helpButton = await centerOf('root.mLoginHolder.bar.instance91');
if (!helpButton?.x) throw new Error('Could not locate the in-game Instructions button');
await clickStage(helpButton.x, helpButton.y, 'Instructions button');
const helpText = await page.$eval('[role="dialog"]', (el) => el.textContent || '').catch(() => '');
if (!helpText.includes('Fishing instructions')) throw new Error('Instructions did not open the offline guide');
console.log('offline instructions:', helpText.replace(/\s+/g, ' ').trim());
await page.screenshot({ path: path.join(outDir, '11-offline-instructions.png') });
await page.click('[aria-label="Close fishing instructions"]');

const enterFrameHandlers = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const results = [];
  const walk = (node) => {
    const fn = node.obj?.onEnterFrame;
    const def = fn?.avm1;
    if (def) results.push({
      path: p.describe(node), name: def.name, flags: def.flags,
      registerCount: def.registerCount, params: def.params,
      code: Array.from(def.code ?? []), constants: def.constants ?? [],
    });
    for (const child of node.children) walk(child);
  };
  walk(p.root);
  return results;
});
await fs.writeFile(path.join(outDir, 'on-enter-frame-functions.json'), JSON.stringify(enterFrameHandlers, null, 2));
console.log('AVM1 onEnterFrame functions:', JSON.stringify(enterFrameHandlers.map(({ path, name, code }) => ({ path, name, bytes: code.length }))));
const avm1WarningTrace = await page.evaluate(() => globalThis.__avm1ConsoleCapture ?? null);
await fs.writeFile(path.join(outDir, 'avm1-warning-stacks.json'), JSON.stringify({
  pageCapture: avm1WarningTrace,
  puppeteerConsoleCounts: [...avm1ConsoleWarnings.entries()],
}, null, 2));
console.log('AVM1 timeout warning summary:', JSON.stringify({
  capturedInPage: avm1WarningTrace?.total ?? 0,
  stacks: avm1WarningTrace?.stacks?.length ?? 0,
  consoleCounts: [...avm1ConsoleWarnings.entries()],
}));
await fs.writeFile(path.join(outDir, 'logs.txt'), logs.join('\n'));
await fs.writeFile(path.join(outDir, 'blocked-requests.json'), JSON.stringify(blockedRequests, null, 2));
await browser.close();
if (blockedRequests.length) {
  throw new Error(`Blocked ${blockedRequests.length} non-local browser request(s): ${blockedRequests.join(', ')}`);
}
