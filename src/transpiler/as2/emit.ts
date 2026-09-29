// AS1/AS2 AST -> TypeScript emitter.
//
// Scoping model (mirrors the Flash Player's AS2 scope chain):
//   * Frame / handler code runs with `$t` bound to the timeline (MovieClip)
//     that owns it. Frame-level `var` / `function` declarations are timeline
//     properties, and every identifier that is not a local, a parameter, an
//     import or a known global resolves to `$t.<name>` (the runtime clip falls
//     back to `_global` when the property is missing, like the real player).
//   * Nested functions stay `function` expressions so that dynamic `this`
//     works (mc.onEnterFrame = function () { this._x++; }).
//   * Class methods resolve unqualified member names to `this.x` /
//     `ClassName.x` exactly like the AS2 compiler does.

import type { ClassDecl, Expr, Param, Stmt, TypeRef } from './ast';

export interface KnownClass {
  /** fully-qualified name, e.g. com.gaia.fishing.Fish */
  name: string;
  /** output module path relative to the project root, no extension, e.g. classes/com/gaia/fishing/Fish */
  module: string;
  /** declared members (for unqualified member resolution in subclasses) */
  members?: { name: string; isStatic: boolean }[];
  extends?: string | null;
}

export interface EmitOptions {
  /** module specifier the generated code imports its runtime from */
  runtime: string;
  /** output path of the module being generated, relative to project root, no extension */
  selfModule: string;
  /** classes of the project (for imports and member resolution) */
  classes?: Map<string, KnownClass>;
}

export interface Diagnostic { level: 'warning' | 'error'; message: string; line?: number }

// ------------------------------------------------------------------ tables

/** ECMAScript globals that exist unchanged in TypeScript. */
const JS_GLOBALS = new Set([
  'Math', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Date', 'Function', 'Error', 'NaN', 'Infinity',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'escape', 'unescape',
]);

/** Flash classes/objects provided by the runtime module. */
export const RUNTIME_CLASSES = new Set([
  'MovieClip', 'Button', 'TextField', 'TextFormat', 'Sound', 'Color', 'Key', 'Mouse', 'Stage', 'Selection', 'System',
  'XML', 'XMLNode', 'LoadVars', 'SharedObject', 'LocalConnection', 'MovieClipLoader', 'ContextMenu', 'ContextMenuItem',
  'AsBroadcaster', 'Camera', 'Microphone', 'NetConnection', 'NetStream', 'Video', 'TextSnapshot', 'Accessibility',
  'PrintJob', 'XMLSocket', 'flash',
]);

/** Global functions provided by the runtime module (imported by name). */
export const RUNTIME_FUNCTIONS = new Set([
  'trace', 'getTimer', 'random', 'int', 'chr', 'ord', 'mbchr', 'mbord', 'mblength', 'mbsubstring', 'substring',
  'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'getURL', 'fscommand', 'stopAllSounds',
  'updateAfterEvent', 'getVersion', 'targetPath', 'stopDrag', 'loadMovieNum', 'loadVariablesNum', 'unloadMovieNum',
  'ASSetPropFlags', 'toggleHighQuality', '_global',
]);

/** Global functions whose meaning depends on the current timeline: emitted as $rt.fn(<timeline>, …). */
export const CONTEXT_FUNCTIONS = new Set([
  'eval', 'set', 'getProperty', 'setProperty', 'duplicateMovieClip', 'removeMovieClip', 'startDrag', 'loadMovie',
  'loadVariables', 'unloadMovie', 'call', 'print', 'printAsBitmap',
]);

/** Classes that make unknown unqualified names resolve to `this.x` in subclasses. */
const DYNAMIC_BASES = new Set(['MovieClip', 'Button', 'TextField', 'Object', 'Sound', 'XML', 'LoadVars']);

/** MovieClip methods that always exist on a timeline (no null guard needed when called on `$t`/`this`). */
const MOVIECLIP_METHODS = new Set([
  'play', 'stop', 'gotoAndPlay', 'gotoAndStop', 'nextFrame', 'prevFrame', 'attachMovie', 'createEmptyMovieClip',
  'createTextField', 'duplicateMovieClip', 'removeMovieClip', 'swapDepths', 'getDepth', 'getNextHighestDepth',
  'getInstanceAtDepth', 'hitTest', 'getBounds', 'localToGlobal', 'globalToLocal', 'startDrag', 'stopDrag',
  'loadMovie', 'unloadMovie', 'loadVariables', 'getBytesLoaded', 'getBytesTotal', 'getURL', 'attachSound',
  'setMask', 'lineStyle', 'beginFill', 'beginGradientFill', 'endFill', 'moveTo', 'lineTo', 'curveTo', 'clear',
]);

const PREC: Record<string, number> = {
  ',': 1, '=': 2, '?': 3, '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8, '==': 9, '!=': 9, '===': 9, '!==': 9,
  '<': 10, '>': 10, '<=': 10, '>=': 10, instanceof: 10, in: 10, '<<': 11, '>>': 11, '>>>': 11, '+': 12, '-': 12,
  '*': 13, '/': 13, '%': 13,
};
const P_UNARY = 14, P_POSTFIX = 15, P_CALL = 17, P_PRIMARY = 18;

const VALID_IDENT = /^[A-Za-z_$][\w$]*$/;
const TS_RESERVED = new Set([
  'enum', 'export', 'await', 'let', 'yield', 'package', 'protected', 'implements', 'interface', 'private', 'public',
  'static', 'const', 'super', 'debugger', 'arguments', 'eval', 'dynamic', 'intrinsic',
]);

// ------------------------------------------------------------------ scopes

interface Scope {
  kind: 'timeline' | 'function' | 'method' | 'catch';
  names: Set<string>;
  parent: Scope | null;
}

interface Ctx {
  /** expression that evaluates to the current timeline (`$t`, or `this` / `$rt.root` in classes) */
  timeline: string;
  scope: Scope;
  /** `with (…)` objects currently in effect, innermost first */
  withs: string[];
  cls: ClassInfo | null;
  isStatic: boolean;
  /** locals that only ever hold objects (new …, literals, functions): member access needs no null guard */
  safe?: Set<string>;
}

interface ClassInfo {
  name: string; // short name
  qualified: string;
  pkg: string;
  instance: Set<string>;
  statics: Set<string>;
  dynamicBase: boolean;
}

