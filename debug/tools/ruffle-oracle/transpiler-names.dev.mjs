// Puppeteer visual check that Workbench character/frame metadata names the
// generated AS2 modules. A saved Workbench label is seeded for sprite 85 (the
// "rod 3" example), while frame labels come from the bundled SWF document.
// Non-local requests are blocked; only repository-bundled SWFs are loaded.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium, { inflate } from '@sparticuz/chromium';

const packageBin = path.resolve('debug/tools/ruffle-oracle/node_modules/@sparticuz/chromium/bin');
const libraryRoot = await inflate(path.join(packageBin, 'al2023.tar.br'));
process.env.LD_LIBRARY_PATH = [path.join(libraryRoot, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
process.env.FONTCONFIG_PATH ??= '/tmp/fonts';
const origin = process.env.APP_URL || 'http://127.0.0.1:5173/';
const outDir = process.argv[2] || 'debug/tools/e2e-output/transpiler-names';
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
  if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
  else { blocked.push(url.href); request.abort(); }
});
await page.setRequestInterception(true);

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem('swfforge:project:bassken_game4.21.swf', JSON.stringify({
      swfName: 'bassken_game4.21.swf', updatedAt: Date.now(),
      characters: { '85': { name: 'rod 3', tags: [] } },
      clips: [], markers: [], containers: [], actors: [], vocab: [],
    }));
  });
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
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((item) => (item.textContent ?? '').trim() === 'Code Editor')?.click();
  });
  await page.waitForSelector('[aria-label="Project files"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('[aria-label="Code Editor"]')?.textContent?.includes('generated files'), { timeout: 120000 });

  await page.evaluate(() => {
    const search = document.querySelector('input[aria-label="Search project files"]');
    if (!search) throw new Error('Project file search not found.');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(search, 'rod_3');
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Project files"] button[title]')]
    .some((button) => button.getAttribute('title') === 'timelines/rod_3.ts'), { timeout: 30000 });
  await page.click('[aria-label="Project files"] button[title="timelines/rod_3.ts"]');
  await page.waitForSelector('[aria-label="timelines/rod_3.ts source"]', { timeout: 30000 });
  const source = await page.$eval('[aria-label="timelines/rod_3.ts source"]', (node) => node.textContent ?? '');
  const labels = [...source.matchAll(/\b\d+:\s*"([^"]+)"/g)].map((match) => match[1]);
  const callbacks = [...source.matchAll(/const\s+(rod_3_[A-Za-z0-9_$]+)\s*=/g)].map((match) => match[1]);
  const state = { sourcePath: 'timelines/rod_3.ts', labels, callbacks, sourceExcerpt: source.slice(0, 2800), blockedNonLocalRequests: blocked.length };
  await fs.writeFile(path.join(outDir, 'state.json'), JSON.stringify(state, null, 2));
  await page.screenshot({ path: path.join(outDir, 'rod-3-generated-typescript.png'), fullPage: false });
  console.log(JSON.stringify({ ...state, sourceExcerpt: undefined }, null, 2));
  if (!source.includes('Workbench timeline name: "rod 3"')) throw new Error('Workbench sprite name was not used in generated TypeScript.');
  for (const label of ['idle', 'throw', 'release']) {
    if (!labels.includes(label)) throw new Error(`Workbench frame label "${label}" is missing from generated TypeScript.`);
  }
  for (const callback of ['rod_3_idle', 'rod_3_throw_shared']) {
    if (!callbacks.includes(callback)) throw new Error(`Expected readable frame callback ${callback}; found ${callbacks.join(', ')}.`);
  }
  for (const mapping of ['9: rod_3_idle', '17: rod_3_throw_shared', '21: rod_3_throw_shared']) {
    if (!source.includes(mapping)) throw new Error(`Numeric frame mapping was not preserved: ${mapping}.`);
  }
  if (!source.includes('Workbench frame 21: "release"')) throw new Error('The release frame context was not shown beside its runtime mapping.');
  if (blocked.length) throw new Error(`Unexpected non-local network request(s): ${blocked.join(', ')}`);
} finally {
  await browser.close();
}
