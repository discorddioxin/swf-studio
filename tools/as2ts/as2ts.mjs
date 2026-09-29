#!/usr/bin/env node
// Launcher for the as2ts CLI: bundles tools/as2ts/cli.ts (and the transpiler
// under src/transpiler/as2) with esbuild in memory, then runs it. Works on any
// Node >= 18 without TypeScript loaders.
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [join(here, 'cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  write: false,
  packages: 'external',
  absWorkingDir: join(here, '..', '..'),
  logLevel: 'error',
});
// Written inside node_modules so bare imports (jszip) resolve normally.
const dir = join(here, '..', '..', 'node_modules', '.cache', 'as2ts');
mkdirSync(dir, { recursive: true });
const file = join(dir, `cli-${process.pid}.mjs`);
writeFileSync(file, result.outputFiles[0].text);
process.on('exit', () => rmSync(file, { force: true }));
await import(pathToFileURL(file).href);
