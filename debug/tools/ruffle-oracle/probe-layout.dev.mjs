// Watch the List's redraw pipeline live: wrap layoutContent/draw/doLaterDispatcher
// (without touching onEnterFrame), then invalidate() and record what happens.
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

const wrap = await page.evaluate(() => {
  const lb = globalThis.__as2player?.root?.obj?.gsecs?.mc_ServerChooser?.serverListing_lt;
  if (!lb) return 'no lb';
  const w = globalThis.__W = { log: [] };
  const log = (s) => { if (w.log.length < 120) w.log.push(s); };
  const names = ['layoutContent', 'draw', 'doLaterDispatcher', 'invalidate', 'configureScrolling', 'setSize',
    'createChildren', 'getViewMetrics', 'addItem', 'setDataProvider', '__set__dataProvider', 'updateControl'];
  const installed = [];
  for (let p = Object.getPrototypeOf(lb); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    for (const name of names) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (!d || d.__wrapped || typeof d.value !== 'function') continue;
      const orig = d.value;
      Object.defineProperty(p, name, {
        configurable: true, enumerable: d.enumerable,
        value: function (...args) {
          const a = args.map((x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : typeof x)).join(',');
          log(`-> ${name}(${a}) h=${this?.__height} w=${this?.__width} rh=${this?.__rowHeight} rc=${this?.__rowCount}`);
          try {
            const r = orig.apply(this, args);
            log(`<- ${name} rc=${this?.__rowCount} rows=${this?.rows?.length} content=${this?.listContent ? 'yes' : 'no'}`);
            return r;
          } catch (e) {
            log(`!! ${name} threw: ${e?.message}`);
            throw e;
          }
        },
      });
      Object.defineProperty(p, name, { value: Object.getOwnPropertyDescriptor(p, name).value });
      Object.getOwnPropertyDescriptor(p, name).value.__wrapped = true;
      installed.push(name);
    }
  }
  return installed.join(',');
});
console.log('wrapped ::', wrap);

await page.evaluate(() => { globalThis.__W.log.length = 0; try { globalThis.__W && (() => { })(); } catch { } });
await page.evaluate(() => {
  const lb = globalThis.__as2player?.root?.obj?.gsecs?.mc_ServerChooser?.serverListing_lt;
  const w = globalThis.__W;
  w.stateBefore = `${lb.__rowCount}/${lb.rows?.length}`;
  try { lb.invalidate(); } catch (e) { w.log.push('invalidate threw ' + e.message); }
});
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(() => ({
  log: globalThis.__W.log,
  state: (() => {
    const lb = globalThis.__as2player?.root?.obj?.gsecs?.mc_ServerChooser?.serverListing_lt;
    return lb ? { rc: lb.__rowCount, rows: lb.rows?.length, inv: lb.invalidateFlag, kids: lb.listContent?.__children?.length ?? lb.listContent?.numChildren } : null;
  })(),
  logs: (globalThis.__as2player?.logs ?? []).slice(-12).map((e) => `${e.level}: ${e.message}`.slice(0, 160)),
}));
console.log('state ::', JSON.stringify(out.state));
for (const l of out.log) console.log('  ', l);
console.log('--- player log tail');
for (const l of out.logs) console.log('  ', l);
await browser.close();
