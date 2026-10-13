// ABC -> TypeScript modules, in the shape the AS3 engine links: one class per
// file, package folders as paths, imports in the spellings `src/engine/flash`
// resolves (flash.* paths, project-relative paths).
//
// The emitted code is ordinary TypeScript: real classes, real methods, real
// control flow. Nothing in it is a VM — the bytecode has already been lifted by
// `lift.ts`, and every import is a name the ABC itself carried in its pools.

import type { AbcClassDef, AbcFile, AbcMethodInfo, AbcTrait } from '../../decompiler/swf/abc';
import { liftMethod, type LiftDiagnostic } from './lift';

export interface EmittedFile { path: string; text: string }
export interface EmitDiagnostic extends LiftDiagnostic { where: string }
export interface EmitResult {
  files: EmittedFile[];
  diagnostics: EmitDiagnostic[];
  /** `flash.*` definitions the emitted code needs but the engine does not provide. */
  unsupported: string[];
}

/** `com.foo.Bar` -> `com/foo/Bar.ts`; a default-package class stays at the root. */
export function classPath(qualifiedName: string): string {
  return `${qualifiedName.split('.').join('/')}.ts`;
}

export interface AbcModuleOptions {
  /** Simple name → module path, for every class/function this project emits. */
  pathOf?: Map<string, string>;
  /** The ABC block to transpile (one `DoABC` tag). */
  abc: AbcFile;
  /** Every qualified class name the project defines — decides project vs engine imports. */
  projectClasses?: Set<string>;
  /** Class name to use for the module when the DoABC block's own name is empty. */
  blockName?: string;
  /**
   * Does the engine provide this dotted `flash.*`/`fl.*` definition? When given,
   * names it rejects become loud stand-ins instead of imports that cannot resolve,
   * and are listed in `unsupported`.
   */
  flashAvailable?: (dotted: string) => boolean;
}

/**
 * One ABC block -> the modules it defines. A block with script traits emits the
 * classes those traits bind; a class trait that also has an SWF name (the
 * DoABC `SymbolClass` name) is emitted as its own module.
 */
export function transpileAbc(options: AbcModuleOptions): EmitResult {
  const { abc } = options;
  const projectClasses = options.projectClasses ?? new Set(abc.classes.map((c) => c.instance.name));
  const files: EmittedFile[] = [];
  const diagnostics: EmitDiagnostic[] = [];

  const unsupported = new Set<string>();
  // Where each simple name lives, so a module can require a sibling on first use.
  const pathOf = new Map<string, string>(options.pathOf ?? []);
  for (const def of abc.classes) if (!pathOf.has(simpleName(def.instance.name))) pathOf.set(simpleName(def.instance.name), classPath(def.instance.name));
  for (const script of abc.scripts) for (const trait of script.traits) {
    if (trait.kind === 'function' && !pathOf.has(simpleName(trait.name))) pathOf.set(simpleName(trait.name), `functions/${simpleName(trait.name)}.ts`);
  }
  for (let scriptIndex = 0; scriptIndex < abc.scripts.length; scriptIndex++) {
    const script = abc.scripts[scriptIndex];
    for (const trait of script.traits) {
      if (trait.kind === 'class' && trait.classIndex != null && abc.classes[trait.classIndex]) {
        const result = emitClassModule({ abc, classIndex: trait.classIndex, projectClasses, pathOf, flashAvailable: options.flashAvailable, unsupported });
        files.push(...result.files);
        diagnostics.push(...result.diagnostics);
      } else if (trait.kind === 'function' && trait.method != null) {
        files.push({ path: `functions/${simpleName(trait.name)}.ts`, text: emitFunctionModule(abc, trait) });
      } else if (trait.kind === 'slot' || trait.kind === 'const') {
        if (trait.value !== undefined) {
          files.push({ path: `constants/${simpleName(trait.name)}.ts`, text: `export const ${simpleName(trait.name)} = ${JSON.stringify(trait.value)};\n` });
        }
      }
    }
    const init = emitScriptInit(abc, script.init);
    if (init) files.push(init);
  }

  // A block whose scripts declare nothing still holds classes (a linked library):
  // emit the ones nothing has emitted yet.
  const emitted = new Set(files.map((f) => f.path));
  for (let i = 0; i < abc.classes.length; i++) {
    const path = classPath(abc.classes[i].instance.name || options.blockName || `__class${i}`);
    if (emitted.has(path)) continue;
    const bound = scriptBoundClasses(abc);
    if (bound.has(i)) continue;
    const result = emitClassModule({ abc, classIndex: i, projectClasses, flashAvailable: options.flashAvailable, unsupported });
    files.push(...result.files);
    diagnostics.push(...result.diagnostics);
  }
  if (unsupported.size) {
    files.push({ path: UNSUPPORTED_HELPER, text: UNSUPPORTED_HELPER_TEXT });
  }
  return { files, diagnostics, unsupported: [...unsupported].sort() };
}

