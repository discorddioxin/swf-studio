// Fresh-boot test: attach a brand-new mx.controls.List now and watch its
// layout pipeline, versus the stale serverListing_lt created during the frame.
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
await new Promise((r) => setTimeout(r, 14000));

const r = await page.evaluate(() => {
  const g = globalThis.__as2player?.root?.obj?.gsecs;
  const old = g?.mc_ServerChooser?.serverListing_lt;
  const w = globalThis.__W = { seq: [] };
  const state = (o) => o ? {
    w: o.width, h: o.height, rh: o.__rowHeight, rc: o.__rowCount, rows: o.rows?.length,
    kids: o.content_mc ? (o.content_mc.__children ? o.content_mc.__children.length : 'n/a') : 'no mc',
    list: o.listContent ? (o.listContent.__children ? o.listContent.__children.length : 'n/a') : 'no mc',
  } : 'none';
  if (!g) return { err: 'no gsecs' };
  const seen = new Set();
  for (let p = Object.getPrototypeOf(old); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of ['layoutContent', 'draw', 'doLaterDispatcher', 'invalidate', 'configureScrolling', 'getViewMetrics', 'setSize', 'init', 'createChildren']) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (!d || typeof d.value !== 'function' || seen.has(name)) continue;
      seen.add(name);
      const orig = d.value;
      Object.defineProperty(p, name, {
        ...d,
        value: function (...args) {
          if (w.seq.length < 80) {
            const a = args.map((x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : typeof x)).join(',');
            w.seq.push(`${name}(${a}) h=${this.__height} w=${this.__width} rh=${this.__rowHeight} rc=${this.__rowCount} vm=${JSON.stringify(this.getViewMetrics?.() ?? null)}`);
          }
          return orig.apply(this, args);
        },
      });
    }
  }
  // fresh instance, same geometry as the server list
  const fresh = g.attachMovie('List', 'probeList', 9999);
  w.fresh = fresh;
  try {
    fresh._x = 20; fresh._y = 300;
    fresh.setSize(238, 203);
    fresh.addItem({ label: 'Angelic fishing', data: '127.0.0.1' });
    fresh.addItem({ label: 'Demonic fishing', data: '127.0.0.2' });
  } catch (e) { w.err = e.message; }
  return { old: state(old), fresh: state(fresh), seq: w.seq.slice(0, 25) };
});
console.log('at create ::', JSON.stringify({ old: r.old, fresh: r.fresh, err: r.err }));
for (const s of r.seq ?? []) console.log('  ', s);
await new Promise((res) => setTimeout(res, 2500));
const after = await page.evaluate(() => {
  const s = (o) => o ? { w: o.width, h: o.height, rc: o.__rowCount, rows: o.rows?.length, kids: o.listContent?.__children?.length ?? o.listContent?.numChildren } : 'none';
  return { old: s(globalThis.__W?.lb ?? globalThis.__as2player?.root?.obj?.gsecs?.mc_ServerChooser?.serverListing_lt), fresh: s(globalThis.__W?.fresh), seq: globalThis.__W?.seq.slice(-20) };
});
console.log('after 2.5s ::', JSON.stringify({ old: after.old, fresh: after.fresh }));
for (const s of after.seq ?? []) console.log('  ', s);
await browser.close();
