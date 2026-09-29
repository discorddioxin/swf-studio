// flash.text: TextField (dynamic + input), TextFormat and the enums.

import { Event } from './events';
import { Rectangle } from './geom';
import { characterBounds, host, InteractiveObject, registerTextField } from './display';

export class TextFormat {
  font: string | null; size: number | null; color: number | null;
  bold: boolean | null; italic: boolean | null; underline: boolean | null;
  url: string | null; target: string | null; align: string | null;
  leftMargin: number | null; rightMargin: number | null; indent: number | null; leading: number | null;
  letterSpacing: number | null = null; kerning: boolean | null = null;
  constructor(font: string | null = null, size: number | null = null, color: number | null = null, bold: boolean | null = null,
    italic: boolean | null = null, underline: boolean | null = null, url: string | null = null, target: string | null = null,
    align: string | null = null, leftMargin: number | null = null, rightMargin: number | null = null, indent: number | null = null, leading: number | null = null) {
    this.font = font; this.size = size; this.color = color; this.bold = bold; this.italic = italic; this.underline = underline;
    this.url = url; this.target = target; this.align = align; this.leftMargin = leftMargin; this.rightMargin = rightMargin;
    this.indent = indent; this.leading = leading;
  }
}

export const TextFieldAutoSize = { NONE: 'none', LEFT: 'left', CENTER: 'center', RIGHT: 'right' } as const;
export const TextFieldType = { DYNAMIC: 'dynamic', INPUT: 'input' } as const;
export const TextFormatAlign = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFY: 'justify', START: 'start', END: 'end' } as const;
export const AntiAliasType = { NORMAL: 'normal', ADVANCED: 'advanced' } as const;
export const GridFitType = { NONE: 'none', PIXEL: 'pixel', SUBPIXEL: 'subpixel' } as const;

export class Font {
  fontName = ''; fontStyle = 'regular'; fontType = 'embedded';
  static enumerateFonts() { return []; }
  static registerFont() {}
  hasGlyphs() { return true; }
}

let measureCtx: CanvasRenderingContext2D | null | undefined;
function measure(text: string, font: string): number {
  if (measureCtx === undefined) {
    try {
      // jsdom has no canvas: fall back to an estimate there.
      const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
      measureCtx = typeof document !== 'undefined' && !isJsdom ? document.createElement('canvas').getContext('2d') : null;
    } catch { measureCtx = null; }
  }
  if (!measureCtx) return text.length * 0.55 * (parseFloat(font.replace(/^\D+/, '')) || 12);
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const htmlToText = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*/gi, '\n').replace(/<[^>]*>/g, '')).replace(/\n$/, '');

export class TextField extends InteractiveObject {
  private _text = '';
  private _html = false;
  private _format = new TextFormat('Times New Roman', 12, 0x000000, false, false, false, null, null, 'left', 0, 0, 0, 0);
  private _w = 100;
  private _h = 100;
  private _ox = 0;
  private _oy = 0;
  autoSize: string = TextFieldAutoSize.NONE;
  wordWrap = false;
  multiline = false;
  selectable = true;
  type: string = TextFieldType.DYNAMIC;
  embedFonts = false;
  border = false;
  borderColor = 0x000000;
  background = false;
  backgroundColor = 0xffffff;
  maxChars = 0;
  restrict: string | null = null;
  displayAsPassword = false;
  antiAliasType = 'normal';
  gridFitType = 'pixel';
  sharpness = 0;
  thickness = 0;
  condenseWhite = false;
  mouseWheelEnabled = true;
  alwaysShowSelection = false;
  scrollV = 1;
  scrollH = 0;
  styleSheet: unknown = null;

  constructor() {
    super();
    // A DefineEditText placed by the timeline carries its box and initial text.
    const b = characterBounds(this._symbol);
    if (!b.isEmpty()) { this._ox = b.x; this._oy = b.y; this._w = b.width; this._h = b.height; }
    const ch = typeof this._symbol === 'number' ? host()?.doc.characters.get(this._symbol) : undefined;
    if (ch?.kind === 'edittext') this._initFromCharacter(ch.attrs);
  }

  /** @internal DefineEditText attributes (JPEXS XML) */
  _initFromCharacter(attrs: Record<string, string>) {
    const bool = (k: string) => attrs[k] === 'true';
    this._html = bool('html');
    this.wordWrap = bool('wordWrap');
    this.multiline = bool('multiline');
    this.selectable = !bool('noSelect');
    this.border = bool('border');
    this.type = bool('readOnly') ? TextFieldType.DYNAMIC : TextFieldType.INPUT;
    if (attrs.maxLength) this.maxChars = Number(attrs.maxLength) || 0;
    if (attrs.fontHeight) this._format.size = Number(attrs.fontHeight) / 20;
    const align = ['left', 'right', 'center', 'justify'][Number(attrs.align) || 0];
    this._format.align = align;
    this.embedFonts = bool('useOutlines');
    this.displayAsPassword = bool('password');
    if (bool('autoSize')) this.autoSize = TextFieldAutoSize.LEFT;
    const initial = attrs.initialText ?? '';
    this._text = this._html ? htmlToText(initial) : initial;
  }

