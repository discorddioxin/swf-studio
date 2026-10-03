// Inspect the running game from inside the browser through the dev-only
// __as2player hook (see src/components/As2Execute.tsx).
import { launch } from './browser.dev.mjs';

const browser = await launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.evaluateOnNewDocument(() => { globalThis.__DBG_T = true; });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle2' });
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /bundled/i.test(x.textContent ?? ''));
  b?.click();
});
await new Promise((r) => setTimeout(r, 12000));
await page.evaluate(() => {
  const t = [...document.querySelectorAll('button,a,[role=tab]')].find((x) => /^execute$/i.test((x.textContent ?? '').trim()));
  t?.click();
});
await new Promise((r) => setTimeout(r, 1500));
// Instrument the List class before the game boots: log addItem/removeAll calls
// with the gsecs frame so late/early population can be told apart.
await page.evaluate(() => {
  const p = globalThis.__as2player;
  const classes = p?.movie?.program?.classes ?? {};
  const key = Object.keys(classes).find((k) => /(^|\.)List$/.test(k));
  const C = key ? classes[key] : null;
  const proto = C?.prototype;
  globalThis.__lbTrace = { key, hasClass: !!C, hooks: [] };
  if (proto) {
    for (const m of ['addItem', 'removeAll', 'addItemAt', 'setDataProvider']) {
      const orig = proto[m];
      if (typeof orig !== 'function') continue;
      proto[m] = function (...args) {
        const g = (globalThis.__as2player?.root?.obj ?? {}) .gsecs;
        globalThis.__lbTrace.hooks.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')}) @gsecs${g?._currentframe} name=${this?._name}`);
        const r = orig.apply(this, args);
        globalThis.__lbTrace.hooks.push(`  -> len=${(() => { try { return this.getLength(); } catch { return 'err'; } })()} dp=${this.__dataProvider ? 'set' : 'unset'}`);
        return r;
      };
    }
  }
});
await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label="Start mode"]');
  // Only switch if a different mode is selected; changing it restarts the player.
  if (sel && sel.value !== 'none') { sel.value = 'none'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await new Promise((r) => setTimeout(r, 12000));

// Step the gsecs movie back through the frame that builds the server list and
// see whether the game's own code fills the ListBox once it is initialised.
const after = await page.evaluate(async () => {
  const read = (fn) => { try { return fn(); } catch (e) { return 'threw ' + e.message; } };
  const t = globalThis.__T ?? [];
  const interesting = t.filter((l) => /mc_ServerChooser|serverListing_lt|frame 61|frame 1 /.test(l));
  return {
    n: t.length,
    log: interesting.slice(0, 40).join('\n'),
    gsecsFrame: read(() => globalThis.__as2player?.root?.obj?.gsecs?._currentframe),
    liveLen: read(() => globalThis.__as2player?.root?.obj?.gsecs?.mc_ServerChooser?.serverListing_lt?.getLength?.()),
  };
});
console.log(JSON.stringify(after, null, 1).slice(0, 3000));
console.log(JSON.stringify(after, null, 1).slice(0, 2000));
console.log(JSON.stringify(after, null, 1).slice(0, 2000));
console.log(JSON.stringify(after, null, 1).slice(0, 1500));
const info = await page.evaluate(() => {
  const p = globalThis.__as2player;
  const root = p?.root?.obj ?? p?.root;
  const g = root?.gsecs;
  const lb = g?.mc_ServerChooser?.serverListing_lt;
  return { frame: g?._currentframe, title: g?.bar?.maintitle, len: String(lb?.getLength?.()) };
});
console.log(JSON.stringify(info, null, 1).slice(0, 3000));
await page.close();
await browser.close();
