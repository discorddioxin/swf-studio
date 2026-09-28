// ---------------------------------------------------------------------------
// Static ActionScript inspector.
// Given a set of decompiled/source ActionScript blobs plus the set of known
// asset names, it extracts every method, member, and the relationships
// between code and assets (attachMovie / string / identifier references).
// It is intentionally a fast, heuristic parser: the goal is an inspectable
// index, not a full compiler.
// ---------------------------------------------------------------------------

export interface AssetDescriptor {
  name: string;
  assetId?: number;
  assetKind?: string;
}

export interface CodeRef {
  name: string;
  via: 'attachMovie' | 'getMovieClip' | 'string literal' | 'identifier';
}

export interface CodeMethod {
  id: string;
  name: string;
  kind: 'function' | 'method' | 'handler';
  params: string[];
  startLine: number;
  endLine: number;
  sourceLabel: string;
  body: string;
  refs: CodeRef[];
  assetRefs: string[];
  calls: string[];
}

export interface CodeMember {
  id: string;
  name: string;
  kind: 'var' | 'property' | 'const';
  startLine: number;
  value: string;
  sourceLabel: string;
  refs: CodeRef[];
  assetRefs: string[];
}

export interface CodeRelationship {
  codeType: 'method' | 'member';
  codeName: string;
  sourceLabel: string;
  line: number;
  assetName: string;
  assetId?: number;
  assetKind?: string;
  via: string;
}

export interface SourceSummary {
  label: string;
  source: string;
  methodCount: number;
  memberCount: number;
  refCount: number;
}

export interface AssetUsage {
  assetId?: number;
  assetKind?: string;
  usedBy: { codeType: string; codeName: string; sourceLabel: string; line: number }[];
}

export interface CodeAnalysis {
  sources: SourceSummary[];
  methods: CodeMethod[];
  members: CodeMember[];
  relationships: CodeRelationship[];
  assetIndex: Record<string, AssetUsage>;
  counts: { methods: number; members: number; relationships: number; sources: number; assets: number };
}

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'function', 'catch', 'return', 'with', 'do', 'else', 'new',
]);

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === '\n') line++;
  return line;
}

function extractBalanced(source: string, openIdx: number): { body: string; closeIdx: number } {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { body: source.slice(openIdx + 1, i), closeIdx: i };
    }
  }
  return { body: source.slice(openIdx + 1), closeIdx: source.length - 1 };
}

function findRefs(text: string, knownNames: Set<string>): CodeRef[] {
  const found = new Map<string, CodeRef>();
  const add = (name: string, via: CodeRef['via']) => {
    if (!knownNames.has(name) || found.has(name)) return;
    found.set(name, { name, via });
  };

  // attachMovie("name", ...)
  const attachRe = /attachMovie\s*\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = attachRe.exec(text))) add(m[1], 'attachMovie');

  // getMovieClip(this, "name") / getDefinitionName(...)
  const gmcRe = /getMovieClip\s*\(\s*[^,]+,\s*["']([^"']+)["']/g;
  while ((m = gmcRe.exec(text))) add(m[1], 'getMovieClip');

  // string literals that name a known asset
  const strRe = /["']([A-Za-z_$][\w$]*)["']/g;
  while ((m = strRe.exec(text))) add(m[1], 'string literal');

  // bare identifiers that name a known asset (e.g. this.heroBall, heroBall.play())
  const idRe = /(?:\b|\.)([A-Za-z_$][\w$]*)\b/g;
  while ((m = idRe.exec(text))) add(m[1], 'identifier');

  return [...found.values()];
}

function findCalls(body: string): string[] {
  const calls = new Set<string>();
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) if (!KEYWORDS.has(m[1])) calls.add(m[1]);
  return [...calls];
}

function cleanParams(raw: string): string[] {
  return raw
    .split(',')
    .map((p) => p.trim().replace(/\s*:\s*.*$/, '').replace(/^this\s*=>?\s*/, '').replace(/=.+$/, ''))
    .filter(Boolean);
}

interface ParsedSource {
  methods: Omit<CodeMethod, 'id' | 'sourceLabel'>[];
  members: Omit<CodeMember, 'id' | 'sourceLabel'>[];
}