// ----------------------------------------------------------------- emitter

export class ModuleEmitter {
  readonly diagnostics: Diagnostic[] = [];
  private runtimeImports = new Set<string>();
  /** alias -> module path for project class imports */
  private classImports = new Map<string, string>();
  /** qualified class -> alias */
  private classAlias = new Map<string, string>();
  /** short names made visible by `import a.b.C;` */
  private imported = new Map<string, string>();
  private indentLevel = 0;
  private tmp = 0;

  constructor(private readonly opts: EmitOptions) {}

  // --- public module builders ------------------------------------------------

  /** Wraps a body of statements as `function (this: AS2Clip) { … }` frame/handler code. */
  timelineFunction(body: Stmt[]): string {
    this.useRuntime('AS2Clip', true);
    const scope: Scope = { kind: 'timeline', names: new Set(), parent: null };
    const ctx: Ctx = { timeline: '$t', scope, withs: [], cls: null, isStatic: false };
    this.collectImports(body);
    this.indentLevel++;
    const inner = this.hoistedBody(body, ctx);
    this.indentLevel--;
    const usesT = /\$t\b/.test(inner);
    const pad = this.pad(1);
    return `function (this: AS2Clip): void {\n${usesT ? `${pad}const $t = this;\n` : ''}${inner}${this.pad(0)}}`;
  }

  /** Emits a complete AS2 class module. */
  classModule(decl: ClassDecl): string {
    for (const m of decl.members) this.collectImports(m.body);
    const dot = decl.name.lastIndexOf('.');
    const short = decl.name.slice(dot + 1);
    const pkg = dot < 0 ? '' : decl.name.slice(0, dot);
    const info: ClassInfo = {
      name: short, qualified: decl.name, pkg,
      instance: new Set(), statics: new Set(), dynamicBase: false,
    };
    // own + inherited members
    for (const m of decl.members) (m.isStatic ? info.statics : info.instance).add(m.name);
    let base = decl.extends ? this.resolveClassName(decl.extends, pkg) : null;
    let baseName = decl.extends;
    const seen = new Set<string>();
    while (baseName) {
      const known = base ? this.opts.classes?.get(base) : undefined;
      if (!known) { if (DYNAMIC_BASES.has(baseName.split('.').pop()!)) info.dynamicBase = true; break; }
      if (seen.has(known.name)) break;
      seen.add(known.name);
      for (const m of known.members ?? []) (m.isStatic ? info.statics : info.instance).add(m.name);
      const knownPkg = known.name.includes('.') ? known.name.slice(0, known.name.lastIndexOf('.')) : '';
      baseName = known.extends ?? null;
      base = baseName ? this.resolveClassName(baseName, knownPkg) : null;
    }
    if (decl.dynamic) info.dynamicBase = true;

    const lines: string[] = [];
    let ext = '';
    if (decl.extends) ext = ` extends ${this.classRef(decl.extends, pkg)}`;

    lines.push(`export class ${short}${ext} {`);
    if (info.dynamicBase || decl.dynamic) lines.push(`  [key: string]: any;`);
    const ctor = decl.members.find((m) => m.kind === 'method' && !m.isStatic && m.name === short);
    const instanceFields = decl.members.filter((m) => m.kind === 'field' && !m.isStatic);
    const clsCtx = (isStatic: boolean, scope: Scope): Ctx => ({
      timeline: isStatic ? '$rt.root' : 'this', scope, withs: [], cls: info, isStatic,
    });

    this.indentLevel = 1;
    for (const m of decl.members) {
      if (m.kind !== 'field') continue;
      const type = this.mapType(m.type, pkg);
      if (m.isStatic) {
        const init = m.init ? ` = ${this.value(m.init, clsCtx(true, { kind: 'method', names: new Set(), parent: null }))}` : '';
        lines.push(`  static ${m.name}: ${type}${init};`);
      } else {
        lines.push(`  declare ${m.name}: ${type};`);
      }
    }

    // constructor (field initialisers are applied first, like AS2)
    const fieldInits = (ctx: Ctx) => instanceFields.filter((f) => f.init).map((f) => `${this.pad()}this.${f.name} = ${this.value(f.init!, ctx)};\n`).join('');
    if (ctor || instanceFields.some((f) => f.init) || decl.extends) {
      const scope: Scope = { kind: 'method', names: new Set(), parent: null };
      const ctx = clsCtx(false, scope);
      const params = ctor ? this.params(ctor.params, scope, pkg, ctor.body) : '';
      this.indentLevel = 2;
      let body = '';
      let bodyStmts = ctor?.body ?? [];
      let superCall = '';
      if (decl.extends) {
        const first = bodyStmts[0];
        if (first && first.k === 'expr' && first.e.k === 'call' && first.e.callee.k === 'id' && first.e.callee.name === 'super') {
          superCall = `${this.pad()}super(${first.e.args.map((a) => this.expr(a, ctx, PREC['='])).join(', ')});\n`;
          bodyStmts = bodyStmts.slice(1);
        } else superCall = `${this.pad()}super();\n`;
      }
      body = superCall + fieldInits(ctx) + this.functionBody(bodyStmts, ctx, scope, ctor?.params ?? []);
      lines.push(`  constructor(${params}) {\n${body}  }`);
    }

    for (const m of decl.members) {
      if (m.kind === 'field' || m === ctor) continue;
      if (decl.intrinsic) continue;
      const scope: Scope = { kind: 'method', names: new Set(), parent: null };
      const ctx = clsCtx(m.isStatic, scope);
      const params = m.kind === 'getter' || m.kind === 'setter' ? this.params(m.params, scope, pkg).replace('?:', ':') : this.params(m.params, scope, pkg, m.body);
      const ret = m.kind === 'setter' ? '' : m.type ? `: ${this.mapType(m.type, pkg)}` : '';
      this.indentLevel = 2;
      const body = this.functionBody(m.body, ctx, scope, m.params);
      const prefix = `${m.isStatic ? 'static ' : ''}${m.kind === 'getter' ? 'get ' : m.kind === 'setter' ? 'set ' : ''}`;
      lines.push(`  ${prefix}${m.name}(${params})${ret} {\n${body}  }`);
    }
    lines.push('}');
    this.useRuntime('$rt');
    lines.push(`$rt.registerClass(${JSON.stringify(decl.name)}, ${short});`);
    this.indentLevel = 0;
    return this.header() + lines.join('\n') + '\n';
  }

