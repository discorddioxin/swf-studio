// Visual smoke check for Code Editor's display-only AVM1 disassembly.
// Loads only the repository-bundled OmnitureActionSource SWF. All requests to
// non-local hosts are blocked so this probe never contacts a game service.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium, { inflate } from '@sparticuz/chromium';

const packageBin = path.resolve('debug/tools/ruffle-oracle/node_modules/@sparticuz/chromium/bin');
const libraryRoot = await inflate(path.join(packageBin, 'al2023.tar.br'));
process.env.LD_LIBRARY_PATH = [path.join(libraryRoot, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
process.env.FONTCONFIG_PATH ??= '/tmp/fonts';

const APP = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const OUT = path.resolve('debug/tools/e2e-output');
await fs.mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote'), '--disable-dev-shm-usage'],
  headless: true,
  defaultViewport: { width: 1440, height: 1000 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const blockedHosts = new Set();
const pageErrors = [];
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = new URL(request.url());
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') request.continue();
  else { blockedHosts.add(url.hostname); request.abort(); }
});
page.on('pageerror', (error) => pageErrors.push(error.message));
try {
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('[aria-label="Bundled main SWF"] option[value="OmnitureActionSource"]'), { timeout: 30000 });
  await page.select('[aria-label="Bundled main SWF"]', 'OmnitureActionSource');
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => /Use bundled SWFs/i.test(item.textContent ?? ''));
    if (!button) throw new Error('Bundled SWFs button not found');
    button.click();
  });
  await page.waitForFunction(() => document.querySelector('.forge-shell'), { timeout: 120000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => (item.textContent ?? '').trim() === 'Code Editor');
    if (!button) throw new Error('Code Editor button not found');
    button.click();
  });
  await page.waitForSelector('[aria-label="Project files"]', { timeout: 30000 });
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => (item.textContent ?? '').trim() === 'Show ActionScript Project');
    if (!button) throw new Error('Show ActionScript Project button not found');
    button.click();
  });

  // Find a bytecode-backed ActionScript file rather than assuming which tag is
  // first in this SWF's serialized order.
  const candidates = await page.$$eval('[aria-label="Project files"] button[title]', (buttons) =>
    buttons.map((button) => button.title).filter((title) => title.toLowerCase().endsWith('.as')),
  );
  let selectedPath = null;
  for (const candidate of candidates) {
    await page.evaluate((path) => {
      const button = [...document.querySelectorAll('[aria-label="Project files"] button[title]')]
        .find((item) => item.getAttribute('title') === path);
      button?.click();
    }, candidate);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const hasDisassembly = await page.evaluate(() => [...document.querySelectorAll('[role="note"]')]
      .some((note) => note.textContent?.includes('best-effort disassembly')));
    if (hasDisassembly) { selectedPath = candidate; break; }
  }
  if (!selectedPath) throw new Error(`No AVM1 wrapper found in ActionScript project (${candidates.length} .as files)`);

  await page.screenshot({ path: path.join(OUT, 'avm1-actionscript-disassembly.png'), fullPage: false });
  const readableExcerpt = await page.$eval('[aria-label$=" source"]', (source) => source.textContent?.slice(0, 900));
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => (item.textContent ?? '').trim() === 'Show raw bytecode');
    button?.click();
  });
  const rawWrapperVisible = await page.$eval('[aria-label$=" source"]', (source) => source.textContent?.includes('avm1Actions(') ?? false);
  if (!rawWrapperVisible) throw new Error('Raw bytecode toggle did not reveal the original avm1Actions wrapper');
  await page.screenshot({ path: path.join(OUT, 'avm1-actionscript-raw.png'), fullPage: false });
  const summary = await page.evaluate(() => ({
    note: [...document.querySelectorAll('[role="note"]')].map((note) => note.textContent?.trim()),
    containsWrapper: document.querySelector('[aria-label$=" source"]')?.textContent?.includes('avm1Actions(') ?? false,
  }));
  console.log(JSON.stringify({ selectedPath, readableExcerpt, rawWrapperVisible, summary, blockedHosts: [...blockedHosts], pageErrors }, null, 2));
} finally {
  await browser.close();
}
