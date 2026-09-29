// TextField text model: Flash's HTML subset → styled runs → wrapped lines.
// Units here are PIXELS (the caller converts from TWIPS).

export interface TextStyle {
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  url?: string;
  align: 'left' | 'center' | 'right' | 'justify';
}

export interface Run extends Omit<TextStyle, 'align'> { text: string }
export interface Paragraph { align: TextStyle['align']; runs: Run[] }
export interface Line { runs: (Run & { x: number; width: number })[]; width: number; height: number; ascent: number; align: TextStyle['align'] }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCharCode(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function attrsOf(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  return out;
}

/** Parse Flash-style HTML (P, FONT, B, I, U, A, BR, LI, TEXTFORMAT, SPAN). */
export function parseHtml(html: string, base: TextStyle): Paragraph[] {
  const paras: Paragraph[] = [];
  const stack: TextStyle[] = [{ ...base }];
  let para: Paragraph = { align: base.align, runs: [] };
  const top = () => stack[stack.length - 1];
  const push = (text: string) => {
    if (!text) return;
    const { align: _a, ...st } = top();
    const last = para.runs[para.runs.length - 1];
    if (last && last.font === st.font && last.size === st.size && last.color === st.color && last.bold === st.bold && last.italic === st.italic && last.underline === st.underline && last.url === st.url) last.text += text;
    else para.runs.push({ ...st, text });
  };
  const breakPara = () => { paras.push(para); para = { align: top().align, runs: [] }; };
  let started = false;
  for (const m of html.matchAll(/<(\/?)([a-z]+)([^>]*)>|([^<]+)/gi)) {
    if (m[4] !== undefined) { push(decodeEntities(m[4]).replace(/\r\n?/g, '\n')); started = true; continue; }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const a = attrsOf(m[3] ?? '');
    if (tag === 'br') { breakPara(); continue; }
    if (tag === 'p' || tag === 'li') {
      if (!closing) {
        if (started && para.runs.length) breakPara();
        const align = (a.align ?? '').toLowerCase();
        stack.push({ ...top(), align: (['left', 'center', 'right', 'justify'].includes(align) ? align : top().align) as TextStyle['align'] });
        para.align = top().align;
        if (tag === 'li') push('\u2022 ');
      } else { if (stack.length > 1) stack.pop(); breakPara(); }
      started = true;
      continue;
    }
    if (closing) { if (['font', 'b', 'i', 'u', 'a', 'span', 'textformat'].includes(tag) && stack.length > 1) stack.pop(); continue; }
    const st = { ...top() };
    if (tag === 'font') {
      if (a.face) st.font = a.face;
      if (a.size) st.size = /^[+-]/.test(a.size) ? st.size + Number(a.size) : Number(a.size) || st.size;
      if (a.color) st.color = a.color;
    } else if (tag === 'b') st.bold = true;
    else if (tag === 'i') st.italic = true;
    else if (tag === 'u') st.underline = true;
    else if (tag === 'a') st.url = a.href;
    else if (tag !== 'span' && tag !== 'textformat') continue; // unknown tags are ignored
    stack.push(st);
  }
  if (para.runs.length || !paras.length) paras.push(para);
  // "\n" / "\r" inside text also break paragraphs
  return paras.flatMap((p) => {
    const out: Paragraph[] = [{ align: p.align, runs: [] }];
    for (const r of p.runs) {
      const parts = r.text.split('\n');
      parts.forEach((t, i) => { if (i) out.push({ align: p.align, runs: [] }); if (t) out[out.length - 1].runs.push({ ...r, text: t }); });
    }
    return out;
  });
}

export function plainToParagraphs(text: string, base: TextStyle): Paragraph[] {
  const { align, ...st } = base;
  return text.replace(/\r\n?/g, '\n').split('\n').map((t) => ({ align, runs: t ? [{ ...st, text: t }] : [] }));
}

export function paragraphsToHtml(paras: Paragraph[]): string {
  return paras.map((p) => `<P ALIGN="${p.align.toUpperCase()}">${p.runs.map((r) => {
    let s = escapeHtml(r.text);
    if (r.underline) s = `<U>${s}</U>`;
    if (r.italic) s = `<I>${s}</I>`;
    if (r.bold) s = `<B>${s}</B>`;
    s = `<FONT FACE="${r.font}" SIZE="${r.size}" COLOR="${r.color}">${s}</FONT>`;
    return r.url ? `<A HREF="${r.url}">${s}</A>` : s;
  }).join('')}</P>`).join('');
}

export const paragraphsToText = (paras: Paragraph[]) => paras.map((p) => p.runs.map((r) => r.text).join('')).join('\r');

export function cssFont(r: { font: string; size: number; bold: boolean; italic: boolean }, families: (name: string) => string) {
  return `${r.italic ? 'italic ' : ''}${r.bold ? 'bold ' : ''}${Math.max(1, r.size)}px ${families(r.font)}`;
}

type Measure = (text: string, run: Run) => number;

/** Greedy word wrap (Flash breaks on spaces, and mid-word when a word is wider than the field). */
export function layout(paras: Paragraph[], width: number, wordWrap: boolean, measure: Measure): Line[] {
  const lines: Line[] = [];
  for (const p of paras) {
    let line: Line = { runs: [], width: 0, height: 0, ascent: 0, align: p.align };
    const lineHeight = (r: Run) => r.size * 1.15;
    const flush = () => {
      if (!line.height) line.height = lineHeight(p.runs[0] ?? { size: 12 } as Run);
      line.ascent = Math.max(line.ascent, line.height * 0.87);
      lines.push(line);
      line = { runs: [], width: 0, height: 0, ascent: 0, align: p.align };
    };
    const put = (r: Run, text: string) => {
      const w = measure(text, r);
      const last = line.runs[line.runs.length - 1];
      if (last && last.font === r.font && last.size === r.size && last.color === r.color && last.bold === r.bold && last.italic === r.italic && last.underline === r.underline) {
        last.text += text; last.width += w;
      } else line.runs.push({ ...r, text, x: line.width, width: w });
      line.width += w;
      line.height = Math.max(line.height, lineHeight(r));
      line.ascent = Math.max(line.ascent, r.size * 0.95);
    };
    for (const r of p.runs) {
      if (!wordWrap) { put(r, r.text); continue; }
      for (const tok of r.text.split(/(\s+)/)) {
        if (!tok) continue;
        const w = measure(tok, r);
        if (line.width + w > width && line.runs.length && !/^\s+$/.test(tok)) {
          flush();
        }
        if (/^\s+$/.test(tok) && !line.runs.length && lines.length && lines[lines.length - 1].align === p.align && line.width === 0) continue;
        if (w > width && !/^\s+$/.test(tok)) {
          // break the word itself
          let chunk = '';
          for (const ch of tok) {
            if (line.width + measure(chunk + ch, r) > width && (chunk || line.runs.length)) { if (chunk) put(r, chunk); flush(); chunk = ''; }
            chunk += ch;
          }
          if (chunk) put(r, chunk);
        } else put(r, tok);
      }
    }
    flush();
  }
  return lines;
}

/** Rough width estimate for environments without canvas text metrics. */
export const estimateWidth: Measure = (text, r) => text.length * r.size * (r.bold ? 0.6 : 0.55);
