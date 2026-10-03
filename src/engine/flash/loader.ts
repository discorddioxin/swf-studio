// Loads the game's AS3 code (transpiled to TypeScript) from the asset bundle.
//
//   compileSources()  TS/JS → CommonJS with sucrase (types stripped, ES
//                     imports → require). Done once per loaded bundle.
//   linkProgram()     evaluates the modules in a fresh module registry (so a
//                     Restart gets fresh static state), resolves imports and
//                     indexes every exported class under its simple and
//                     package-qualified names for SymbolClass linkage and
//                     getDefinitionByName.
//
// Import resolution, in order:
//   flash.* / fl.*   in any spelling ("flash/display/MovieClip",
//                    "flash.display.MovieClip", "../lib/flash/display", …)
//                    → the runtime package table
//   relative paths   → bundle files (with .ts/.tsx/.js/.mjs/index.* lookup)
//   other paths      → bundle files matched by path suffix
//                    ("com/game/Enemy", "com.game.Enemy", "@/com/game/Enemy")

import { transform } from 'sucrase';
import { runtime } from './context';
import { FLASH_DEFINITIONS, PACKAGES, TOP_LEVEL } from './packages';

export interface SourceFile { path: string; text: string }

export interface CompiledModule { path: string; code: string | null; error?: string }
export interface CompiledSources { modules: CompiledModule[] }

export interface ClassInfo { name: string; qualifiedName: string; path: string }
export interface LinkedProgram {
  getDefinition(name: string): unknown;
  classes: ClassInfo[];
  errors: { path: string; message: string }[];
}

const CODE_EXT = /\.(tsx?|mts|cts|jsx?|mjs|cjs)$/i;
const SKIP = /(^|\/)(node_modules|\.git)\/|\.d\.ts$/i;

export function isCodeFile(path: string) { return CODE_EXT.test(path) && !SKIP.test(path); }

