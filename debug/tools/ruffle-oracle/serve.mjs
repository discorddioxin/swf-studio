// Static server for the Ruffle oracle: serves oracle.html, the Ruffle dist and
// the bundled SWFs, plus the offline GSI stubs the game would otherwise fetch
// from gaiaonline.com. No host/origin restrictions — it is a local tool.
//
//   node serve.mjs [--port 8123]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gsiStubFetchText } from '../../../src/lib/gsiStub.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SWFS = path.join(ROOT, 'game-files/fish-full/swfs');
const RUFFLE = path.join(HERE, 'node_modules/@ruffle-rs/ruffle');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8123;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.swf': 'application/x-shockwave-flash', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.json': 'application/json', '.map': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

async function file(res, p) {
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); return res.end(); }

  // offline GSI stubs (same code the studio uses)
  if (p.startsWith('/stub/')) {
    let body = '';
    for await (const c of req) body += c;
    const target = p === '/stub/gateway'
      ? 'http://www.gaiaonline.com/chat/gsi/gateway.php'
      : p === '/stub/game' ? 'http://www.gaiaonline.com/game.php?v=simple' : 'http://www.gaiaonline.com/chat/gsi/inventory.php';
    const text = await gsiStubFetchText(target, req.method ?? 'GET', body || null, (level, message) => console.log(`[stub:${level}] ${message}`));
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
    return res.end(text ?? '');
  }

  if (p === '/' || p === '/oracle.html') return file(res, path.join(HERE, 'oracle.html'));
  // The game asks for its externals from server paths that do not exist here
  // (e.g. /sharedsource/GSECS/gsecs2.9.swf) — serve any bundled SWF by name.
  const byName = /\/([A-Za-z0-9_.-]+\.swf)$/.exec(p);
  if (byName) {
    try { await stat(path.join(SWFS, byName[1])); return file(res, path.join(SWFS, byName[1])); } catch { /* fall through */ }
  }
  if (p.startsWith('/ruffle/')) return file(res, path.join(RUFFLE, p.slice('/ruffle/'.length)));
  if (p.startsWith('/swfs/')) return file(res, path.join(SWFS, p.slice('/swfs/'.length)));
  if (p.startsWith('/external/')) return file(res, path.join(ROOT, 'game-files/fish-full', p.slice(1)));
  return file(res, path.join(HERE, p.slice(1)));
});

server.listen(PORT, '0.0.0.0', () => console.log(`ruffle oracle on http://127.0.0.1:${PORT}/oracle.html`));