function analyzeSource(source: string, knownNames: Set<string>): ParsedSource {
  const methods: ParsedSource['methods'] = [];
  const seen = new Set<string>();

  // First pass: named function declarations  `function name(...) {`
  const namedRe = /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = namedRe.exec(source))) {
    const braceIdx = source.indexOf('{', m.index + m[0].length - 1);
    const { body, closeIdx } = extractBalanced(source, braceIdx);
    const before = source.slice(Math.max(0, m.index - 80), m.index).trim();
    const assignee = before.match(/([\w$.]+)\s*=\s*$/)?.[1];
    let kind: CodeMethod['kind'] = 'function';
    let name = m[1];
    if (assignee) {
      if (/this\.\w+$/.test(assignee)) kind = 'method';
      else if (/^\w+$/.test(assignee) && !/^function$/.test(assignee)) kind = 'handler';
    }
    const params = cleanParams(m[2]);
    const refs = findRefs(body, knownNames);
    const key = `${name}:${lineAt(source, m.index)}`;
    if (!seen.has(key)) {
      seen.add(key);
      methods.push({
        name, kind, params,
        startLine: lineAt(source, m.index),
        endLine: lineAt(source, closeIdx),
        body,
        refs,
        assetRefs: refs.map((r) => r.name),
        calls: findCalls(body),
      });
    }
    namedRe.lastIndex = closeIdx + 1;
  }

  // Second pass: function expressions `name = function(...) {` and `this.x = function(...) {`
  const exprRe = /([\w$.]+)\s*=\s*function\s*\(([^)]*)\)\s*\{/g;
  while ((m = exprRe.exec(source))) {
    const assignee = m[1];
    const braceIdx = source.indexOf('{', m.index + m[0].length - 1);
    const { body, closeIdx } = extractBalanced(source, braceIdx);
    const isMethod = /^this\.\w+$/.test(assignee);
    const kind: CodeMethod['kind'] = isMethod ? 'method' : 'handler';
    const name = isMethod ? assignee.split('.').pop()! : assignee.replace(/^var\s+/, '');
    const params = cleanParams(m[2]);
    const key = `${name}:${lineAt(source, m.index)}`;
    if (!seen.has(key)) {
      seen.add(key);
      const refs = findRefs(body, knownNames);
      methods.push({
        name, kind, params,
        startLine: lineAt(source, m.index),
        endLine: lineAt(source, closeIdx),
        body,
        refs,
        assetRefs: refs.map((r) => r.name),
        calls: findCalls(body),
      });
    }
    exprRe.lastIndex = closeIdx + 1;
  }

  // Members: `var x = ...` and `this.x = ...` (non-function)
  const members: ParsedSource['members'] = [];
  const memberSeen = new Set<string>();
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    let v: RegExpMatchArray | null = trimmed.match(/^var\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?);?$/);
    if (v) {
      const key = `var:${v[1]}:${idx + 1}`;
      if (!memberSeen.has(key)) {
        memberSeen.add(key);
        const refs = findRefs(line, knownNames);
        members.push({ name: v[1], kind: 'var', startLine: idx + 1, value: v[2].slice(0, 120), refs, assetRefs: refs.map((r) => r.name) });
      }
      return;
    }
    v = trimmed.match(/^this\.([A-Za-z_$][\w$]*)\s*=\s*(.+?);?$/);
    if (v && !/\bfunction\b/.test(v[2]) && !/=>/.test(v[2])) {
      const key = `prop:${v[1]}:${idx + 1}`;
      if (!memberSeen.has(key)) {
        memberSeen.add(key);
        const refs = findRefs(line, knownNames);
        members.push({ name: v[1], kind: 'property', startLine: idx + 1, value: v[2].slice(0, 120), refs, assetRefs: refs.map((r) => r.name) });
      }
    }
  });

  return { methods, members };
}