export function compileSources(files: SourceFile[]): CompiledSources {
  const modules = files.filter((f) => isCodeFile(f.path)).map((f): CompiledModule => {
    const path = normalize(f.path);
    try {
      const isTs = /\.(tsx?|mts|cts)$/i.test(path);
      const isJsx = /\.(tsx|jsx)$/i.test(path);
      const transforms: ('typescript' | 'imports' | 'jsx')[] = ['imports'];
      if (isTs) transforms.unshift('typescript');
      if (isJsx) transforms.push('jsx');
      const out = transform(f.text, { transforms, filePath: path, production: true });
      return { path, code: out.code };
    } catch (e) {
      return { path, code: null, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return { modules };
}

export function linkProgram(compiled: CompiledSources): LinkedProgram {
  const byPath = new Map(compiled.modules.map((m) => [m.path, m]));
  const noExt = new Map<string, CompiledModule[]>();
  for (const m of compiled.modules) {
    const key = stripExt(m.path).toLowerCase();
    noExt.set(key, [...(noExt.get(key) ?? []), m]);
  }
  const cache = new Map<string, { exports: Record<string, unknown>; loaded: boolean }>();
  const errors: { path: string; message: string }[] = [];
  for (const m of compiled.modules) if (m.error) errors.push({ path: m.path, message: `Compile error: ${m.error}` });

  const globalNames = Object.keys(TOP_LEVEL);
  const globalValues = globalNames.map((n) => TOP_LEVEL[n]);

  const load = (m: CompiledModule): Record<string, unknown> => {
    const hit = cache.get(m.path);
    if (hit) return hit.exports;
    const module = { exports: {} as Record<string, unknown>, loaded: false };
    cache.set(m.path, module);
    if (m.code == null) throw new Error(`${m.path} failed to compile: ${m.error}`);
    const dir = m.path.includes('/') ? m.path.slice(0, m.path.lastIndexOf('/')) : '';
    const require = (spec: string) => resolve(spec, m.path, dir);
    const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', ...globalNames,
      `${m.code}\n//# sourceURL=swf-code:///${m.path}`);
    fn.call(module.exports, module.exports, require, module, m.path, dir, ...globalValues);
    module.loaded = true;
    return module.exports;
  };

  const resolve = (spec: string, from: string, dir: string): unknown => {
    const flash = resolveFlash(spec);
    if (flash) return flash;
    const target = findModule(spec, dir, byPath, noExt);
    if (target) return load(target);
    throw new Error(`Cannot resolve import "${spec}" from ${from}. Make sure every transpiled file is in the loaded folder.`);
  };

  for (const m of compiled.modules) {
    if (cache.has(m.path) || m.code == null) continue;
    try { load(m); } catch (e) {
      errors.push({ path: m.path, message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    }
  }

  // Index classes: `com/game/Enemy.ts` exporting Enemy → Enemy, game.Enemy, com.game.Enemy, …
  const classes: ClassInfo[] = [];
  const index = new Map<string, unknown>();
  const ambiguous = new Set<string>();
  const byQualified = new Map<string, unknown>();
  const add = (key: string, value: unknown) => {
    const prev = index.get(key);
    if (prev === undefined) index.set(key, value);
    else if (prev !== value) ambiguous.add(key);
  };
  for (const [path, mod] of cache) {
    const segments = stripExt(path).split('/');
    const fileBase = segments[segments.length - 1];
    const pkgSegments = segments.slice(0, -1);
    for (const [exportName, value] of Object.entries(mod.exports)) {
      if (typeof value !== 'function' || !/^[A-Z_$]/.test(exportName === 'default' ? fileBase : exportName)) continue;
      const name = exportName === 'default' ? fileBase : exportName;
      const qualifiedName = qualify(pkgSegments, name);
      if (!byQualified.has(qualifiedName)) { classes.push({ name, qualifiedName, path }); byQualified.set(qualifiedName, value); }
      setQualifiedName(value, qualifiedName);
      add(name, value);
      for (let i = pkgSegments.length - 1; i >= 0; i--) add(`${pkgSegments.slice(i).join('.')}.${name}`, value);
    }
  }

  return {
    classes,
    errors,
    getDefinition(name: string) {
      const n = String(name).trim().replace('::', '.');
      if (!n) return undefined;
      // 1. unambiguous name / package-qualified suffix of a loaded class
      if (index.has(n) && !ambiguous.has(n)) return index.get(n);
      // 2. ambiguous: prefer the class whose qualified name matches exactly
      const exact = classes.filter((c) => c.qualifiedName === n || c.qualifiedName.endsWith(`.${n}`));
      if (exact.length === 1) return byQualified.get(exact[0].qualifiedName);
      // 3. flash.* / fl.* / AS3 top level
      const flash = FLASH_DEFINITIONS.get(n);
      if (flash !== undefined) return flash;
      // 4. "com.game.Main" when the code declared Main without that folder structure
      const simple = n.slice(n.lastIndexOf('.') + 1);
      if (n.includes('.') && index.has(simple) && !ambiguous.has(simple)) return index.get(simple);
      return undefined;
    },
  };
}

/**
 * The AS3 class names a movie expects its code to define: every SymbolClass
 * entry (0 is the document class) plus the classes named on characters.
 */
export function expectedClasses(doc: { symbolClasses?: Map<number, string>; characters: Map<number, { className?: string }> }): string[] {
  const names = new Set<string>();
  for (const className of doc.symbolClasses?.values() ?? []) if (className) names.add(className);
  for (const character of doc.characters.values()) if (character.className) names.add(character.className);
  return [...names];
}

/** A dependency SWF's code files (the transpiled sources of one loaded package). */
export interface DependencySources {
  /** the SWF the code came from, e.g. "game_chat.swf" */
  name: string;
  files: SourceFile[];
}

/**
 * The sources to link when a game is split over several SWFs: the main movie's
 * code first, then every dependency file the main package does not already
 * provide. A dependency never shadows the main movie's own class, so folding
 * them in cannot change how the main movie behaves — it only adds the classes
 * an external SWF would have contributed at run time.
 */
export function mergeSources(
  main: SourceFile[],
  dependencies: DependencySources[],
): { sources: SourceFile[]; used: string[] } {
  const seen = new Set(main.map((f) => normalize(f.path).toLowerCase()));
  const sources = [...main];
  const used: string[] = [];
  for (const dependency of dependencies) {
    let added = 0;
    for (const file of dependency.files) {
      const key = normalize(file.path).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(file);
      added++;
    }
    if (added) used.push(dependency.name);
  }
  return { sources, used };
}

/** Evaluate modules with the player active so module-level `trace`/errors reach its console. */
export function linkWithPlayer(compiled: CompiledSources, player: unknown): LinkedProgram {
  const previous = runtime.player;
  runtime.player = player as typeof runtime.player;
  try { return linkProgram(compiled); } finally { runtime.player = previous; }
}

// --------------------------------------------------------------------------

function resolveFlash(spec: string): Record<string, unknown> | null {
  const cleaned = spec.replace(/\\/g, '/').replace(/\.(d\.)?(ts|js)$/, '');
  const m = /(?:^|[/@])((?:flash|fl)(?:[./][A-Za-z_$][\w$]*)*)$/.exec(cleaned);
  if (!m) return null;
  const dotted = m[1].replace(/\//g, '.');
  if (PACKAGES[dotted]) return { __esModule: true, ...PACKAGES[dotted] };
  const cut = dotted.lastIndexOf('.');
  const pkg = PACKAGES[dotted.slice(0, cut)];
  const member = dotted.slice(cut + 1);
  if (pkg && member in pkg) return { __esModule: true, ...pkg, default: pkg[member] };
  if (dotted === 'flash' || dotted === 'fl') {
    const all: Record<string, unknown> = { __esModule: true };
    for (const p of Object.values(PACKAGES)) Object.assign(all, p);
    return all;
  }
  return null;
}

function findModule(spec: string, dir: string, byPath: Map<string, CompiledModule>, noExt: Map<string, CompiledModule[]>): CompiledModule | undefined {
  const s = spec.replace(/\\/g, '/');
  const candidates = (base: string) => [base, ...['ts', 'tsx', 'js', 'mjs', 'cjs', 'jsx', 'mts'].map((e) => `${base}.${e}`),
    ...['ts', 'tsx', 'js'].map((e) => `${base}/index.${e}`)];
  if (s.startsWith('./') || s.startsWith('../') || s.startsWith('/')) {
    const base = normalize(s.startsWith('/') ? s.slice(1) : `${dir ? `${dir}/` : ''}${s}`);
    for (const c of candidates(base)) { const hit = byPath.get(c); if (hit) return hit; }
    const loose = noExt.get(stripExt(base).toLowerCase());
    if (loose?.length) return loose[0];
  }
  // Package-style: strip aliases like "@/", "~/", or any leading "../" and
  // match by suffix. This also rescues a relative import that points into a
  // *different* package of the same game (a dependency SWF's code lives in its
  // own folder, so "../../util/GameConfig" is only found by its tail).
  const tail = s.replace(/^[@~]\/?/, '').replace(/^((\.\.?)\/)+/, '').replace(/\.(tsx?|jsx?|mjs)$/, '');
  const asPath = /\//.test(tail) ? tail : tail.replace(/\./g, '/');
  const wanted = asPath.toLowerCase();
  let best: CompiledModule | undefined;
  for (const [key, list] of noExt) {
    if (key === wanted || key.endsWith(`/${wanted}`)) {
      if (!best || list[0].path.length < best.path.length) best = list[0];
    }
  }
  return best;
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop(); else out.push(part);
  }
  return out.join('/');
}
const stripExt = (p: string) => p.replace(/\.[^./]+$/, '');
function qualify(pkgSegments: string[], name: string) {
  // Heuristic for display: the package is the path below common source roots.
  const roots = new Set(['src', 'scripts', 'source', 'as3', 'ts', 'out', 'transpiled', 'classes']);
  let start = 0;
  pkgSegments.forEach((seg, i) => { if (roots.has(seg.toLowerCase())) start = i + 1; });
  const pkg = pkgSegments.slice(start).join('.');
  return pkg ? `${pkg}.${name}` : name;
}
function setQualifiedName(cls: unknown, qualified: string) {
  if (typeof cls !== 'function' || Object.prototype.hasOwnProperty.call(cls, '__qualifiedName')) return;
  const cut = qualified.lastIndexOf('.');
  const as3 = cut > 0 ? `${qualified.slice(0, cut)}::${qualified.slice(cut + 1)}` : qualified;
  try { Object.defineProperty(cls, '__qualifiedName', { value: as3, enumerable: false }); } catch { /* frozen */ }
}
