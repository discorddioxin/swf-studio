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

export interface TimelineNameMetadata {
  /** Human-readable name shown in Workbench (for example, "rod 3"). */
  name?: string;
  /** 1-based SWF frame number to Workbench frame label (for example, 1 → "idle"). */
  frameLabels?: ReadonlyMap<number, string> | Readonly<Record<number, string>>;
}

export type TimelineNameIndex = ReadonlyMap<number, TimelineNameMetadata> | Readonly<Record<number, TimelineNameMetadata>>;

export interface ProjectOptions {
  avm1?: 'decode' | 'interpret';
  /** module specifier the generated code imports its runtime from (default "@/runtime/as2") */
  runtime?: string;
  /** Optional names/labels from the Workbench SWF document and project annotations. */
  timelineMetadata?: TimelineNameIndex;
}

export interface ProjectFile {
  path: string;
  content: string;
  /** Metadata copied from the SWF tag that supplied a synthesized/external init script. */
  tagOrder?: number;
  targetSpriteId?: number;
}

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
    // The `_2` suffix is FFDec's ordinal for a second init-action file, not a
    // sprite id. Only the owning DefineSprite directory carries target scope.
    return { kind: 'init', timeline };
  }
  if (frame) return { kind: 'frame', timeline, frame: Number(frame[1]) };
  return { kind: 'unknown' };
}

interface Parsed { file: ProjectFile; role: Role; body: Stmt[] | null; error: string | null; line?: number }

// "frame_1/DoAction.as" must come before "frame_1/DoAction_2.as" (tag order in the SWF)
const natural = (a: string, b: string) => a.replace(/\.as$/i, '').localeCompare(b.replace(/\.as$/i, ''), undefined, { numeric: true });

function timelineMetadataAt(index: TimelineNameIndex | undefined, id: number): TimelineNameMetadata | undefined {
  if (!index) return undefined;
  return typeof (index as ReadonlyMap<number, TimelineNameMetadata>).get === 'function'
    ? (index as ReadonlyMap<number, TimelineNameMetadata>).get(id)
    : (index as Readonly<Record<number, TimelineNameMetadata>>)[id];
}

function frameLabelAt(metadata: TimelineNameMetadata | undefined, frame: number): string | undefined {
  const labels = metadata?.frameLabels;
  if (!labels) return undefined;
  const value = typeof (labels as ReadonlyMap<number, string>).get === 'function'
    ? (labels as ReadonlyMap<number, string>).get(frame)
    : (labels as Readonly<Record<number, string>>)[frame];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function timelineFrameLabels(metadata: TimelineNameMetadata | undefined): [number, string][] {
  const labels = metadata?.frameLabels;
  if (!labels) return [];
  let entries: [number, string][];
  if (typeof (labels as ReadonlyMap<number, string>).entries === 'function') {
    entries = [...(labels as ReadonlyMap<number, string>).entries()];
  } else {
    entries = Object.entries(labels as Readonly<Record<number, string>>)
      .map(([frame, label]) => [Number(frame), label] as [number, string]);
  }
  return entries
    .filter(([frame, label]) => Number.isInteger(frame) && frame > 0 && typeof label === 'string' && !!label.trim())
    .map(([frame, label]) => [frame, label.trim()] as [number, string])
    .sort((a, b) => a[0] - b[0]);
}

/** Stable, readable path/identifier fragment derived from a Workbench label. */
function nameSegment(value: string, fallback: string): string {
  const cleaned = value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_$]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toLowerCase();
  const segment = cleaned || fallback;
  return /^[a-z_$]/.test(segment) ? segment : `_${segment}`;
}