const UNSUPPORTED_HELPER = '__flash/unsupported.ts';
const UNSUPPORTED_HELPER_TEXT = [
  '// Emitted with an ABC transpile: stands in for flash.* definitions this engine',
  '// does not implement. It throws where the movie uses it, not at load time.',
  'export function unsupportedFlash(name: string): any {',
  '  const fail = () => { throw new Error("flash definition " + name + " is not implemented by this engine"); };',
  '  const stub: any = new Proxy(fail, { get: () => stub, apply: fail, construct: fail });',
  '  return stub;',
  '}',
  '',
].join('\n');

function scriptBoundClasses(abc: AbcFile): Set<number> {
  const set = new Set<number>();
  for (const script of abc.scripts) for (const t of script.traits) if (t.kind === 'class' && t.classIndex != null) set.add(t.classIndex);
  return set;
}

export function simpleName(qualified: string): string {
  const cut = Math.max(qualified.lastIndexOf('.'), qualified.lastIndexOf(':'));
  return cut >= 0 ? qualified.slice(cut + 1) : qualified;
}

// ------------------------------------------------------------------ classes

export interface ClassModuleOptions {
  abc: AbcFile;
  /** Simple name → module path, for every class/function this project emits. */
  pathOf?: Map<string, string>;
  classIndex: number;
  projectClasses: Set<string>;
  flashAvailable?: (dotted: string) => boolean;
  unsupported?: Set<string>;
}

export interface ClassModuleResult extends EmitResult {
  /** Simple names this module provides: its own class plus its bound frame scripts. */
  provides: string[];
  qualifiedName: string;
}

