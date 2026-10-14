// ABC -> TypeScript modules, in the shape the AS3 engine links: one class per
// file, package folders as paths, imports in the spellings `src/engine/flash`
// resolves (flash.* paths, project-relative paths).
//
// The emitted code is ordinary TypeScript: real classes, real methods, real
// control flow. Nothing in it is a VM — the bytecode has already been lifted by
// `lift.ts`, and every import is a name the ABC itself carried in its pools.

import type { Stmt } from '../as2/ast';
import type { AbcClassDef, AbcFile, AbcMethodInfo, AbcTrait } from '../../decompiler/swf/abc';
import { FLASH_DEFINITIONS, TOP_LEVEL } from '../../src/engine/flash/packages';
import { liftMethod, type LiftDiagnostic } from './lift';

export interface EmittedFile { path: string; text: string }

/** The names a module's bodies use, split by how they use them. */
interface NameUse {
  /** Named as a value: `new Foo`, `Foo.bar`, `x instanceof Foo`, `extends`. */
  values: Set<string>;
  /** Named in a position TypeScript erases: `x as Foo`. */
  types: Set<string>;
}
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
  /**
   * Which `flash.*` / `fl.*` names the player can actually provide. Defaults to
   * the engine's own table, so an unavailable class becomes a loud
   * `unsupportedFlash(...)` stub instead of an import that fails to link.
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
    else if ((trait.kind === 'slot' || trait.kind === 'const') && trait.value !== undefined
      && !pathOf.has(simpleName(trait.name))) pathOf.set(simpleName(trait.name), `constants/${simpleName(trait.name)}.ts`);
  }
  for (let scriptIndex = 0; scriptIndex < abc.scripts.length; scriptIndex++) {
    const script = abc.scripts[scriptIndex];
    for (const trait of script.traits) {
      if (trait.kind === 'class' && trait.classIndex != null && abc.classes[trait.classIndex]) {
        const result = emitClassModule({ abc, classIndex: trait.classIndex, projectClasses, pathOf, flashAvailable: flashAvailableOf(options), unsupported });
        files.push(...result.files);
        diagnostics.push(...result.diagnostics);
      } else if (trait.kind === 'function' && trait.method != null) {
        files.push({ path: `functions/${simpleName(trait.name)}.ts`, text: emitFunctionModule(abc, trait, pathOf) });
      } else if (trait.kind === 'slot' || trait.kind === 'const') {
        // A script-level constant: a package constant of the movie (`fl.video`'s
        // `SKIN_AUTO_HIDE_INTERVAL`). The name it is written under may carry a
        // namespace — the file name keeps a sanitised form of it, so two packages can
        // each have their own.
        if (trait.value !== undefined) {
          const name = simpleName(trait.name);
          const where = `constants/${trait.name.replace(/[^\w$]+/g, '_').replace(/^_+|_+$/g, '')}.ts`;
          pathOf.set(name, where);
          files.push({ path: where, text: `export const ${name} = ${literalOf(trait.value)};\n` });
        }
      }
    }
    const init = emitScriptInit(abc, script.init, script.traits);
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
    const result = emitClassModule({ abc, classIndex: i, projectClasses, flashAvailable: flashAvailableOf(options), unsupported });
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
  '  // A real function, not an arrow: a movie extends flash classes, so the stub has',
  '  // to be constructible for the class definition itself to succeed.',
  '  const fail = function (): never { throw new Error("flash definition " + name + " is not implemented by this engine"); };',
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

/** Packages the player itself owns: anything else in the movie folder is game code. */
const PLAYER_PACKAGE = /^(flash|fl|adobe|mx|air)[.]/;

/** The engine's own `flash.*` table unless the caller overrides it. */
function flashAvailableOf(options: { flashAvailable?: (dotted: string) => boolean }) {
  return options.flashAvailable ?? ((dotted: string) => !PLAYER_PACKAGE.test(dotted) || FLASH_DEFINITIONS.has(dotted));
}

export interface ClassModuleOptions {
  abc: AbcFile;
  /** Simple name → module path, for every class/function this project emits. */
  pathOf?: Map<string, string>;
  classIndex: number;
  projectClasses: Set<string>;
  /**
   * Which `flash.*` / `fl.*` names the player can actually provide. Defaults to
   * the engine's own table, so an unavailable class becomes a loud
   * `unsupportedFlash(...)` stub instead of an import that fails to link.
   */
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
  // What this module's bodies name, and how: a value use needs a real import (or a
  // require at the point of use), a type use only needs `import type`.
  const used: NameUse = { values: new Set(), types: new Set() };
  const isInterface = instance.isInterface;