  /** Import block for everything referenced so far. */
  header(): string {
    const out: string[] = [];
    const vals = [...this.runtimeImports].filter((n) => !n.startsWith('type ')).sort();
    const types = [...this.runtimeImports].filter((n) => n.startsWith('type ')).map((n) => n.slice(5)).sort();
    const names = [...vals, ...types.filter((t) => !vals.includes(t)).map((t) => `type ${t}`)];
    if (names.length) out.push(`import { ${names.join(', ')} } from ${JSON.stringify(this.opts.runtime)};`);
    for (const [alias, mod] of [...this.classImports].sort()) {
      const short = mod.split('/').pop()!;
      out.push(`import { ${short === alias ? alias : `${short} as ${alias}`} } from ${JSON.stringify(relativeModule(this.opts.selfModule, mod))};`);
    }
    return out.length ? out.join('\n') + '\n\n' : '';
  }

  useRuntime(name: string, typeOnly = false) {
    if (typeOnly) { if (!this.runtimeImports.has(name)) this.runtimeImports.add(`type ${name}`); return; }
    this.runtimeImports.delete(`type ${name}`);
    this.runtimeImports.add(name);
  }

  warn(message: string, line?: number) { this.diagnostics.push({ level: 'warning', message, line }); }

  // --- classes & imports -------------------------------------------------------

  private collectImports(body: Stmt[]) {
    for (const s of body) {
      if (s.k !== 'import') continue;
      if (s.path.endsWith('.*')) {
        const pkg = s.path.slice(0, -2);
        for (const c of this.opts.classes?.keys() ?? []) if (c.startsWith(pkg + '.') && !c.slice(pkg.length + 1).includes('.')) this.imported.set(c.slice(pkg.length + 1), c);
      } else this.imported.set(s.path.split('.').pop()!, s.path);
    }
  }

  /** Resolve a class name as written (short or qualified) to a project class. */
  private resolveClassName(name: string, pkg: string): string | null {
    const classes = this.opts.classes;
    if (!classes) return null;
    if (classes.has(name)) return name;
    const imp = this.imported.get(name);
    if (imp && classes.has(imp)) return imp;
    if (pkg && classes.has(`${pkg}.${name}`)) return `${pkg}.${name}`;
    return null;
  }

  private aliasFor(qualified: string): string {
    const existing = this.classAlias.get(qualified);
    if (existing) return existing;
    const known = this.opts.classes!.get(qualified)!;
    if (known.module === this.opts.selfModule) {
      const short = qualified.split('.').pop()!;
      this.classAlias.set(qualified, short);
      return short;
    }
    let alias = qualified.split('.').pop()!;
    const taken = (a: string) => this.classImports.has(a) || RUNTIME_CLASSES.has(a) || RUNTIME_FUNCTIONS.has(a) || JS_GLOBALS.has(a) || a === '$rt';
    if (taken(alias) || this.opts.selfModule.endsWith('/' + alias)) alias = qualified.replace(/\./g, '_');
    this.classAlias.set(qualified, alias);
    this.classImports.set(alias, known.module);
    return alias;
  }

  private classRef(name: string, pkg: string): string {
    const q = this.resolveClassName(name, pkg);
    if (q) return this.aliasFor(q);
    const short = name.split('.').pop()!;
    if (RUNTIME_CLASSES.has(short)) { this.useRuntime(short); return short; }
    if (name === 'Object') return 'Object';
    this.warn(`Unknown base class "${name}" (not found in the project or the runtime)`);
    this.useRuntime('$rt');
    return `($rt.classByName(${JSON.stringify(name)}) as any)`;
  }

  mapType(t: TypeRef, pkg = ''): string {
    if (!t) return 'any';
    switch (t) {
      case 'Number': return 'number';
      case 'String': return 'string';
      case 'Boolean': return 'boolean';
      case 'Void': return 'void';
      case 'Object': case 'Function': return 'any';
      case 'Array': return 'any[]';
    }
    const q = this.resolveClassName(t, pkg);
    if (q) return this.aliasFor(q);
    const short = t.split('.').pop()!;
    if (RUNTIME_CLASSES.has(short) && short !== 'flash' && !t.includes('.')) { this.useRuntime(short, true); return short; }
    return 'any';
  }

  // --- statements --------------------------------------------------------------

  private pad(extra = 0) { return '  '.repeat(this.indentLevel + extra); }

  /** Body of timeline code: frame-level functions are hoisted and become timeline properties. */
  private hoistedBody(body: Stmt[], ctx: Ctx): string {
    let out = '';
    const fns = body.filter((s): s is Extract<Stmt, { k: 'function' }> => s.k === 'function');
    for (const f of fns) out += `${this.pad()}${ctx.timeline}.${f.name} = ${this.funcExpr(f.name, f.params, f.ret, f.body, ctx)};\n`;
    for (const s of body) if (s.k !== 'function') out += this.stmt(s, ctx);
    return out;
  }

  /** Emits a function body: declares locals (params, vars, nested functions). */
  private functionBody(body: Stmt[], ctx: Ctx, scope: Scope, params: Param[]): string {
    for (const p of params) scope.names.add(p.name);
    collectDeclarations(body, scope.names);
    const declared = new Set<string>(params.map((p) => p.name));
    const inner: Ctx = { ...ctx, scope, safe: safeLocals(body, params) };
    (inner as CtxWithDeclared).declared = declared;
    let out = '';
    // nested function declarations are hoisted
    for (const s of body) if (s.k === 'function') { out += this.stmt(s, inner); declared.add(s.name); }
    for (const s of body) if (s.k !== 'function') out += this.stmt(s, inner);
    return out;
  }

  /**
   * AS2 never enforces argument counts, so untyped parameters are optional;
   * functions that read `arguments` also accept extra arguments.
   */
  private params(ps: Param[], scope: Scope, pkg: string, body?: Stmt[]): string {
    scope.names.add('arguments');
    const out = ps.map((p) => {
      scope.names.add(p.name);
      const name = safeLocal(p.name);
      if (p.rest) return `...${name}: any[]`;
      return p.type ? `${name}: ${this.mapType(p.type, pkg)}` : `${name}?: any`;
    });
    if (body && !ps.some((p) => p.rest) && usesArguments(body)) out.push('..._args: any[]');
    return out.join(', ');
  }