export function analyzeCode(
  sources: { label: string; source: string }[],
  assets: AssetDescriptor[],
): CodeAnalysis {
  const knownNames = new Set(assets.map((a) => a.name));
  const assetByName = new Map<string, AssetDescriptor>();
  for (const a of assets) if (!assetByName.has(a.name)) assetByName.set(a.name, a);

  const methods: CodeMethod[] = [];
  const members: CodeMember[] = [];
  const summaries: SourceSummary[] = [];
  let methodSeq = 0;
  let memberSeq = 0;

  for (const s of sources) {
    if (!s.source || !s.source.trim()) {
      summaries.push({ label: s.label, source: s.source, methodCount: 0, memberCount: 0, refCount: 0 });
      continue;
    }
    const parsed = analyzeSource(s.source, knownNames);
    for (const method of parsed.methods) methods.push({ ...method, id: `m${methodSeq++}`, sourceLabel: s.label });
    for (const member of parsed.members) members.push({ ...member, id: `v${memberSeq++}`, sourceLabel: s.label });
    const refCount = parsed.methods.reduce((n, m) => n + m.refs.length, 0) + parsed.members.reduce((n, m) => n + m.refs.length, 0);
    summaries.push({ label: s.label, source: s.source, methodCount: parsed.methods.length, memberCount: parsed.members.length, refCount });
  }

  const relationships: CodeRelationship[] = [];
  const assetIndex: CodeAnalysis['assetIndex'] = {};
  const pushRel = (codeType: 'method' | 'member', codeName: string, sourceLabel: string, line: number, ref: CodeRef) => {
    const asset = assetByName.get(ref.name);
    const rel: CodeRelationship = {
      codeType, codeName, sourceLabel, line,
      assetName: ref.name, assetId: asset?.assetId, assetKind: asset?.assetKind, via: ref.via,
    };
    relationships.push(rel);
    const usage = (assetIndex[ref.name] ??= { assetId: asset?.assetId, assetKind: asset?.assetKind, usedBy: [] });
    usage.usedBy.push({ codeType, codeName, sourceLabel, line });
  };
  for (const m of methods) for (const ref of m.refs) pushRel('method', m.name, m.sourceLabel, m.startLine, ref);
  for (const m of members) for (const ref of m.refs) pushRel('member', m.name, m.sourceLabel, m.startLine, ref);

  return {
    sources: summaries,
    methods,
    members,
    relationships,
    assetIndex,
    counts: { methods: methods.length, members: members.length, relationships: relationships.length, sources: sources.length, assets: Object.keys(assetIndex).length },
  };
}

// ---------------------------------------------------------------------------
// Whole-codebase cross-reference engine.
// Indexes every method/member across every code source and resolves
// code→code edges (calls, member reads/writes) plus code→asset edges, so the
// dedicated Code Inspector can navigate all code and find references.
// ---------------------------------------------------------------------------

export interface SymbolDef {
  id: string;
  name: string;
  kind: 'function' | 'method' | 'handler' | 'var' | 'property';
  isCode: boolean;
  sourceId: string;
  sourceLabel: string;
  timelineId: string;
  line: number;
  endLine: number;
  params: string[];
  body: string;
  lineText: string;
  refs: CodeRef[];
}

export type RefVia = 'call' | 'read' | 'write' | 'asset';
export type RefTargetKind = 'method' | 'member' | 'asset';

export interface RefEdge {
  id: string;
  fromName: string;
  fromSourceId: string;
  fromLine: number;
  toKind: RefTargetKind;
  toName: string;
  assetId?: number;
  assetKind?: string;
  via: RefVia;
}

export interface CodebaseSource {
  id: string;
  label: string;
  timelineId: string;
  source: string;
  methodCount: number;
  memberCount: number;
}

export interface CodebaseAnalysis {
  sources: CodebaseSource[];
  symbols: SymbolDef[];
  references: RefEdge[];
  byName: Record<string, { definitions: string[]; references: RefEdge[] }>;
  assetIndex: Record<string, { assetId?: number; assetKind?: string; usedBy: { fromName: string; fromSourceId: string; line: number }[] }>;
  symbolNames: Set<string>;
  assetNames: Set<string>;
  symbolKindByName: Map<string, 'code' | 'member'>;
  counts: { sources: number; methods: number; members: number; symbols: number; references: number; assets: number };
}

