// Build a runnable AS2Program in the browser:
//   FFDec .as exports ──as2ts──▶ TypeScript modules ──sucrase──▶ CommonJS ──link──▶ AS2Program
// The generated TypeScript is exactly what the as2ts CLI writes to disk, so
// what runs here is what gets committed to a repo.

import { transform } from 'sucrase';
import * as runtime from '../../runtime/as2';
import type { AS2Program } from '../../runtime/as2';
import { transpileProject, type ProjectResult } from '../../../transpiler/as2/project';

export const RUNTIME_SPECIFIER = 'as2-runtime';

export interface BuildIssue { file: string; message: string }

export interface AS2Build {
  program: AS2Program | null;
  project: ProjectResult;
  /** generated TypeScript, keyed by module path */
  files: Map<string, string>;
  errors: BuildIssue[];
  warnings: BuildIssue[];
}

export interface SourceInput { path: string; text: string }

/** Transpile + compile + link. Module bodies (class definitions) run here, so call resetRuntime() first. */
export function buildAS2Program(sources: SourceInput[]): AS2Build {
  const project = transpileProject(sources.map((s) => ({ path: s.path, content: s.text })), { runtime: RUNTIME_SPECIFIER });
  const errors: BuildIssue[] = [];
  const warnings: BuildIssue[] = [];
  for (const r of project.report) {
    for (const d of r.diagnostics) (d.level === 'error' ? errors : warnings).push({ file: r.source.split('\n')[0], message: d.message });
  }
  const files = new Map([...project.files].filter(([k]) => k.endsWith('.ts')));
  const compiled = new Map<string, string>();
  for (const [path, code] of files) {
    try {
      compiled.set(path, transform(code, { transforms: ['typescript', 'imports'], filePath: path, production: true }).code);
    } catch (e) {
      errors.push({ file: path, message: `compile: ${(e as Error).message}` });
    }
  }
  const program = link(compiled, errors);
  return { program, project, files, errors, warnings };
}

function link(compiled: Map<string, string>, errors: BuildIssue[]): AS2Program | null {
  const cache = new Map<string, { exports: any }>();
  // modules whose body threw (usually a static initializer reading a class that was still being
  // loaded through an import cycle); they are re-run once the other modules exist
  const failed = new Map<string, Error>();
  const norm = (from: string, spec: string) => {
    const base = from.split('/').slice(0, -1);
    for (const part of spec.split('/')) {
      if (part === '..') base.pop();
      else if (part !== '.' && part) base.push(part);
    }
    const p = base.join('/');
    return compiled.has(`${p}.ts`) ? `${p}.ts` : compiled.has(p) ? p : `${p}/index.ts`;
  };
  const load = (path: string): any => {
    const hit = cache.get(path);
    if (hit) return hit.exports;
    const code = compiled.get(path);
    if (code == null) throw new Error(`module not found: ${path}`);
    const mod = { exports: {} as any };
    cache.set(path, mod);
    run(path, code, mod);
    return mod.exports;
  };
  const run = (path: string, code: string, mod: { exports: any }) => {
    const require = (spec: string) => {
      if (spec === RUNTIME_SPECIFIER || spec.endsWith('runtime/as2')) return runtime;
      if (spec.startsWith('.')) return load(norm(path, spec));
      throw new Error(`${path}: cannot import "${spec}"`);
    };
    try {
      new Function('exports', 'require', 'module', `${code}\n//# sourceURL=as2/${path}`)(mod.exports, require, mod);
      failed.delete(path);
    } catch (e) {
      failed.set(path, e as Error);
    }
  };
  // Flash's compiler orders class definitions by dependency; here a failed module is simply
  // re-run (with the same exports object, so importers' live bindings see the class) until
  // a pass makes no progress.
  const retryFailed = () => {
    for (let pass = 0; pass < 8 && failed.size; pass++) {
      const before = failed.size;
      for (const path of [...failed.keys()]) run(path, compiled.get(path)!, cache.get(path)!);
      if (failed.size >= before) break;
    }
  };
  if (!compiled.has('index.ts')) { errors.push({ file: 'index.ts', message: 'no project index was generated' }); return null; }
  // load classes first so registration order follows dependencies, then the index
  for (const p of [...compiled.keys()].filter((k) => k.startsWith('classes/'))) load(p);
  retryFailed();
  const idx = load('index.ts');
  retryFailed();
  for (const [file, e] of failed) errors.push({ file, message: `load: ${e.message}` });
  return (idx.program ?? idx.default ?? null) as AS2Program | null;
}