  private funcExpr(name: string | null, params: Param[], ret: TypeRef, body: Stmt[], ctx: Ctx): string {
    const scope: Scope = { kind: 'function', names: new Set(['arguments']), parent: ctx.scope };
    const pkg = ctx.cls?.pkg ?? '';
    const ps = this.params(params, scope, pkg, body);
    const retType = ret ? `: ${this.mapType(ret, pkg)}` : '';
    this.indentLevel++;
    const inner = this.functionBody(body, { ...ctx, scope }, scope, params);
    this.indentLevel--;
    const fname = name && VALID_IDENT.test(name) && !TS_RESERVED.has(name) ? ` ${name}` : '';
    return `function${fname}(this: any${ps ? ', ' + ps : ''})${retType} {\n${inner}${this.pad()}}`;
  }

  private blockOrStmt(s: Stmt, ctx: Ctx): string {
    if (s.k === 'block') {
      this.indentLevel++;
      const inner = s.body.map((x) => this.stmt(x, ctx)).join('');
      this.indentLevel--;
      return `{\n${inner}${this.pad()}}`;
    }
    this.indentLevel++;
    const inner = this.stmt(s, ctx);
    this.indentLevel--;
    return `{\n${inner}${this.pad()}}`;
  }

  private stmts(body: Stmt[], ctx: Ctx): string {
    this.indentLevel++;
    const inner = body.map((x) => this.stmt(x, ctx)).join('');
    this.indentLevel--;
    return `{\n${inner}${this.pad()}}`;
  }

  stmt(s: Stmt, ctx: Ctx): string {
    const p = this.pad();
    switch (s.k) {
      case 'expr': {
        const code = this.expr(s.e, ctx, 0);
        // object literals / function expressions at statement start need parens
        return `${p}${/^(\{|function\b)/.test(code) ? `(${code})` : code};\n`;
      }
      case 'var': return this.varStmt(s.decls, ctx, p);
      case 'function': {
        if (kindOf(ctx.scope) === 'timeline') return `${p}${ctx.timeline}.${s.name} = ${this.funcExpr(s.name, s.params, s.ret, s.body, ctx)};\n`;
        return `${p}const ${safeLocal(s.name)} = ${this.funcExpr(s.name, s.params, s.ret, s.body, ctx)};\n`;
      }
      case 'block': return `${p}${this.stmts(s.body, ctx)}\n`;
      case 'if': {
        let out = `${p}if (${this.expr(s.test, ctx, 0)}) ${this.blockOrStmt(s.then, ctx)}`;
        let els = s.else;
        while (els && els.k === 'if') {
          out += ` else if (${this.expr(els.test, ctx, 0)}) ${this.blockOrStmt(els.then, ctx)}`;
          els = els.else;
        }
        if (els) out += ` else ${this.blockOrStmt(els, ctx)}`;
        return out + '\n';
      }
      case 'for': {
        let init = '';
        if (s.init) init = (s.init as Stmt).k === 'var' ? this.varStmt((s.init as Extract<Stmt, { k: 'var' }>).decls, ctx, '').trim().replace(/;$/, '') : this.expr(s.init as Expr, ctx, 0);
        return `${p}for (${init}; ${s.test ? this.expr(s.test, ctx, 0) : ''}; ${s.update ? this.expr(s.update, ctx, 0) : ''}) ${this.blockOrStmt(s.body, ctx)}\n`;
      }
      case 'forin': {
        let left: string;
        if (s.left.decl && s.left.target.k === 'id') {
          const name = s.left.target.name;
          left = kindOf(ctx.scope) === 'timeline' ? this.expr(s.left.target, ctx, P_CALL) : this.declareLocal(name, ctx);
        } else left = this.expr(s.left.target, ctx, P_CALL);
        return `${p}for (${left} in ${this.expr(s.obj, ctx, 0)}) ${this.blockOrStmt(s.body, ctx)}\n`;
      }
      case 'while': return `${p}while (${this.expr(s.test, ctx, 0)}) ${this.blockOrStmt(s.body, ctx)}\n`;
      case 'dowhile': return `${p}do ${this.blockOrStmt(s.body, ctx)} while (${this.expr(s.test, ctx, 0)});\n`;
      case 'switch': {
        let out = `${p}switch (${this.expr(s.disc, ctx, 0)}) {\n`;
        for (const c of s.cases) {
          out += `${this.pad(1)}${c.test ? `case ${this.expr(c.test, ctx, 0)}:` : 'default:'}\n`;
          this.indentLevel += 2;
          out += c.body.map((x) => this.stmt(x, ctx)).join('');
          this.indentLevel -= 2;
        }
        return out + `${p}}\n`;
      }
      case 'break': return `${p}break${s.label ? ' ' + s.label : ''};\n`;
      case 'continue': return `${p}continue${s.label ? ' ' + s.label : ''};\n`;
      case 'return': return `${p}return${s.arg ? ' ' + (s.arg.k === 'seq' ? this.expr(s.arg, ctx, 0) : this.value(s.arg, ctx)) : ''};\n`;
      case 'throw': return `${p}throw ${this.expr(s.arg, ctx, 0)};\n`;
      case 'try': {
        let out = `${p}try ${this.stmts(s.block, ctx)}`;
        if (s.handler) {
          // catch parameter is block-scoped; everything else resolves through the outer scope
          const inner: Ctx = { ...ctx, scope: { kind: 'catch', names: new Set([s.param ?? '$e']), parent: ctx.scope } };
          (inner as CtxWithDeclared).declared = (ctx as CtxWithDeclared).declared;
          out += ` catch (${safeLocal(s.param ?? '$e')}: any) ${this.stmts(s.handler, inner)}`;
        }
        if (s.finalizer) out += ` finally ${this.stmts(s.finalizer, ctx)}`;
        return out + '\n';
      }
      case 'with': {
        const name = `$w${++this.tmp}`;
        const inner: Ctx = { ...ctx, withs: [name, ...ctx.withs] };
        return `${p}{\n${this.pad(1)}const ${name} = ${this.expr(s.obj, ctx, PREC['='])};\n${this.pad(1)}${this.blockOrStmtIndented(s.body, inner)}\n${p}}\n`;
      }
      case 'label': return `${p}${s.label}: ${this.blockOrStmt(s.body, ctx).trimStart()}\n`;
      case 'empty': return '';
      case 'tellTarget': {
        this.useRuntime('$rt');
        const name = `$t${++this.tmp}`;
        const inner: Ctx = { ...ctx, timeline: name, withs: [] };
        this.indentLevel++;
        const body = s.body.map((x) => this.stmt(x, inner)).join('');
        this.indentLevel--;
        return `${p}{\n${this.pad(1)}const ${name}: any = $rt.tellTarget(${ctx.timeline}, ${this.expr(s.target, ctx, PREC['='])});\n${body}${p}}\n`;
      }
      case 'ifFrameLoaded': return `${p}${this.stmts(s.body, ctx)}\n`; // content is always fully loaded
      case 'import': return '';
      case 'include':
        this.warn(`#include "${s.path}" could not be resolved`);
        return `${p}// #include ${JSON.stringify(s.path)} (not found)\n`;
      case 'class': case 'interface':
        this.warn(`${s.k} declaration inside frame code ignored`);
        return '';
      case 'on': case 'onClipEvent':
        this.warn(`${s.k === 'on' ? 'on(...)' : 'onClipEvent(...)'} block found inside frame code; emitted inline`);
        return `${p}${this.stmts(s.body, ctx)}\n`;
    }
  }

