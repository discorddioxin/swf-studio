import { launch } from './browser.dev.mjs';
const name = process.argv[2];
const b = await launch();
const p = await b.newPage();
const msgs = [];
p.on('console', (m) => msgs.push(m.text()));
await p.goto(`http://127.0.0.1:8123/oracle.html?swf=/swfs/${name}.swf&w=640&h=580`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 5000));
const uniq = {};
for (const m of msgs.filter((x) => /Error running definition tag|ERROR/.test(x))) {
  const clean = m.replace(/%c\w+%c/g, '').replace(/%c/g, '').replace(/color:.*$/, '').trim();
  uniq[clean] = (uniq[clean] ?? 0) + 1;
}
for (const [k, n] of Object.entries(uniq)) console.log(`${String(n).padStart(3)}x ${k.slice(0, 200)}`);
await p.close(); b.disconnect();
