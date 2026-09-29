// ---------------------------------------------------------------------------
// Static ActionScript inspector.
// Given a set of decompiled/source ActionScript blobs plus the set of known
// asset names, it extracts every method, member, and the relationships
// between code and assets (attachMovie / string / identifier references).
// It is intentionally a fast, heuristic parser: the goal is an inspectable
// index, not a full compiler.
//
// Structure (braces, definitions, calls, member reads/writes) is always
// detected on a *masked* copy of the source in which comments and string
// contents are blanked, so `"}"` or `// function x() {` cannot derail it.
// ---------------------------------------------------------------------------

import type { Project, SwfDocument } from '../types';

export interface AssetDescriptor {
  name: string;
  assetId?: number;
  assetKind?: string;
}

export interface CodeRef {
  name: string;
  via: 'attachMovie' | 'getMovieClip' | 'string literal' | 'identifier';
  /** 1-based line (within the analysed source) of the first occurrence. */
  line?: number;
  /** Every line on which the name occurs, ascending. */
  lines?: number[];
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
  /** First usage line. */
  line: number;
  /** Every usage line, ascending. */
  lines: number[];
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
  usedBy: { codeType: string; codeName: string; sourceLabel: string; line: number; lines: number[] }[];
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
  'typeof', 'delete', 'void', 'in', 'instanceof', 'var', 'const', 'case', 'break', 'continue',
  'try', 'finally', 'throw', 'default', 'true', 'false', 'null', 'undefined', 'super',
]);

const IDENT = '[A-Za-z_$][\\w$]*';
/** Optional AS2/AS3 type annotation, e.g. `:Number`, `:void`, `:Vector.<int>`, `:*`. */
const TYPE_ANN = '(?:\\s*:\\s*[\\w$.*<>]+)?';

/** A plain object with no prototype, so symbol names such as `constructor`,
 * `toString` or `__proto__` can be used as keys safely. */
function dict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

// ------------------------------------------------------------ source masking

interface MaskedSource {
  /** Comments AND string-literal contents blanked. Used for structure: braces,
   * definitions, calls, member reads/writes. */
  code: string;
  /** Only comments blanked (string literals kept). Used for asset references,
   * which are frequently string literals (`attachMovie("hero", …)`). */
  text: string;
}

/** Keywords after which a `/` starts a regex literal rather than a division. */
const REGEX_PRECEDING_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'new', 'throw', 'instanceof', 'else', 'do']);

/**
 * Does a `/` at `i` begin a regex literal? Decided from the previous
 * significant character, as JS/AS3 tokenizers do: after an operand
 * (identifier, number, `)`, `]`) it is a division; after an operator,
 * punctuation, a keyword such as `return`, or at the start, it is a regex.
 */
function startsRegex(src: string, i: number): boolean {
  let p = i - 1;
  while (p >= 0 && (src[p] === ' ' || src[p] === '\t' || src[p] === '\r' || src[p] === '\n')) p--;
  if (p < 0) return true;
  const prev = src[p];
  if (/[\w$]/.test(prev)) {
    let q = p;
    while (q >= 0 && /[\w$]/.test(src[q])) q--;
    return REGEX_PRECEDING_KEYWORDS.has(src.slice(q + 1, p + 1));
  }
  return !(prev === ')' || prev === ']' || prev === '}' || prev === '"' || prev === "'");
}

/** End (exclusive, after the closing `/`) of a regex literal starting at
 * `i`, or -1 if it is not terminated on the same line (then it's a division). */
function regexEnd(src: string, i: number): number {
  let inClass = false;
  for (let j = i + 1; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\n' || ch === '\r') return -1;
    if (ch === '\\') { j++; continue; }
    if (inClass) { if (ch === ']') inClass = false; continue; }
    if (ch === '[') inClass = true;
    else if (ch === '/') return j + 1;
  }
  return -1;
}

