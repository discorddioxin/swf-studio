// Puppeteer visual regression for Sprite Tree inline rename/tag persistence.
// Game SWFs are bundled; requests to non-local hosts are explicitly blocked.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch } from './browser.dev.mjs';

const url = process.env.APP_URL || 'http://127.0.0.1:5173/';
const outDir = process.argv[2] || 'debug/tools/e2e-output/sprite-tree';
await fs.mkdir(outDir, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const blocked = [];
page.on('request', (request) => {
  const parsed = new URL(request.url());
  if (['127.0.0.1', 'localhost'].includes(parsed.hostname) || ['data:', 'blob:'].includes(parsed.protocol)) request.continue();
  else { blocked.push(request.url()); request.abort(); }
});
await page.setRequestInterception(true);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clickText = (pattern) => page.evaluate((source) => {
  const re = new RegExp(source, 'i');
  const button = [...document.querySelectorAll('button,a,[role=tab]')]
    .find((node) => re.test((node.textContent || '').trim()));
  button?.click();
  return button?.textContent?.trim() ?? null;
}, pattern.source);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('Load:', await clickText(/bundled/));
  await sleep(12000);
  console.log('Sprite Tree view:', await clickText(/^\s*Sprite Tree\s*$/));
  await page.waitForSelector('[role="treeitem"]', { timeout: 30000 });
  await sleep(250);
  await page.screenshot({ path: path.join(outDir, '01-sprite-tree.png'), fullPage: true });

  const original = await page.$eval('button[aria-label^="Rename "]', (button) => button.getAttribute('aria-label'));
  if (!original) throw new Error('No sprite rename action found');
  const renamed = 'Sprite QA Name';
  await page.click(`button[aria-label="${original}"]`);
  const renameInput = 'input[aria-label^="Rename "]';
  await page.waitForSelector(renameInput);
  await page.click(renameInput);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type(renamed);
  await page.keyboard.press('Enter');

  await page.click(`button[aria-label="Add tag to ${renamed}"]`);
  const tagInput = `input[aria-label="New tag for ${renamed}"]`;
  await page.waitForSelector(tagInput);
  await page.type(tagInput, 'visual check');
  await page.keyboard.press('Enter');
  await sleep(800); // project autosaves to localStorage after a short debounce
  await page.screenshot({ path: path.join(outDir, '02-renamed-and-tagged.png'), fullPage: true });

  const saved = await page.evaluate((name) => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith('swfforge:project:'));
    if (!key) return null;
    const project = JSON.parse(localStorage.getItem(key) || '{}');
    const entry = Object.entries(project.characters || {}).find(([, label]) => label?.name === name);
    return entry ? { key, characterId: entry[0], label: entry[1], vocab: project.vocab } : { key, characterCount: Object.keys(project.characters || {}).length };
  }, renamed);
  console.log('Saved annotation:', JSON.stringify(saved));
  console.log('Blocked non-local requests:', blocked.length);
  if (!saved?.label || saved.label.name !== renamed || !saved.label.tags?.includes('visual-check')) {
    throw new Error(`Sprite name/tag were not persisted: ${JSON.stringify(saved)}`);
  }
  if (blocked.length) throw new Error(`Unexpected non-local network request(s): ${blocked.join(', ')}`);
  await fs.writeFile(path.join(outDir, 'state.json'), JSON.stringify(saved, null, 2));
} finally {
  await browser.close();
}
