// Click JOIN in the server chooser and report what the game does next: the
// Sushi traffic in the console and which screen (room select?) appears.
import { launch } from './browser.dev.mjs';

const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' });
const clickText = (re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const b = [...document.querySelectorAll('button,a,[role=tab]')].find((x) => rx.test((x.textContent ?? '').trim()));
  if (b) { b.click(); return (b.textContent ?? '').trim(); }
  return null;
}, re.source);
await clickText(/bundled/);
await new Promise((r) => setTimeout(r, 12000));
await clickText(/^execute$/);
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label="Start mode"]');
  if (sel) { sel.value = 'gaia-guest'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await new Promise((r) => setTimeout(r, 15000));

const mark = await page.evaluate(() => {
  const p = globalThis.__as2player;
  globalThis.__LOG0 = (p.logs ?? []).length;
  const g = p.root.obj?.gsecs;
  const lb = g?.mc_ServerChooser?.serverListing_lt;
  return { logs: globalThis.__LOG0, gsecsFrame: g?._currentframe, len: (() => { try { return lb.getLength(); } catch { return null; } })() };
});
console.log('before join ::', JSON.stringify(mark));

await page.evaluate(() => {
  const g = globalThis.__as2player.root.obj.gsecs;
  const lb = g.mc_ServerChooser.serverListing_lt;
  try { lb.setSelectedIndex(0); } catch { }
  try { g.mc_ServerChooser.join_btn?.onRelease?.(); } catch (e) { console.log('join threw', e.message); }
});
await new Promise((r) => setTimeout(r, 8000));

const after = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const g = p.root.obj?.gsecs;
  const names = [];
  const walk = (o, d) => { if (!o || d > 2) return; for (const k of Object.keys(o)) { if (/^mc_|_btn$|Panel$|panel$/.test(k)) names.push(`${d}:${k}`); } };
  walk(g, 0);
  const newLogs = (p.logs ?? []).slice(globalThis.__LOG0).map((e) => `${e.level}: ${e.message}`.slice(0, 170));
  return {
    gsecsFrame: g?._currentframe,
    title: g?.bar?.maintitle,
    chooserVisible: g?.mc_ServerChooser?._visible,
    clips: names.slice(0, 30),
    newLogs,
  };
});
console.log('after join ::', JSON.stringify({ frame: after.gsecsFrame, title: after.title, chooserVisible: after.chooserVisible, clips: after.clips }, null, 1).slice(0, 1200));
console.log('--- log since join');
for (const l of after.newLogs) console.log('  ', l);
await page.screenshot({ path: '/tmp/join_state.png' });
await browser.close();