/**
 * Blank out comments, string contents and regex-literal bodies while
 * preserving length and newlines, so every index/line computed on a masked
 * copy maps 1:1 onto the original source.
 */
function maskSource(src: string): MaskedSource {
  const n = src.length;
  const code: string[] = new Array(n);
  const text: string[] = new Array(n);
  const blank = (arr: string[], from: number, to: number) => {
    for (let k = from; k < to; k++) arr[k] = src[k] === '\n' || src[k] === '\r' ? src[k] : ' ';
  };
  let i = 0;
  while (i < n) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      blank(code, i, j); blank(text, i, j);
      i = j;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const j = close < 0 ? n : close + 2;
      blank(code, i, j); blank(text, i, j);
      i = j;
      continue;
    }
    if (ch === '/' && startsRegex(src, i)) {
      const end = regexEnd(src, i);
      if (end > 0) {
        // Keep the delimiters; blank the body in `code` so quotes/braces
        // inside the pattern cannot derail structure detection.
        code[i] = '/'; code[end - 1] = '/';
        blank(code, i + 1, end - 1);
        for (let k = i; k < end; k++) text[k] = src[k];
        i = end;
        continue;
      }
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && src[j] !== ch && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j, n);
      code[i] = ch; text[i] = ch;
      blank(code, i + 1, j);
      for (let k = i + 1; k < j; k++) text[k] = src[k];
      if (j < n && src[j] === ch) { code[j] = ch; text[j] = ch; i = j + 1; } else i = j;
      continue;
    }
    code[i] = ch; text[i] = ch;
    i++;
  }
  return { code: code.join(''), text: text.join('') };
}

/** Blank the given absolute [from, to) ranges inside `str` (which starts at
 * absolute offset `base`), preserving newlines. */
function blankRanges(str: string, base: number, ranges: [number, number][]): string {
  if (!ranges.length) return str;
  let out = '';
  let cursor = 0;
  for (const [from, to] of ranges) {
    const a = Math.max(cursor, from - base);
    const b = Math.min(str.length, to - base);
    if (b <= a) continue;
    out += str.slice(cursor, a) + str.slice(a, b).replace(/[^\n\r]/g, ' ');
    cursor = b;
  }
  return out + str.slice(cursor);
}

// ------------------------------------------------------------ line lookup

/** O(log n) index → line lookup (the previous implementation rescanned the
 * whole source for every lookup, which made analysis quadratic). */
class LineIndex {
  readonly starts: number[] = [0];
  constructor(source: string) {
    for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) this.starts.push(i + 1);
  }
  /** 1-based line containing `index`. */
  lineAt(index: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  }
}

