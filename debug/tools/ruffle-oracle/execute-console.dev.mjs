// Puppeteer smoke/visual check for the Execute console tabs and runtime diagnostics.
// It loads only the bundled Gaia fishing SWFs; all non-local browser requests are blocked.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium, { inflate } from '@sparticuz/chromium';

const packageBin = path.resolve('debug/tools/ruffle-oracle/node_modules/@sparticuz/chromium/bin');
const libraryRoot = await inflate(path.join(packageBin, 'al2023.tar.br'));
process.env.LD_LIBRARY_PATH = [path.join(libraryRoot, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
process.env.FONTCONFIG_PATH ??= '/tmp/fonts';
const origin = process.env.APP_URL || 'http://127.0.0.1:5173/';
const outDir = process.argv[2] || 'debug/tools/e2e-output/execute-console';
await fs.mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote'), '--disable-dev-shm-usage'],
  headless: true,
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const blocked = [];
page.on('request', (request) => {
  const url = new URL(request.url());
  if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
  else { blocked.push(url.href); request.abort(); }
});
await page.setRequestInterception(true);

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[aria-label="Bundled main SWF"]', { timeout: 30000 });
  await page.select('select[aria-label="Bundled main SWF"]', 'bassken_game4.21');
  const started = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => /Use bundled SWFs/i.test(item.textContent ?? ''));
    button?.click();
    return !!button;
  });
  if (!started) throw new Error('Could not start the bundled main SWF.');
  await page.waitForSelector('.forge-bottom-dock', { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Bundled main SWF"]'), { timeout: 120000 });
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((button) => (button.textContent ?? '').trim() === 'Execute')?.click());
  await page.waitForSelector('canvas[aria-label="Game stage"]', { timeout: 30000 });
  await page.waitForSelector('[aria-label="Console tabs"] [role="tab"]', { timeout: 30000 });
  await page.waitForSelector('select[aria-label="Start mode"]', { timeout: 30000 });
  await page.select('select[aria-label="Start mode"]', 'gaia-guest');
  await page.waitForFunction(() => {
    const tab = [...document.querySelectorAll('[aria-label="Console tabs"] [role="tab"]')]
      .find((item) => (item.textContent ?? '').includes('Req/Res'));
    return !!tab && tab.querySelector('span')?.textContent?.trim() !== '0';
  }, { timeout: 45000 }).catch(() => {});

  const names = await page.$$eval('[aria-label="Console tabs"] [role="tab"]', (tabs) => tabs.map((tab) => (tab.textContent ?? '').trim()));
  const actionsTabPresent = names.some((name) => name.startsWith('Actions'));
  if (actionsTabPresent) throw new Error('The removed Actions report tab is still present in Execute.');
  for (const label of ['Logs', 'Req/Res', 'Problems']) {
    if (!names.some((name) => name.startsWith(label))) throw new Error(`Missing console tab: ${label}`);
  }
  const screenshots = [
    ['logs', 'Logs'],
    ['req-res', 'Req/Res'],
    ['problems', 'Problems'],
  ];
  const views = {};
  for (const [id, label] of screenshots) {
    await page.evaluate((wanted) => {
      const tab = [...document.querySelectorAll('[aria-label="Console tabs"] [role="tab"]')]
        .find((item) => (item.textContent ?? '').trim().startsWith(wanted));
      tab?.click();
    }, label);
    await page.waitForFunction((wanted) => [...document.querySelectorAll('[aria-label="Console tabs"] [role="tab"]')]
      .some((tab) => (tab.textContent ?? '').trim().startsWith(wanted) && tab.getAttribute('aria-selected') === 'true'), { timeout: 10000 }, label);
    views[id] = await page.$eval('#execution-console-panel', (panel) => panel.textContent ?? '');
    await page.screenshot({ path: path.join(outDir, `${id}.png`), fullPage: false });
  }
  const state = { tabs: names, actionsTabPresent, views, blockedNonLocalRequests: blocked.length, blockedRequests: blocked };
  await fs.writeFile(path.join(outDir, 'state.json'), JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ tabs: names, reqResPreview: views['req-res'].slice(0, 1200), problemsPreview: views.problems.slice(0, 1200), blockedNonLocalRequests: blocked.length }, null, 2));
  if (blocked.length) throw new Error(`Unexpected non-local network request(s): ${blocked.join(', ')}`);
} finally {
  await browser.close();
}
