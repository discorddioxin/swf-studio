// Ruffle-as-oracle validation: load each bundled SWF in Ruffle (a real Flash
// implementation) and report the tag-level errors it prints. A faithful SWF
// should produce none.
import { launch } from './browser.dev.mjs';
import fs from 'node:fs';
const SWFS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['bassken_scene', 'bassken_pier', 'bassken_overview', 'bassken_fish4.20', 'game_chat', 'gsecs2.9', 'bassken_game4.21'];
const b = await launch();
const out = {};
for (const name of SWFS) {
  const p = await b.newPage();
  const msgs = [];
  p.on('console', (m) => msgs.push(m.text()));
  await p.goto(`http://127.0.0.1:8123/oracle.html?swf=/swfs/${name}.swf&w=640&h=580`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 5000));
  const errs = msgs.filter((m) => /Error running definition tag/.test(m));
  const byType = {};
  for (const e of errs) { const m = /tag: ([A-Za-z0-9]+)/.exec(e); if (m) byType[m[1]] = (byType[m[1]] ?? 0) + 1; }
  const other = [...new Set(msgs.filter((m) => /ERROR/.test(m) && !/Error running definition tag/.test(m)).map((m) => m.replace(/^%c[^%]*%c[^%]*%c\s*/, '').slice(0, 90)))];
  out[name] = { tagErrors: errs.length, byType, other };
  console.log(name.padEnd(18), String(errs.length).padStart(4), 'tag errors ', JSON.stringify(byType));
  for (const o of other) console.log('   ', o);
  const png = await p.evaluate(() => {
    const c = document.querySelector('ruffle-player')?.shadowRoot?.querySelector('canvas');
    try { return c ? c.toDataURL('image/png') : null; } catch { return null; }
  });
  if (png) fs.writeFileSync(`/tmp/verify-${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  await p.close();
}
fs.writeFileSync('/tmp/verify-report.json', JSON.stringify(out, null, 2));
b.disconnect();