  get text() { return this._text; }
  set text(v: string) { this._text = v == null ? '' : String(v).replace(/\r\n?/g, '\n'); }
  get htmlText() { return this._text; }
  set htmlText(v: string) { this._text = htmlToText(String(v ?? '')); }
  appendText(v: string) { this.text = this._text + String(v); }
  replaceText(begin: number, end: number, v: string) { this.text = this._text.slice(0, begin) + v + this._text.slice(end); }
  replaceSelectedText(v: string) { this.appendText(v); }
  get length() { return this._text.length; }
  get textColor() { return this._format.color ?? 0; }
  set textColor(v: number) { this._format.color = v; }
  get defaultTextFormat() { return Object.assign(new TextFormat(), this._format); }
  set defaultTextFormat(f: TextFormat) { this._merge(f); }
  setTextFormat(f: TextFormat, _begin = -1, _end = -1) { this._merge(f); }
  getTextFormat(_begin = -1, _end = -1) { return this.defaultTextFormat; }
  private _merge(f: TextFormat) {
    for (const [k, v] of Object.entries(f)) if (v != null) (this._format as unknown as Record<string, unknown>)[k] = v;
  }
  get numLines() { return this._lines().length; }
  get maxScrollV() { return 1; }
  get maxScrollH() { return 0; }
  get bottomScrollV() { return this.numLines; }
  get selectionBeginIndex() { return this._text.length; }
  get selectionEndIndex() { return this._text.length; }
  get caretIndex() { return this._text.length; }
  setSelection() {}
  getLineText(i: number) { return this._lines()[i] ?? ''; }
  getLineLength(i: number) { return this.getLineText(i).length; }
  get textWidth() { return Math.max(0, ...this._lines().map((l) => measure(l, this._font()))); }
  get textHeight() { return this._lines().length * this._lineHeight(); }

  get width() { return this._autoRect().width * Math.abs(this.scaleX); }
  set width(v: number) { this._w = Math.max(0, Number(v) || 0); }
  get height() { return this._autoRect().height * Math.abs(this.scaleY); }
  set height(v: number) { this._h = Math.max(0, Number(v) || 0); }

  /** @internal typed by the player's keyboard handling */
  _input(key: string) {
    if (this.type !== TextFieldType.INPUT) return;
    if (key === 'Backspace') this._text = this._text.slice(0, -1);
    else if (key === 'Enter') { if (this.multiline) this._text += '\n'; }
    else if (key.length === 1) {
      if (this.maxChars && this._text.length >= this.maxChars) return;
      if (this.restrict && !new RegExp(`^[${this.restrict.replace(/\\/g, '\\\\').replace(/]/g, '\\]')}]$`).test(key)) return;
      this._text += key;
    } else return;
    this.dispatchEvent(new Event(Event.CHANGE, true));
  }

  private _font() {
    const f = this._format;
    const family = (f.font ?? 'Times New Roman').replace(/^_sans$/, 'sans-serif').replace(/^_serif$/, 'serif').replace(/^_typewriter$/, 'monospace');
    return `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${f.size ?? 12}px "${family}", sans-serif`;
  }
  private _lineHeight() { return (this._format.size ?? 12) * 1.15 + (this._format.leading ?? 0); }
  private _lines(): string[] {
    const shown = this.displayAsPassword ? '*'.repeat(this._text.length) : this._text;
    const raw = shown.split('\n');
    if (!this.wordWrap) return raw;
    const font = this._font();
    const max = Math.max(1, this._w - 4);
    const out: string[] = [];
    for (const para of raw) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        if (line && measure(line + word, font) > max && word.trim()) { out.push(line.trimEnd()); line = word.trimStart(); }
        else line += word;
      }
      out.push(line);
    }
    return out;
  }
  private _autoRect(): Rectangle {
    if (this.autoSize === TextFieldAutoSize.NONE) return new Rectangle(this._ox, this._oy, this._w, this._h);
    const w = this.wordWrap ? this._w : this.textWidth + 4;
    const h = this.textHeight + 4;
    const x = this.autoSize === TextFieldAutoSize.RIGHT ? this._ox + this._w - w : this.autoSize === TextFieldAutoSize.CENTER ? this._ox + (this._w - w) / 2 : this._ox;
    return new Rectangle(x, this._oy, w, h);
  }

  /** @internal */ _localBounds() { return this._autoRect(); }
  /** @internal */ _drawSelf(ctx: CanvasRenderingContext2D) {
    const r = this._autoRect();
    if (this.background) { ctx.fillStyle = hex(this.backgroundColor); ctx.fillRect(r.x, r.y, r.width, r.height); }
    if (this.border) { ctx.strokeStyle = hex(this.borderColor); ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width - 1, r.height - 1); }
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.width, r.height); ctx.clip();
    const font = this._font();
    ctx.font = font;
    ctx.fillStyle = hex(this._format.color ?? 0);
    ctx.textBaseline = 'top';
    const lh = this._lineHeight();
    const align = this._format.align ?? 'left';
    this._lines().forEach((line, i) => {
      const w = measure(line, font);
      const x = align === 'center' ? r.x + (r.width - w) / 2 : align === 'right' ? r.right - 2 - w : r.x + 2 + (this._format.leftMargin ?? 0);
      ctx.fillText(line, x, r.y + 2 + i * lh);
    });
    ctx.restore();
  }
}

registerTextField(TextField as unknown as new () => InteractiveObject);

const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