  private blockOrStmtIndented(s: Stmt, ctx: Ctx): string {
    this.indentLevel++;
    const r = this.blockOrStmt(s, ctx);
    this.indentLevel--;
    return r;
  }

  /** for-in loop variable: TS forbids type annotations there (it is always a string key). */
  private declareLocal(name: string, ctx: Ctx): string {
    const declared = (ctx as CtxWithDeclared).declared;
    const n = safeLocal(name);
    if (declared && declared.has(name)) return n;
    declared?.add(name);
    return `var ${n}`;
  }

  private varStmt(decls: { name: string; type: TypeRef; init: Expr | null }[], ctx: Ctx, p: string): string {
    if (kindOf(ctx.scope) === 'timeline') {
      // frame-level var = timeline variable
      const parts = decls.filter((d) => d.init).map((d) => `${p}${ctx.timeline}.${d.name} = ${this.expr(d.init!, ctx, PREC['='])};\n`);
      return parts.join('');
    }
    const declared = (ctx as CtxWithDeclared).declared ?? new Set<string>();
    const pkg = ctx.cls?.pkg ?? '';
    const fresh: string[] = [];
    const assigns: string[] = [];
    for (const d of decls) {
      const n = safeLocal(d.name);
      const init = d.init ? this.value(d.init, ctx) : null;
      if (declared.has(d.name)) { if (init != null) assigns.push(`${n} = ${init}`); continue; }
      declared.add(d.name);
      fresh.push(`${n}: ${this.mapType(d.type, pkg)}${init != null ? ` = ${init}` : ''}`);
    }
    let out = '';
    if (fresh.length) out += `${p}var ${fresh.join(', ')};\n`;
    for (const a of assigns) out += `${p}${a};\n`;
    return out;
  }

  // --- expressions -------------------------------------------------------------

  /** Expression in a value position: AS2 lets null/undefined flow into any declared type. */
  private value(e: Expr, ctx: Ctx): string {
    if (e.k === 'lit' && (e.v === 'null' || e.v === 'undefined')) return `(${e.v} as any)`;
    return this.expr(e, ctx, PREC['=']);
  }

  private wrap(code: string, prec: number, min: number) { return prec < min ? `(${code})` : code; }

  expr(e: Expr, ctx: Ctx, min: number): string {
    switch (e.k) {
      case 'num': return e.v;
      case 'str': return JSON.stringify(e.v);
      case 'lit':
        if (e.v === 'this') return kindOf(ctx.scope) === 'timeline' ? '$t' : 'this';
        return e.v;
      case 'id': return this.identifier(e.name, ctx, e.line);
      case 'array': return `[${e.items.map((x) => (x ? this.expr(x, ctx, PREC['=']) : 'undefined')).join(', ')}]`;
      case 'object': {
        if (!e.props.length) return '{}';
        const props = e.props.map((pr) => `${VALID_IDENT.test(pr.key) || /^\d+$/.test(pr.key) ? pr.key : JSON.stringify(pr.key)}: ${this.expr(pr.value, ctx, PREC['='])}`);
        return `({ ${props.join(', ')} } as any)`;
      }
      case 'func': return this.wrap(this.funcExpr(e.name, e.params, e.ret, e.body, ctx), P_PRIMARY, min);
      case 'member': return this.member(e, ctx);
      case 'index': return `${this.expr(e.obj, ctx, P_CALL)}${this.isSafe(e.obj, ctx) ? '' : '?.'}[${this.expr(e.index, ctx, 0)}]`;
      case 'call': return this.call(e, ctx, min);
      case 'new': {
        const callee = this.expr(e.callee, ctx, P_CALL);
        return this.wrap(`new ${callee}(${e.args.map((a) => this.expr(a, ctx, PREC['='])).join(', ')})`, P_CALL, min);
      }
      case 'unary': {
        if (e.op === 'typeof') { this.useRuntime('$rt'); return `$rt.typeOf(${this.expr(e.arg, ctx, 0)})`; }
        if (e.op === 'delete' && e.arg.k === 'id' && this.isLocal(e.arg.name, ctx)) return 'false';
        const sep = /^[a-z]/.test(e.op) ? ' ' : '';
        let arg = this.expr(e.arg, ctx, P_UNARY);
        if ((e.op === '-' || e.op === '+') && arg.startsWith(e.op)) arg = `(${arg})`;
        return this.wrap(`${e.op}${sep}${arg}`, P_UNARY, min);
      }
      case 'update': {
        const arg = this.target(e.arg, ctx);
        return this.wrap(e.prefix ? `${e.op}${arg}` : `${arg}${e.op}`, e.prefix ? P_UNARY : P_POSTFIX, min);
      }
      case 'binary': {
        const prec = PREC[e.op];
        return this.wrap(`${this.expr(e.left, ctx, prec)} ${e.op} ${this.expr(e.right, ctx, prec + 1)}`, prec, min);
      }
      case 'assign': {
        if (e.target.k === 'call' && e.target.callee.k === 'id' && e.target.callee.name === 'eval' && !this.isLocal('eval', ctx)) {
          // eval("name") = value  ->  set("name", value)
          this.useRuntime('$rt');
          const name = this.expr(e.target.args[0] ?? { k: 'str', v: '' }, ctx, PREC['=']);
          const value = e.op === '=' ? this.expr(e.value, ctx, PREC['='])
            : `$rt.eval(${ctx.timeline}, ${name}) ${e.op.slice(0, -1)} ${this.wrap(this.expr(e.value, ctx, PREC['=']), 0, 0)}`;
          return this.wrap(`$rt.set(${ctx.timeline}, ${name}, ${value})`, P_CALL, min);
        }
        return this.wrap(`${this.target(e.target, ctx)} ${e.op} ${this.value(e.value, ctx)}`, PREC['='], min);
      }
      case 'cond':
        return this.wrap(`${this.expr(e.test, ctx, PREC['?'] + 1)} ? ${this.expr(e.then, ctx, PREC['='])} : ${this.expr(e.else, ctx, PREC['='])}`, PREC['?'], min);
      case 'seq':
        return this.wrap(e.items.map((x) => this.expr(x, ctx, PREC['='])).join(', '), PREC[','], min);
    }
  }

