// Maps an FFDec "export scripts" folder (AS1/AS2) to a TypeScript project.
//
// Recognised layout (FFDec 11–24, both "DefineSprite_12" and "DefineSprite_12_linkage"
// folder styles, and the older "...Tag_" names):
//   scripts/frame_1/DoAction.as                       main timeline frame 1
//   scripts/frame_1/DoAction_2.as                     second DoAction on that frame (appended)
//   scripts/DefineSprite_12/frame_3/DoAction.as       sprite 12, frame 3
//   scripts/DefineSprite_12/DoInitAction.as           #initclip code of sprite 12
//   scripts/DefineButton2_40/on(release).as           button 40 handlers
//   scripts/frame_1/PlaceObject2_45_7/onClipEvent(load).as   clip actions of the instance at depth 7
//   scripts/__Packages/com/x/Foo.as                   AS2 class com.x.Foo
// File contents decide handler types (on(...) / onClipEvent(...) blocks), not names.

import type { ClassDecl, Stmt } from './ast';
import { ModuleEmitter, type Diagnostic, type KnownClass } from './emit';
import { LexError } from './lexer';
import { ParseError, parseProgram } from './parser';

export interface ProjectOptions {
  /** module specifier the generated code imports its runtime from (default "@/runtime/as2") */
  runtime?: string;
}

export interface ProjectFile { path: string; content: string }

export interface FileReport {
  source: string;
  target: string | null;
  role: string;
  diagnostics: Diagnostic[];
}

export interface ProjectResult {
  /** generated files: relative path -> TypeScript source */
  files: Map<string, string>;
  report: FileReport[];
  /** markdown summary (also included in `files` as as2ts-report.md) */
  summary: string;
}

type Role =
  | { kind: 'frame'; timeline: number; frame: number }
  | { kind: 'init'; timeline: number }
  | { kind: 'button'; button: number }
  | { kind: 'placement'; timeline: number; frame: number; character: number; depth: number }
  | { kind: 'class' }
  | { kind: 'initByName'; name: string }
  | { kind: 'unknown' };

const RE = {
  sprite: /DefineSprite(?:Tag)?_(\d+)/i,
  frame: /(?:^|\/)frame_?(\d+)(?:\/|\.as$)/i,
  button: /DefineButton2?(?:Tag)?_(\d+)/i,
  // PlaceObject2_<char>_<depth>, or (FFDec ≥ 22) PlaceObject2_<char>_<instanceName>_<depth>
  place: /PlaceObject\d?(?:Tag)?_(\d+)(?:_(?:[^/]*_)?(\d+))?(?=\/|$)/i,
  // FFDec ≥ 22 files a sprite's DoInitAction under "<default package>/<linkageName>.as"
  defaultPackage: /(?:^|\/)(?:%3Cdefault(?: |%20)package%3E|<default package>)\/([^/]+)\.as$/i,
  depth: /depth_?(\d+)/i,
  init: /DoInitAction/i,
  packages: /(?:^|\/)__Packages\/(.+)\.as$/i,
};

export function classify(path: string): Role {
  const p = path.replace(/\\/g, '/');
  if (RE.packages.test(p)) return { kind: 'class' };
  const dp = RE.defaultPackage.exec(p);
  if (dp) return { kind: 'initByName', name: decodeURIComponent(dp[1]) };
  const sprite = RE.sprite.exec(p);
  const timeline = sprite ? Number(sprite[1]) : 0;
  const button = RE.button.exec(p);
  if (button) return { kind: 'button', button: Number(button[1]) };
  const frame = RE.frame.exec(p);
  const place = RE.place.exec(p);
  if (place && frame) {
    const depth = place[2] != null ? Number(place[2]) : Number(RE.depth.exec(p)?.[1] ?? place[1]);
    return { kind: 'placement', timeline, frame: Number(frame[1]), character: place[2] != null ? Number(place[1]) : 0, depth };
  }
  if (RE.init.test(p)) {
    const own = /DoInitAction(?:Tag)?_(\d+)/i.exec(p);
    return { kind: 'init', timeline: own ? Number(own[1]) : timeline };
  }
  if (frame) return { kind: 'frame', timeline, frame: Number(frame[1]) };
  return { kind: 'unknown' };
}

