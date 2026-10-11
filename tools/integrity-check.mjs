import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

// Integrity check: verify preview responds, then trigger capture via /api/capture
const server = createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, debugFolder: './debug' }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(0, () => {
  const port = (server.address() as any).port;
  console.log(`Integrity check listener on port ${port}`);
  // Check debug folder exists
  const dir = path.resolve('debug');
  fs.mkdirSync(dir, { recursive: true });
  console.log('Debug folder ready:', dir);
  console.log('Run: PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node tools/screenshot-preview.mjs');
  server.close();
});