export function emitClassModule(options: ClassModuleOptions): ClassModuleResult {
  const { abc, classIndex, projectClasses } = options;
  const def: AbcClassDef = abc.classes[classIndex];
  const instance = def.instance;
  const qualifiedName = instance.name || `__class${classIndex}`;
  const simple = simpleName(qualifiedName);
  const diagnostics: EmitDiagnostic[] = [];
  const valueNames = new Set<string>();                  // what this module's bodies use as values
  const isInterface = instance.isInterface;

  // Timeline frame scripts are ordinary instance traits named `frameN` (namespace
  // = the class's package), so the member loops below emit them like any method.
  const frames = new Map<string, number>();
  const instanceMembers = new Set<string>(instance.traits.filter((t) => t.kind !== 'class').map((t) => simpleName(t.name)));
  const staticMembers = new Set<string>(def.traits.filter((t) => t.kind !== 'class').map((t) => simpleName(t.name)));
  const globals = new Set<string>();
  for (const script of abc.scripts) for (const trait of script.traits) if (trait.kind === 'function') globals.add(simpleName(trait.name));
  const instanceScope: LiftScope = { target: 'instance', memberNames: instanceMembers, staticMembers, staticOwner: simple, globals };
  const staticScope: LiftScope = { target: 'class', memberNames: staticMembers, staticMembers, staticOwner: simple, globals };

  const members: string[] = [];

  if (!isInterface && instance.iinit >= 0) {
    const ctor = hoistSuper(liftBody(abc, instance.iinit, instanceScope, diagnostics, `${qualifiedName}::constructor`, valueNames));
    members.push(`  public constructor(${paramsOf(abc, instance.iinit)}) {\n${ctor}\n  }`);
  }

  for (const trait of instance.traits) {
    const text = memberOf(abc, trait, instanceScope, diagnostics, qualifiedName, isInterface, false, valueNames);
    if (text) members.push(text);
  }
  for (const trait of def.traits) {
    const text = memberOf(abc, trait, staticScope, diagnostics, qualifiedName, isInterface, true, valueNames);
    if (text) members.push(text);
  }
  for (const [frameName, method] of [...frames.entries()].sort()) {
    const lifted = liftBody(abc, method, instanceScope, diagnostics, `${qualifiedName}::${frameName}`, valueNames);
    members.push(`  public ${frameName}(): any {\n${lifted}\n  }`);
  }

  const supers = [...instance.interfaces].map((i) => simpleName(i));
  const superName = instance.superName ? simpleName(instance.superName) : '';
  // JavaScript has no `super` without a base class, so one that uses `super` gets `extends Object`.
  const withBase = superName && superName !== 'Object';
  const needsBase = !withBase && members.some((m) => /\bsuper\b/.test(m));
  const header = isInterface
    ? `export interface ${simple}${supers.length ? ` extends ${supers.join(', ')}` : ''} {`
    : `export class ${simple}${withBase || needsBase ? ` extends ${withBase ? superName : 'Object'}` : ''}${supers.length ? ` implements ${supers.join(', ')}` : ''} {`;

  const text = [header, ...members, '}'].join('\n');
  const uses = namesUsed(text);
  // A name the body never used as a value is a type here: import it as one, so a
  // module-level `import type` cannot become part of a runtime import cycle.
  if (superName) valueNames.add(superName);
  // Other project classes this module only touches inside method bodies: require
  // them on first use. An eager import of a class that a sibling requires back
  // would make the cycle resolve to `undefined` at `extends` time.
  const lazy = new Set<string>();
  const lazyLines: string[] = [];
  for (const name of [...valueNames].sort()) {
    if (name === simple || name === superName || BUILTINS.has(name)) continue;
    const target = options.pathOf?.get(name);
    if (!target) continue;
    lazy.add(name);
    lazyLines.push(`  get ${name}(): any { return require('${specifier(qualifiedName, target.replace(/\.ts$/, ''))}').${name}; },`);
  }
  const typeOnly = new Set([...uses].filter((n) => !valueNames.has(n)));
  const imports = importLines(uses, abc, projectClasses, qualifiedName, simple, options.flashAvailable, options.unsupported, typeOnly, lazy);
  if (lazyLines.length) {
    imports.push(
      '// AS3 resolves classes lazily; requiring these on first use keeps a class cycle',
      '// from freezing into a broken `extends`.',
      'const __m: Record<string, any> = {',
      ...lazyLines,
      '};',
    );
  }

  return {
    files: [{ path: classPath(qualifiedName), text: `${imports.join('\n')}${imports.length ? '\n\n' : ''}${text}\n` }],
    diagnostics,
    unsupported: [],
    provides: [simple, ...frames.keys()],
    qualifiedName,
  };
}

/** Everything a member body needs in order to resolve names against its class. */
interface LiftScope {
  target: 'instance' | 'class' | 'none';
  memberNames: Set<string>;
  staticMembers: Set<string>;
  staticOwner: string;
  globals: Set<string>;
}

/**
 * A constructor's `super(...)` must run before anything else in JavaScript, while
 * ActionScript's compiler emits slot defaults first. Move the call to the top.
 */
function hoistSuper(body: string): string {
  const lines = body.split('\n');
  const at = lines.findIndex((l) => /^\s+super\(.*\);\s*$/.test(l));
  if (at < 0) return body;
  const [call] = lines.splice(at, 1);
  const firstReal = lines.findIndex((l) => l.trim() && !/^\s*var /.test(l));
  lines.splice(firstReal < 0 ? lines.length : firstReal, 0, call);
  return lines.join('\n');
}

