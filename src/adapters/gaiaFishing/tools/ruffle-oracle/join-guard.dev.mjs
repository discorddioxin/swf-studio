// Puppeteer visual regression for the GSECS server chooser. The page stays
// completely offline except for the local Vite origin; game networking uses
// the in-process MockServer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch } from './browser.dev.mjs';

const url = process.env.APP_URL || 'http://127.0.0.1:5173/';
const outDir = process.argv[2] || 'debug/tools/e2e-output/join-guard';
await fs.mkdir(outDir, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const logs = [];
const blocked = [];
page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
await page.setRequestInterception(true);
page.on('request', (request) => {
  const parsed = new URL(request.url());
  if (['127.0.0.1', 'localhost'].includes(parsed.hostname) || ['data:', 'blob:'].includes(parsed.protocol)) {
    request.continue();
  } else {
    blocked.push(request.url());
    request.abort();
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clickButton = async (test) => page.evaluate((pattern) => {
  const re = new RegExp(pattern, 'i');
  const button = [...document.querySelectorAll('button,a,[role=tab]')]
    .find((node) => re.test((node.textContent || '').trim()));
  button?.click();
  return button?.textContent?.trim() ?? null;
}, test.source);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('Load:', await clickButton(/bundled/));
  await sleep(12000);
  console.log('Tab:', await clickButton(/^\s*Execute\s*$/));
  await sleep(2000);
  const startMode = await page.evaluate(() => {
    localStorage.removeItem('swf-studio.as2.boot');
    const select = document.querySelector('select[aria-label="Start mode"]');
    if (!select) return 'missing';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, 'none');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return select.value;
  });
  console.log('Start mode:', startMode);
  await page.waitForFunction(() => {
    const g = globalThis.__as2player?.root?.obj?.gsecs;
    return g?._currentframe === 75 && g?.mc_ServerChooser?.serverListing_lt?.getLength?.() === 2;
  }, { timeout: 60000 });
  await sleep(500);

  const screenshot = async (name) => page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  const currentChooserState = async () => page.evaluate(() => {
    const player = globalThis.__as2player;
    const root = player?.root?.obj;
    const g = root?.gsecs;
    const list = g?.mc_ServerChooser?.serverListing_lt;
    const joinButton = g?.mc_ServerChooser?.join_btn;
    const nodeFor = (object) => {
      let found = null;
      const walk = (node) => {
        if (node.obj === object) { found = node; return; }
        for (const child of node.children) if (!found) walk(child);
      };
      walk(player.root);
      return found;
    };
    const joinNode = nodeFor(joinButton);
    const bounds = joinNode && player.boundsIn(joinNode, null);
    const center = bounds ? {
      x: Math.round((bounds.xMin + bounds.xMax) / 40),
      y: Math.round((bounds.yMin + bounds.yMax) / 40),
    } : null;
    const target = center ? player.mouseTarget(center.x, center.y) : null;
    return {
      gsecsFrame: g?._currentframe,
      serverCount: list?.getLength?.(),
      selectedIndex: list?.getSelectedIndex?.(),
      selectedItem: list?.getSelectedItem?.() ?? null,
      joinEnabled: joinButton?.enabled,
      joinAlpha: joinButton?._alpha,
      joinNodeMouseTarget: !!joinNode && player.isMouseTarget(joinNode),
      hitTarget: target ? player.describe(target) : null,
      joinCenter: center,
      selectedIP: root?.GSECS_SelectedServerIP ?? null,
    };
  });

  const before = await currentChooserState();
  console.log('Before no-selection click:', JSON.stringify(before));
  await screenshot('01-server-chooser-disabled');
  if (!before.joinCenter) throw new Error('Could not find the server chooser Join button bounds');

  // Drive the actual player pointer path; this is the same hit-testing used by
  // the canvas mouse handlers, not a test-only button callback.
  await page.evaluate(({ x, y }) => {
    const player = globalThis.__as2player;
    player.pointerMove(x, y);
    player.pointerDown(x, y);
    player.pointerUp(x, y);
  }, before.joinCenter);
  // Also call the handler directly to verify its ActionScript guard. A script
  // caller must not be able to bypass the UI's disabled state either.
  const directHandler = await page.evaluate(() => {
    const button = globalThis.__as2player?.root?.obj?.gsecs?.mc_ServerChooser?.join_btn;
    if (typeof button?.onRelease !== 'function') return 'missing handler';
    button.onRelease();
    return 'called';
  });
  await sleep(1000);
  const after = await currentChooserState();
  console.log('Direct handler:', directHandler);
  console.log('After no-selection click:', JSON.stringify(after));
  await screenshot('02-after-blocked-join');
  if (after.gsecsFrame !== 75 || after.joinEnabled !== false || after.joinAlpha !== 45 || after.selectedIndex != null) {
    throw new Error(`Join without selection changed screen/state: ${JSON.stringify(after)}`);
  }

  // Select a visible server row with the same player hit-test path, then Join.
  const row = await page.evaluate(() => {
    const player = globalThis.__as2player;
    const list = player.root.obj.gsecs.mc_ServerChooser.serverListing_lt;
    const rowClip = list.content_mc?.listRow10?.bG_mc ?? list.content_mc?.listRow11?.bG_mc;
    let node = null;
    const walk = (current) => {
      if (current.obj === rowClip) { node = current; return; }
      for (const child of current.children) if (!node) walk(child);
    };
    walk(player.root);
    const bounds = node && player.boundsIn(node, null);
    return bounds ? {
      x: Math.round((bounds.xMin + bounds.xMax) / 40),
      y: Math.round((bounds.yMin + bounds.yMax) / 40),
      label: rowClip?._name ?? node.name,
    } : null;
  });
  console.log('Server row click point:', JSON.stringify(row));
  if (!row) throw new Error('Could not find a visible server row to select');
  await page.evaluate(({ x, y }) => {
    const player = globalThis.__as2player;
    player.pointerMove(x, y);
    player.pointerDown(x, y);
    player.pointerUp(x, y);
  }, row);
  await sleep(250);
  const selected = await currentChooserState();
  console.log('After selecting a server:', JSON.stringify(selected));
  await screenshot('03-server-selected');
  if (selected.selectedIndex == null || selected.joinEnabled !== true || selected.joinAlpha !== 100) {
    throw new Error(`Selecting a server did not enable Join: ${JSON.stringify(selected)}`);
  }

  await page.evaluate(({ x, y }) => {
    const player = globalThis.__as2player;
    const bounds = player.boundsIn((() => {
      let found = null;
      const button = player.root.obj.gsecs.mc_ServerChooser.join_btn;
      const walk = (node) => { if (node.obj === button) { found = node; return; } for (const child of node.children) if (!found) walk(child); };
      walk(player.root);
      return found;
    })(), null);
    const center = { x: Math.round((bounds.xMin + bounds.xMax) / 40), y: Math.round((bounds.yMin + bounds.yMax) / 40) };
    player.pointerMove(center.x, center.y);
    player.pointerDown(center.x, center.y);
    player.pointerUp(center.x, center.y);
  }, selected.joinCenter ?? before.joinCenter);
  await page.waitForFunction(() => globalThis.__as2player?.root?.obj?.gsecs?._currentframe === 45, { timeout: 30000 });
  await sleep(500);
  await screenshot('04-room-chooser');
  const roomFrame = await page.evaluate(() => globalThis.__as2player?.root?.obj?.gsecs?._currentframe);
  console.log('Room chooser frame:', roomFrame);

  // The back button remains usable after the valid Join flow.
  const back = await page.evaluate(() => {
    const player = globalThis.__as2player;
    const object = player.root.obj.gsecs?.mChooser?.goBack_btn;
    let node = null;
    const walk = (current) => { if (current.obj === object) { node = current; return; } for (const child of current.children) if (!node) walk(child); };
    walk(player.root);
    const bounds = node && player.boundsIn(node, null);
    return bounds ? { x: Math.round((bounds.xMin + bounds.xMax) / 40), y: Math.round((bounds.yMin + bounds.yMax) / 40) } : null;
  });
  if (!back) throw new Error('Could not find the Room Chooser back button');
  await page.evaluate(({ x, y }) => {
    const player = globalThis.__as2player;
    player.pointerMove(x, y);
    player.pointerDown(x, y);
    player.pointerUp(x, y);
  }, back);
  await page.waitForFunction(() => globalThis.__as2player?.root?.obj?.gsecs?._currentframe === 75, { timeout: 30000 });
  await sleep(300);
  await screenshot('05-back-to-server-chooser');
  const returnedFrame = await page.evaluate(() => globalThis.__as2player?.root?.obj?.gsecs?._currentframe);
  console.log('Back navigation frame:', returnedFrame);
  if (returnedFrame !== 75) throw new Error(`Back navigation failed; got frame ${returnedFrame}`);

  await fs.writeFile(path.join(outDir, 'state.json'), JSON.stringify({ before, after, selected, roomFrame, returnedFrame, blocked }, null, 2));
  await fs.writeFile(path.join(outDir, 'logs.txt'), logs.join('\n'));
  console.log('Blocked non-local requests:', blocked.length);
  console.log('Screenshots:', outDir);
} finally {
  await browser.close();
}