/** Index of the `}` matching the `{` at `openIdx`, or -1 if unterminated. */
function extractBalanced(code: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ------------------------------------------------------------ references

const ATTACH_RE = /attachMovie\s*\(\s*["']([^"']+)["']/g;
const GET_MOVIE_CLIP_RE = /getMovieClip\s*\(\s*[^,]+,\s*["']([^"']+)["']/g;
const STRING_NAME_RE = /["']([A-Za-z_$][\w$]*)["']/g;
const IDENT_RE = /(?<![\w$])[A-Za-z_$][\w$]*(?![\w$])/g;

/**
 * `text` must already have comments removed. `base` is the absolute offset of
 * `text` in the source so first-occurrence lines can be reported.
 */
function findRefs(text: string, knownNames: Set<string>, base = 0, lines?: LineIndex): CodeRef[] {
  const found = new Map<string, CodeRef & { lineSet?: Set<number> }>();
  if (!knownNames.size) return [];
  const add = (name: string, via: CodeRef['via'], index: number) => {
    if (!knownNames.has(name)) return;
    let ref = found.get(name);
    if (!ref) {
      ref = { name, via };
      if (lines) ref.lineSet = new Set();
      found.set(name, ref);
    }
    ref.lineSet?.add(lines!.lineAt(base + index));
  };
  let m: RegExpExecArray | null;
  ATTACH_RE.lastIndex = 0;
  while ((m = ATTACH_RE.exec(text))) add(m[1], 'attachMovie', m.index);
  GET_MOVIE_CLIP_RE.lastIndex = 0;
  while ((m = GET_MOVIE_CLIP_RE.exec(text))) add(m[1], 'getMovieClip', m.index);
  STRING_NAME_RE.lastIndex = 0;
  while ((m = STRING_NAME_RE.exec(text))) add(m[1], 'string literal', m.index);
  IDENT_RE.lastIndex = 0;
  while ((m = IDENT_RE.exec(text))) add(m[0], 'identifier', m.index);
  return [...found.values()].map(({ lineSet, ...ref }) => {
    if (!lineSet) return ref;
    const all = [...lineSet].sort((a, b) => a - b);
    return { ...ref, line: all[0], lines: all };
  });
}

/** `code` must have comments and strings masked. */
function findCalls(code: string): string[] {
  const calls = new Set<string>();
  const re = /(?<![\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (KEYWORDS.has(m[1])) continue;
    // `function foo(` is a (nested) definition, not a call.
    if (/(?:^|[^\w$])function\s+$/.test(code.slice(Math.max(0, m.index - 10), m.index))) continue;
    calls.add(m[1]);
  }
  return [...calls];
}

function cleanParams(raw: string): string[] {
  return raw
    .split(',')
    .map((p) => p.trim().replace(/\s*:\s*.*$/, '').replace(/=.+$/, '').trim())
    .filter(Boolean);
}

// ------------------------------------------------------------ source parsing

interface ParsedMethod extends Omit<CodeMethod, 'id' | 'sourceLabel'> {
  /** Absolute offset of the first body character. */
  bodyStart: number;
  /** Masked body with nested function definitions blanked (for edge scans). */
  scanCode: string;
  /** Names bound in this function's lexical scope (params, locals, catch
   * variables — including enclosing functions'), which shadow members. */
  locals: Set<string>;
}

interface ParsedMember extends Omit<CodeMember, 'id' | 'sourceLabel'> {
  /** Masked initializer (for edge scans). */
  scanCode: string;
}

interface ParsedSource {
  methods: ParsedMethod[];
  members: ParsedMember[];
  lines: LineIndex;
}

const FUNCTION_KEYWORD_RE = /(?<![\w$.])function(?![\w$])/g;
// `function [get|set] [name](params)[:ReturnType] {` — sticky, applied at a keyword.
const FUNCTION_HEAD_RE = new RegExp(
  `function\\s*(?:(get|set)\\s+(?=${IDENT}\\s*\\())?(${IDENT})?\\s*\\(([^)]*)\\)${TYPE_ANN}\\s*\\{`,
  'y',
);
// What precedes `function` when it is assigned: `[var] a.b.c[:Type] =` or `key:`.
const ASSIGNEE_RE = new RegExp(`(?:(?<![\\w$])(var|const)\\s+)?(${IDENT}(?:\\s*\\.\\s*${IDENT})*)${TYPE_ANN}\\s*(=|:)\\s*$`);
const MODIFIERS = '(?:(?:public|private|protected|internal|static|override|final|dynamic|native)\\s+)*';
const DECL_HEAD_RE = new RegExp(`^\\s*${MODIFIERS}(var|const)\\s+`);
const DECLARATOR_RE = new RegExp(`^\\s*(${IDENT})${TYPE_ANN}\\s*(?:=(?!=)\\s*([\\s\\S]*?))?\\s*$`);
const THIS_PROP_HEAD_RE = new RegExp(`^\\s*this\\.(${IDENT})\\s*=(?!=)\\s*`);

/** Split the masked range [from, to) at top-level commas; absolute ranges. */
function splitTopLevel(code: string, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < to; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { out.push([start, i]); start = i + 1; }
  }
  out.push([start, to]);
  return out;
}

/** End of the statement starting at `from`: the first top-level `;` (or an
 * unmatched closing bracket) before `to`. */
function statementEnd(code: string, from: number, to: number): number {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') { if (--depth < 0) return i; }
    else if (ch === ';' && depth === 0) return i;
  }
  return to;
}

const LOCAL_DECL_RE = /(?<![\w$.])(?:var|const|let)\s+/g;
const CATCH_RE = new RegExp(`(?<![\\w$.])catch\\s*\\(\\s*(${IDENT})`, 'g');
const LEADING_IDENT_RE = new RegExp(`^\\s*(${IDENT})`);

/** Names declared with var/const/let (all declarators, incl. `for (var k in o)`)
 * or bound by `catch (e)` in a masked function body. */
function declaredLocals(code: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  LOCAL_DECL_RE.lastIndex = 0;
  while ((m = LOCAL_DECL_RE.exec(code))) {
    const from = m.index + m[0].length;
    let to = code.indexOf('\n', from);
    if (to < 0) to = code.length;
    for (const [a, b] of splitTopLevel(code, from, statementEnd(code, from, to))) {
      const id = LEADING_IDENT_RE.exec(code.slice(a, b));
      if (id) out.push(id[1]);
    }
  }
  CATCH_RE.lastIndex = 0;
  while ((m = CATCH_RE.exec(code))) out.push(m[1]);
  return out;
}

interface FoundFunction {
  keywordIdx: number;
  openIdx: number;
  /** Matching `}` (or last index when unterminated). */
  closeIdx: number;
  /** Exclusive end of the body. */
  bodyEnd: number;
  name: string;
  kind: CodeMethod['kind'];
  params: string[];
}

function discoverFunctions(code: string): FoundFunction[] {
  const out: FoundFunction[] = [];
  let m: RegExpExecArray | null;
  FUNCTION_KEYWORD_RE.lastIndex = 0;
  while ((m = FUNCTION_KEYWORD_RE.exec(code))) {
    FUNCTION_HEAD_RE.lastIndex = m.index;
    const head = FUNCTION_HEAD_RE.exec(code);
    if (!head) continue;
    const [, accessor, fnName, rawParams] = head;
    const openIdx = FUNCTION_HEAD_RE.lastIndex - 1;

    const before = code.slice(Math.max(0, m.index - 200), m.index);
    const assign = ASSIGNEE_RE.exec(before);
    let name: string | undefined;
    let kind: CodeMethod['kind'] = 'function';
    if (assign) {
      const [, decl, rawPath, op] = assign;
      const path = rawPath.replace(/\s+/g, '');
      const parts = path.split('.');
      const last = parts[parts.length - 1];
      if (op === ':') { name = last; kind = 'method'; }                          // { onLoad: function () {} }
      else if (parts.length === 2 && parts[0] === 'this') { name = last; kind = 'method'; }
      else if (parts.length >= 3 && parts[parts.length - 2] === 'prototype') { name = last; kind = 'method'; }
      else if (parts.length === 1) { name = path; kind = decl ? 'function' : 'handler'; }
      else { name = path; kind = 'handler'; }                                     // btn.onRelease = function …
    } else if (fnName) {
      name = fnName;
      kind = accessor ? 'method' : 'function';
    }
    if (!name) continue; // anonymous callback, e.g. setInterval(function () {…})

    const close = extractBalanced(code, openIdx);
    out.push({
      keywordIdx: m.index, openIdx,
      closeIdx: close < 0 ? code.length - 1 : close,
      bodyEnd: close < 0 ? code.length : close,
      name, kind, params: cleanParams(rawParams),
    });
    // Do NOT skip the body: nested definitions (onEnterFrame inside onLoad…)
    // are indexed too.
    FUNCTION_KEYWORD_RE.lastIndex = openIdx + 1;
  }
  return out;
}

function analyzeSource(source: string, knownNames: Set<string>): ParsedSource {
  const { code, text } = maskSource(source);
  const lines = new LineIndex(source);
  const fns = discoverFunctions(code);

  const methods: ParsedMethod[] = fns.map((fn, i) => {
    // Blank directly-nested definitions so a parent is not credited with its
    // children's calls / references (each child is its own entry).
    const nested: [number, number][] = [];
    for (let j = i + 1; j < fns.length && fns[j].keywordIdx < fn.closeIdx; j++) {
      nested.push([fns[j].keywordIdx, fns[j].closeIdx + 1]);
      while (j + 1 < fns.length && fns[j + 1].keywordIdx < fns[j].closeIdx) j++;
    }
    const bodyStart = fn.openIdx + 1;
    const bodyEnd = fn.bodyEnd;
    const scanText = blankRanges(text.slice(bodyStart, bodyEnd), bodyStart, nested);
    const scanCode = blankRanges(code.slice(bodyStart, bodyEnd), bodyStart, nested);
    const refs = findRefs(scanText, knownNames, bodyStart, lines);
    return {
      locals: new Set([...fn.params, ...declaredLocals(scanCode)]),
      name: fn.name,
      kind: fn.kind,
      params: fn.params,
      startLine: lines.lineAt(fn.keywordIdx),
      endLine: lines.lineAt(fn.closeIdx),
      body: source.slice(bodyStart, bodyEnd),
      refs,
      assetRefs: refs.map((r) => r.name),
      calls: findCalls(scanCode),
      bodyStart,
      scanCode,
    };
  });

  // Closures see their enclosing functions' bindings: inherit them.
  const stack: number[] = [];
  fns.forEach((fn, i) => {
    while (stack.length && fns[stack[stack.length - 1]].closeIdx < fn.keywordIdx) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent != null) for (const name of methods[parent].locals) methods[i].locals.add(name);
    stack.push(i);
  });

  // Lines that sit inside a function body: `var`s there are locals, not members.
  const depthDelta = new Int32Array(lines.starts.length + 2);
  for (const fn of fns) {
    depthDelta[lines.lineAt(fn.openIdx) + 1]++;
    depthDelta[lines.lineAt(fn.closeIdx) + 1]--;
  }

  const members: ParsedMember[] = [];
  const pushMember = (name: string, kind: CodeMember['kind'], lineNo: number, valueFrom: number, valueTo: number) => {
    const valueText = text.slice(valueFrom, valueTo).trim();
    const valueCode = code.slice(valueFrom, valueTo);
    if (/^\s*function(?![\w$])/.test(valueCode) || /=>/.test(valueCode)) return; // indexed as a method
    // References come from the initializer only: declaring `var hero` is not
    // a reference to an asset called `hero`.
    const refs = findRefs(text.slice(valueFrom, valueTo), knownNames, valueFrom, lines);
    members.push({
      name, kind, startLine: lineNo,
      value: valueText.slice(0, 120), refs, assetRefs: refs.map((r) => r.name), scanCode: valueCode,
    });
  };

  let depth = 0;
  for (let li = 0; li < lines.starts.length; li++) {
    const lineNo = li + 1;
    depth += depthDelta[lineNo];
    const from = lines.starts[li];
    const to = li + 1 < lines.starts.length ? lines.starts[li + 1] - 1 : source.length;
    const lineText = text.slice(from, to);
    if (!lineText.trim()) continue;

    const decl = DECL_HEAD_RE.exec(lineText);
    if (decl) {
      if (depth > 0) continue; // function-local declaration
      const kind: CodeMember['kind'] = decl[1] === 'const' ? 'const' : 'var';
      const listFrom = from + decl[0].length;
      const listTo = statementEnd(code, listFrom, to);
      // `var a = 1, b:int = 2, c;` — one member per declarator.
      for (const [a, b] of splitTopLevel(code, listFrom, listTo)) {
        const piece = text.slice(a, b);
        const d = DECLARATOR_RE.exec(piece);
        if (!d) continue;
        const value = d[2] ?? '';
        const valueTo = a + piece.trimEnd().length;
        pushMember(d[1], kind, lineNo, valueTo - value.length, valueTo);
      }
      continue;
    }
    const prop = THIS_PROP_HEAD_RE.exec(lineText);
    if (prop) {
      const valueFrom = from + prop[0].length;
      pushMember(prop[1], 'property', lineNo, valueFrom, statementEnd(code, valueFrom, to));
    }
  }

  return { methods, members, lines };
}

function stripMethod(m: ParsedMethod): Omit<CodeMethod, 'id' | 'sourceLabel'> {
  const { bodyStart: _b, scanCode: _s, locals: _l, ...rest } = m;
  return rest;
}

function stripMember(m: ParsedMember): Omit<CodeMember, 'id' | 'sourceLabel'> {
  const { scanCode: _s, ...rest } = m;
  return rest;
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
    const src = s.source ?? '';
    if (!src.trim()) {
      summaries.push({ label: s.label, source: src, methodCount: 0, memberCount: 0, refCount: 0 });
      continue;
    }
    const parsed = analyzeSource(src, knownNames);
    for (const method of parsed.methods) methods.push({ ...stripMethod(method), id: `m${methodSeq++}`, sourceLabel: s.label });
    for (const member of parsed.members) members.push({ ...stripMember(member), id: `v${memberSeq++}`, sourceLabel: s.label });
    const refCount = parsed.methods.reduce((n, m) => n + m.refs.length, 0) + parsed.members.reduce((n, m) => n + m.refs.length, 0);
    summaries.push({ label: s.label, source: src, methodCount: parsed.methods.length, memberCount: parsed.members.length, refCount });
  }

  const relationships: CodeRelationship[] = [];
  const assetIndex = dict<AssetUsage>();
  const pushRel = (codeType: 'method' | 'member', codeName: string, sourceLabel: string, defLine: number, ref: CodeRef) => {
    const asset = assetByName.get(ref.name);
    const line = ref.line ?? defLine;
    const lines = ref.lines ?? [line];
    relationships.push({
      codeType, codeName, sourceLabel, line, lines,
      assetName: ref.name, assetId: asset?.assetId, assetKind: asset?.assetKind, via: ref.via,
    });
    const usage = (assetIndex[ref.name] ??= { assetId: asset?.assetId, assetKind: asset?.assetKind, usedBy: [] });
    usage.usedBy.push({ codeType, codeName, sourceLabel, line, lines });
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

/**
 * Every name a character or clip can be referred to by in code. Shared by the
 * Inspector "Code" tab and the full-screen Code Inspector so both resolve
 * asset references identically.
 */
export function buildAssetDescriptors(doc: SwfDocument, project: Project): AssetDescriptor[] {
  const out: AssetDescriptor[] = [];
  doc.characters.forEach((ch) => {
    const names = new Set<string>();
    if (ch.className) names.add(ch.className);
    if (ch.exportName) names.add(ch.exportName);
    const label = project.characters[ch.id]?.name;
    if (label) names.add(label);
    names.add(`${ch.kind}_${ch.id}`);
    names.forEach((name) => out.push({ name, assetId: ch.id, assetKind: ch.kind }));
  });
  project.clips.forEach((c) => out.push({ name: c.name, assetKind: 'clip' }));
  return out;
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
  /** First usage line in the source. */
  fromLine: number;
  /** Every usage line of this (from, via, to) edge, ascending. */
  lines: number[];
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
  assetIndex: Record<string, { assetId?: number; assetKind?: string; usedBy: { fromName: string; fromSourceId: string; line: number; lines: number[] }[] }>;
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

const EDGE_IDENT_RE = /(?<![\w$])[A-Za-z_$][\w$]*(?![\w$])/g;
const OWNER_RE = /(?:^|[^\w$.])(this|_root|_global|_parent|_level\d+)\.$/;
const EMPTY_SET: ReadonlySet<string> = new Set();
const COMPOUND_ASSIGN_RE = /^(?:[+\-*/%&|^]|<<|>>>?)=/;

/**
 * Scan masked code (comments/strings blanked) for code→code edges.
 * `index` is the offset of the identifier inside `code`.
 */
function scanCodeEdges(
  code: string,
  methodNames: Set<string>,
  memberNames: Set<string>,
  emit: (edge: { toName: string; via: Exclude<RefVia, 'asset'>; index: number }) => void,
  locals: ReadonlySet<string> = EMPTY_SET,
) {
  let m: RegExpExecArray | null;
  EDGE_IDENT_RE.lastIndex = 0;
  while ((m = EDGE_IDENT_RE.exec(code))) {
    const name = m[0];
    const start = m.index;
    const isMethod = methodNames.has(name);
    const isMember = memberNames.has(name);
    if (!isMethod && !isMember) continue;
    if (BUILTINS.has(name) || KEYWORDS.has(name)) continue;

    const lookBehind = code.slice(Math.max(0, start - 16), start);
    // Declarations (`var x`, `function x`, `get x`) are not references.
    if (/(?:^|[^\w$])(?:var|const|function|get|set)\s+$/.test(lookBehind)) continue;

    let q = start + name.length;
    while (q < code.length && (code[q] === ' ' || code[q] === '\t')) q++;
    const next = code.slice(q, q + 4);

    const dotted = code[start - 1] === '.';
    // A bare name bound by a parameter / local / catch variable (in this
    // function or an enclosing one) shadows any member or method of that name.
    if (!dotted && locals.has(name)) continue;

    // Calls: `name(` (also `obj.name(` — methods are often invoked via _root./this.).
    if (next[0] === '(') {
      if (isMethod) emit({ toName: name, via: 'call', index: start });
      continue;
    }
    if (!isMember || AS_PROPERTIES.has(name)) continue;

    // `this.x`, `_root.x`, `_global.x`, `_parent.x`, `_level0.x` address
    // timeline members; any other `obj.x` needs type inference to resolve.
    const owner = dotted ? OWNER_RE.exec(lookBehind) : null;
    if (dotted && !owner) continue;

    // Object-literal key `{ name: … }` is not a reference.
    let p = (owner ? start - owner[1].length - 1 : start) - 1;
    while (p >= 0 && /\s/.test(code[p])) p--;
    if (next[0] === ':' && (code[p] === '{' || code[p] === ',')) continue;

    const incDec = next.startsWith('++') || next.startsWith('--')
      || (p >= 1 && ((code[p] === '+' && code[p - 1] === '+') || (code[p] === '-' && code[p - 1] === '-')));
    const plainAssign = next[0] === '=' && next[1] !== '=';
    const compound = COMPOUND_ASSIGN_RE.test(next);

    if (plainAssign) emit({ toName: name, via: 'write', index: start });
    else if (compound || incDec) {
      emit({ toName: name, via: 'read', index: start });
      emit({ toName: name, via: 'write', index: start });
    } else emit({ toName: name, via: 'read', index: start });
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
  /** Parallel to `symbols`: what to scan for edges and how to map offsets to lines. */
  const scanInfo: { code: string; base: number; lines: LineIndex | null; line: number; locals: ReadonlySet<string> }[] = [];
  const methodNames = new Set<string>();
  const memberNames = new Set<string>();
  let seq = 0;
  const summaries: CodebaseSource[] = [];

  // Pass 1 — collect all symbols.
  for (const s of sources) {
    const src = s.source ?? '';
    const lines = src.split('\n');
    const parsed: ParsedSource | null = src.trim() ? analyzeSource(src, assetNames) : null;
    let methodCount = 0;
    let memberCount = 0;
    for (const m of parsed?.methods ?? []) {
      symbols.push({
        id: `sym${seq++}`, name: m.name, kind: m.kind, isCode: true, sourceId: s.id, sourceLabel: s.label, timelineId: s.timelineId,
        line: m.startLine, endLine: m.endLine, params: m.params, body: m.body,
        lineText: lines[m.startLine - 1] ?? '', refs: m.refs,
      });
      scanInfo.push({ code: m.scanCode, base: m.bodyStart, lines: parsed!.lines, line: m.startLine, locals: m.locals });
      methodNames.add(m.name);
      methodCount++;
    }
    for (const m of parsed?.members ?? []) {
      symbols.push({
        id: `sym${seq++}`, name: m.name, kind: m.kind === 'const' ? 'property' : m.kind, isCode: false,
        sourceId: s.id, sourceLabel: s.label, timelineId: s.timelineId,
        line: m.startLine, endLine: m.startLine, params: [], body: m.value,
        lineText: lines[m.startLine - 1] ?? '', refs: m.refs,
      });
      scanInfo.push({ code: m.scanCode, base: 0, lines: null, line: m.startLine, locals: EMPTY_SET });
      memberNames.add(m.name);
      memberCount++;
    }
    summaries.push({ id: s.id, label: s.label, timelineId: s.timelineId, source: src, methodCount, memberCount });
  }

  // Pass 2 — resolve cross-references.
  const references: RefEdge[] = [];
  const edgeByKey = new Map<string, RefEdge>();
  let refSeq = 0;
  const addEdge = (from: SymbolDef, edge: { toName: string; via: RefVia }, lines: number[]) => {
    const key = `${from.id}|${edge.via}|${edge.toName}`;
    const existing = edgeByKey.get(key);
    if (existing) {
      for (const l of lines) if (!existing.lines.includes(l)) existing.lines.push(l);
      return;
    }
    const toKind: RefTargetKind = edge.via === 'asset' ? 'asset' : edge.via === 'call' ? 'method' : 'member';
    const asset = edge.via === 'asset' ? assetByName.get(edge.toName) : undefined;
    const ref: RefEdge = {
      id: `ref${refSeq++}`,
      fromName: from.name, fromSourceId: from.sourceId, fromLine: lines[0], lines: [...lines],
      toKind, toName: edge.toName,
      assetId: asset?.assetId, assetKind: asset?.assetKind,
      via: edge.via,
    };
    edgeByKey.set(key, ref);
    references.push(ref);
  };

  symbols.forEach((s, i) => {
    const info = scanInfo[i];
    scanCodeEdges(info.code, methodNames, memberNames, (edge) => {
      // Drop self-references (recursion, `var x = x + 1`) to keep the graph clean.
      if (edge.toName === s.name) return;
      addEdge(s, edge, [info.lines ? info.lines.lineAt(info.base + edge.index) : info.line]);
    }, info.locals);
    for (const ref of s.refs) addEdge(s, { toName: ref.name, via: 'asset' }, ref.lines ?? [ref.line ?? s.line]);
  });
  for (const r of references) {
    r.lines.sort((a, b) => a - b);
    r.fromLine = r.lines[0];
  }

  // Indexes (prototype-free so names like `constructor`/`toString` are safe).
  const byName = dict<{ definitions: string[]; references: RefEdge[] }>();
  for (const s of symbols) {
    (byName[s.name] ??= { definitions: [], references: [] }).definitions.push(s.id);
  }
  for (const r of references) {
    (byName[r.toName] ??= { definitions: [], references: [] }).references.push(r);
  }
  const assetIndex = dict<CodebaseAnalysis['assetIndex'][string]>();
  for (const r of references) {
    if (r.via !== 'asset') continue;
    const usage = (assetIndex[r.toName] ??= { assetId: r.assetId, assetKind: r.assetKind, usedBy: [] });
    usage.usedBy.push({ fromName: r.fromName, fromSourceId: r.fromSourceId, line: r.fromLine, lines: r.lines });
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