  // Timeline frame scripts are ordinary instance traits named `frameN` (namespace
  // = the class's package), so the member loops below emit them like any method.
  const frames = new Map<string, number>();
  const instanceMembers = new Set<string>(instance.traits.filter((t) => t.kind !== 'class').map((t) => simpleName(t.name)));
  const staticMembers = new Set<string>(def.traits.filter((t) => t.kind !== 'class').map((t) => simpleName(t.name)));
  const globals = new Set<string>();
  for (const script of abc.scripts) for (const trait of script.traits) if (trait.kind === 'function') globals.add(simpleName(trait.name));
  // Classes are globals too (`flash.utils.getDefinitionByName`, unqualified use in
  // another class): a body names one by its simple name and the import machinery
  // brings it in, instead of the body pointing at `this.RequestRetry`.
  for (const qualified of projectClasses) globals.add(simpleName(qualified));
  // Which names are methods, walked up the superclass chain: a method read as a value
  // is bound to its receiver in AVM2, a field read is not.
  const byQualified = new Map(abc.classes.map((c) => [c.instance.name, c]));
  const methodNames = (from?: string, statics = false): Set<string> => {
    const names = new Set<string>();
    let cls = from ? byQualified.get(from) : undefined;
    const seen = new Set<string>();
    for (let depth = 0; cls && depth < 64; depth++) {
      for (const trait of statics ? cls.traits : cls.instance.traits) if (trait.kind === 'method') names.add(simpleName(trait.name));
      const superName = cls.instance.superName;
      if (!superName || seen.has(superName)) break;
      seen.add(superName);
      cls = byQualified.get(superName);
    }
    return names;
  };
  // The script this class belongs to: its slot table is what `getglobalscope; getslot N`
  // reads, and slot N is the trait the script defined there (this class, usually).
  const script = abc.scripts.find((s2) => s2.traits.some((t) => t.classIndex === classIndex));
  const scriptSlots = new Map<number, string>();
  for (const trait of script?.traits ?? []) if (trait.slotId != null && trait.slotId > 0) scriptSlots.set(trait.slotId, simpleName(trait.name));

  const instanceScope: LiftScope = {
    target: 'instance', memberNames: instanceMembers, staticMembers, staticOwner: simple,
    scriptSlots,
    superOwner: instance.superName ? simpleName(instance.superName) : undefined,
    instanceMethods: methodNames(qualifiedName), staticMethods: methodNames(qualifiedName, true),
    globals, ownTraits: instance.traits,
  };
  const staticScope: LiftScope = {
    target: 'class', memberNames: staticMembers, staticMembers, staticOwner: simple, scriptSlots,
    superOwner: instance.superName ? simpleName(instance.superName) : undefined,
    staticMethods: methodNames(qualifiedName, true), globals, ownTraits: def.traits,
  };

  // Bodies are lifted first and printed afterwards: which names need to be
  // required on first use (see `lazy` below) is only known once every body of the
  // module has been lifted, and the printer has to write those as property reads.
  const members: MemberPiece[] = [];

  if (!isInterface && instance.iinit >= 0) {
    const where = `${qualifiedName}::constructor`;
    members.push({
      open: `  public constructor(${paramsOf(abc, instance.iinit)}) {\n`,
      close: '\n  }',
      stmts: liftStmts(abc, instance.iinit, instanceScope, diagnostics, where),
      where,
      hoistSuper: true,
    });
  }

  // A class's static initializer (`cinit`): the compiler's static slot defaults, the
  // values a static slot is first written with, and the class-level wiring. Nothing
  // in a trait carries these, so without it every static starts out `undefined`.
  const hasCinit = !isInterface && def.cinit >= 0 && abc.bodies.some((b) => b.method === def.cinit);
  if (hasCinit) {
    const where = `${qualifiedName}::<cinit>`;
    members.push({
      open: '  public static __cinit(): void {\n', close: '\n  }',
      stmts: liftStmts(abc, def.cinit, staticScope, diagnostics, where), where,
    });
  }

