// What the Execute tab shows about an AS3 program before it runs: how many
// classes it exports, which of them can be a document class, which classes the
// movie expects but nobody declares, which imports lead nowhere.
//
// None of it evaluates the program. Linking a module runs its body, and an AS3
// module body is the class's static initializer (`cinit`) and its script's
// initializer: game code that may touch the stage, start timers or open a
// socket. That must happen once, when the player starts (`FlashPlayer` is the
// only caller of `linkProgram`), not every time the tab inspects the code.
//
// Everything here is read from the compiled modules' text, which the compiler
// (sucrase) writes in a fixed shape:
//
//   var _Base = require('./com/game/Base');
//   class Enemy extends _Base.Base { … } exports.Enemy = Enemy;
//   const IEnemy = __interface('com.game.IEnemy'); exports.IEnemy = IEnemy;
//
// Names are indexed by the linker's own `indexClasses` and imports resolved by
// its own `moduleFinder` / `resolveFlash`, so the two cannot disagree on what a
// name or a path means. A superclass that leads into `flash.*` is checked
// against the engine's class: that is engine code, not the movie's.

import { DisplayObject } from './display';
import {
  compileSources, indexClasses, moduleDir, moduleFinder, resolveFlash,
  type ClassInfo, type CompiledModule, type CompiledSources, type SourceFile,
} from './loader';
import { FLASH_DEFINITIONS } from './packages';

export interface As3Analysis {
  compiled: CompiledSources;
  /** Exported classes, as `linkProgram` would index them. */
  classes: ClassInfo[];
  /** The classes whose superclass chain reaches `flash.display.DisplayObject` (document-class candidates). */
  displayClasses: string[];
  /** Compile errors and imports nothing in the program or the engine answers. */
  errors: { path: string; message: string }[];
  /** Class names the movie expects (`expectedClasses`) that resolve to nothing. */
  unresolved: string[];
}

/** One compiled module, as its text declares it. */
interface ModuleShape {
  path: string;
  /** local binding → import specifier (`var _Base = require('./Base')`, through `_interopRequire…`) */
  imports: Map<string, string>;
  /** every specifier the module requires */
  specs: string[];
  /** declared classes and functions → the `extends` expression ('' for none, null for a function) */
  declarations: Map<string, string | null>;
  /** export name → local binding */
  exports: Map<string, string>;
}

/** An exported class or function: what the index holds for it. */
interface Declared { path: string; local: string }

