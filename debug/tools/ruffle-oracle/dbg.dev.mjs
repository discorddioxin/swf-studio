import { launch } from './browser.dev.mjs';
const b = await launch();
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 200)); });
await p.goto('http://127.0.0.1:8123/oracle.html?swf=/swfs/bassken_game4.21.swf&w=640&h=580', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 6000));
const info = await p.evaluate(() => ({
  lang: navigator.language,
  status: window.__oracle?.status,
  frames: window.__oracle?.frames,
  canvases: document.querySelectorAll('canvas').length,
  shadowCanvas: !!document.querySelector('ruffle-player')?.shadowRoot?.querySelector('canvas'),
  shadowHtml: document.querySelector('ruffle-player')?.shadowRoot?.innerHTML?.slice(0, 200),
  elRuffle: typeof document.querySelector('ruffle-player')?.ruffle,
  logs: (window.__oracle?.logs ?? []).slice(-5),
}));
console.log(JSON.stringify(info, null, 1));
await p.close(); b.disconnect();
