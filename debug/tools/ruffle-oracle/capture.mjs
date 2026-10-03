// Capture reference frames from the Ruffle oracle.
//
//   node capture.mjs --out /tmp/oracle [--swf /swfs/bassken_game4.21.swf] [--times 1000,3000,6000]
//
// Chromium is started from the @sparticuz/chromium build that ships in this
// folder (unpacked to /tmp), driven over the DevTools protocol by puppeteer-core.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.dev.mjs';
import chromium from '@sparticuz/chromium';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] == null ? 'true' : all[i + 1]]] : acc), []),
);
const OUT = path.resolve(args.out ?? '/tmp/oracle');
const SWF = args.swf ?? '/swfs/bassken_game4.21.swf';
const TIMES = String(args.times ?? '1500,4000,8000').split(',').map(Number);
const PORT = Number(args.port ?? 8123);
const W = Number(args.w ?? 640);
const H = Number(args.h ?? 580);
const CDP_PORT = Number(args.cdp ?? 9333);
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- chromium ---------------------------------------------------------------
let browser;
const attach = async () => launch();
try {
  browser = await attach();
  console.log('attached to existing chromium');
} catch {
  const exe = await chromium.executablePath();
  const child = spawn(exe, [...chromium.args, `--remote-debugging-port=${CDP_PORT}`, '--window-size=1200,900', 'about:blank'], { detached: true, stdio: 'ignore', env: { ...process.env } });
  child.unref();
  for (let i = 0; i < 40; i++) { await sleep(500); try { browser = await attach(); break; } catch { /* keep waiting */ } }
}
if (!browser) { console.error('could not start chromium'); process.exit(1); }

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });
page.on('console', (m) => console.log(`[page:${m.type()}] ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

const url = `http://127.0.0.1:${PORT}/oracle.html?swf=${encodeURIComponent(SWF)}&w=${W}&h=${H}`;
console.log('open', url);
await page.goto(url, { waitUntil: 'domcontentloaded' });

const shot = async (name) => {
  const data = await page.evaluate(() => {
    // Ruffle renders into a canvas inside its shadow root.
    const host = document.querySelector('ruffle-player');
    const c = host?.shadowRoot?.querySelector('canvas') ?? document.querySelector('canvas');
    if (!c) return null;
    try { return c.toDataURL('image/png'); } catch { return 'tainted'; }
  });
  if (!data || data === 'tainted') { console.log('no canvas for', name, data); return; }
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
  console.log('shot', name);
};

let elapsed = 0;
for (const t of TIMES) {
  await sleep(Math.max(0, t - elapsed));
  elapsed = t;
  const st = await page.evaluate(() => ({
    status: window.__oracle?.status, ready: window.__oracle?.ready,
    logs: (window.__oracle?.logs ?? []).slice(-6),
    // game state, when reachable
    gsecs: (() => { try { const g = window.__ruffleRoot?.gsecs; return g ? { frame: g._currentframe, title: g.bar?.maintitle } : null; } catch { return null; } })(),
  }));
  console.log(`t=${t}ms`, JSON.stringify(st));
  await shot(`t${String(t).padStart(5, '0')}`);
}
await page.close();
// Detach rather than close: the browser may have been started by someone else.
if (typeof browser.disconnect === 'function') browser.disconnect();
