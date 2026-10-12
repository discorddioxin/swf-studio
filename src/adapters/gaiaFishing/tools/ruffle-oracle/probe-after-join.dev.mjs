// After JOIN: dump the display list (scale, size, character) to find nodes that
// are drawn far too large, and check what the room-select step is waiting for.
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

const dump = () => page.evaluate(() => {
  const p = globalThis.__as2player;
  const root = p.root;
  const out = [];
  const walk = (n, d) => {
    if (d > 3) return;
    const o = n.obj ?? {};
    const ch = n.character;
    out.push({
      d, name: o._name ?? n.name, kind: n.kind, char: ch?.exportName ?? ch?.kind ?? n.characterId,
      x: Math.round(o._x ?? 0), y: Math.round(o._y ?? 0),
      sx: Math.round((o._xscale ?? 100) * 10) / 10, sy: Math.round((o._yscale ?? 100) * 10) / 10,
      w: Math.round(o.width ?? 0), h: Math.round(o.height ?? 0),
      vis: o._visible !== false,
    });
    for (const c of n.children ?? []) walk(c, d + 1);
  };
  walk(root, 0);
  const g = root.obj?.gsecs;
  return {
    frame: root.obj?._currentframe,
    nodes: out.filter((n) => (n.w > 600 || n.h > 400) || (n.d <= 1)),
    gsecsFrame: g?._currentframe,
    chooser: g?.mc_ServerChooser ? `${g.mc_ServerChooser._visible}/${g.mc_ServerChooser._name}` : 'none',
    roomList: g?.mc_RoomChooser ? 'yes' : Object.keys(g ?? {}).filter((k) => /room/i.test(k)).join(','),
  };
});
console.log('--- before join');
const before = await dump();
console.log(JSON.stringify(before.nodes.filter((n) => n.d <= 1), null, 1).slice(0, 1500));
await page.evaluate(() => {
  const g = globalThis.__as2player.root.obj.gsecs;
  const lb = g.mc_ServerChooser.serverListing_lt;
  try { lb.selectItem?.(0); } catch { }
  try { g.join_btn?.onRelease?.(); } catch (e) { console.log('join threw', e.message); }
});
await new Promise((r) => setTimeout(r, 6000));
console.log('--- after join');
const after = await dump();
console.log(JSON.stringify(after, null, 1).slice(0, 2500));
await page.screenshot({ path: '/tmp/after_join.png' });
await browser.close();
