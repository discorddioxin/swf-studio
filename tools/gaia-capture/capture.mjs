#!/usr/bin/env node
// Gaia game capture: records what a live Gaia Flash game loads and does over
// time, so SWF Studio's engine can reproduce the real start-up sequence.
//
// Runs on YOUR machine in a visible Chrome window. You log in to Gaia
// yourself in that window; the script never sees or stores credentials (the
// login cookie stays in the local ./profile folder, which you can delete).
//
//   cd tools/gaia-capture && npm install
//   node capture.mjs                                   # Bass'ken, 60 s
//   node capture.mjs --url "http://www.gaiaonline.com/launch/fishing?&l=gambino" --seconds 120 --interval 250
//
// Output (./out/<timestamp>/):
//   capture.json   every event in time order: requests/responses, console and
//                  Ruffle log lines (incl. AS trace()), clicks/keys, screenshots
//   metadata.json  Ruffle's metadata for each SWF (swfVersion, isActionScript3,
//                  frameRate, numFrames, size, background colour)
//   files/         copies of every SWF / XML / text / data response
//   frames/        screenshots of the game element, named by milliseconds
//   report.md      readable summary: load order, timeline of actions

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import puppeteer from 'puppeteer';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] == null ? 'true' : all[i + 1]]] : acc), []),
);
const URL_TO_CAPTURE = args.url ?? 'http://www.gaiaonline.com/launch/fishing?&l=bassken';
const SECONDS = Number(args.seconds ?? 60);
const INTERVAL = Number(args.interval ?? 500);
const PROFILE = path.resolve(args.profile ?? './profile');
const OUT = path.resolve('out', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });

const events = [];
let t0 = Date.now();
const now = () => Date.now() - t0;
const log = (type, data) => { const e = { t: now(), type, ...data }; events.push(e); return e; };

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: PROFILE,
  defaultViewport: null,
  args: ['--window-size=1100,900', '--autoplay-policy=no-user-gesture-required'],
});
const [page] = await browser.pages();

// ---- 1. Log in (only if needed) -------------------------------------------
await page.goto('https://www.gaiaonline.com/', { waitUntil: 'domcontentloaded' });
const loggedIn = await page.evaluate(() => !/Login|Register/.test(document.querySelector('#gaia_header')?.textContent ?? 'Login'));
if (!loggedIn) {
  console.log('\nLog in to Gaia in the Chrome window, then come back here and press Enter.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('Press Enter once you are logged in… ');
  rl.close();
}

// ---- 2. Instrument the page before the game loads -------------------------
// Ruffle reads window.RufflePlayer.config when it starts: force verbose
// logging (AS trace() output is logged at "info") whatever Gaia assigns.
await page.evaluateOnNewDocument(() => {
  const force = (cfg) => Object.assign(cfg ?? {}, { logLevel: 'info', showSwfDownload: false });
  let holder = { config: force({}) };
  Object.defineProperty(window, 'RufflePlayer', {
    configurable: true,
    get: () => holder,
    set: (v) => { holder = v ?? {}; holder.config = force(holder.config); },
  });
  const report = (type, e) => window.__capture?.({ type, detail: e });
  const where = (e) => {
    const el = document.querySelector('ruffle-object, ruffle-embed, object, embed');
    const r = el?.getBoundingClientRect();
    return r ? { x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) } : { x: e.clientX, y: e.clientY };
  };
  addEventListener('pointerdown', (e) => report('input', { kind: 'mousedown', button: e.button, ...where(e) }), true);
  addEventListener('pointerup', (e) => report('input', { kind: 'mouseup', button: e.button, ...where(e) }), true);
  addEventListener('keydown', (e) => report('input', { kind: 'keydown', key: e.key, code: e.code, keyCode: e.keyCode }), true);
  addEventListener('keyup', (e) => report('input', { kind: 'keyup', key: e.key, code: e.code, keyCode: e.keyCode }), true);
});
await page.exposeFunction('__capture', (e) => log(e.type, e.detail));

