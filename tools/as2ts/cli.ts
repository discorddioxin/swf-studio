// as2ts command line. Run through the launcher: `npm run as2ts -- <input> [options]`.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import JSZip from 'jszip';
import { transpileProject, transpileScript, type ProjectFile } from '../../transpiler/as2';

const HELP = `as2ts – ActionScript 1/2 to TypeScript

Usage:
  npm run as2ts -- <input> [-o <outdir>] [--runtime <module>] [--strict]

<input> can be:
  • an FFDec script export folder   (ffdec -export script <folder> game.swf)
  • a .zip of such a folder
  • a single .as file              (printed to stdout unless -o is given)

Options:
  -o, --out <dir>      output folder (default: ./as2ts-out)
  --runtime <module>   module the generated code imports its runtime from
                       (default: @/runtime/as2 – the runtime inside swf-studio)
  --strict             exit with code 1 if any script failed to parse
  -h, --help           show this help
`;

function parseArgs(argv: string[]) {
  const opts = { input: '', out: '', runtime: '@/runtime/as2', strict: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') opts.out = argv[++i] ?? '';
    else if (a === '--runtime') opts.runtime = argv[++i] ?? opts.runtime;
    else if (a === '--strict') opts.strict = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (!opts.input) opts.input = a;
    else throw new Error(`Unexpected argument "${a}"`);
  }
  return opts;
}

function walk(dir: string, root = dir, out: ProjectFile[] = []): ProjectFile[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, root, out);
    else if (/\.as$/i.test(name)) out.push({ path: relative(root, full).replace(/\\/g, '/'), content: readFileSync(full, 'utf8') });
  }
  return out;
}

async function readZip(file: string): Promise<ProjectFile[]> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const out: ProjectFile[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.as$/i.test(entry.name)) continue;
    out.push({ path: entry.name, content: await entry.async('string') });
  }
  return out;
}

function writeTree(outDir: string, files: Map<string, string>) {
  for (const [path, content] of files) {
    const full = join(outDir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.input) { process.stdout.write(HELP); process.exit(opts.input || opts.help ? 0 : 1); }
  const input = resolve(opts.input);
  if (!existsSync(input)) throw new Error(`Input not found: ${input}`);

  // single file
  if (statSync(input).isFile() && /\.as$/i.test(input)) {
    const { code, diagnostics } = transpileScript(readFileSync(input, 'utf8'), { runtime: opts.runtime });
    for (const d of diagnostics) process.stderr.write(`${d.level}${d.line ? ` (line ${d.line})` : ''}: ${d.message}\n`);
    if (opts.out) {
      const target = opts.out.endsWith('.ts') ? resolve(opts.out) : join(resolve(opts.out), input.replace(/^.*[\\/]/, '').replace(/\.as$/i, '.ts'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, code);
      process.stderr.write(`wrote ${target}\n`);
    } else process.stdout.write(code);
    return;
  }

  const files = statSync(input).isDirectory() ? walk(input) : await readZip(input);
  if (!files.length) throw new Error(`No .as files found in ${input}`);
  const result = transpileProject(files, { runtime: opts.runtime });
  const outDir = resolve(opts.out || 'as2ts-out');
  writeTree(outDir, result.files);

  const errors = result.report.reduce((n, r) => n + r.diagnostics.filter((d) => d.level === 'error').length, 0);
  const warnings = result.report.reduce((n, r) => n + r.diagnostics.filter((d) => d.level === 'warning').length, 0);
  process.stdout.write(`as2ts: ${files.length} script(s) -> ${result.files.size} file(s) in ${outDir}\n`);
  process.stdout.write(`       ${errors} error(s), ${warnings} warning(s) – see as2ts-report.md\n`);
  if (opts.strict && errors) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`as2ts: ${(err as Error).message}\n`);
  process.exit(1);
});