const BUILTINS = new Set([
  'if', 'for', 'while', 'switch', 'function', 'catch', 'return', 'with', 'do', 'else', 'new',
  'typeof', 'delete', 'void', 'in', 'instanceof',
  'start', 'stop', 'gotoAndPlay', 'gotoAndStop', 'nextFrame', 'prevFrame', 'toggleHighQuality',
  'attachMovie', 'getMovieClip', 'getDefinitionName', 'loadMovie', 'loadNum', 'loadMovieNum', 'loadNumNum',
  'unloadMovie', 'unloadNum', 'unloadMovieNum', 'unloadNumNum', 'getTimer', 'getURL', 'trace',
  'createEmptyMovieClip', 'duplicateMovieClip', 'removeMovieClip', 'getBytesTotal', 'getBytesLoaded',
  'beginFill', 'endFill', 'lineTo', 'moveTo', 'curveTo', 'lineStyle', 'beginBitmapFill', 'clear', 'showFrame',
  'Math', 'String', 'Number', 'Boolean', 'Object', 'Array', 'Date', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'escape', 'unescape', 'decodeURI', 'encodeURI', 'decodeURIComponent', 'encodeURIComponent',
  'eval', 'this', 'onEnterFrame', 'onPress', 'onRelease', 'onRollOver', 'onRollOut', 'onKeyDown', 'onKeyUp',
  'onMouseMove', 'onMouseDown', 'onMouseUp', 'onReleaseOutside', 'onDragOver', 'onData',
]);

const AS_PROPERTIES = new Set([
  '_root', '_global', '_parent', '_self', '_level', '_x', '_y', '_xmouse', '_ymouse',
  '_width', '_height', '_alpha', '_visible', '_xscale', '_yscale', '_rotation', '_name', '_depth',
]);

function scanCodeEdges(
  text: string,
  methodNames: Set<string>,
  memberNames: Set<string>,
  emit: (edge: Omit<RefEdge, 'id' | 'fromName' | 'fromSourceId' | 'fromLine' | 'toKind'>) => void,
) {
  let m: RegExpExecArray | null;
  // method calls
  const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = callRe.exec(text))) {
    const name = m[1];
    if (BUILTINS.has(name) || !methodNames.has(name)) continue;
    emit({ toName: name, via: 'call' });
  }
  // member writes:  this.x =  or  x =  (not ==)
  const writeRe = /(?:this\.|(?<![\w$.]))([A-Za-z_$][\w$]*)\s*=(?![=])/g;
  while ((m = writeRe.exec(text))) {
    const name = m[1];
    if (BUILTINS.has(name) || AS_PROPERTIES.has(name) || !memberNames.has(name)) continue;
    emit({ toName: name, via: 'write' });
  }
  // member reads:  this.x  (explicit member access)
  const thisReadRe = /this\.([A-Za-z_$][\w$]*)\b/g;
  while ((m = thisReadRe.exec(text))) {
    const name = m[1];
    if (BUILTINS.has(name) || AS_PROPERTIES.has(name) || !memberNames.has(name)) continue;
    emit({ toName: name, via: 'read' });
  }
  // member reads: bare identifiers not in a call/write, not preceded by '.' or a word char
  const bareReadRe = /(?<![\w$.])([A-Za-z_$][\w$]*)(?!\s*[\(=])/g;
  while ((m = bareReadRe.exec(text))) {
    const name = m[1];
    if (BUILTINS.has(name) || KEYWORDS.has(name) || AS_PROPERTIES.has(name) || !memberNames.has(name)) continue;
    emit({ toName: name, via: 'read' });
  }
}

