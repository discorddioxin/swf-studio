// Drive the studio's Execute tab in a headless browser and capture what the
// app's own engine renders (no Ruffle involved — this is our player).
import { launch } from './browser.dev.mjs';
import fs from 'node:fs';

const OUT = process.argv[2] ?? '/tmp/app';
const APP = process.argv[3] ?? 'http://127.0.0.1:5173/';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(APP, { waitUntil: 'networkidle2' });

// 1. Load the bundled SWFs with bassken_game4.21 as the main movie.
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /bundled/i.test(x.textContent ?? ''));
  if (b) { b.click(); return b.textContent?.trim(); }
  return null;
});
console.log('clicked:', clicked);
await sleep(12000);

// 2. Pick the main SWF from the "Main SWF" dropdown if present.
const picked = await page.evaluate(() => {
  const selects = [...document.querySelectorAll('select')];
  for (const s of selects) {
    const opts = [...s.options].map((o) => ({ value: o.value, text: o.textContent ?? '' }));
    const want = opts.find((o) => /bassken_game4\.21/i.test(o.text) || /bassken_game4\.21/i.test(o.value));
    if (want) { s.value = want.value; s.dispatchEvent(new Event('change', { bubbles: true })); return want.text || want.value; }
  }
  return null;
});
console.log('main swf:', picked);
await sleep(4000);

// 3. Switch to the Execute tab and choose the "Gaia: play as guest" start mode,
//    which is what makes the offline game reach its own server chooser screen.
const state = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('button,a,[role=tab]')];
  const exec = tabs.find((t) => /^execute$/i.test((t.textContent ?? '').trim()));
  if (exec) exec.click();
  return { execFound: !!exec, tabs: tabs.slice(0, 12).map((t) => (t.textContent ?? '').trim()).filter(Boolean) };
});
console.log('tabs:', JSON.stringify(state));
await sleep(3000);

const started = await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label="Start mode"]');
  if (!sel) return 'no select';
  sel.value = 'gaia-guest';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return `${sel.value} | ${[...sel.options].map((o) => o.textContent).join(',')}`;
});
console.log('start mode:', started);
await sleep(2000);

const runClicked = await page.evaluate(() => {
  // no separate run button: choosing the start mode restarts the player
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /^▶ play$|^play$/i.test((x.textContent ?? '').trim()));
  if (b) { b.click(); return b.textContent?.trim(); }
  return 'already running';
});
console.log('run button:', runClicked);

for (const t of [3000, 8000, 15000, 25000]) {
  await sleep(t === 3000 ? 3000 : 5000);
  const shot = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, url: (() => { try { return c.toDataURL('image/png'); } catch { return null; } })() }));
    const big = canvases.filter((c) => c.url).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    return { big, count: canvases.length };
  });
  console.log(`t+${t}ms canvases=${shot.count}`);
  if (shot.big?.url) {
    fs.writeFileSync(`${OUT}/canvas_${t}.png`, Buffer.from(shot.big.url.split(',')[1], 'base64'));
    console.log(`  saved canvas_${t}.png ${shot.big.w}x${shot.big.h}`);
  }
}
const summary = await page.evaluate(() => {
  const el = document.querySelector('canvas');
  return { bodyText: document.body.innerText.slice(0, 600), canvas: el ? { w: el.width, h: el.height } : null };
});
fs.writeFileSync(`${OUT}/logs.txt`, logs.slice(-400).join('\n'));
console.log('--- page text ---');
console.log(summary.bodyText.slice(0, 400));
await page.close();
await browser.close();