/** A member method / accessor / slot of a class, or '' for traits that are not members. */
function memberOf(
  abc: AbcFile,
  trait: AbcTrait,
  scope: LiftScope,
  diagnostics: EmitDiagnostic[],
  owner: string,
  isInterface: boolean,
  isStatic: boolean,
  valueNames: Set<string>,
): string {
  const name = simpleName(trait.name);
  const stat = isStatic ? 'static ' : '';
  if (trait.kind === 'slot' || trait.kind === 'const') {
    const init = trait.value !== undefined && trait.value !== null ? ` = ${JSON.stringify(trait.value)}` : '';
    if (isInterface) return `  ${name}: ${trait.type ? typeName(trait.type) : 'any'};`;
    return `  public ${stat}${name}: ${trait.type ? typeName(trait.type) : 'any'}${init};`;
  }
  if (trait.kind !== 'method' && trait.kind !== 'getter' && trait.kind !== 'setter') return '';
  if (trait.method == null) return `  public ${stat}${name}: any;`;
  const info = abc.methods[trait.method];
  const params = paramsOf(abc, trait.method);
  const ret = info?.returnType ? typeName(info.returnType) : 'any';
  const hasBody = abc.bodies.some((b) => b.method === trait.method);
  if (isInterface) {
    if (trait.kind === 'getter') return `  get ${name}(): ${ret};`;
    if (trait.kind === 'setter') return `  set ${name}(${params});`;
    return `  ${name}(${params}): ${ret};`;
  }
  if (!hasBody) return `  public ${stat}${name}(${params}): ${ret} { throw new Error(${JSON.stringify(`${owner}::${name} has no body in the ABC`)}); }`;
  const lifted = liftBody(abc, trait.method, scope, diagnostics, `${owner}::${name}`, valueNames);
  if (trait.kind === 'getter') return `  public ${stat}get ${name}()${ret === 'void' ? '' : `: ${ret}`} {\n${lifted}\n  }`;
  if (trait.kind === 'setter') return `  public ${stat}set ${name}(${params}) {\n${lifted}\n  }`;
  return `  public ${stat}${name}(${params}): ${ret} {\n${lifted}\n  }`;
}

/** Lift a method body, indented as a member; a refusal becomes a loud stub. */
function liftBody(abc: AbcFile, method: number, scope: LiftScope, diagnostics: EmitDiagnostic[], where: string, valueNames: Set<string>, lazy: Set<string> = new Set()): string {
  const body = abc.bodies.find((b) => b.method === method);
  if (!body) return `    throw new Error(${JSON.stringify(`${where}: no body in the ABC`)});`;
  const result = liftMethod({ abc, body, ...scope, ...abiFlags(abc, method), paramNames: paramNamesOf(abc, method) });
  if (!result.stmts) {
    const first = result.diagnostics[0];
    diagnostics.push({ offset: first?.offset ?? 0, message: first?.message ?? 'unknown', where });
    const detail = first ? `byte ${first.offset}: ${first.message}` : 'unknown reason';
    // Loud and honest: the method exists, and calling it says exactly why it cannot run.
    return `    throw new Error(${JSON.stringify(`${where}: not lifted yet (${detail})`)});`;
  }
  const printer = new Printer(valueNames, lazy);
  const printed = printer.print(result.stmts);
  return printed.split('\n').map((l) => `    ${l}`).join('\n');
}

/** The module that runs a script's top level (its trait bindings are the class objects). */
function emitScriptInit(abc: AbcFile, method: number): EmittedFile | null {
  const body = abc.bodies.find((b) => b.method === method);
  if (!body) return null;
  const result = liftMethod({ abc, body, target: 'none' });
  if (!result.stmts) return null;
  const valueNames = new Set<string>();
  // The structural part of a script init (`newclass`, `initproperty`) *is* the
  // TypeScript class declaration, so statements that only build class objects go.
  const kept = result.stmts
    .map((s) => ({ stmt: s, text: new Printer(valueNames).print([s]) }))
    .filter((r) => r.text.trim() && !/__class\d+/.test(r.text) && r.stmt.k !== 'return');
  if (!kept.length) return null;
  const printed = kept.map((r) => r.text).join('\n');
  const header = `// Script init from the ABC — runs when the module is linked.\n`;
  return { path: `script/init_${method}.ts`, text: `${header}export function __scriptInit() {\n${printed.split('\n').map((l) => `  ${l}`).join('\n')}\n}\n` };
}