  private member(e: Extract<Expr, { k: 'member' }>, ctx: Ctx): string {
    // fully-qualified project class reference: com.x.Foo
    const chain = memberChain(e);
    if (chain && !this.isLocal(chain.split('.')[0], ctx)) {
      const q = this.opts.classes?.has(chain) ? chain : null;
      if (q) return this.aliasFor(q);
    }
    const obj = this.expr(e.obj, ctx, P_CALL);
    const q = this.isSafe(e.obj, ctx) ? '' : '?.';
    const prop = e.prop;
    if (!VALID_IDENT.test(prop)) return `${obj}${q}[${JSON.stringify(prop)}]`;
    return `${obj}${q || '.'}${prop}`;
  }

  /**
   * Can this expression be dereferenced without a null guard? AS2 silently
   * yields undefined for `undefined.x` and ignores `undefined.f()`; JS throws,
   * so everything not provably an object gets `?.`.
   */
  private isSafe(e: Expr, ctx: Ctx): boolean {
    switch (e.k) {
      case 'lit': return e.v === 'this';
      case 'new': case 'object': case 'array': case 'str': case 'func': return true;
      case 'id': {
        if (this.isLocal(e.name, ctx)) return e.name === 'arguments' || !!ctx.safe?.has(e.name);
        if (e.name === 'super' || e.name === '_root' || e.name === '_global') return true;
        const cls = ctx.cls;
        if (cls && (cls.statics.has(e.name) || cls.instance.has(e.name))) return false;
        if (this.resolveClassName(e.name, cls?.pkg ?? '')) return true;
        return RUNTIME_FUNCTIONS.has(e.name) || RUNTIME_CLASSES.has(e.name) || JS_GLOBALS.has(e.name);
      }
      case 'member': { const chain = memberChain(e); return !!(chain && this.opts.classes?.has(chain)); }
      default: return false;
    }
  }

  /** Is `obj.method` known to exist (static call on a class/global, or a declared method of this class)? */
  private isKnownMethod(obj: Expr, prop: string, ctx: Ctx): boolean {
    if (obj.k === 'id' && !this.isLocal(obj.name, ctx)) {
      if (obj.name === 'super') return true;
      if (RUNTIME_CLASSES.has(obj.name) || RUNTIME_FUNCTIONS.has(obj.name) || JS_GLOBALS.has(obj.name)) return true;
      if (this.resolveClassName(obj.name, ctx.cls?.pkg ?? '')) return true;
    }
    if (obj.k === 'member') { const chain = memberChain(obj); if (chain && this.opts.classes?.has(chain)) return true; }
    if (obj.k === 'lit' && obj.v === 'this' && ctx.cls && !ctx.cls.dynamicBase && ctx.cls.instance.has(prop)) return true;
    if (obj.k === 'lit' && obj.v === 'this' && !ctx.cls && kindOf(ctx.scope) === 'timeline' && MOVIECLIP_METHODS.has(prop)) return true;
    if ((obj.k === 'str' || obj.k === 'array') && prop in (obj.k === 'str' ? String.prototype : Array.prototype)) return true;
    return false;
  }

  /** Assignment target: writes through a possibly-undefined object are dropped, as in AS2. */
  private target(e: Expr, ctx: Ctx): string {
    if (e.k === 'member' && !this.isSafe(e.obj, ctx) && !memberChainIsClass(e, this.opts.classes)) {
      this.useRuntime('$rt');
      const prop = VALID_IDENT.test(e.prop) ? `.${e.prop}` : `[${JSON.stringify(e.prop)}]`;
      return `(${this.expr(e.obj, ctx, PREC['?'] + 1)} ?? $rt.sink)${prop}`;
    }
    if (e.k === 'index' && !this.isSafe(e.obj, ctx)) {
      this.useRuntime('$rt');
      return `(${this.expr(e.obj, ctx, PREC['?'] + 1)} ?? $rt.sink)[${this.expr(e.index, ctx, 0)}]`;
    }
    return this.expr(e, ctx, P_POSTFIX);
  }

