import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiagnosticLog, createPreviewServer } from './preview-server.mjs';

let directory, preview, origin;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'swf-preview-'));
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist/index.html'), '<html>SWF Studio</html>');
  await writeFile(join(directory, 'dist/manifest.json'), '{"swfs":[]}');
  await mkdir(join(directory, 'dist/swfs'));
  await writeFile(join(directory, 'dist/swfs/game.swf'), Buffer.from('FWS\x06binary'));
});
afterEach(async () => {
  await preview?.close(); preview = undefined;
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});
async function start() {
  preview = await createPreviewServer({ root: join(directory, 'dist'), host: '0.0.0.0', port: 0 });
  origin = `http://127.0.0.1:${preview.server.address().port}`;
}

describe('production preview server', () => {
  it('binds publicly, accepts preview hosts, and serves the app and raw SWFs', async () => {
    await start();
    expect(preview.server.address().address).toBe('0.0.0.0');
    const app = await fetch(origin, { headers: { Host: '5173-example.e2b.app' } });
    expect(app.status).toBe(200);
    expect(await app.text()).toContain('SWF Studio');
    const manifest = await fetch(origin + '/manifest.json');
    expect(await manifest.json()).toEqual({ swfs: [] });
    const swf = await fetch(origin + '/swfs/game.swf');
    expect(swf.headers.get('content-type')).toBe('application/x-shockwave-flash');
    expect(await swf.text()).toBe('FWS\x06binary');
    const head = await fetch(origin + '/swfs/game.swf', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');
  });

  it('reports live resource usage without accumulating request history', async () => {
    await start();
    for (let i = 0; i < 50; i++) await (await fetch(origin)).arrayBuffer();
    const response = await fetch(origin + '/__preview_health');
    const health = await response.json();
    expect(health).toMatchObject({ status: 'ok', mode: 'production', requests: 51, errors: 0 });
    expect(health.uptimeSeconds).toBeGreaterThan(0);
    expect(health.rssMiB).toBeGreaterThan(0);
    expect(health.heapUsedMiB).toBeGreaterThan(0);
  });

  it('rejects bad URLs/methods and does not expose source files or escaping symlinks', async () => {
    await writeFile(join(directory, 'secret.txt'), 'outside the production build');
    await symlink(join(directory, 'secret.txt'), join(directory, 'dist/escape.txt'));
    await start();
    expect((await fetch(origin + '/missing.swf')).status).toBe(404);
    expect((await fetch(origin + '/%')).status).toBe(400);
    expect((await fetch(origin + '/..%2fsecret.txt')).status).toBe(403);
    expect((await fetch(origin + '/escape.txt')).status).toBe(403);
    expect((await fetch(origin + '/manifest.json', { method: 'POST' })).status).toBe(405);
    expect((await fetch(origin)).status).toBe(200);
    expect(preview.health().errors).toBe(0);
  });

  it('serves large assets with streams and survives aborted downloads', async () => {
    await writeFile(join(directory, 'dist/large.swf'), Buffer.alloc(1024 * 1024, 0x5a));
    await start();
    const controller = new AbortController();
    const response = await fetch(origin + '/large.swf', { signal: controller.signal });
    expect(response.headers.get('content-length')).toBe(String(1024 * 1024));
    await response.body.getReader().read();
    controller.abort();
    const next = await fetch(origin + '/large.swf');
    expect((await next.arrayBuffer()).byteLength).toBe(1024 * 1024);
    expect((await fetch(origin + '/__preview_health')).status).toBe(200);
  });

  it('fails clearly for a missing build or occupied port instead of silently switching ports', async () => {
    await expect(createPreviewServer({ root: join(directory, 'missing'), port: 0 })).rejects.toThrow('npm run build');
    await start();
    await expect(createPreviewServer({ root: join(directory, 'dist'), port: preview.server.address().port })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });

  it('rotates diagnostic logs so monitoring cannot exhaust disk space', async () => {
    const logs = join(directory, 'logs');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createDiagnosticLog(logs);
    log('start', { sandboxId: 'example' });
    const path = join(logs, 'server.jsonl');
    await writeFile(path, 'x'.repeat(1024 * 1024));
    log('resources', { rssMiB: 32 });
    expect((await readFile(path + '.1')).length).toBe(1024 * 1024);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ event: 'resources', rssMiB: 32 });
  });
});