  const slotDefaults: string[] = [];
  for (const trait of instance.traits) {
    const piece = memberPiece(abc, trait, instanceScope, diagnostics, qualifiedName, isInterface, false, slotDefaults);
    if (piece) members.push(piece);
  }
  for (const trait of def.traits) {
    const piece = memberPiece(abc, trait, staticScope, diagnostics, qualifiedName, isInterface, true);
    if (piece) members.push(piece);
  }
  for (const [frameName, method] of [...frames.entries()].sort()) {
    const where = `${qualifiedName}::${frameName}`;
    members.push({
      open: `  public ${frameName}(): any {\n`, close: '\n  }',
      stmts: liftStmts(abc, method, instanceScope, diagnostics, where), where,
    });
  }

  const supers = [...instance.interfaces].map((i) => simpleName(i));
  const superName = instance.superName ? simpleName(instance.superName) : '';
  const withBase = !!(superName && superName !== 'Object');
  if (superName) used.values.add(superName);

  // The module's own class and its base are named by the class declaration itself,
  // so those two keep their real import and print as plain names.
  const refs: RefMaps = {
    pathOf: options.pathOf ?? new Map<string, string>(),
    self: qualifiedName,
    skip: new Set([simple, superName].filter(Boolean)),
    // `T(x)` is a cast when T is a class, so the printer needs the class names of the
    // movie and the engine — capitalized, because that is what tells a class from the
    // utility functions (`getDefinitionByName(x)` is a call, not a cast).
    classNames: new Set([...projectClasses, ...FLASH_DEFINITIONS.keys()]
      .map(simpleName)
      .filter((name) => /^[A-Z]/.test(name))),
  };
  const body = members.map((m) => {
    if (m.stmts === undefined) return m.open;
    const printed = m.stmts === null ? refusalStub(m.where, diagnostics) : printStmts(m.stmts, used, refs);
    return `${m.open}${m.hoistSuper ? hoistSuper(printed) : printed}${m.close}`;
  });
  // JavaScript has no `super` without a base class, so one that uses `super` gets `extends Object`.
  const needsBase = !withBase && body.some((text) => /\bsuper\b/.test(text));
  const header = isInterface
    ? `export interface ${simple}${supers.length ? ` extends ${supers.join(', ')}` : ''} {`
    : `export class ${simple}${withBase || needsBase ? ` extends ${withBase ? superName : 'Object'}` : ''}${supers.length ? ` implements ${supers.join(', ')}` : ''} {`;
  // An interface is a runtime object in AVM2 (`x is IFoo`), and a class records the
  // interfaces it implements so that check can answer. TypeScript erases both facts,
  // so the module states them: a value next to the interface, a registration after
  // the class. Both are what makes `instanceof` work against an interface name.
  //
  // The names go through the same resolution bodies use: a module the project loads
  // at the point of use (a cycle breaker) is fetched with `require`, not an import.
  const refOf = (name: string): string => {
    if (refs.skip?.has(name)) return name;
    const target = refs.pathOf.get(name);
    if (!target) return name;
    return `require('${specifier(refs.self, target.replace(/\.ts$/, ''))}').${name}`;
  };
  const slotsCall = slotDefaults.length ? `__slots(${simple}, { ${slotDefaults.join(', ')} });\n` : '';
  const cinitCall = `${slotsCall}${hasCinit ? `${simple}.__cinit();\n` : ''}`;
  const tail = isInterface
    ? `\nexport const ${simple} = __interface('${qualifiedName}'${supers.length ? `, ${supers.map(refOf).join(', ')}` : ''});`
    : supers.length
      ? `\n${cinitCall}__implements(${simple}, ${supers.map(refOf).join(', ')});`
      : `\n${cinitCall}`;
  const text = [header, ...body, `}${tail}`].join('\n');

  const uses = namesUsed(text);
  // Registration and construction are value positions for those names, and the
  // interface value is exported by the interface's own module.
  for (const face of supers) used.values.add(face);
  // A name in the text that no body printed as a value is a type here (a slot's
  // declared type, an interface, an `as` cast): importing it as a value would put
  // the module back into a runtime import graph it does not belong to.
  const types = new Set([...used.types, ...[...uses].filter((name) => !used.values.has(name))]);
  for (const name of types) if (projectClasses.has(name) || abc.classes.some((c) => c.instance.name === name)) uses.add(name);
  const required = new Set([...used.values].filter((name) => options.pathOf?.has(name) && !refs?.skip?.has(name)));
  const ownNames = new Set([...instanceMembers, ...staticMembers, ...frames.keys()]);
  const imports = importLines(uses, abc, projectClasses, qualifiedName, simple, options.flashAvailable, options.unsupported, types, used.values, options.pathOf ? required : undefined, ownNames);