interface Parsed { file: ProjectFile; role: Role; body: Stmt[] | null; error: string | null; line?: number }

// "frame_1/DoAction.as" must come before "frame_1/DoAction_2.as" (tag order in the SWF)
const natural = (a: string, b: string) => a.replace(/\.as$/i, '').localeCompare(b.replace(/\.as$/i, ''), undefined, { numeric: true });

export function transpileProject(input: ProjectFile[], options: ProjectOptions = {}): ProjectResult {
  const runtime = options.runtime ?? '@/runtime/as2';
  const files = new Map<string, string>();
  const report: FileReport[] = [];
  const byPath = new Map(input.map((f) => [f.path.replace(/\\/g, '/'), f]));

  // ------------------------------------------------------------ parse all
  const parsed: Parsed[] = [];
  for (const file of [...input].sort((a, b) => natural(a.path, b.path))) {
    if (!/\.as$/i.test(file.path)) continue;
    const path = file.path.replace(/\\/g, '/');
    let role = classify(path);
    try {
      const body = inlineIncludes(parseProgram(file.content), path, byPath, new Set([path]));
      if ((role.kind === 'unknown' || role.kind === 'initByName') && body.some((s) => s.k === 'class')) role = { kind: 'class' };
      // FFDec names a DoInitAction of an exported sprite after its linkage name: scripts/<exportName>.as
      else if (role.kind === 'unknown' && /^(?:scripts\/)?[^/]+\.as$/i.test(path.replace(/^.*?(scripts\/)/i, 'scripts/')) && !path.includes('__Packages')) {
        role = { kind: 'initByName', name: path.split('/').pop()!.replace(/\.as$/i, '') };
      }
      parsed.push({ file: { path, content: file.content }, role, body, error: null });
    } catch (err) {
      const line = err instanceof ParseError || err instanceof LexError ? err.line : undefined;
      parsed.push({ file: { path, content: file.content }, role, body: null, error: (err as Error).message, line });
    }
  }

  // ------------------------------------------------------------ classes
  const classes = new Map<string, KnownClass>();
  const classDecls: { decl: ClassDecl; source: Parsed }[] = [];
  for (const p of parsed) {
    if (!p.body) continue;
    for (const s of p.body) {
      if (s.k !== 'class' || s.decl.intrinsic) continue;
      const module = `classes/${s.decl.name.replace(/\./g, '/')}`;
      classes.set(s.decl.name, {
        name: s.decl.name, module, extends: s.decl.extends,
        members: s.decl.members.map((m) => ({ name: m.name, isStatic: m.isStatic, field: m.kind === 'field' })),
      });
      classDecls.push({ decl: s.decl, source: p });
    }
  }
  for (const { decl, source } of classDecls) {
    const module = classes.get(decl.name)!.module;
    const em = new ModuleEmitter({ runtime, selfModule: module, classes });
    // `import` statements of the file apply to the class
    const imports = source.body!.filter((s) => s.k === 'import');
    const code = em.classModule({ ...decl, members: decl.members.map((m) => ({ ...m, body: [...imports, ...m.body] })) });
    files.set(`${module}.ts`, banner(source.file.path) + code);
    report.push({ source: source.file.path, target: `${module}.ts`, role: `class ${decl.name}`, diagnostics: em.diagnostics });
  }

  // ------------------------------------------------------------ timelines & buttons
  interface TimelineAcc { frames: Map<number, Parsed[]>; placements: Map<string, Parsed[]>; init: Parsed[] }
  const timelines = new Map<number, TimelineAcc>();
  const buttons = new Map<number, Parsed[]>();
  const initsByName = new Map<string, Parsed[]>();
  const tl = (id: number) => {
    let t = timelines.get(id);
    if (!t) timelines.set(id, (t = { frames: new Map(), placements: new Map(), init: [] }));
    return t;
  };
  for (const p of parsed) {
    const r = p.role;
    switch (r.kind) {
      case 'frame': { const t = tl(r.timeline); t.frames.set(r.frame, [...(t.frames.get(r.frame) ?? []), p]); break; }
      case 'init': tl(r.timeline).init.push(p); break;
      case 'placement': {
        const t = tl(r.timeline);
        const key = `${r.frame}:${r.depth}`;
        t.placements.set(key, [...(t.placements.get(key) ?? []), p]);
        break;
      }
      case 'button': buttons.set(r.button, [...(buttons.get(r.button) ?? []), p]); break;
      case 'initByName': initsByName.set(r.name, [...(initsByName.get(r.name) ?? []), p]); break;
      case 'class':
        if (p.error) report.push({ source: p.file.path, target: null, role: 'class', diagnostics: [{ level: 'error', message: p.error, line: p.line }] });
        break;
      case 'unknown':
        report.push({
          source: p.file.path, target: null, role: 'unmapped',
          diagnostics: [{ level: 'warning', message: p.error ?? 'Path does not match the FFDec export layout (frame_N / DefineSprite_N / DefineButton_N / PlaceObject / __Packages); skipped' }],
        });
        break;
    }
  }

  const timelineModules: [number, string][] = [];
  for (const [id, acc] of [...timelines].sort((a, b) => a[0] - b[0])) {
    const module = id === 0 ? 'timelines/root' : `timelines/sprite_${id}`;
    const em = new ModuleEmitter({ runtime, selfModule: module, classes });
    const diags: Diagnostic[] = [];
    const sources: string[] = [];
    const parts: string[] = [];

    const fnFor = (list: Parsed[]): string => {
      const ok = list.filter((p) => p.body);
      for (const p of list) {
        sources.push(p.file.path);
        if (p.error) diags.push({ level: 'error', message: `${p.file.path}: ${p.error}`, line: p.line });
      }
      const failed = list.filter((p) => p.error);
      const body = ok.flatMap((p) => p.body!.filter((s) => s.k !== 'on' && s.k !== 'onClipEvent'));
      let code = em.timelineFunction(body);
      if (failed.length) {
        em.useRuntime('$rt');
        const calls = failed.map((p) => `  $rt.untranslated(${JSON.stringify(p.file.path)}, ${JSON.stringify(p.error)});\n`).join('');
        code = code.replace(/\{\n/, `{\n${calls}`);
      }
      return code;
    };

    if (acc.init.length) parts.push(`/** DoInitAction (runs once before the sprite's first frame). */\nexport const init = ${indent(fnFor(acc.init), 0)};`);
    if (acc.frames.size) {
      const entries = [...acc.frames].sort((a, b) => a[0] - b[0]).map(([frame, list]) => `  ${frame}: ${indent(fnFor(list), 1)},`);
      parts.push(`/** Frame scripts, keyed by 1-based frame number. */\nexport const frames: Record<number, (this: AS2Clip) => void> = {\n${entries.join('\n')}\n};`);
    }
    if (acc.placements.size) {
      em.useRuntime('AS2Handler', true);
      const entries: string[] = [];
      for (const [key, list] of [...acc.placements].sort((a, b) => natural(a[0], b[0]))) {
        const handlers = list.flatMap((p) => handlerEntries(em, p, diags, sources, 2, (p.role as Extract<Role, { kind: 'placement' }>).character));
        entries.push(`  ${JSON.stringify(key)}: [\n${handlers.join('\n')}\n  ],`);
      }
      parts.push(`/** Clip actions of instances placed on this timeline, keyed by "frame:depth". */\nexport const placements: Record<string, AS2Handler[]> = {\n${entries.join('\n')}\n};`);
    }
    const code = banner(sources.join(', ')) + em.header() + parts.join('\n\n') + '\n';
    files.set(`${module}.ts`, code);
    timelineModules.push([id, module]);
    report.push({ source: sources.join('\n'), target: `${module}.ts`, role: id === 0 ? 'main timeline' : `sprite ${id}`, diagnostics: [...diags, ...em.diagnostics] });
  }

  const buttonModules: [number, string][] = [];
  for (const [id, list] of [...buttons].sort((a, b) => a[0] - b[0])) {
    const module = `buttons/button_${id}`;
    const em = new ModuleEmitter({ runtime, selfModule: module, classes });
    em.useRuntime('AS2Handler', true);
    const diags: Diagnostic[] = [];
    const sources: string[] = [];
    const handlers = list.flatMap((p) => handlerEntries(em, p, diags, sources, 1));
    const body = `/** Button actions. Handlers run with \`this\` = the timeline that contains the button. */\nexport const handlers: AS2Handler[] = [\n${handlers.join('\n')}\n];\n`;
    files.set(`${module}.ts`, banner(sources.join(', ')) + em.header() + body);
    buttonModules.push([id, module]);
    report.push({ source: sources.join('\n'), target: `${module}.ts`, role: `button ${id}`, diagnostics: [...diags, ...em.diagnostics] });
  }

  const initModules: [string, string][] = [];
  for (const [name, list] of [...initsByName].sort((a, b) => natural(a[0], b[0]))) {
    const module = `init/${name.replace(/[^\w$]/g, '_')}`;
    const em = new ModuleEmitter({ runtime, selfModule: module, classes });
    const diags: Diagnostic[] = [];
    for (const p of list) if (p.error) diags.push({ level: 'error', message: `${p.file.path}: ${p.error}`, line: p.line });
    const body = list.flatMap((p) => p.body ?? []);
    const fn = em.timelineFunction(body);
    const code = `/** DoInitAction of the sprite exported as "${name}" (runs once, before the frame it is defined on). */\nexport const init = ${fn};\n`;
    files.set(`${module}.ts`, banner(list.map((p) => p.file.path).join(', ')) + em.header() + code);
    initModules.push([name, module]);
    report.push({ source: list.map((p) => p.file.path).join('\n'), target: `${module}.ts`, role: `init action of "${name}"`, diagnostics: [...diags, ...em.diagnostics] });
  }

  // ------------------------------------------------------------ index
  const idx: string[] = [`import type { AS2Program } from ${JSON.stringify(runtime)};`];
  for (const [id, m] of timelineModules) idx.push(`import * as ${id === 0 ? 'root' : `sprite_${id}`} from './${m}';`);
  for (const [id, m] of buttonModules) idx.push(`import { handlers as button_${id} } from './${m}';`);
  const classList = [...classes.values()].sort((a, b) => natural(a.name, b.name));
  classList.forEach((c, i) => idx.push(`import { ${c.name.split('.').pop()} as class_${i} } from './${c.module}';`));
  initModules.forEach(([, m], i) => idx.push(`import { init as init_${i} } from './${m}';`));
  idx.push('');
  idx.push('export const program: AS2Program = {');
  idx.push(`  timelines: {${timelineModules.map(([id]) => `\n    ${id}: ${id === 0 ? 'root' : `sprite_${id}`},`).join('')}\n  },`);
  idx.push(`  buttons: {${buttonModules.map(([id]) => `\n    ${id}: button_${id},`).join('')}\n  },`);
  idx.push(`  classes: {${classList.map((c, i) => `\n    ${JSON.stringify(c.name)}: class_${i},`).join('')}\n  },`);
  idx.push(`  initByName: {${initModules.map(([n], i) => `\n    ${JSON.stringify(n)}: init_${i},`).join('')}\n  },`);
  idx.push('};');
  idx.push('');
  idx.push('export default program;');
  files.set('index.ts', banner('as2ts project index') + idx.join('\n') + '\n');

  const summary = renderSummary(report, input.length);
  files.set('as2ts-report.md', summary);
  return { files, report, summary };
}

function handlerEntries(em: ModuleEmitter, p: Parsed, diags: Diagnostic[], sources: string[], level: number, character?: number): string[] {
  const pad = '  '.repeat(level);
  sources.push(p.file.path);
  if (!p.body) {
    diags.push({ level: 'error', message: `${p.file.path}: ${p.error}`, line: p.line });
    return [`${pad}// ${p.file.path}: not translated – ${p.error}`];
  }
  const out: string[] = [];
  const loose: Stmt[] = [];
  const ch = character ? `character: ${character}, ` : '';
  for (const s of p.body) {
    if (s.k === 'on') out.push(`${pad}{ ${ch}kind: 'on', events: ${JSON.stringify(s.events)}, run: ${indent(em.timelineFunction(s.body), level)} },`);
    else if (s.k === 'onClipEvent') out.push(`${pad}{ ${ch}kind: 'onClipEvent', events: [${JSON.stringify(s.event)}], run: ${indent(em.timelineFunction(s.body), level)} },`);
    else if (s.k !== 'empty' && s.k !== 'import') loose.push(s);
  }
  if (loose.length) {
    // FFDec sometimes writes the handler body without the on(...) wrapper and puts the event in the file name.
    const m = /(on|onClipEvent)\(([^)]*)\)(?:_\d+)?\.as$/i.exec(p.file.path);
    if (m) {
      const kind = m[1] === 'on' ? 'on' : 'onClipEvent';
      const events = m[2].split(',').map((e) => e.trim()).filter(Boolean);
      out.push(`${pad}{ ${ch}kind: '${kind}', events: ${JSON.stringify(events)}, run: ${indent(em.timelineFunction(loose), level)} },`);
    } else diags.push({ level: 'warning', message: `${p.file.path}: statements outside on()/onClipEvent() blocks were ignored` });
  }
  return out;
}