/** An `internal function frame1()` binding, for the rare block that names a function. */
function emitFunctionModule(abc: AbcFile, trait: AbcTrait): string {
  const name = simpleName(trait.name);
  const body = trait.method != null ? abc.bodies.find((b) => b.method === trait.method) : undefined;
  if (!body) return `export function ${name}(...args: any[]): any { throw new Error("no body"); }\n`;
  const result = liftMethod({ abc, body, target: 'none', paramNames: paramNamesOf(abc, trait.method as number) });
  const valueNames = new Set<string>();
  const text = result.stmts ? new Printer(valueNames).print(result.stmts) : `throw new Error("not lifted yet");`;
  return `export function ${name}(${paramsOf(abc, trait.method as number)}): any {\n${text.split('\n').map((l) => `  ${l}`).join('\n')}\n}\n`;
}

function paramsOf(abc: AbcFile, method: number): string {
  const info = abc.methods[method];
  if (!info) return '';
  const declared = info.paramTypes.map((t, i) => `${paramName(info, i)}: ${typeName(t)}`);
  if (info.needRest) declared.push('...rest: any[]');
  return declared.join(', ');
}

/** The name a parameter has in the signature and in the body — the same one. */
function paramName(info: AbcMethodInfo | undefined, index: number): string {
  const declared = info?.paramNames[index];
  return declared && /^[A-Za-z_$][\w$]*$/.test(declared) ? declared : `param${index + 1}`;
}

function paramNamesOf(abc: AbcFile, method: number): string[] | undefined {
  const info = abc.methods[method];
  if (!info) return undefined;
  return info.paramTypes.map((_, i) => paramName(info, i));
}

/** The ABI extra locals (`rest`, `arguments`) the body may read. */
function abiFlags(abc: AbcFile, method: number): { needRest?: boolean; needArguments?: boolean } {
  const info = abc.methods[method];
  return { needRest: info?.needRest, needArguments: info?.needArguments };
}

/** AS3 type names fold onto TypeScript's for the primitives, stay bare otherwise. */
function typeName(qualified: string): string {
  const simple = simpleName(qualified);
  switch (simple) {
    case 'int': case 'uint': case 'Number': return 'number';
    case 'String': return 'string';
    case 'Boolean': return 'boolean';
    case 'void': return 'void';
    case '': case '*': case 'any': return 'any';
    default: return /^[A-Za-z_$][\w$]*$/.test(simple) ? simple : 'any';
  }
}

// ------------------------------------------------------------------ frame scripts

// ------------------------------------------------------------------ names & imports