  return {
    files: [{ path: classPath(qualifiedName), text: `${imports.join('\n')}${imports.length ? '\n\n' : ''}${text}\n` }],
    diagnostics,
    unsupported: [],
    provides: [simple, ...frames.keys()],
    qualifiedName,
  };
}

/** One class member: literal text, or an opening line plus a body printed later. */
interface MemberPiece {
  open: string;
  close: string;
  /** `undefined` for a member that is a single line, `null` for a refused body. */
  stmts?: Stmt[] | null;
  /** `where` names the body in a refusal; the constructor's `super()` is hoisted. */
  where: string;
  hoistSuper?: boolean;
}

/** Everything a member body needs in order to resolve names against its class. */
interface LiftScope {
  target: 'instance' | 'class' | 'none';
  memberNames: Set<string>;
  staticMembers: Set<string>;
  staticOwner: string;
  /** The superclass's simple name: `super.m(...)` / `super.m` read against it. */
  superOwner?: string;
  /** Instance methods reachable from this class: a read of one is a bound closure. */
  instanceMethods?: Set<string>;
  /** Static methods of this class: a read of one binds to the class object. */
  staticMethods?: Set<string>;
  /** The enclosing script's traits by slot id: `getglobalscope; getslot N` reads one. */
  scriptSlots?: Map<number, string>;
  /** The class's own traits, so a `slot` index in a body can be named. */
  ownTraits?: AbcTrait[];
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

/** A member method / accessor / slot of a class, or null for traits that are not members. */
function memberPiece(
  abc: AbcFile,
  trait: AbcTrait,
  scope: LiftScope,
  diagnostics: EmitDiagnostic[],
  owner: string,
  isInterface: boolean,
  isStatic: boolean,
  slotDefaults?: string[],
): MemberPiece | null {
  const name = simpleName(trait.name);
  const stat = isStatic ? 'static ' : '';
  const literal = (text: string): MemberPiece => ({ open: text, close: '', where: '' });
  if (trait.kind === 'slot' || trait.kind === 'const') {
    const type = trait.type ? typeName(trait.type) : 'any';
    if (isInterface) return literal(`  ${name}: ${type};`);
    const initial = slotDefault(trait);
    // A static slot is set when the class is defined, before `cinit`: a field initializer.
    if (isStatic) return literal(`  public static ${name}: ${type}${initial === 'undefined' ? '' : ` = ${initial}`};`);
    // An instance slot holds its default from the moment the object exists — before
    // any constructor in the chain runs (a base constructor calling an overridden
    // method sees it). A JavaScript field initializer runs only after `super()`
    // returns, so the default goes on the prototype (`__slots` below) instead.
    if (initial !== 'undefined') slotDefaults?.push(`${JSON.stringify(name)}: ${initial}`);
    return literal(`  public ${name}: ${type};`);
  }
  if (trait.kind !== 'method' && trait.kind !== 'getter' && trait.kind !== 'setter') return null;
  if (trait.method == null) return literal(`  public ${stat}${name}: any;`);
  const info = abc.methods[trait.method];
  const params = paramsOf(abc, trait.method);
  const ret = info?.returnType ? typeName(info.returnType) : 'any';
  const hasBody = abc.bodies.some((b) => b.method === trait.method);
  if (isInterface) {
    if (trait.kind === 'getter') return literal(`  get ${name}(): ${ret};`);
    if (trait.kind === 'setter') return literal(`  set ${name}(${params});`);
    return literal(`  ${name}(${params}): ${ret};`);
  }
  if (!hasBody) return literal(`  public ${stat}${name}(${params}): ${ret} { throw new Error(${JSON.stringify(`${owner}::${name} has no body in the ABC`)}); }`);
  const where = `${owner}::${name}`;
  const stmts = liftStmts(abc, trait.method, scope, diagnostics, where);
  if (trait.kind === 'getter') return { open: `  public ${stat}get ${name}()${ret === 'void' ? '' : `: ${ret}`} {\n`, close: '\n  }', stmts, where };
  if (trait.kind === 'setter') return { open: `  public ${stat}set ${name}(${params}) {\n`, close: '\n  }', stmts, where };
  return { open: `  public ${stat}${name}(${params}): ${ret} {\n`, close: '\n  }', stmts, where };
}

/** Lift a method body to statements; a refusal is recorded and reported as `null`. */
function liftStmts(abc: AbcFile, method: number, scope: LiftScope, diagnostics: EmitDiagnostic[], where: string): Stmt[] | null {
  const body = abc.bodies.find((b) => b.method === method);
  if (!body) {
    diagnostics.push({ offset: 0, message: 'no body in the ABC', where });
    return null;
  }
  const result = liftMethod({ abc, body, ...scope, ...abiFlags(abc, method), paramNames: paramNamesOf(abc, method) });
  if (result.stmts) return result.stmts;
  const first = result.diagnostics[0];
  diagnostics.push({ offset: first?.offset ?? 0, message: first?.message ?? 'unknown', where });
  return null;
}

/** Print a lifted body as a member body. */
function printStmts(
  stmts: Stmt[],
  used: NameUse,
  refs: RefMaps | undefined,
): string {
  const printed = new Printer(used, refs).print(stmts);
  return printed.split('\n').map((l) => `    ${l}`).join('\n');
}

/**
 * The stub a body that could not be lifted becomes: the method exists, and calling
 * it says exactly which byte of which method is missing.
 */
function refusalStub(where: string, diagnostics: EmitDiagnostic[]): string {
  const detail = diagnostics.find((d) => d.where === where);
  return `    throw new Error(${JSON.stringify(`${where}: not lifted yet (${detail ? `byte ${detail.offset}: ${detail.message}` : 'unknown reason'})`)});`;
}

/** The module that runs a script's top level (its trait bindings are the class objects). */
function emitScriptInit(abc: AbcFile, method: number, traits: AbcTrait[]): EmittedFile | null {
  const body = abc.bodies.find((b) => b.method === method);
  if (!body) return null;
  const result = liftMethod({ abc, body, target: 'none' });
  if (!result.stmts) return null;
  const used: NameUse = { values: new Set(), types: new Set() };
  // Names the module itself defines: a script init that only re-states them
  // (`this.Thing = Thing`, the class/function slots) says nothing new.
  const own = new Set(traits.map((t) => simpleName(t.name)));
  const restatesOwnSlot = (text: string) => {
    const m = /^this\.([\w$]+) = (this|[\w$]+);$/.exec(text.trim());
    return !!m && own.has(m[1]) && (m[2] === 'this' || m[2] === m[1]);
  };
  // The structural part of a script init (`newclass`, `initproperty`) *is* the
  // TypeScript class declaration, so statements that only build class objects go.
  const kept = result.stmts
    .map((s) => ({ stmt: s, text: new Printer(used).print([s]) }))
    .filter((r) => r.text.trim() && !/__class\d+/.test(r.text) && r.stmt.k !== 'return' && !restatesOwnSlot(r.text));
  if (!kept.length) return null;
  const printed = kept.map((r) => r.text).join('\n');
  const header = `// Script init from the ABC — runs when the module is linked.\n`;
  return { path: `script/init_${method}.ts`, text: `${header}export function __scriptInit() {\n${printed.split('\n').map((l) => `  ${l}`).join('\n')}\n}\n` };
}

/** An `internal function frame1()` binding, for the rare block that names a function. */
function emitFunctionModule(abc: AbcFile, trait: AbcTrait, pathOf?: Map<string, string>): string {
  const name = simpleName(trait.name);
  const body = trait.method != null ? abc.bodies.find((b) => b.method === trait.method) : undefined;
  if (!body) return `export function ${name}(...args: any[]): any { throw new Error("no body"); }\n`;
  const result = liftMethod({ abc, body, target: 'none', paramNames: paramNamesOf(abc, trait.method as number) });
  const refs: RefMaps = { pathOf: pathOf ?? new Map<string, string>(), self: `functions/${name}` };
  const text = result.stmts ? new Printer({ values: new Set(), types: new Set() }, refs).print(result.stmts) : `throw new Error("not lifted yet");`;
  return `export function ${name}(${paramsOf(abc, trait.method as number)}): any {\n${text.split('\n').map((l) => `  ${l}`).join('\n')}\n}\n`;
}

function paramsOf(abc: AbcFile, method: number): string {
  const info = abc.methods[method];
  if (!info) return '';
  // The optional values belong to the last parameters, in order (AVM2 overview §4.5).
  const firstOptional = info.paramTypes.length - info.optional.length;
  const declared = info.paramTypes.map((t, i) => {
    const option = i >= firstOptional ? info.optional[i - firstOptional] : undefined;
    const initial = option ? literalOf(option.kind === 'undefined' ? undefined : option.value) : '';
    return `${paramName(info, i)}: ${typeName(t)}${option ? ` = ${initial}` : ''}`;
  });
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

/** A constant as TypeScript source; JSON has no spelling for NaN, the infinities or -0. */
function literalOf(value: string | number | boolean | null | undefined): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    if (Object.is(value, -0)) return '-0';
  }
  return JSON.stringify(value);
}

