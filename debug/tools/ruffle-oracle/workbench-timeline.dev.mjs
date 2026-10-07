// Headless visual smoke test for the Workbench timeline zoom, resize handle,
// and Sprite Tree. Loads only repository-bundled SWFs and blocks non-local
// requests so this check cannot contact a game server or third party.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chromium, { inflate, setupLambdaEnvironment } from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.WORKBENCH_OUT ?? '/tmp/swf-studio-workbench-evidence';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
fs.mkdirSync(out, { recursive: true });
const origin = process.env.WORKBENCH_URL ?? 'http://127.0.0.1:5173';
await inflate(path.join(here, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br'));
setupLambdaEnvironment('/tmp/al2023/lib');
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args,
  headless: true,
  defaultViewport: { width: 1440, height: 960 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
const consoleErrors = [];
const blockedRequests = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = request.url();
  if (url.startsWith('data:') || url.startsWith('blob:') || new URL(url).origin === origin) {
    void request.continue();
  } else {
    blockedRequests.push(url);
    void request.abort();
  }
});

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('select[aria-label="Bundled main SWF"]', { timeout: 30000 });
  await page.select('select[aria-label="Bundled main SWF"]', 'bassken_game4.21');
  const started = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => /Use bundled SWFs/i.test(candidate.textContent ?? ''));
    button?.click();
    return !!button;
  });
  if (!started) throw new Error('Could not start bundled SWF loading.');
  await page.waitForSelector('.forge-bottom-dock', { timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('[aria-label="Bundled main SWF"]') === null, { timeout: 120000 });
  await page.screenshot({ path: path.join(out, '01-workbench-library.png') });

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Sprite Tree')?.click();
  });
  await page.waitForSelector('[role="tablist"][aria-label="Sprite tree scope"]');
  await sleep(100);
  const local = await page.evaluate(() => ({
    tabCount: document.querySelector('[role="tablist"][aria-label="Sprite tree scope"] [role="tab"][aria-selected="true"]')?.textContent?.trim(),
    rows: document.querySelectorAll('[role="tree"] [role="treeitem"]').length,
    labels: document.querySelector('[role="tree"]')?.innerText?.slice(0, 900),
  }));
  await page.screenshot({ path: path.join(out, '02-sprite-tree-local.png') });

  await page.evaluate(() => {
    document.querySelector('[role="tablist"][aria-label="Sprite tree scope"] [role="tab"]:nth-child(2)')?.click();
  });
  await sleep(100);
  const global = await page.evaluate(() => ({
    tabCount: document.querySelector('[role="tablist"][aria-label="Sprite tree scope"] [role="tab"][aria-selected="true"]')?.textContent?.trim(),
    rows: document.querySelectorAll('[role="tree"] [role="treeitem"]').length,
    labels: document.querySelector('[role="tree"]')?.innerText?.slice(0, 900),
  }));
  await page.screenshot({ path: path.join(out, '03-sprite-tree-global.png') });
  if (local.rows < 1 || global.rows < 1) throw new Error(`Sprite Tree did not render rows: ${JSON.stringify({ local, global })}`);
  const openedSprite = await page.evaluate(() => {
    const row = document.querySelector('[role="tree"] [role="treeitem"]');
    const id = row?.getAttribute('data-character-id');
    row?.querySelector('button[aria-label^="Open "]')?.click();
    return id;
  });
  if (!openedSprite) throw new Error('Could not select a sprite from the tree.');
  await page.waitForFunction((id) => [...document.querySelectorAll('select')].some((select) => select.value === `sprite:${id}`), { timeout: 10000 }, openedSprite);

  const beforeZoom = await page.$eval('input[aria-label="Timeline frame zoom"]', (input) => input.value);
  await page.$eval('input[aria-label="Timeline frame zoom"]', (input) => input.focus());
  await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('input[aria-label="Timeline frame zoom"]')?.value === '34');
  await sleep(250); // let the frame-cell width transition settle before measuring
  const zoomMetrics = await page.evaluate(() => ({
    value: document.querySelector('input[aria-label="Timeline frame zoom"]')?.value,
    width: document.querySelector('[data-frame-index]')?.getBoundingClientRect().width,
    stripHeight: document.querySelector('[data-timeline-frame-strip]')?.getBoundingClientRect().height,
    frameNodeHeight: document.querySelector('[data-frame-index]')?.getBoundingClientRect().height,
  }));
  if (!Number.isFinite(Number(zoomMetrics.width)) || Number(zoomMetrics.width) <= Number(beforeZoom)) {
    throw new Error(`Frame zoom did not enlarge frame nodes: ${JSON.stringify(zoomMetrics)}`);
  }

  const beforeResize = await page.evaluate(() => ({
    dockHeight: document.querySelector('.forge-bottom-dock')?.getBoundingClientRect().height ?? 0,
    stripHeight: document.querySelector('[data-timeline-frame-strip]')?.getBoundingClientRect().height ?? 0,
    frameNodeHeight: document.querySelector('[data-frame-index]')?.getBoundingClientRect().height ?? 0,
  }));
  const box = await page.$eval('[aria-label="Resize Timeline panel"]', (handle) => {
    const rect = handle.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!box) throw new Error('Timeline resize handle is not visible.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 130, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((oldHeight) => (document.querySelector('.forge-bottom-dock')?.getBoundingClientRect().height ?? 0) > oldHeight + 80, { timeout: 5000 }, beforeResize.dockHeight);
  await page.waitForFunction((oldHeight) => (document.querySelector('[data-frame-index]')?.getBoundingClientRect().height ?? 0) > oldHeight + 70, { timeout: 5000 }, beforeResize.frameNodeHeight);
  await sleep(200);
  const afterResize = await page.evaluate(() => ({
    dockHeight: document.querySelector('.forge-bottom-dock')?.getBoundingClientRect().height,
    stripHeight: document.querySelector('[data-timeline-frame-strip]')?.getBoundingClientRect().height,
    frameNodeHeight: document.querySelector('[data-frame-index]')?.getBoundingClientRect().height,
  }));
  await page.screenshot({ path: path.join(out, '04-timeline-zoomed-resized.png') });
  if (Number(afterResize.frameNodeHeight) <= Number(beforeResize.frameNodeHeight) + 60) {
    throw new Error(`Timeline frame nodes did not stretch vertically: ${JSON.stringify({ beforeResize, afterResize })}`);
  }

  console.log(JSON.stringify({
    selectedBundledMain: 'bassken_game4.21',
    local,
    global,
    openedSprite,
    beforeZoom: `${beforeZoom}px`,
    zoomMetrics,
    beforeResize,
    afterResize,
    blockedRequests,
    consoleErrors,
    screenshots: out,
  }, null, 2));
  if (blockedRequests.length) throw new Error(`Unexpected non-local requests: ${blockedRequests.join(', ')}`);
  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(' | ')}`);
} finally {
  await browser.close();
}