/** Every identifier the module text uses, split into names and member accesses. */
function namesUsed(text: string): Set<string> {
  const used = new Set<string>();
  for (const m of text.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
  return used;
}

const BUILTINS = new Set(['any', 'Array', 'Boolean', 'const', 'else', 'Error', 'export', 'false', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'let', 'number', 'new', 'null', 'of', 'return', 'string', 'super', 'this',
  'throw', 'true', 'typeof', 'undefined', 'var', 'void', 'while', 'NaN', 'JSON', 'Math', 'Object', 'String',
  'Number', 'delete', 'as', 'is', 'interface', 'extends', 'implements', 'class', 'get', 'set', 'static', 'public',
  'catch', 'try', 'break', 'continue', 'do', 'switch', 'case', 'default', 'int', 'uint', 'trace', 'Date', 'RegExp']);

/** Imports for everything the module body references and the ABC knows the package of. */
function importLines(
  uses: Set<string>,
  abc: AbcFile,
  projectClasses: Set<string>,
  self: string,
  simple: string,
  flashAvailable?: (dotted: string) => boolean,
  unsupported?: Set<string>,
  typeOnly?: Set<string>,
  lazy?: Set<string>,
): string[] {
  const packageOf = new Map<string, string>();
  const poolNames = abc.multinames.map((m) => (m.nsKind === 'package' || m.nsKind === 'packageInternal' || m.nsKind === 'namespace') && m.ns ? `${m.ns}.${m.name}` : m.name);
  for (const qualified of poolNames.concat(abc.classes.map((c) => c.instance.name))) {
    if (!qualified) continue;
    const name = simpleName(qualified);
    if (!/^[A-Z]/.test(name) && name !== simple) continue;
    const ns = qualified.includes('.') ? qualified.slice(0, qualified.lastIndexOf('.')) : '';
    const better = !packageOf.has(name) || (AS3_PACKAGES.has(ns) && !AS3_PACKAGES.has(packageOf.get(name)!.slice(0, packageOf.get(name)!.lastIndexOf('.'))));
    if (better) packageOf.set(name, qualified);
  }
  const bySimple = new Map<string, string>();
  for (const qualified of projectClasses) bySimple.set(simpleName(qualified), qualified);

  const lines: string[] = [];
  const typeLines: string[] = [];
  for (const name of [...uses].sort()) {
    if (BUILTINS.has(name) || name === simple) continue;
    const project = bySimple.get(name);
    if (project) {
      const from = classPath(project).replace(/\.ts$/, '');
      if (lazy?.has(name)) {
        typeLines.push(`import type { ${name} } from '${specifier(self, from)}';`);
        continue;
      }
      const line = `import { ${name} } from '${specifier(self, from)}';`;
      (typeOnly?.has(name) ? typeLines : lines).push(line);
      continue;
    }
    const qualified = packageOf.get(name);
    if (!qualified || qualified === name) continue;
    if (typeOnly?.has(name)) {
      typeLines.push(`import type { ${name} } from '${qualified.split('.').join('/')}';`);
      continue;
    }
    if (flashAvailable && !flashAvailable(qualified)) {
      unsupported?.add(qualified);
      lines.push(`import { unsupportedFlash } from '${specifier(self, UNSUPPORTED_HELPER.replace(/\.ts$/, ''))}';`);
      lines.push(`const ${name}: any = unsupportedFlash(${JSON.stringify(qualified)});`);
      continue;
    }
    lines.push(`import { ${name} } from '${qualified.split('.').join('/')}';`);
  }
  return [...lines, ...typeLines];
}

/** A relative import specifier between two project modules, both root-relative. */
function specifier(self: string, target: string): string {
  const from = classPath(self).split('/').slice(0, -1);
  const to = target.split('/');
  while (from.length && to.length > 1 && from[0] === to[0]) { from.shift(); to.shift(); }
  const rel = [...from.map(() => '..'), ...to].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

// ------------------------------------------------------------------ printing

class Printer {
  private out: string[] = [];
  private indent = 0;
  /**
   * Names referenced as *values* (class objects, statics) — shared across printers.
   * `lazy` names live in other modules and are required on first use, so they print
   * as reads of the module's `__m` accessor instead of a bare identifier.
   */
  constructor(private readonly valueNames: Set<string> = new Set(), private readonly lazy: Set<string> = new Set()) {}

  print(stmts: import('../as2/ast').Stmt[]): string {
    for (const s of stmts) this.stmt(s);
    return this.out.join('\n');
  }

  private line(text: string) { this.out.push(`${'  '.repeat(this.indent)}${text}`); }

  private stmt(s: import('../as2/ast').Stmt) {
    switch (s.k) {
      case 'empty': case 'import': case 'include': return;
      case 'expr': this.line(`${this.expr(s.e)};`); return;
      case 'var':
        this.line(`${s.decls.map((d) => `var ${d.name}${d.init ? ` = ${this.expr(d.init)}` : ''}`).join(', ')};`);
        return;
      case 'block': for (const b of s.body) this.stmt(b); return;
      case 'if':
        this.line(`if (${this.expr(s.test)}) ${this.blockish(s.then)}`);
        if (s.else) this.line(`else ${this.blockish(s.else)}`);
        return;
      case 'while': this.line(`while (${this.expr(s.test)}) ${this.blockish(s.body)}`); return;
      case 'dowhile': this.line(`do ${this.blockish(s.body)} while (${this.expr(s.test)});`); return;
      case 'for': this.line(`for (${s.init ? this.inline(s.init) : ''}; ${s.test ? this.expr(s.test) : ''}; ${s.update ? this.expr(s.update) : ''}) ${this.blockish(s.body)}`); return;
      case 'forin': this.line(`for (${s.left.decl ? 'const ' : ''}${this.expr(s.left.target)} in ${this.expr(s.obj)}) ${this.blockish(s.body)}`); return;
      case 'switch': {
        this.line(`switch (${this.expr(s.disc)}) {`);
        this.indent++;
        for (const c of s.cases) {
          this.line(`${c.test ? `case ${this.expr(c.test)}:` : 'default:'}`);
          this.indent++;
          for (const b of c.body) this.stmt(b);
          this.indent--;
        }
        this.indent--;
        this.line('}');
        return;
      }
      case 'break': this.line(`break${s.label ? ` ${s.label}` : ''};`); return;
      case 'continue': this.line(`continue${s.label ? ` ${s.label}` : ''};`); return;
      case 'return': this.line(s.arg ? `return ${this.expr(s.arg)};` : 'return;'); return;
      case 'throw': this.line(`throw ${this.expr(s.arg)};`); return;
      case 'try': {
        this.line('try {');
        this.indent++;
        for (const b of s.block) this.stmt(b);
        this.indent--;
        if (s.handler) {
          this.line(`} catch (${s.param ?? '__e'}) {`);
          this.indent++;
          for (const b of s.handler) this.stmt(b);
          this.indent--;
        }
        if (s.finalizer) {
          this.line('} finally {');
          this.indent++;
          for (const b of s.finalizer) this.stmt(b);
          this.indent--;
        }
        this.line('}');
        return;
      }
      case 'label': this.line(`${s.label}: ${this.blockish(s.body)}`); return;
      case 'function': {
        this.line(`function ${s.name}(${s.params.map((p) => p.name).join(', ')}) {`);
        this.indent++;
        for (const b of s.body) this.stmt(b);
        this.indent--;
        this.line('}');
        return;
      }
      case 'with': this.line(`/* with (${this.expr(s.obj)}) — AVM1 only */`); return;
      case 'class': case 'interface': default: this.line(`/* ${(s as { k: string }).k} — emitted separately */`); return;
    }
  }

  private blockish(s: import('../as2/ast').Stmt): string {
    if (s.k !== 'block') {
      return `{ ${this.inline(s)} }`;
    }
    if (!s.body.length) return '{}';
    const savedOut = this.out;
    const savedIndent = this.indent;
    this.out = [];
    this.indent = savedIndent + 1;
    for (const b of s.body) this.stmt(b);
    const inner = this.out.join('\n');
    this.out = savedOut;
    this.indent = savedIndent;
    return `{\n${inner}\n${'  '.repeat(savedIndent)}}`;
  }

  private inline(node: import('../as2/ast').Stmt | import('../as2/ast').Expr): string {
    if (!STMT_KINDS.has((node as { k: string }).k)) return this.expr(node as import('../as2/ast').Expr);
    const s = node as import('../as2/ast').Stmt;
    const saved = this.out;
    const savedIndent = this.indent;
    this.out = [];
    this.indent = 0;
    this.stmt(s);
    const text = this.out.join(' ').trim().replace(/;$/, '');
    this.out = saved;
    this.indent = savedIndent;
    return text;
  }

  /** An operand of an operator: parenthesised when it is an operator itself. */
  private operand(e: import('../as2/ast').Expr): string {
    return isOperator(e) ? `(${this.expr(e)})` : this.expr(e);
  }

  /** A callee / object / receiver: parenthesised unless it is a plain value. */
  private atom(e: import('../as2/ast').Expr): string {
    return isOperator(e) || e.k === 'unary' || e.k === 'update' ? `(${this.expr(e)})` : this.expr(e);
  }

  expr(e: import('../as2/ast').Expr): string {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return JSON.stringify(e.v);
      case 'lit': return e.v;
      case 'id':
        this.valueNames.add(e.name);
        return this.lazy.has(e.name) ? `__m.${e.name}` : e.name;
      case 'array': return `[${e.items.map((i) => (i ? this.expr(i) : '')).join(', ')}]`;
      case 'object': return `{ ${e.props.map((p) => `${key(p.key)}: ${this.expr(p.value)}`).join(', ')} }`;
      case 'func': {
        const savedOut = this.out;
        const savedIndent = this.indent;
        this.out = [];
        this.indent = 1;
        for (const b of e.body ?? []) this.stmt(b);
        const inner = this.out.join('\n');
        this.out = savedOut;
        this.indent = savedIndent;
        return `function (${e.params.map((p) => p.name).join(', ')}) {${inner ? `\n${inner}\n` : ' '}}`;
      }
      case 'member': {
        const obj = this.atom(e.obj);
        return /^[A-Za-z_$][\w$]*$/.test(e.prop) ? `${obj}.${e.prop}` : `${obj}[${JSON.stringify(e.prop)}]`;
      }
      case 'index': return `${this.atom(e.obj)}[${this.expr(e.index)}]`;
      case 'call': return `${this.atom(e.callee)}(${e.args.map((a) => this.expr(a)).join(', ')})`;
      case 'new': return `new ${this.atom(e.callee)}(${e.args.map((a) => this.expr(a)).join(', ')})`;
      case 'unary': {
        const op = e.op.trim();
        const arg = isOperator(e.arg) ? `(${this.expr(e.arg)})` : this.expr(e.arg);
        return op === 'delete' ? `delete ${arg}` : /^[a-z]+$/.test(op) ? `${op} ${arg}` : `${op}${arg}`;
      }
      case 'update': return e.prefix ? `${e.op}${this.atom(e.arg)}` : `${this.atom(e.arg)}${e.op}`;
      case 'binary': {
        // `x as Foo` names a type: importing `Foo` as a value would create a cycle.
        if (e.op === 'as') {
          if (e.right.k === 'id') { this.valueNames.delete(e.right.name); return `(${this.atom(e.left)} as ${e.right.name})`; }
          return `(${this.atom(e.left)} as ${this.expr(e.right)})`;
        }
        if (e.op === 'is') return `(${this.atom(e.left)} instanceof ${this.expr(e.right)})`;
        return `${this.operand(e.left)} ${e.op} ${this.operand(e.right)}`;
      }
      case 'assign': return `${this.atom(e.target)} ${e.op} ${this.expr(e.value)}`;
      case 'cond': return `${this.operand(e.test)} ? ${this.expr(e.then)} : ${this.expr(e.else)}`;
      case 'seq': return e.items.map((i) => this.expr(i)).join(', ');
      default: return '/* unsupported expression */';
    }
  }
}

/** AS3 runtime packages, used to prefer `flash.events.Event` over a stray `flash.event.Event`. */
const AS3_PACKAGES = new Set(['flash.display', 'flash.events', 'flash.text', 'flash.geom', 'flash.net', 'flash.utils',
  'flash.filters', 'flash.media', 'flash.system', 'flash.ui', 'flash.errors', 'flash.accessibility', 'flash.external',
  'flash.printing', 'flash.xml', 'flash.desktop', 'flash.profiler', 'flash.sampler', 'flash.concurrent',
  'flash.display3D', 'fl.controls', 'fl.core', 'fl.events', 'fl.managers', 'fl.containers', 'fl.data', 'fl.display',
  'fl.transitions', 'fl.motion', 'fl.livepreview', 'fl.video', 'fl.text']);

const STMT_KINDS = new Set(['expr', 'var', 'function', 'block', 'if', 'for', 'forin', 'while', 'dowhile', 'switch',
  'break', 'continue', 'return', 'throw', 'try', 'with', 'label', 'empty', 'on', 'onClipEvent', 'tellTarget',
  'ifFrameLoaded', 'import', 'include', 'class', 'interface']);

/** True for expression kinds that need parentheses inside a larger expression. */
function isOperator(e: import('../as2/ast').Expr): boolean {
  return e.k === 'binary' || e.k === 'cond' || e.k === 'assign' || e.k === 'seq';
}

function key(k: string): string { return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k); }
