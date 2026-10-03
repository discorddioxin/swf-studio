// Drive the Execute tab through the real flow (server select -> join -> room
// select -> in-game) with our own engine and save a screenshot per step.
// Usage: node tools/ruffle-oracle/flow.dev.mjs [outDir]
import { launch } from './browser.dev.mjs';
import fs from 'node:fs';

const OUT = process.argv[2] ?? '/tmp/flow';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launch();
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' });

const clickText = (re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const b = [...document.querySelectorAll('button,a,[role=tab]')].find((x) => rx.test((x.textContent ?? '').trim()));
  if (b) { b.click(); return (b.textContent ?? '').trim(); }
  return null;
}, re.source);

console.log('load bundled:', await clickText(/bundled/));
await sleep(12000);
console.log('execute tab:', await clickText(/^execute$/));
await sleep(2000);
// Start mode: "Gaia: play as guest" (the offline entry point the app offers).
const mode = await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label="Start mode"]');
  if (!sel) return 'no select';
  sel.value = 'gaia-guest';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return sel.value;
});
console.log('start mode:', mode);

const state = () => page.evaluate(() => {
  const p = globalThis.__as2player;
  const root = p?.root?.obj;
  const g = root?.gsecs;
  const lb = g?.mc_ServerChooser?.serverListing_lt;
  return {
    rootFrame: root?._currentframe,
    gsecsFrame: g?._currentframe,
    title: g?.bar?.maintitle ?? null,
    servers: (() => { try { return lb?.getLength?.() ?? null; } catch { return null; } })(),
    items: [0, 1, 2].map((i) => { try { return JSON.stringify(lb?.getItemAt?.(i)); } catch { return null; } }),
    chooserVisible: g?.mc_ServerChooser?._visible ?? null,
    children: (() => { const out = []; const walk = (o, d) => { if (!o || d > 2) return; for (const k of Object.keys(o).slice(0, 30)) { if (!/^_|^__/.test(k)) out.push(`${k}`); } }; walk(g, 0); return out.slice(0, 20).join(','); })(),
  };
});

const shot = async (name) => {
  const png = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].filter((x) => x.width > 300).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return c ? c.toDataURL('image/png') : null;
  });
  if (png) fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  return !!png;
};

for (const [name, wait] of [['01-server-list', 6000], ['02-server-list-late', 6000]]) {
  await sleep(wait);
  console.log(name, JSON.stringify(await state()));
  console.log('  saved:', await shot(name));
}

// Press JOIN the way the game does (the button's own handler).
const joined = await page.evaluate(() => {
  const g = globalThis.__as2player?.root?.obj?.gsecs;
  const btn = g?.mc_ServerChooser?.join_btn;
  if (!btn) return 'no join_btn';
  if (typeof btn.onRelease !== 'function') return `onRelease is ${typeof btn.onRelease}`;
  try { btn.onRelease(); return 'pressed'; } catch (e) { return 'threw ' + e.message; }
});
console.log('join:', joined);

for (const [name, wait] of [['03-after-join', 4000], ['04-room-select', 6000], ['05-late', 8000]]) {
  await sleep(wait);
  console.log(name, JSON.stringify(await state()));
  console.log('  saved:', await shot(name));
}

fs.writeFileSync(`${OUT}/logs.txt`, logs.slice(-200).join('\n'));
const text = await page.evaluate(() => document.body.innerText.slice(0, 1200));
fs.writeFileSync(`${OUT}/panel.txt`, text);
console.log('--- panel ---');
console.log(text.slice(0, 900));
await browser.close();