  private call(e: Extract<Expr, { k: 'call' }>, ctx: Ctx, min: number): string {
    const args = () => e.args.map((a) => this.value(a, ctx)).join(', ');
    if (e.callee.k === 'id' && !this.isLocal(e.callee.name, ctx)) {
      const name = e.callee.name;
      if (CONTEXT_FUNCTIONS.has(name)) {
        this.useRuntime('$rt');
        let a: string[];
        if (name === 'getProperty' || name === 'setProperty') {
          // second argument is a property identifier (_x, _alpha, …)
          a = e.args.map((x, i) => (i === 1 && x.k === 'id' ? JSON.stringify(x.name) : this.expr(x, ctx, PREC['='])));
        } else a = e.args.map((x) => this.expr(x, ctx, PREC['=']));
        return this.wrap(`$rt.${name === 'eval' ? 'eval' : name}(${[ctx.timeline, ...a].join(', ')})`, P_CALL, min);
      }
      if (name === 'super' && ctx.cls) return this.wrap(`super(${args()})`, P_CALL, min);
    }
    // AS2 cast syntax: Type(value) where Type is a class (project or Flash)
    if (e.args.length === 1) {
      const castTo = this.castTarget(e.callee, ctx);
      if (castTo) { this.useRuntime('$rt'); return this.wrap(`$rt.cast(${this.expr(e.args[0], ctx, PREC['='])}, ${castTo})`, P_CALL, min); }
    }
    if (e.callee.k === 'member' && e.callee.obj.k === 'id' && e.callee.obj.name === 'Object' && e.callee.prop === 'registerClass' && !this.isLocal('Object', ctx)) {
      this.useRuntime('$rt');
      return this.wrap(`$rt.registerLinkage(${args()})`, P_CALL, min);
    }
    // AS2 ignores calls to undefined functions / on undefined objects: guard unless known to exist
    let callee: string;
    let guard = '?.';
    if (e.callee.k === 'member') {
      callee = this.expr(e.callee, ctx, P_CALL);
      if (this.isKnownMethod(e.callee.obj, e.callee.prop, ctx)) guard = '';
    } else if (e.callee.k === 'id') {
      callee = this.expr(e.callee, ctx, P_CALL);
      const n = e.callee.name;
      if (this.isLocal(n, ctx) ? ctx.safe?.has(n) : ((!ctx.cls && MOVIECLIP_METHODS.has(n)) || RUNTIME_FUNCTIONS.has(n) || RUNTIME_CLASSES.has(n) || JS_GLOBALS.has(n)
        || !!this.resolveClassName(n, ctx.cls?.pkg ?? '') || (!!ctx.cls && !ctx.cls.dynamicBase && (ctx.cls.instance.has(n) || ctx.cls.statics.has(n))))) guard = '';
    } else {
      callee = this.expr(e.callee, ctx, P_CALL);
      if (e.callee.k === 'func') guard = '';
    }
    return this.wrap(`${callee}${guard}(${args()})`, P_CALL, min);
  }

  private castTarget(callee: Expr, ctx: Ctx): string | null {
    const chain = memberChain(callee);
    if (!chain || this.isLocal(chain.split('.')[0], ctx)) return null;
    const q = this.opts.classes?.has(chain) ? chain : !chain.includes('.') ? this.resolveClassName(chain, ctx.cls?.pkg ?? '') : null;
    if (q) return this.aliasFor(q);
    if (!chain.includes('.') && RUNTIME_CLASSES.has(chain) && /^[A-Z]/.test(chain) && !['Key', 'Mouse', 'Stage', 'Selection', 'System', 'SharedObject', 'AsBroadcaster', 'Camera', 'Microphone', 'Accessibility'].includes(chain)) {
      this.useRuntime(chain);
      return chain;
    }
    return null;
  }

  private isLocal(name: string, ctx: Ctx): boolean {
    for (let s: Scope | null = ctx.scope; s; s = s.parent) {
      if (s.names.has(name)) return true;
      if (s.kind === 'timeline') return false;
    }
    return false;
  }

  private identifier(name: string, ctx: Ctx, line?: number): string {
    if (name.includes('§')) {
      this.warn(`FFDec decompiler marker "${name}" – the original bytecode could not be decompiled here; review by hand`, line);
      this.useRuntime('$rt');
      return `$rt.ffdec(${JSON.stringify(name)})`;
    }
    if (this.isLocal(name, ctx)) return safeLocal(name);

    // with(obj) { x } – look the name up on the with-objects first
    const onTimeline = (n: string) => {
      if (ctx.withs.length) {
        this.useRuntime('$rt');
        return `$rt.scope([${[...ctx.withs, ctx.timeline].join(', ')}], ${JSON.stringify(n)})${VALID_IDENT.test(n) ? '.' + n : `[${JSON.stringify(n)}]`}`;
      }
      return VALID_IDENT.test(n) ? `${ctx.timeline}.${n}` : `${ctx.timeline}[${JSON.stringify(n)}]`;
    };

    const cls = ctx.cls;
    if (cls) {
      if (cls.statics.has(name)) return `${cls.name}.${name}`;
      if (cls.instance.has(name) && !ctx.isStatic) return `this.${name}`;
    }
    // project classes (imported, same package or default package)
    const q = this.resolveClassName(name, cls?.pkg ?? '');
    if (q) return this.aliasFor(q);
    const lvl = /^_level(\d+)$/.exec(name);
    if (lvl) { this.useRuntime('$rt'); return `$rt.level(${lvl[1]})`; }
    if (name === '_root') {
      if (cls) { this.useRuntime('$rt'); return '$rt.root'; }
      return onTimeline('_root');
    }
    if (name === '_parent' && cls && !ctx.isStatic) return 'this._parent';
    if (RUNTIME_FUNCTIONS.has(name) || RUNTIME_CLASSES.has(name)) { this.useRuntime(name); return name; }
    if (JS_GLOBALS.has(name)) return name;
    if (name === 'arguments') return 'arguments';
    if (cls) {
      if (cls.dynamicBase && !ctx.isStatic) return `this.${name}`;
      this.useRuntime('_global');
      return `_global.${name}`;
    }
    return onTimeline(name);
  }
}

type CtxWithDeclared = Ctx & { declared?: Set<string> };

/** Scope kind that owns `var` declarations (catch blocks are transparent). */
function kindOf(scope: Scope): Scope['kind'] {
  let s: Scope = scope;
  while (s.kind === 'catch' && s.parent) s = s.parent;
  return s.kind;
}

// ------------------------------------------------------------------ helpers

/** var / function names declared anywhere in a function body (not inside nested functions). */
export function collectDeclarations(body: Stmt[], into: Set<string>) {
  const visit = (s: Stmt | null) => {
    if (!s) return;
    switch (s.k) {
      case 'var': for (const d of s.decls) into.add(d.name); break;
      case 'function': into.add(s.name); break;
      case 'block': case 'ifFrameLoaded': case 'tellTarget': case 'on': case 'onClipEvent': s.body.forEach(visit); break;
      case 'if': visit(s.then); visit(s.else); break;
      case 'for': if (s.init && (s.init as Stmt).k === 'var') visit(s.init as Stmt); visit(s.body); break;
      case 'forin': if (s.left.decl && s.left.target.k === 'id') into.add(s.left.target.name); visit(s.body); break;
      case 'while': case 'dowhile': case 'with': case 'label': visit(s.body); break;
      case 'switch': for (const c of s.cases) c.body.forEach(visit); break;
      case 'try': s.block.forEach(visit); s.handler?.forEach(visit); s.finalizer?.forEach(visit); break;
    }
  };
  body.forEach(visit);
}

