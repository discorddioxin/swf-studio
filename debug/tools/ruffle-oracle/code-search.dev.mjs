// Puppeteer visual check for Explorer content search, including decoded AVM1
// strings. Loads only the bundled fishing SWF and blocks non-local requests.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium, { inflate } from '@sparticuz/chromium';

const outDir = process.argv[2] || 'debug/tools/e2e-output/code-search';
const query = process.env.CODE_SEARCH_QUERY || 'gotoAndStop';
const origin = process.env.APP_URL || 'http://127.0.0.1:5173/';
const appOrigin = new URL(origin).origin;
const packageBin = path.resolve('debug/tools/ruffle-oracle/node_modules/@sparticuz/chromium/bin');
const libraryRoot = await inflate(path.join(packageBin, 'al2023.tar.br'));
process.env.LD_LIBRARY_PATH = [path.join(libraryRoot, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
process.env.FONTCONFIG_PATH ??= '/tmp/fonts';
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
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = request.url();
  if (url.startsWith('data:') || url.startsWith('blob:') || new URL(url).origin === appOrigin) {
    void request.continue();
  } else {
    blocked.push(url);
    void request.abort();
  }
});

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[aria-label="Bundled main SWF"]', { timeout: 30000 });
  await page.select('select[aria-label="Bundled main SWF"]', 'bassken_game4.21');
  const started = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => /Use bundled SWFs/i.test(item.textContent ?? ''));
    button?.click();
    return !!button;
  });
  if (!started) throw new Error('Could not start the bundled SWF.');
  await page.waitForSelector('.forge-bottom-dock', { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Bundled main SWF"]'), { timeout: 120000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((item) => (item.textContent ?? '').trim() === 'Code Editor')?.click());
  await page.waitForSelector('[aria-label="Project files"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[aria-label="Code Editor"]')?.textContent?.includes('transpiler diagnostics'), { timeout: 120000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Show ActionScript Project')?.click());
  await page.waitForFunction(() => {
    const editor = document.querySelector('[aria-label="Code Editor"]')?.textContent ?? '';
    return editor.includes('ActionScript source files') && !editor.includes('Building project…');
  }, { timeout: 120000 });

  const searchField = 'input[aria-label="Search project files and source"]';
  await page.evaluate(({ selector, value }) => {
    const input = document.querySelector(selector);
    if (!(input instanceof HTMLInputElement)) throw new Error('Explorer search field not found.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector: searchField, value: query });
  await page.waitForFunction((needle) => [...document.querySelectorAll('[aria-label="Project files"] button[title]')]
    .some((button) => !button.getAttribute('title')?.toLowerCase().includes(needle.toLowerCase())), { timeout: 30000 }, query);

  const rows = await page.$$eval('[aria-label="Project files"] button[title]', (buttons) => buttons.map((button) => button.title));
  const contentMatch = rows.find((title) => !title.toLowerCase().includes(query.toLowerCase()));
  if (!contentMatch) throw new Error(`Search yielded no content-only result for "${query}". Results: ${rows.join(', ')}`);
  await page.screenshot({ path: path.join(outDir, 'search-results.png') });
  await page.click(`[aria-label="Project files"] button[title=${JSON.stringify(contentMatch)}]`);
  await page.waitForFunction(({ path, needle }) => {
    const editor = document.querySelector(`[aria-label="${CSS.escape(path)} source"]`);
    return (editor?.textContent ?? '').toLowerCase().includes(needle.toLowerCase());
  }, { timeout: 30000 }, { path: contentMatch, needle: query });
  const sourceSelector = `[aria-label=${JSON.stringify(`${contentMatch} source`)}]`;
  const sourceExcerpt = await page.$eval(sourceSelector, (node, needle) => {
    const text = node.textContent ?? '';
    const index = text.toLowerCase().indexOf(String(needle).toLowerCase());
    return text.slice(Math.max(0, index - 120), Math.min(text.length, index + String(needle).length + 160));
  }, query);
  await page.screenshot({ path: path.join(outDir, 'opened-content-match.png') });
  const state = { query, contentMatch, resultCount: rows.length, resultPaths: rows.slice(0, 30), sourceExcerpt, blockedNonLocalRequests: blocked.length, pageErrors: errors };
  await fs.writeFile(path.join(outDir, 'state.json'), JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state, null, 2));
  if (blocked.length) throw new Error(`Unexpected non-local requests: ${blocked.join(', ')}`);
  if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
}