/** Replaces `#include "x.as"` with the parsed content of the referenced file. */
function inlineIncludes(body: Stmt[], from: string, files: Map<string, ProjectFile>, stack: Set<string>): Stmt[] {
  if (!body.some((s) => s.k === 'include')) return body;
  const out: Stmt[] = [];
  for (const s of body) {
    if (s.k !== 'include') { out.push(s); continue; }
    const target = joinPath(from, s.path);
    const file = files.get(target) ?? [...files.values()].find((f) => f.path.replace(/\\/g, '/').endsWith('/' + s.path.replace(/^\.\//, '')));
    const key = file?.path.replace(/\\/g, '/');
    if (!file || !key || stack.has(key)) { out.push(s); continue; }
    out.push(...inlineIncludes(parseProgram(file.content), key, files, new Set([...stack, key])));
  }
  return out;
}

function joinPath(from: string, rel: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const seg of rel.replace(/\\/g, '/').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg) parts.push(seg);
  }
  return parts.join('/');
}

function indent(code: string, level: number): string {
  const pad = '  '.repeat(level);
  return code.split('\n').map((l, i) => (i === 0 || !l ? l : pad + l)).join('\n');
}

function banner(source: string): string {
  return `// Generated by as2ts from ${source}\n// Edit freely – this is now ordinary TypeScript.\n\n`;
}

function renderSummary(report: FileReport[], inputCount: number): string {
  const errors = report.flatMap((r) => r.diagnostics.filter((d) => d.level === 'error'));
  const warnings = report.flatMap((r) => r.diagnostics.filter((d) => d.level === 'warning'));
  const lines = [
    '# as2ts report',
    '',
    `Input files: ${inputCount} · Generated modules: ${report.filter((r) => r.target).length} · Errors: ${errors.length} · Warnings: ${warnings.length}`,
    '',
    '| Output | Role | Source |',
    '|---|---|---|',
    ...report.filter((r) => r.target).map((r) => `| \`${r.target}\` | ${r.role} | ${r.source.split('\n').map((s) => `\`${s}\``).join('<br>')} |`),
    '',
  ];
  const withDiags = report.filter((r) => r.diagnostics.length);
  if (withDiags.length) {
    lines.push('## Diagnostics', '');
    for (const r of withDiags) {
      lines.push(`### ${r.target ?? r.source}`, '');
      for (const d of r.diagnostics) lines.push(`- **${d.level}**${d.line ? ` (line ${d.line})` : ''}: ${d.message}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