/** Does a function body (excluding nested functions) read `arguments`? */
function usesArguments(body: Stmt[]): boolean {
  let found = false;
  const ex = (e: Expr | null | undefined): void => {
    if (!e || found) return;
    switch (e.k) {
      case 'id': if (e.name === 'arguments') found = true; break;
      case 'func': break;
      case 'member': ex(e.obj); break;
      case 'index': ex(e.obj); ex(e.index); break;
      case 'call': case 'new': ex(e.callee); e.args.forEach(ex); break;
      case 'unary': case 'update': ex(e.arg); break;
      case 'binary': ex(e.left); ex(e.right); break;
      case 'assign': ex(e.target); ex(e.value); break;
      case 'cond': ex(e.test); ex(e.then); ex(e.else); break;
      case 'seq': e.items.forEach(ex); break;
      case 'array': e.items.forEach((x) => ex(x)); break;
      case 'object': e.props.forEach((p) => ex(p.value)); break;
      default: break;
    }
  };
  const st = (s: Stmt | null): void => {
    if (!s || found) return;
    switch (s.k) {
      case 'expr': ex(s.e); break;
      case 'var': s.decls.forEach((d) => ex(d.init)); break;
      case 'block': case 'ifFrameLoaded': case 'tellTarget': case 'on': case 'onClipEvent': s.body.forEach(st); break;
      case 'if': ex(s.test); st(s.then); st(s.else); break;
      case 'for': if (s.init && (s.init as Stmt).k === 'var') st(s.init as Stmt); else ex(s.init as Expr | null); ex(s.test); ex(s.update); st(s.body); break;
      case 'forin': ex(s.obj); st(s.body); break;
      case 'while': case 'dowhile': ex(s.test); st(s.body); break;
      case 'with': ex(s.obj); st(s.body); break;
      case 'label': st(s.body); break;
      case 'switch': ex(s.disc); s.cases.forEach((c) => { ex(c.test); c.body.forEach(st); }); break;
      case 'return': case 'throw': ex(s.arg); break;
      case 'try': s.block.forEach(st); s.handler?.forEach(st); s.finalizer?.forEach(st); break;
      default: break;
    }
  };
  body.forEach(st);
  return found;
}

function memberChainIsClass(e: Expr, classes?: Map<string, KnownClass>): boolean {
  const chain = memberChain(e);
  return !!(chain && classes?.has(chain));
}

/** Locals whose every assignment is an object/array/function/new expression (never undefined once set). */
function safeLocals(body: Stmt[], params: Param[]): Set<string> {
  const good = new Set<string>();
  const bad = new Set<string>(params.map((p) => p.name));
  const isObj = (e: Expr | null) => !!e && (e.k === 'new' || e.k === 'object' || e.k === 'array' || e.k === 'func');
  const note = (name: string, e: Expr | null) => { if (isObj(e)) good.add(name); else bad.add(name); };
  const ex = (e: Expr | null | undefined): void => {
    if (!e) return;
    switch (e.k) {
      case 'assign': if (e.target.k === 'id') note(e.target.name, e.op === '=' ? e.value : null); ex(e.target); ex(e.value); break;
      case 'update': if (e.arg.k === 'id') bad.add(e.arg.name); ex(e.arg); break;
      case 'member': ex(e.obj); break;
      case 'index': ex(e.obj); ex(e.index); break;
      case 'call': case 'new': ex(e.callee); e.args.forEach(ex); break;
      case 'unary': ex(e.arg); break;
      case 'binary': ex(e.left); ex(e.right); break;
      case 'cond': ex(e.test); ex(e.then); ex(e.else); break;
      case 'seq': e.items.forEach(ex); break;
      case 'array': e.items.forEach((x) => ex(x)); break;
      case 'object': e.props.forEach((p) => ex(p.value)); break;
      default: break; // nested functions have their own scope
    }
  };
  const st = (s: Stmt | null): void => {
    if (!s) return;
    switch (s.k) {
      case 'expr': ex(s.e); break;
      case 'var': for (const d of s.decls) { if (d.init) note(d.name, d.init); ex(d.init); } break;
      case 'function': good.add(s.name); break;
      case 'block': case 'ifFrameLoaded': case 'tellTarget': case 'on': case 'onClipEvent': s.body.forEach(st); break;
      case 'if': ex(s.test); st(s.then); st(s.else); break;
      case 'for': if (s.init && (s.init as Stmt).k === 'var') st(s.init as Stmt); else ex(s.init as Expr | null); ex(s.test); ex(s.update); st(s.body); break;
      case 'forin': if (s.left.target.k === 'id') bad.add(s.left.target.name); ex(s.obj); st(s.body); break;
      case 'while': case 'dowhile': ex(s.test); st(s.body); break;
      case 'with': ex(s.obj); st(s.body); break;
      case 'label': st(s.body); break;
      case 'switch': ex(s.disc); for (const c of s.cases) { ex(c.test); c.body.forEach(st); } break;
      case 'return': case 'throw': ex(s.arg); break;
      case 'try': s.block.forEach(st); if (s.param) bad.add(s.param); s.handler?.forEach(st); s.finalizer?.forEach(st); break;
      default: break;
    }
  };
  body.forEach(st);
  for (const b of bad) good.delete(b);
  return good;
}

function memberChain(e: Expr): string | null {
  if (e.k === 'id') return e.name;
  if (e.k === 'member') { const l = memberChain(e.obj); return l ? `${l}.${e.prop}` : null; }
  return null;
}

function safeLocal(name: string): string {
  if (TS_RESERVED.has(name) && name !== 'arguments') return `${name}_`;
  if (!VALID_IDENT.test(name)) return name.replace(/[^\w$]/g, '_');
  return name;
}

/** Relative import specifier from one project module to another (both root-relative, no extension). */
export function relativeModule(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  const rel = [...Array(up).fill('..'), ...b.slice(i)].join('/');
  return up === 0 ? `./${rel}` : rel;
}