function uniqueSegment(base: string, used: Set<string>, suffix: string): string {
  let candidate = base;
  if (used.has(candidate)) candidate = `${base}_${suffix}`;
  let index = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix}_${index++}`;
  used.add(candidate);
  return candidate;
}

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
    const projectFile: ProjectFile = { ...file, path };
    let role = classify(path);
    if (projectFile.targetSpriteId != null && role.kind === 'init') {
      role = { kind: 'init', timeline: projectFile.targetSpriteId };
    }
    try {
      const sourceBody = parseProgram(file.content);
      const body = inlineIncludes(sourceBody, path, byPath, new Set([path]));
      if ((role.kind === 'unknown' || role.kind === 'initByName') && body.some((s) => s.k === 'class')) role = { kind: 'class' };
      // FFDec names a DoInitAction of an exported sprite after its linkage name: scripts/<exportName>.as
      else if (role.kind === 'unknown' && /^(?:scripts\/)?[^/]+\.as$/i.test(path.replace(/^.*?(scripts\/)/i, 'scripts/')) && !path.includes('__Packages')) {
        role = { kind: 'initByName', name: path.split('/').pop()!.replace(/\.as$/i, '') };
      }
      parsed.push({ file: projectFile, role, body, error: null });
    } catch (err) {
      const line = err instanceof ParseError || err instanceof LexError ? err.line : undefined;
      parsed.push({ file: projectFile, role, body: null, error: (err as Error).message, line });
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
    const em = new ModuleEmitter({ runtime, selfModule: module, classes, avm1: options.avm1 });
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

  interface TimelineModule { id: number; module: string; alias: string; displayName?: string; metadata?: TimelineNameMetadata }
  const timelineModules: TimelineModule[] = [];
  const timelineBindings = new Map<number, TimelineModule>();
  const usedTimelinePaths = new Set<string>();
  const usedTimelineAliases = new Set<string>();
  for (const [id] of [...timelines].sort((a, b) => a[0] - b[0])) {
    const metadata = timelineMetadataAt(options.timelineMetadata, id);
    const displayName = metadata?.name?.trim() || undefined;
    if (id === 0) {
      usedTimelinePaths.add('root');
      usedTimelineAliases.add('root');
      timelineBindings.set(id, { id, module: 'timelines/root', alias: 'root', displayName, metadata });
      continue;
    }
    const fallback = `sprite_${id}`;
    const slug = displayName ? nameSegment(displayName, fallback) : fallback;
    const moduleName = uniqueSegment(slug, usedTimelinePaths, String(id));
    const aliasBase = displayName ? `timeline_${slug}` : fallback;
    const alias = uniqueSegment(aliasBase, usedTimelineAliases, String(id));
    timelineBindings.set(id, { id, module: `timelines/${moduleName}`, alias, displayName, metadata });
  }

  for (const [id, acc] of [...timelines].sort((a, b) => a[0] - b[0])) {
    const binding = timelineBindings.get(id)!;
    const { module, displayName, metadata } = binding;
    const stem = nameSegment(displayName ?? (id === 0 ? 'main_timeline' : `sprite_${id}`), id === 0 ? 'main_timeline' : `sprite_${id}`);
    const em = new ModuleEmitter({ runtime, selfModule: module, classes, avm1: options.avm1 });
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
      const frameCode = [...acc.frames]
        .sort((a, b) => a[0] - b[0])
        .map(([frame, list]) => ({ frame, code: fnFor(list), label: frameLabelAt(metadata, frame) }));
      const counts = new Map<string, number>();
      for (const { code } of frameCode) counts.set(code, (counts.get(code) ?? 0) + 1);

      // Workbench labels turn anonymous numeric callbacks into named code while
      // the exported frame map keeps its original 1-based numeric keys.
      const workbenchLabels = timelineFrameLabels(metadata);
      if (displayName || workbenchLabels.length) {
        const labelCounts = new Map<string, number>();
        for (const { label } of frameCode) {
          if (!label) continue;
          const key = nameSegment(label, 'frame');
          labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
        }
        const usedFrameNames = new Set<string>();
        const frameNames = new Map<number, string>();
        for (const { frame, label } of frameCode) {
          const labelPart = label ? nameSegment(label, `frame_${frame}`) : `frame_${frame}`;
          const duplicateLabel = label && (labelCounts.get(labelPart) ?? 0) > 1;
          const base = `${stem}_${labelPart}${duplicateLabel ? `_frame_${frame}` : ''}`;
          frameNames.set(frame, uniqueSegment(base, usedFrameNames, `frame_${frame}`));
        }

        const callbackByFrame = new Map<number, string>();
        const callbackDeclarations: string[] = [];
        const emitted = new Set<string>();
        for (const { frame, code } of frameCode) {
          if (emitted.has(code)) continue;
          emitted.add(code);
          const matchingFrames = frameCode.filter((entry) => entry.code === code);
          const firstFrameName = frameNames.get(matchingFrames[0].frame)!;
          const callbackName = (counts.get(code) ?? 0) > 1
            ? uniqueSegment(`${firstFrameName}_shared`, usedFrameNames, `frame_${frame}`)
            : firstFrameName;
          for (const entry of matchingFrames) callbackByFrame.set(entry.frame, callbackName);
          callbackDeclarations.push(`const ${callbackName} = ${indent(code, 0)};`);
        }

        const labels = workbenchLabels.length
          ? `/** 1-based SWF frame numbers to labels shown in Workbench. */\nexport const frameLabels: Readonly<Record<number, string>> = {\n${workbenchLabels.map(([frame, label]) => `  ${frame}: ${JSON.stringify(label)},`).join('\n')}\n};\n\n`
          : '';
        const declarations = callbackDeclarations.length ? `${callbackDeclarations.join('\n\n')}\n\n` : '';
        const entries = frameCode.map(({ frame, label }) => {
          const comment = label
            ? `  // Workbench frame ${frame}: ${JSON.stringify(label).split('*/').join('* /')}\n`
            : '';
          return `${comment}  ${frame}: ${callbackByFrame.get(frame)},`;
        });
        parts.push(`${labels}${declarations}/** Frame scripts, keyed by 1-based frame number. */\nexport const frames: Record<number, (this: AS2Clip) => void> = {\n${entries.join('\n')}\n};`);
      } else {
        // Preserve the ID-only output for callers that have no Workbench metadata.
        // Identical bodies still execute on every scheduled frame.
        const sharedNames = new Map<string, string>();
        const sharedDeclarations: string[] = [];
        for (const { code } of frameCode) {
          if ((counts.get(code) ?? 0) < 2 || sharedNames.has(code)) continue;
          const name = `$sharedFrameAction${sharedNames.size + 1}`;
          sharedNames.set(code, name);
          sharedDeclarations.push(`const ${name} = ${indent(code, 0)};`);
        }
        const entries = frameCode.map(({ frame, code }) => {
          const callback = sharedNames.get(code) ?? indent(code, 1);
          return `  ${frame}: ${callback},`;
        });
        const declarations = sharedDeclarations.length ? `${sharedDeclarations.join('\n\n')}\n\n` : '';
        parts.push(`${declarations}/** Frame scripts, keyed by 1-based frame number. */\nexport const frames: Record<number, (this: AS2Clip) => void> = {\n${entries.join('\n')}\n};`);
      }
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
    const identity = displayName
      ? `// Workbench timeline name: ${JSON.stringify(displayName)}${id === 0 ? '' : ` (sprite ${id})`}\n`
      : '';
    const code = banner(sources.join(', ')) + em.header() + identity + parts.join('\n\n') + '\n';
    files.set(`${module}.ts`, code);
    timelineModules.push(binding);
    const role = id === 0 ? 'main timeline' : `sprite ${id}${displayName ? ` · ${JSON.stringify(displayName)}` : ''}`;
    report.push({ source: sources.join('\n'), target: `${module}.ts`, role, diagnostics: [...diags, ...em.diagnostics] });
  }

  const buttonModules: [number, string][] = [];
  for (const [id, list] of [...buttons].sort((a, b) => a[0] - b[0])) {
    const module = `buttons/button_${id}`;
    const em = new ModuleEmitter({ runtime, selfModule: module, classes, avm1: options.avm1 });
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
    const em = new ModuleEmitter({ runtime, selfModule: module, classes, avm1: options.avm1 });
    const diags: Diagnostic[] = [];
    for (const p of list) if (p.error) diags.push({ level: 'error', message: `${p.file.path}: ${p.error}`, line: p.line });
    const body = list.flatMap((p) => p.body ?? []);
    const fn = em.timelineFunction(body);
    const code = `/** DoInitAction of the sprite exported as "${name}" (runs once, before the frame it is defined on). */\nexport const init = ${fn};\n`;
    files.set(`${module}.ts`, banner(list.map((p) => p.file.path).join(', ')) + em.header() + code);
    initModules.push([name, module]);
    report.push({ source: list.map((p) => p.file.path).join('\n'), target: `${module}.ts`, role: `init action of "${name}"`, diagnostics: [...diags, ...em.diagnostics] });
  }

  // Emit each DoInitAction separately. Grouping by sprite id or export name is
  // useful for older consumers, but it loses the SWF's tag order when actions
  // initialize one sprite and then register another sprite's class.
  const initActionSources = parsed
    .filter((p) => p.role.kind === 'init' || p.role.kind === 'initByName')
    .sort((a, b) => {
      const ao = a.file.tagOrder, bo = b.file.tagOrder;
      if (ao != null && bo != null) return ao - bo || natural(a.file.path, b.file.path);
      if (ao != null) return -1;
      if (bo != null) return 1;
      return natural(a.file.path, b.file.path);
    });
  const initActionModules: { module: string; p: Parsed; order: number; targetSpriteId?: number; linkageName?: string }[] = [];
  initActionSources.forEach((p, index) => {
    const module = `init/action_${index + 1}`;
    const em = new ModuleEmitter({ runtime, selfModule: module, classes, avm1: options.avm1 });
    const diags: Diagnostic[] = [];
    const body = (p.body ?? []).filter((s) => s.k !== 'on' && s.k !== 'onClipEvent');
    let fn = em.timelineFunction(body);
    if (p.error) {
      em.useRuntime('$rt');
      fn = fn.replace(/\{\n/, `{\n  $rt.untranslated(${JSON.stringify(p.file.path)}, ${JSON.stringify(p.error)});\n`);
      diags.push({ level: 'error', message: `${p.file.path}: ${p.error}`, line: p.line });
    }
    const role = p.role;
    const targetSpriteId = p.file.targetSpriteId
      ?? (role.kind === 'init' && role.timeline !== 0 ? role.timeline : undefined);
    const linkageName = role.kind === 'initByName' ? role.name : undefined;
    const order = p.file.tagOrder ?? index;
    files.set(`${module}.ts`, banner(p.file.path) + em.header() + `/** One ordered SWF DoInitAction tag. */\nexport const init = ${fn};\n`);
    initActionModules.push({ module, p, order, targetSpriteId, linkageName });
    report.push({ source: p.file.path, target: `${module}.ts`, role: 'ordered init action', diagnostics: [...diags, ...em.diagnostics] });
  });

  // ------------------------------------------------------------ index
  const idx: string[] = [`import type { AS2Program } from ${JSON.stringify(runtime)};`];
  for (const { alias, module } of timelineModules) idx.push(`import * as ${alias} from './${module}';`);
  for (const [id, m] of buttonModules) idx.push(`import { handlers as button_${id} } from './${m}';`);
  const classList = [...classes.values()].sort((a, b) => natural(a.name, b.name));
  classList.forEach((c, i) => idx.push(`import { ${c.name.split('.').pop()} as class_${i} } from './${c.module}';`));
  initModules.forEach(([, m], i) => idx.push(`import { init as init_${i} } from './${m}';`));
  initActionModules.forEach(({ module }, i) => idx.push(`import { init as initAction_${i} } from './${module}';`));
  idx.push('');
  idx.push('export const program: AS2Program = {');
  idx.push(`  timelines: {${timelineModules.map(({ id, alias, displayName }) => `\n    ${id}: ${alias},${displayName ? ` // ${JSON.stringify(displayName)}` : ''}`).join('')}\n  },`);
  idx.push(`  buttons: {${buttonModules.map(([id]) => `\n    ${id}: button_${id},`).join('')}\n  },`);
  idx.push(`  classes: {${classList.map((c, i) => `\n    ${JSON.stringify(c.name)}: class_${i},`).join('')}\n  },`);
  idx.push(`  initByName: {${initModules.map(([n], i) => `\n    ${JSON.stringify(n)}: init_${i},`).join('')}\n  },`);
  idx.push(`  initActions: [${initActionModules.map((entry, i) => {
    const fields = [`order: ${entry.order}`];
    if (entry.targetSpriteId != null) fields.push(`targetSpriteId: ${entry.targetSpriteId}`);
    if (entry.linkageName != null) fields.push(`linkageName: ${JSON.stringify(entry.linkageName)}`);
    fields.push(`run: initAction_${i}`);
    return `\n    { ${fields.join(', ')} },`;
  }).join('')}\n  ],`);
  idx.push('};');
  idx.push('');
  idx.push('export default program;');
  files.set('index.ts', banner('as2ts project index') + idx.join('\n') + '\n');

  // Actor entry points are a migration layer, not another timeline scheduler.
  // Existing Execute/index.ts keep using the exact same frame/placement mapping.
  for (const binding of timelineModules) {
    const { id, module, displayName, metadata } = binding;
    const slug = module.slice('timelines/'.length);
    const className = slug.split('_').filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('') + 'Actor';
    const frames = [...(timelines.get(id)?.frames.keys() ?? [])].sort((a, b) => a - b);
    const used = new Set<string>();
    const methods = frames.map((frame) => {
      const label = frameLabelAt(metadata, frame);
      const method = uniqueSegment(`action_${label ? nameSegment(label, `frame_${frame}`) : `frame_${frame}`}`, used, String(frame));
      return `  ${method}(): void { this.runFrameAction(${frame}); }`;
    });
    report.push({ source: module + '.ts', target: `actors/${slug}.ts`, role: 'actor migration', diagnostics: [] });
    files.set(`actors/${slug}.ts`, banner(`actor migration entry for ${module}`) + [
      `import { TimelineActor, type AS2Clip } from ${JSON.stringify(runtime)};`,
      `import * as behavior from '../${module}';`,
      '',
      '// Explicit behavior methods: do not dispatch alongside the legacy frame scheduler.',
      '// Move decoded logic from the timeline module here as you migrate your game.',
      `export class ${/^\d/.test(className) ? 'Sprite' : ''}${className} extends TimelineActor {`,
      `  constructor(sprite: AS2Clip) {`,
      `    super(${JSON.stringify(displayName ?? (id === 0 ? 'Root' : `Sprite ${id}`))}, sprite, behavior, ${JSON.stringify(Object.fromEntries(timelineFrameLabels(metadata)))});`,
      '  }',
      '',
      ...methods,
      '',
      '  override update(deltaSeconds: number): void {',
      '    // Add game behavior here using this.sprite, this.animation and this.graphics.',
      '    // The host owns animation timing; deltaSeconds is for your game logic.',
      '    super.update(deltaSeconds);',
      '  }',
      '}',
      '',
    ].join('\n'));
  }

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
    const includedBody = parseProgram(file.content);
    out.push(...inlineIncludes(includedBody, key, files, new Set([...stack, key])));
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