export function analyzeCodebase(
  sources: { id: string; label: string; timelineId: string; source: string }[],
  assets: AssetDescriptor[],
): CodebaseAnalysis {
  const assetNames = new Set(assets.map((a) => a.name));
  const assetByName = new Map<string, AssetDescriptor>();
  for (const a of assets) if (!assetByName.has(a.name)) assetByName.set(a.name, a);

  const symbols: SymbolDef[] = [];
  const methodNames = new Set<string>();
  const memberNames = new Set<string>();
  const parsedBySource = new Map<string, { methods: ParsedSource['methods']; members: ParsedSource['members'] }>();
  const linesBySource = new Map<string, string[]>();
  let seq = 0;
  const summaries: CodebaseSource[] = [];

  // Pass 1 — collect all symbols.
  for (const s of sources) {
    const src = s.source ?? '';
    const lines = src.split('\n');
    linesBySource.set(s.id, lines);
    const parsed = src.trim() ? analyzeSource(src, assetNames) : { methods: [], members: [] };
    parsedBySource.set(s.id, parsed);
    let methodCount = 0;
    let memberCount = 0;
    for (const m of parsed.methods) {
      const id = `sym${seq++}`;
      const kind = m.kind;
      symbols.push({
        id, name: m.name, kind, isCode: true, sourceId: s.id, sourceLabel: s.label, timelineId: s.timelineId,
        line: m.startLine, endLine: m.endLine, params: m.params, body: m.body,
        lineText: lines[m.startLine - 1] ?? '', refs: m.refs,
      });
      methodNames.add(m.name);
      methodCount++;
    }
    for (const m of parsed.members) {
      const id = `sym${seq++}`;
      const kind = m.kind === 'const' ? 'property' : m.kind;
      symbols.push({
        id, name: m.name, kind, isCode: false, sourceId: s.id, sourceLabel: s.label, timelineId: s.timelineId,
        line: m.startLine, endLine: m.startLine, params: [], body: m.value,
        lineText: lines[m.startLine - 1] ?? '', refs: m.refs,
      });
      memberNames.add(m.name);
      memberCount++;
    }
    summaries.push({ id: s.id, label: s.label, timelineId: s.timelineId, source: src, methodCount, memberCount });
  }

  // Pass 2 — resolve cross-references.
  const references: RefEdge[] = [];
  const seenEdge = new Set<string>();
  let refSeq = 0;
  const addEdge = (from: SymbolDef, edge: { toName: string; via: RefVia }) => {
    const toKind: RefTargetKind = edge.via === 'asset' ? 'asset' : edge.via === 'call' ? 'method' : 'member';
    const key = `${from.id}|${edge.via}|${edge.toName}`;
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    const asset = edge.via === 'asset' ? assetByName.get(edge.toName) : undefined;
    references.push({
      id: `ref${refSeq++}`,
      fromName: from.name, fromSourceId: from.sourceId, fromLine: from.line,
      toKind, toName: edge.toName,
      assetId: asset?.assetId, assetKind: asset?.assetKind,
      via: edge.via,
    });
  };

  for (const s of symbols) {
    const text = s.isCode ? s.body : s.lineText;
    scanCodeEdges(text, methodNames, memberNames, (edge) => {
      // drop self-references to keep the graph clean (a def referring to itself)
      if (edge.toName === s.name && edge.via !== 'asset') return;
      addEdge(s, edge);
    });
    for (const ref of s.refs) addEdge(s, { toName: ref.name, via: 'asset' });
  }

  // Indexes.
  const byName: CodebaseAnalysis['byName'] = {};
  for (const s of symbols) {
    (byName[s.name] ??= { definitions: [], references: [] }).definitions.push(s.id);
  }
  for (const r of references) {
    (byName[r.toName] ??= { definitions: [], references: [] }).references.push(r);
  }
  const assetIndex: CodebaseAnalysis['assetIndex'] = {};
  for (const r of references) {
    if (r.via !== 'asset') continue;
    const usage = (assetIndex[r.toName] ??= { assetId: r.assetId, assetKind: r.assetKind, usedBy: [] });
    usage.usedBy.push({ fromName: r.fromName, fromSourceId: r.fromSourceId, line: r.fromLine });
  }

  const symbolKindByName = new Map<string, 'code' | 'member'>();
  for (const s of symbols) if (!symbolKindByName.has(s.name)) symbolKindByName.set(s.name, s.isCode ? 'code' : 'member');

  const methods = symbols.filter((s) => s.isCode).length;
  const members = symbols.length - methods;

  return {
    sources: summaries,
    symbols,
    references,
    byName,
    assetIndex,
    symbolNames: new Set(symbols.map((s) => s.name)),
    assetNames,
    symbolKindByName,
    counts: {
      sources: sources.length,
      methods,
      members,
      symbols: symbols.length,
      references: references.length,
      assets: Object.keys(assetIndex).length,
    },
  };
}
