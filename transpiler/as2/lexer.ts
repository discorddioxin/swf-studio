// AS1/AS2 tokenizer. AS2 has no regular-expression literals, so '/' is always
// an operator. FFDec's decompiler markers (§§push, §§pop, …) are identifiers.

export type TokenType = 'ident' | 'keyword' | 'num' | 'str' | 'punc' | 'eof';
export interface Token { type: TokenType; value: string; pos: number; line: number; nlBefore: boolean }

const KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'continue', 'default', 'delete', 'do', 'dynamic', 'else', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'intrinsic', 'new',
  'null', 'private', 'public', 'return', 'static', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined',
  'var', 'void', 'while', 'with',
]);

// Longest first.
const PUNCS = [
  '>>>=', '===', '!==', '>>>', '<<=', '>>=', '...', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=',
  '%=', '&=', '|=', '^=', '<<', '>>', '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|',
  '^', '!', '~', '?', ':', '=', '.', '@', '#',
];

export class LexError extends Error {
  constructor(message: string, readonly line: number) { super(`${message} (line ${line})`); }
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0, line = 1, nl = false;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; nl = true; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '\u00a0' || c === '\ufeff') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') { line++; nl = true; }
      i = stop;
      continue;
    }
    const start = i;
    const push = (type: TokenType, value: string) => { out.push({ type, value, pos: start, line, nlBefore: nl }); nl = false; };

    if (/[A-Za-z_$§]/.test(c)) {
      while (i < n && /[\w$§]/.test(src[i])) i++;
      const word = src.slice(start, i);
      push(KEYWORDS.has(word) ? 'keyword' : 'ident', word);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      if (c === '0' && /[xX]/.test(src[i + 1] ?? '')) { i += 2; while (i < n && /[0-9a-fA-F]/.test(src[i])) i++; }
      else {
        while (i < n && /[0-9]/.test(src[i])) i++;
        if (src[i] === '.') { i++; while (i < n && /[0-9]/.test(src[i])) i++; }
        if (/[eE]/.test(src[i] ?? '')) { i++; if (/[+-]/.test(src[i] ?? '')) i++; while (i < n && /[0-9]/.test(src[i])) i++; }
      }
      push('num', src.slice(start, i));
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      let s = '';
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') {
          const e = src[i + 1];
          const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
          if (e === 'x') { s += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)); i += 4; continue; }
          if (e === 'u') { s += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue; }
          if (e === '\n') line++;
          s += map[e] ?? e;
          i += 2;
          continue;
        }
        if (src[i] === '\n') line++;
        s += src[i++];
      }
      if (i >= n) throw new LexError('Unterminated string', line);
      i++;
      push('str', s);
      continue;
    }
    const p = PUNCS.find((x) => src.startsWith(x, i));
    if (!p) throw new LexError(`Unexpected character ${JSON.stringify(c)}`, line);
    i += p.length;
    push('punc', p);
  }
  out.push({ type: 'eof', value: '', pos: n, line, nlBefore: true });
  return out;
}