page.on('console', (m) => log('console', { level: m.type(), text: m.text() }));
page.on('pageerror', (err) => log('pageerror', { text: String(err) }));
page.on('request', (r) => {
  if (/^data:/.test(r.url())) return;
  log('request', { url: r.url(), method: r.method(), resourceType: r.resourceType(), postData: r.postData()?.slice(0, 2000) });
});
let fileNo = 0;
page.on('response', async (r) => {
  const url = r.url();
  if (/^data:/.test(url)) return;
  const type = r.headers()['content-type'] ?? '';
  const e = log('response', { url, status: r.status(), contentType: type });
  const interesting = /\.swf(\?|$)|\.xml(\?|$)|\.txt(\?|$)|gsi|\.php|json|x-shockwave-flash|xml|text\/plain/i.test(url + ' ' + type)
    && !/\.(js|css|png|gif|jpe?g|woff2?)(\?|$)/i.test(url);
  if (!interesting) return;
  try {
    const body = Buffer.from(typeof r.content === 'function' ? await r.content() : await r.buffer());
    const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'index').replace(/[^\w.-]+/g, '_');
    const name = `${String(++fileNo).padStart(3, '0')}_${base}`;
    fs.writeFileSync(path.join(OUT, 'files', name), body);
    e.savedAs = `files/${name}`;
    e.bytes = body.length;
  } catch { /* redirects / aborted */ }
});

// ---- 3. Load the game and record ------------------------------------------
console.log(`\nLoading ${URL_TO_CAPTURE}\nRecording for ${SECONDS}s. Play normally (click Start, cast, etc.); every click and key is logged.`);
t0 = Date.now();
log('navigate', { url: URL_TO_CAPTURE });
await page.goto(URL_TO_CAPTURE, { waitUntil: 'domcontentloaded' });

const metadata = [];
const grabMetadata = async () => {
  const found = await page.evaluate(() => [...document.querySelectorAll('ruffle-object, ruffle-embed, ruffle-player')]
    .map((p) => ({ metadata: p.metadata ?? null, readyState: p.readyState ?? null }))).catch(() => []);
  for (const f of found) if (f.metadata && !metadata.some((m) => JSON.stringify(m) === JSON.stringify(f.metadata))) {
    metadata.push(f.metadata);
    log('ruffle-metadata', f.metadata);
  }
};

const end = Date.now() + SECONDS * 1000;
while (Date.now() < end) {
  const t = now();
  await grabMetadata();
  const el = await page.$('ruffle-object, ruffle-embed, ruffle-player, object, embed');
  const file = `frames/${String(t).padStart(7, '0')}.png`;
  try {
    if (el) await el.screenshot({ path: path.join(OUT, file) });
    else await page.screenshot({ path: path.join(OUT, file) });
    log('screenshot', { file });
  } catch { /* element not ready yet */ }
  await new Promise((r) => setTimeout(r, Math.max(0, INTERVAL - (now() - t))));
}

// ---- 4. Write results ------------------------------------------------------
fs.writeFileSync(path.join(OUT, 'capture.json'), JSON.stringify(events, null, 2));
fs.writeFileSync(path.join(OUT, 'metadata.json'), JSON.stringify(metadata, null, 2));

const fmt = (ms) => `${(ms / 1000).toFixed(2)}s`;
const loads = events.filter((e) => e.type === 'response' && e.savedAs);
const actions = events.filter((e) => ['input', 'console', 'pageerror', 'ruffle-metadata'].includes(e.type)
  && !(e.type === 'console' && /favicon|DevTools/i.test(e.text ?? '')));
const report = [
  `# Capture of ${URL_TO_CAPTURE}`, '',
  `Recorded ${SECONDS}s at ${INTERVAL} ms screenshot interval on ${new Date().toISOString()}.`, '',
  '## SWF metadata (from Ruffle)', '',
  ...(metadata.length ? metadata.map((m) => `- \`${JSON.stringify(m)}\``) : ['- (Ruffle metadata not available)']), '',
  '## Files loaded (in order)', '',
  '| time | status | bytes | url | saved as |', '|---|---|---|---|---|',
  ...loads.map((e) => `| ${fmt(e.t)} | ${e.status} | ${e.bytes ?? ''} | ${e.url} | ${e.savedAs} |`), '',
  '## Timeline (input, trace/log output, errors)', '',
  ...actions.map((e) => `- ${fmt(e.t)} **${e.type}** ${e.type === 'input' ? JSON.stringify(e) : (e.text ?? JSON.stringify(e))}`), '',
  `Screenshots: ${events.filter((e) => e.type === 'screenshot').length} in frames/ (file name = ms since navigation).`,
].join('\n');
fs.writeFileSync(path.join(OUT, 'report.md'), report);
console.log(`\nDone. Results in ${OUT}\nZip that folder (and the game XML export if you have it) and share it.`);
await browser.close();