const ID = '[A-Za-z_$][\\w$]*';
const REQUIRE = new RegExp(`\\bvar (${ID}) = require\\((['"])([^'"]+)\\2\\)`, 'g');
const INTEROP = new RegExp(`\\bvar (${ID}) = _interopRequire(?:Default|Wildcard)\\((${ID})\\)`, 'g');
const ANY_REQUIRE = /\brequire\((['"])([^'"]+)\1\)/g;
const CLASS = new RegExp(`\\bclass (${ID})(?: extends ([^{]+?))?\\s*\\{`, 'g');
const FUNCTION = new RegExp(`\\bfunction (${ID})\\s*\\(`, 'g');
const EXPORT = new RegExp(`\\bexports\\.(${ID}) = (${ID});`, 'g');

function shapeOf(m: CompiledModule & { code: string }): ModuleShape {
  const imports = new Map<string, string>();
  for (const [, local, , spec] of m.code.matchAll(REQUIRE)) imports.set(local, spec);
  for (const [, local, from] of m.code.matchAll(INTEROP)) { const spec = imports.get(from); if (spec) imports.set(local, spec); }
  const declarations = new Map<string, string | null>();
  for (const [, name] of m.code.matchAll(FUNCTION)) if (!declarations.has(name)) declarations.set(name, null);
  for (const [, name, base] of m.code.matchAll(CLASS)) declarations.set(name, base?.trim() ?? '');
  const exports = new Map<string, string>();
  for (const [, name, local] of m.code.matchAll(EXPORT)) exports.set(name, local);
  return { path: m.path, imports, specs: [...new Set([...m.code.matchAll(ANY_REQUIRE)].map((r) => r[2]))], declarations, exports };
}

const isEngineDisplayClass = (value: unknown) =>
  typeof value === 'function' && (value === DisplayObject || value.prototype instanceof DisplayObject);

/**
 * Analyse an AS3 program without running any of it. `expected` is the class
 * names the movie links symbols to (`expectedClasses(doc)`).
 */
export function analyzeAs3Program(sources: SourceFile[], expected: string[]): As3Analysis {
  return analyzeCompiled(compileSources(sources), expected);
}

export function analyzeCompiled(compiled: CompiledSources, expected: string[]): As3Analysis {
  const errors: As3Analysis['errors'] = [];
  for (const m of compiled.modules) if (m.error) errors.push({ path: m.path, message: `Compile error: ${m.error}` });
  const shapes = new Map<string, ModuleShape>();
  for (const m of compiled.modules) if (m.code != null) shapes.set(m.path, shapeOf(m as CompiledModule & { code: string }));

  const find = moduleFinder(compiled);
  for (const shape of shapes.values()) {
    for (const spec of shape.specs) {
      if (!resolveFlash(spec) && !find(spec, moduleDir(shape.path))) {
        errors.push({ path: shape.path, message: `Cannot resolve import "${spec}" from ${shape.path}. Make sure every transpiled file is in the loaded folder.` });
      }
    }
  }

  // The index holds one object per declaration, so a class re-exported under a
  // second name is the same value, exactly as the evaluated exports would be.
  const declared = new Map<string, Declared>();
  const declaration = (path: string, local: string) => {
    const key = `${path}\0${local}`;
    let d = declared.get(key);
    if (!d) declared.set(key, d = { path, local });
    return d;
  };
  const index = indexClasses<Declared | null>(
    [...shapes.values()].map((shape) => [shape.path, [...shape.exports].map(([name, local]): [string, Declared | null] =>
      [name, shape.declarations.has(local) ? declaration(shape.path, local) : null])]),
    (d) => d !== null,
  );

  // Superclass chains: `_Base.Base` is an import binding and a member of what it
  // imports; a bare name is a class of the same module.
  const display = new Map<Declared, boolean>();
  const isDisplay = (d: Declared): boolean => {
    const known = display.get(d);
    if (known !== undefined) return known;
    display.set(d, false);                       // a cycle is not a display class
    const result = extendsDisplay(d);
    display.set(d, result);
    return result;
  };
  const extendsDisplay = (d: Declared): boolean => {
    const shape = shapes.get(d.path);
    const base = shape?.declarations.get(d.local);
    if (!shape || !base) return false;
    const member = new RegExp(`^(${ID})\\.(${ID})$`).exec(base);
    if (!member) return new RegExp(`^${ID}$`).test(base) && shape.declarations.has(base) && isDisplay(declaration(shape.path, base));
    const [, binding, name] = member;
    const spec = shape.imports.get(binding);
    if (spec === undefined) return false;
    const flash = resolveFlash(spec);
    if (flash) return isEngineDisplayClass(flash[name]);
    const target = find(spec, moduleDir(shape.path));
    const targetShape = target && shapes.get(target.path);
    const local = targetShape?.exports.get(name);
    return !!(targetShape && local && targetShape.declarations.has(local) && isDisplay(declaration(targetShape.path, local)));
  };

  const displayClasses = index.classes
    .filter((c) => { const d = index.byQualified.get(c.qualifiedName); return !!d && isDisplay(d); })
    .map((c) => c.qualifiedName);
  const unresolved = expected.filter((name) => index.lookup(name, (n) => FLASH_DEFINITIONS.get(n)) === undefined);
  return { compiled, classes: index.classes, displayClasses, errors, unresolved };
}
