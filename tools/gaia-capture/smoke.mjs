// Headless smoke run of bassken_game4.21 as the main SWF.
//
//   node tools/gaia-capture/smoke.mjs [--seconds 25] [--boot guest|none] [--out /tmp/smoke]
//
// Drives the studio UI (bundled SWFs → main SWF → Execute), collects the page
// console + the in-app Execute console, and screenshots the canvas over time.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] == null ? 'true' : all[i + 1]]] : acc), []),
);
const URL_APP = args.url ?? 'http://127.0.0.1:5173/';
const MAIN = args.main ?? 'bassken_game4.21';
const SECONDS = Number(args.seconds ?? 25);
const BOOT = args.boot ?? 'guest';
const OUT = path.resolve(args.out ?? '/tmp/smoke');
fs.mkdirSync(OUT, { recursive: true });

// Launching Chromium from puppeteer is flaky in this sandbox, so allow
// attaching to one that is already running: keep a browser up with
//   LD_LIBRARY_PATH=/tmp/al/lib /tmp/chromium --headless=new --no-sandbox \
//     --disable-gpu --remote-debugging-port=9333 about:blank &
// and pass --cdp 9333.
const browser = args.cdp
  ? await puppeteer.connect({ browserURL: `http://127.0.0.1:${args.cdp}`, protocolTimeout: 20000, defaultViewport: null })
  : await (async () => {
      const chromium = (await import('@sparticuz/chromium')).default;
      const exe = await chromium.executablePath();
      return puppeteer.launch({ executablePath: exe, args: [...chromium.args, '--window-size=1200,900'], headless: true, protocolTimeout: 15000 });
    })();
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { globalThis.__SWF_AVM1_TRACE = true; });
await page.setViewport({ width: 1200, height: 900 });

const lines = [];
const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };
page.on('console', (m) => log(`[page:${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => log(`[pageerror] ${e.message}`));

const shot = async (name) => {
  try {
    // Grab the game canvas directly: a full-page screenshot goes through the
    // software GL compositor and can take tens of seconds.
    const dataUrl = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return c ? c.toDataURL('image/png') : null;
    }, { timeout: 20000 });
    if (!dataUrl) { log('no canvas for', name); return; }
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    log('canvas shot', name);
  } catch (e) {
    log('canvas shot FAILED', name, String(e).split('\n')[0]);
    blocked = true;
  }
};
let blocked = false;
const responsive = async () => {
  try { await page.evaluate(() => 1 + 1, { timeout: 4000 }); return true; } catch { blocked = true; return false; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL_APP, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('select[aria-label="Bundled main SWF"]', { timeout: 30000 });
await page.select('select[aria-label="Bundled main SWF"]', MAIN);
await shot('01-loader');
// "Use bundled SWFs"
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /Use bundled SWFs/i.test(b.textContent ?? ''));
  if (!btn) return false;
  btn.click();
  return true;
});
log('clicked bundled:', clicked);
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => /Execute/i.test(b.textContent ?? '')) || /Execute/.test(document.body.innerText),
  { timeout: 120000, polling: 500 },
);
await shot('02-loaded');

// open the Execute tab
await page.evaluate(() => {
  const tab = [...document.querySelectorAll('button,[role="tab"],a')].find((b) => (b.textContent ?? '').trim() === 'Execute');
  tab?.click();
});
await sleep(1500);
await shot('03-execute');

// pick the boot preset (Gaia: play as guest)
if (BOOT === 'guest') {
  const picked = await page.evaluate(() => {
    const sel = document.querySelector('select[aria-label="Boot script"], select[aria-label="Start script"]')
      ?? [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => /guest/i.test(o.textContent ?? '')));
    if (!sel) return false;
    const opt = [...sel.options].find((o) => /guest/i.test(o.textContent ?? ''));
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.textContent;
  });
  log('boot preset:', picked);
}

const status = async (label) => {
  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const logs = [...document.querySelectorAll('[class*="font-mono"]')].map((e) => (e.textContent ?? '').trim()).filter(Boolean);
    return {
      canvas: canvas ? { w: canvas.width, h: canvas.height, css: canvas.getBoundingClientRect().toJSON() } : null,
      text: document.body.innerText.slice(0, 3000),
      logs: logs.slice(-12),
    };
  });
  log(`--- ${label} ---`);
  if (info.canvas) log('canvas', JSON.stringify(info.canvas));
  for (const l of info.logs) log('log:', l.slice(0, 300));
  return info;
};

await status('after execute');
for (let i = 0; i < 4 && !blocked; i++) {
  await sleep((SECONDS * 1000) / 4);
  const alive = await responsive();
  log(`t+${Math.round(((i + 1) * SECONDS) / 4)}s responsive=${alive}`);
  if (!alive) break;
  await status(`t+${Math.round(((i + 1) * SECONDS) / 4)}s`);
  await shot(`frame-${String(i + 1).padStart(2, '0')}`);
}
if (args.click === 'join') {
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.82, r: r.toJSON() };
  });
  log('click at', JSON.stringify(info));
  if (info) { await page.mouse.click(info.x, info.y); await sleep(4000); await shot('after-click'); await status('after click'); }
}
fs.writeFileSync(path.join(OUT, 'console.log'), lines.join('\n'));
if (args.cdp) browser.disconnect(); else await browser.close();
log('done');
