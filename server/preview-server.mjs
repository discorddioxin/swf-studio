// Low-overhead production preview: no bundler, file watcher, or dependency on
// Vite at runtime. Build first with `npm run build`.
import { createServer } from 'node:http';
import { createReadStream, appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.swf': 'application/x-shockwave-flash', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.flv': 'video/x-flv', '.xml': 'application/xml', '.as': 'text/plain; charset=utf-8',
};
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel);
};

export async function createPreviewServer({ root = 'dist', host = '0.0.0.0', port = 5173, log = () => {} } = {}) {
  let directory;
  try {
    directory = await realpath(root);
    if (!(await stat(join(directory, 'index.html'))).isFile()) throw new Error('No index.html');
  } catch {
    throw new Error(`No production build in ${resolve(root)}. Run "npm run build" first.`);
  }
  const startedAt = new Date().toISOString();
  const started = process.hrtime.bigint();
  let requests = 0, errors = 0;
  const health = () => {
    const memory = process.memoryUsage();
    return {
      status: 'ok', mode: 'production', pid: process.pid, startedAt,
      uptimeSeconds: Number(process.hrtime.bigint() - started) / 1e9,
      rssMiB: +(memory.rss / 1024 / 1024).toFixed(2),
      heapUsedMiB: +(memory.heapUsed / 1024 / 1024).toFixed(2), requests, errors,
    };
  };
  const server = createServer(async (req, res) => {
    requests++;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    const reply = (status, text, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(text) });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD'); reply(405, 'Method not allowed'); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://preview.internal').pathname); }
    catch { reply(400, 'Invalid URL'); return; }
    if (pathname === '/__preview_health') {
      reply(200, JSON.stringify(health()), 'application/json'); return;
    }
    const path = resolve(directory, '.' + pathname);
    if (pathname.includes('\0') || !inside(directory, path)) { reply(403, 'Forbidden'); return; }
    try {
      // Resolve symlinks too; a build artifact must never expose the source
      // checkout, diagnostic logs, or files outside the production directory.
      let file = await realpath(path);
      if (!inside(directory, file)) { reply(403, 'Forbidden'); return; }
      let info = await stat(file);
      if (info.isDirectory()) {
        file = await realpath(join(file, 'index.html'));
        if (!inside(directory, file)) { reply(403, 'Forbidden'); return; }
        info = await stat(file);
      }
      if (!info.isFile()) { reply(404, 'Not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      // Backpressure bounds memory even when a browser downloads large SWFs.
      pipeline(createReadStream(file), res, (error) => {
        if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE' && error.code !== 'ECONNRESET') {
          errors++; log('request-error', { message: error.message });
        }
      });
    } catch (error) {
      if (res.destroyed) return;
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') reply(404, 'Not found');
      else if (error.code === 'EACCES') reply(403, 'Forbidden');
      else {
        errors++; log('request-error', { message: error.message }); reply(500, 'Internal server error');
      }
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  log('listening', { host, port: server.address().port, ...health() });
  const monitor = setInterval(() => log('resources', health()), 30000);
  monitor.unref();
  let closed;
  return {
    server, health,
    close() {
      if (closed) return closed;
      clearInterval(monitor);
      closed = new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      return closed;
    },
  };
}

// Keep at most two 1 MiB files. No request headers, URLs, or credentials are
// logged. This directory is ignored by Git but remains in the workspace.
export function createDiagnosticLog(directory) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'server.jsonl');
  return (event, data = {}) => {
    const line = JSON.stringify({ timestamp: new Date().toISOString(), event, ...data }) + '\n';
    console.log(line.trimEnd());
    try {
      if (existsSync(path) && statSync(path).size + Buffer.byteLength(line) > 1024 * 1024) renameSync(path, path + '.1');
      appendFileSync(path, line);
    } catch (error) { console.error(`Could not write preview diagnostics: ${error.message}`); }
  };
}

async function main() {
  const log = createDiagnosticLog(resolve('.preview'));
  log('start', { pid: process.pid, sandboxId: process.env.E2B_SANDBOX_ID ?? null });
  process.on('uncaughtExceptionMonitor', (error, origin) => log('fatal', { origin, message: error.message, stack: error.stack }));
  process.on('exit', (code) => log('exit', { code }));
  const port = Number(process.env.PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const preview = await createPreviewServer({
    root: process.env.PREVIEW_ROOT ?? 'dist', host: process.env.HOST ?? '0.0.0.0', port, log,
  });
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, async () => {
    if (closing) return;
    closing = true;
    log('shutdown', { signal, ...preview.health() });
    const timeout = setTimeout(() => process.exit(1), 5000);
    timeout.unref();
    try { await preview.close(); process.exit(0); }
    catch (error) { log('shutdown-error', { message: error.message }); process.exit(1); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    createDiagnosticLog(resolve('.preview'))('startup-error', { message: error.message });
    process.exitCode = 1;
  });
}
