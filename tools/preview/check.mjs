// Bounded, repeatable load/idle check for the production preview server.
// Runs separately from the server; stopping this probe cannot stop the app.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const base = new URL(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5173/');
const report = { startedAt: new Date().toISOString(), requests: 0, failures: [], samples: [] };
const started = performance.now();
async function request(path, json = false) {
  try {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(10000) });
    report.requests++;
    if (!response.ok) report.failures.push({ path, status: response.status });
    return json ? await response.json() : await response.arrayBuffer();
  } catch (error) {
    report.failures.push({ path, error: String(error) });
    return null;
  }
}
async function sample() {
  const health = await request('__preview_health', true);
  if (health?.status !== 'ok') throw new Error('Production preview health endpoint unavailable. Start `npm run preview:stable` first.');
  const row = { seconds: +((performance.now() - started) / 1000).toFixed(2), ...health };
  report.samples.push(row);
  console.log(JSON.stringify(row));
}

async function main() {
  await sample();
  const manifest = await request('manifest.json', true);
  if (!Array.isArray(manifest?.swfs)) throw new Error('Missing bundled SWF manifest.');
  const paths = ['.', 'manifest.json'];
  for (const entry of manifest.swfs) paths.push(entry.path, ...(entry.fonts ?? []));
  // Drain every response (including binary assets) so the client does not
  // introduce its own unbounded connection/response queue.
  for (let round = 0; round < 30; round++) {
    await Promise.all(Array.from({ length: 12 }, (_, i) => request(paths[(round * 12 + i) % paths.length])));
    if (round % 5 === 0) await sample();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  await sample();
  console.log('Idle observation for 30 seconds.');
  await new Promise((resolve) => setTimeout(resolve, 30000));
  await sample();
  report.completedAt = new Date().toISOString();
  report.durationSeconds = +((performance.now() - started) / 1000).toFixed(2);
  try { report.oomEvents = await readFile('/sys/fs/cgroup/user/memory.events', 'utf8'); }
  catch { /* cgroup accounting is Linux/Arena-specific */ }
  await mkdir('.preview', { recursive: true });
  await writeFile('.preview/load-test.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.requests} requests; ${report.failures.length} failures. Report: .preview/load-test.json`);
  if (report.failures.length) { console.error(report.failures); process.exitCode = 1; }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
