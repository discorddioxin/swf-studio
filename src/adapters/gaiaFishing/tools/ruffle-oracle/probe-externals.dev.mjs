// Which external SWFs the game asked for, which one resolved, and what the
// Program panel would report as missing (loadMovie warnings from the player log).
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

const banner = await page.evaluate(() => {
  const m = /The game loads[^.]*\./i.exec(document.body.innerText ?? '');
  return m ? m[0] : null;
});
const info = await page.evaluate(() => {
  const l = globalThis.__as2player?.logs ?? [];
  const ext = l.filter((e) => /loadMovie|is not available|no symbol exported/i.test(e.message))
    .map((e) => `${e.level}: ${e.message}`);
  const p = globalThis.__as2player;
  const tr = p?.root?.obj?._global?.omnitureTrackingObject;
  return {
    missingExternals: p ? [...(p.missingExternals ?? [])] : null,
    logCount: l.length,
    externals: [...new Set(ext)],
    tracking: tr ? {
      statURL: tr.statURL,
      trackingMC: !!tr.trackingMC,
      trackingMCKids: tr.trackingMC?.numChildren?.() ?? tr.trackingMC?.__children?.length,
      loaded: tr.loaded,
      sTrack: typeof tr.s?.track,
      sKids: tr.s?.numChildren?.() ?? tr.s?.__children?.length,
      loadInterval: tr.loadInterval,
      movie: !!tr.s?.movie,
      keys: Object.keys(tr).slice(0, 12).join(','),
    } : 'no omnitureTrackingObject',
  };
});
console.log('warning banner ::', banner ?? '(none)');
console.log('missingExternals ::', JSON.stringify(info.missingExternals));
console.log('omniture tracking ::', JSON.stringify(info.tracking));
console.log('log lines ::', info.logCount);
for (const e of info.externals) console.log('  ', e);
await browser.close();