/**
 * The value a slot starts with: the trait's own constant when it has one, else the
 * default of its declared type — Boolean false, Number NaN, int/uint 0, `*`
 * undefined, anything else null (Ruffle `default_value_for_type`).
 */
function slotDefault(trait: AbcTrait): string {
  if (trait.valueKind != null) return literalOf(trait.value);
  switch (trait.type ?? '') {
    case 'Boolean': return 'false';
    case 'Number': return 'NaN';
    case 'int': case 'uint': return '0';
    case '': case '*': return 'undefined';
    default: return 'null';
  }
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

/**
 * Names a module can use without an import: JavaScript's own globals, ActionScript's
 * int/uint/Number spellings, and everything the engine puts at the top level
 * (`trace`, `Vector`, the error classes). The list is derived from the engine's own
 * table so a name cannot be imported here while the loader also injects it.
 */
const BUILTINS = new Set([
  ...Object.keys(TOP_LEVEL),
  'any', 'Array', 'Boolean', 'const', 'else', 'Error', 'export', 'false', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'let', 'number', 'new', 'null', 'of', 'return', 'string', 'super', 'this',
  'throw', 'true', 'typeof', 'undefined', 'var', 'void', 'while', 'NaN', 'JSON', 'Math', 'Object', 'String',
  'Number', 'delete', 'as', 'is', 'interface', 'extends', 'implements', 'class', 'get', 'set', 'static', 'public',
  'catch', 'try', 'break', 'continue', 'do', 'switch', 'case', 'default', 'int', 'uint', 'trace', 'Date', 'RegExp',
  'Function', 'Proxy',
]);

/** Imports for everything the module body references and the ABC knows the package of. */
function importLines(
  uses: Set<string>,
  abc: AbcFile,
  projectClasses: Set<string>,
  self: string,
  simple: string,
  flashAvailable?: (dotted: string) => boolean,
  unsupported?: Set<string>,
  /** Names a body only names as a type: an `import type` suffices. */
  types?: Set<string>,
  /** Names a body uses as a value. */
  values?: Set<string>,
  /** Project classes a body requires at the point of use, so no import is needed. */
  required?: Set<string>,
  /** Names this module declares itself (its class, its members): never imported. */
  ownNames?: Set<string>,
): string[] {
  const packageOf = new Map<string, string>();
  const poolNames = abc.multinames.map((m) => (m.nsKind === 'package' || m.nsKind === 'packageInternal' || m.nsKind === 'namespace') && m.ns ? `${m.ns}.${m.name}` : m.name);
  // A multiname with a namespace *set* (how `implements`/`extends` lists name an
  // interface) gives no package by itself; the set's package that actually defines
  // the name — in the movie or in the player — is where it comes from.
  for (const m of abc.multinames) {
    if (!m.nsSet?.length || !m.name) continue;
    const home = m.nsSet.find((ns) => ns && (projectClasses.has(`${ns}.${m.name}`) || FLASH_DEFINITIONS.has(`${ns}.${m.name}`)));
    if (home) poolNames.push(`${home}.${m.name}`);
  }
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
    if (BUILTINS.has(name) || name === simple || ownNames?.has(name)) continue;
    const asValue = values?.has(name) ?? true;
    const asType = types?.has(name) ?? false;
    const project = bySimple.get(name);
    if (project) {
      const from = classPath(project).replace(/\.ts$/, '');
      // Required at the point of use: import it as a type only if a type position
      // names it too, and otherwise not at all.
      if (required?.has(name)) {
        if (asType) typeLines.push(`import type { ${name} } from '${specifier(self, from)}';`);
        continue;
      }
      const line = `import { ${name} } from '${specifier(self, from)}';`;
      (asType && !asValue ? typeLines : lines).push(line);
      continue;
    }
    const qualified = packageOf.get(name);
    if (!qualified || qualified === name) continue;
    // A package path must be package segments; a namespace that is a URI (Adobe's
    // `http://www.adobe.com/2007/flash/flvplayback/internal`) names no module.
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(qualified)) continue;
    if (!asValue && asType) {
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

/** What the printer needs to know about the module it is printing. */
interface RefMaps {
  pathOf: Map<string, string>;
  self: string;
  /** Names of this module's own classes: print them bare. */
  skip?: Set<string>;
  /** Simple names of every class in the movie and the engine. */
  classNames?: Set<string>;
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
  /**
   * `refs` maps every project class/function to the module that defines it. A
   * name in it is printed as a `require` at the point of use: a module-level
   * import of a class a sibling requires back would freeze that sibling's
   * `extends` at `undefined`, while a require here resolves after both modules
   * are on the way up.
   */
  constructor(
    private readonly used: NameUse = { values: new Set(), types: new Set() },
    private readonly refs?: RefMaps,
  ) {}

  print(stmts: import('../as2/ast').Stmt[]): string {
    if (process.env.EMIT_STMT) for (const s of stmts) console.log(JSON.stringify(s));
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

  /**
   * A class named in a class position. A class the lifter had to reach through
   * `this` (`this.RequestRetry` — an unqualified name in the movie's own scope) is a
   * name, not a member: `x as this.T` is not even TypeScript, and `this.T` is
   * undefined at runtime.
   */
  private classText(e: import('../as2/ast').Expr, how: 'type' | 'value'): string {
    const named = e.k === 'id' ? e.name
      : e.k === 'member' && e.obj.k === 'id' && e.obj.name === 'this' ? e.prop
        : null;
    if (named == null || !/^[A-Z]/.test(named)) return this.expr(e);
    if (how === 'type') { this.used.types.add(named); return named; }
    return this.expr({ k: 'id', name: named, line: 0 });
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
      case 'id': {
        this.used.values.add(e.name);
        const refs = this.refs;
        if (!refs || refs.skip?.has(e.name)) return e.name;
        const target = refs.pathOf.get(e.name);
        if (!target) return e.name;
        return `require('${specifier(refs.self, target.replace(/\.ts$/, ''))}').${e.name}`;
      }
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
      case 'call': {
        // `T(x)` on a class is a cast in ActionScript: a class object called as a
        // function coerces its one argument. A JavaScript class cannot be called, so
        // the cast is what the movie means and what the engine can run.
        if (e.args.length === 1 && e.callee.k === 'id' && this.refs?.classNames?.has(e.callee.name)) {
          return `(${this.expr(e.args[0])} as ${this.classText(e.callee, 'type')})`;
        }
        return `${this.atom(e.callee)}(${e.args.map((a) => this.expr(a)).join(', ')})`;
      }
      case 'new': {
        // `new f().g()` is `(new f()).g()` in JavaScript, so a callee that carries a
        // call of its own (a class required at the point of use) needs parentheses.
        const callee = this.expr(e.callee);
        const loose = e.callee.k === 'call' || e.callee.k === 'cond' || e.callee.k === 'assign'
          || e.callee.k === 'binary' || e.callee.k === 'unary' || e.callee.k === 'update' || /\brequire\(/.test(callee);
        return `new ${loose ? `(${callee})` : callee}(${e.args.map((a) => this.expr(a)).join(', ')})`;
      }
      case 'unary': {
        const op = e.op.trim();
        const arg = isOperator(e.arg) ? `(${this.expr(e.arg)})` : this.expr(e.arg);
        return op === 'delete' ? `delete ${arg}` : /^[a-z]+$/.test(op) ? `${op} ${arg}` : `${op}${arg}`;
      }
      case 'update': return e.prefix ? `${e.op}${this.atom(e.arg)}` : `${this.atom(e.arg)}${e.op}`;
      case 'binary': {
        // `x as Foo` is a type: TypeScript erases it, so it must not force a value
        // import for `Foo`.
        if (e.op === 'as') return `(${this.atom(e.left)} as ${this.classText(e.right, 'type')})`;
        if (e.op === 'is') return `(${this.atom(e.left)} instanceof ${this.classText(e.right, 'value')})`;
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
