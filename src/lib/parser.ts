import { avm1ActionSource, hexToBytes } from './swf/bitio';
import {
  type ColorTransform, type DisplayItem, type EventKind, type Frame, type FrameEvent,
  type Matrix, type PlaceOp, type Rect, type SwfCharacter, type TextRecord, type SwfDocument,
  type Timeline, type CharacterKind, IDENTITY,
} from '../types';

// ---------------------------------------------------------------------------
// Small DOM helpers.  JPEXS writes elements like
//   <item type="PlaceObject2Tag" depth="1" placeFlagHasMatrix="true">
//      <matrix type="MATRIX" hasScale="true" scaleX="65536" translateX="1200"/>
//   </item>
// but older / patched exporters use <PlaceObject2Tag ...>.  We accept both.
// ---------------------------------------------------------------------------

function attrMap(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    // JPEXS inlines raw byte arrays (imageData, soundData, actionBytes…) as hex
    // attributes – never keep those around, they can be megabytes each.
    if (a.value.length > 256) { out[a.name] = `«${a.value.length} chars»`; continue; }
    out[a.name] = a.value;
  }
  return out;
}

function tagTypeOf(el: Element): string | null {
  const t = el.getAttribute('type');
  if (t && /Tag$/.test(t)) return t;
  if (/Tag$/.test(el.tagName)) return el.tagName;
  return null;
}

const CONTAINER_RE = /^(subTags|tags|subtags|tagList|timelined)$/i;

/** direct tag children, either inline or wrapped in a list container such as
 *  <tags> (SWF) or <subTags> (DefineSpriteTag).  JPEXS names list elements
 *  after the java field, so we also accept any untyped container whose items
 *  are themselves tags. */
function tagChildren(el: Element): Element[] {
  const out: Element[] = [];
  for (const c of Array.from(el.children)) {
    if (tagTypeOf(c)) { out.push(c); continue; }
    if (c.hasAttribute('type') && !CONTAINER_RE.test(c.tagName)) continue;
    for (const g of Array.from(c.children)) if (tagTypeOf(g)) out.push(g);
  }
  return out;
}

/** search data (non-tag) descendants of a tag element */
function findData(el: Element, pred: (e: Element) => boolean): Element | null {
  const stack: Element[] = Array.from(el.children);
  while (stack.length) {
    const cur = stack.shift()!;
    if (tagTypeOf(cur) || CONTAINER_RE.test(cur.tagName)) continue; // never cross into sub tags
    if (pred(cur)) return cur;
    stack.push(...Array.from(cur.children));
  }
  return null;
}

function findAllData(el: Element, pred: (e: Element) => boolean): Element[] {
  const out: Element[] = [];
  const stack: Element[] = Array.from(el.children);
  while (stack.length) {
    const cur = stack.shift()!;
    if (tagTypeOf(cur) || CONTAINER_RE.test(cur.tagName)) continue;
    if (pred(cur)) out.push(cur);
    stack.push(...Array.from(cur.children));
  }
  return out;
}

const isType = (name: string) => (e: Element) =>
  e.getAttribute('type') === name || e.tagName.toLowerCase() === name.toLowerCase();

function num(v: string | null | undefined, dflt = 0): number {
  if (v == null || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function bool(v: string | null | undefined): boolean {
  return v === 'true' || v === '1';
}

// ---------------------------------------------------------------------------

export interface ParseOptions { fileName: string }

class Parser {
  /** JPEXS dumps raw struct fields, so scale/rotate are 16.16 fixed point and
   *  colour multipliers are 8.8 fixed point.  Some exporters emit floats – we
   *  auto-detect by looking for a decimal point anywhere in a MATRIX. */
  fixedMatrix = true;
  fixedColor = true;
  characters = new Map<number, SwfCharacter>();
  timelines = new Map<string, Timeline>();
  warnings: string[] = [];
  unknown: Record<string, number> = {};
  tagCount = 0;
  classNames = new Map<number, string>();
  backgroundColor: number | undefined;
  exportNames = new Map<number, string>();

  detectNumberFormat(doc: Document) {
    const mats = doc.querySelectorAll('[scaleX],[translateX],[rotateSkew0]');
    let sawDot = false, sawBig = false;
    for (let i = 0; i < Math.min(mats.length, 400); i++) {
      const m = mats[i];
      for (const k of ['scaleX', 'scaleY', 'rotateSkew0', 'rotateSkew1']) {
        const v = m.getAttribute(k);
        if (!v) continue;
        if (v.includes('.')) sawDot = true;
        if (Math.abs(Number(v)) > 40) sawBig = true;
      }
    }
    this.fixedMatrix = sawBig || !sawDot;
    const cx = doc.querySelectorAll('[redMultTerm],[alphaMultTerm]');
    let cSawDot = false, cSawBig = false;
    for (let i = 0; i < Math.min(cx.length, 400); i++) {
      for (const k of ['redMultTerm', 'greenMultTerm', 'blueMultTerm', 'alphaMultTerm']) {
        const v = cx[i].getAttribute(k);
        if (!v) continue;
        if (v.includes('.')) cSawDot = true;
        if (Math.abs(Number(v)) > 2) cSawBig = true;
      }
    }
    this.fixedColor = cSawBig || !cSawDot;
  }

  matrixOf(el: Element): Matrix | undefined {
    const m = findData(el, isType('MATRIX')) ?? findData(el, (e) => e.tagName === 'matrix');
    if (!m) return undefined;
    return this.readMatrix(m);
  }

  readMatrix(m: Element): Matrix {
    const f = this.fixedMatrix ? 65536 : 1;
    const hasScale = m.hasAttribute('hasScale') ? bool(m.getAttribute('hasScale')) : true;
    const hasRot = m.hasAttribute('hasRotate') ? bool(m.getAttribute('hasRotate')) : true;
    const a = hasScale ? num(m.getAttribute('scaleX'), f) / f : 1;
    const d = hasScale ? num(m.getAttribute('scaleY'), f) / f : 1;
    const b = hasRot ? num(m.getAttribute('rotateSkew0')) / f : 0;
    const c = hasRot ? num(m.getAttribute('rotateSkew1')) / f : 0;
    // translate is *always* in twips, never scaled
    return {
      a, b, c, d,
      tx: num(m.getAttribute('translateX')),
      ty: num(m.getAttribute('translateY')),
    };
  }

  colorOf(el: Element): ColorTransform | undefined {
    const cx =
      findData(el, isType('CXFORMWITHALPHA')) ??
      findData(el, isType('CXFORM')) ??
      findData(el, (e) => /^colorTransform/i.test(e.tagName));
    if (!cx) return undefined;
    const f = this.fixedColor ? 256 : 1;
    const hasMult = cx.hasAttribute('hasMultTerms') ? bool(cx.getAttribute('hasMultTerms')) : true;
    const hasAdd = cx.hasAttribute('hasAddTerms') ? bool(cx.getAttribute('hasAddTerms')) : true;
    const ct: ColorTransform = {
      rm: hasMult ? num(cx.getAttribute('redMultTerm'), f) / f : 1,
      gm: hasMult ? num(cx.getAttribute('greenMultTerm'), f) / f : 1,
      bm: hasMult ? num(cx.getAttribute('blueMultTerm'), f) / f : 1,
      am: hasMult ? num(cx.getAttribute('alphaMultTerm'), f) / f : 1,
      ra: hasAdd ? num(cx.getAttribute('redAddTerm')) : 0,
      ga: hasAdd ? num(cx.getAttribute('greenAddTerm')) : 0,
      ba: hasAdd ? num(cx.getAttribute('blueAddTerm')) : 0,
      aa: hasAdd ? num(cx.getAttribute('alphaAddTerm')) : 0,
    };
    if (ct.rm === 1 && ct.gm === 1 && ct.bm === 1 && ct.am === 1 &&
        !ct.ra && !ct.ga && !ct.ba && !ct.aa) return undefined;
    return ct;
  }

  rectOf(el: Element, prefer?: string): Rect | undefined {
    let r: Element | null = null;
    if (prefer) r = findData(el, (e) => e.tagName === prefer);
    if (!r) r = findData(el, (e) => e.hasAttribute('Xmin') || e.hasAttribute('xmin'));
    if (!r) return undefined;
    const g = (n: string) => num(r!.getAttribute(n) ?? r!.getAttribute(n.toLowerCase()));
    return { xMin: g('Xmin'), xMax: g('Xmax'), yMin: g('Ymin'), yMax: g('Ymax') };
  }
}

// Attribute names that carry a tag's *own* character id, in priority order.
// FFDec spells the font tags' id `fontID` (DefineFont2/3, AlignZones) but
// `fontId` (DefineFontName). In DefineEditText `fontId` references the font the
// field uses, so it must not be read as the field's own id — charIdOf skips it
// for that tag (it made text fields collide with the font of the same number).
const ID_ATTRS = [
  'spriteId', 'shapeId', 'buttonId', 'fontID', 'fontId', 'soundId', 'videoId', 'imageId',
  'textId', 'characterID', 'characterId', 'binaryDataId', 'tagID', 'id',
];

function charIdOf(el: Element): number | undefined {
  // DefineEditText is the one tag whose `fontId` is a *reference*; for it the
  // character id is characterID/characterId, so that name is skipped here.
  const isEditText = /^DefineEditText/.test(el.getAttribute('type') ?? '');
  for (const k of ID_ATTRS) {
    if (k === 'fontId' && isEditText) continue;
    const v = el.getAttribute(k);
    if (v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

export function kindOfTag(type: string): CharacterKind | null {
  if (/^DefineSprite/.test(type)) return 'sprite';
  if (/^DefineMorphShape/.test(type)) return 'morphshape';
  if (/^DefineShape/.test(type)) return 'shape';
  if (/^DefineButton/.test(type)) return 'button';
  if (/^(DefineBits|DefineBitsJPEG|DefineBitsLossless)/.test(type)) return 'bitmap';
  if (/^DefineEditText/.test(type)) return 'edittext';
  if (/^DefineText/.test(type)) return 'text';
  if (/^DefineFont/.test(type)) return 'font';
  if (/^DefineSound/.test(type)) return 'sound';
  if (/^DefineVideoStream/.test(type)) return 'video';
  if (/^DefineBinaryData/.test(type)) return 'binary';
  return null;
}

const PLACE_RE = /^PlaceObject(2|3|4)?Tag$/;
const REMOVE_RE = /^RemoveObject(2)?Tag$/;

export function classify(type: string): EventKind {
  if (/^(DoAction|DoInitAction|DoABC|RawABC|DefineButtonCxform)/.test(type)) return 'action';
  if (/^(StartSound|SoundStreamHead|SoundStreamBlock|DefineSound)/.test(type)) return 'sound';
  if (/^FrameLabel/.test(type)) return 'label';
  if (/^(Define|JPEGTables|SymbolClass|ExportAssets|ImportAssets)/.test(type)) return 'define';
  if (PLACE_RE.test(type)) return 'place';
  if (REMOVE_RE.test(type)) return 'remove';
  return 'other';
}

/** everything the user asked to be emphasised */
export function isSpecialTag(type: string): boolean {
  return type !== 'PlaceObject2Tag' && type !== 'RemoveObject2Tag' &&
    type !== 'ShowFrameTag' && type !== 'EndTag' && !/^Define/.test(type) &&
    type !== 'JPEGTablesTag';
}

export interface DecodedActionBytes {
  source: string;
  listing: string[];
}

function cleanHex(value: string): number[] {
  const hex = value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function le16(bytes: number[], at: number) {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function leS16(bytes: number[], at: number) {
  const n = le16(bytes, at);
  return n & 0x8000 ? n - 0x10000 : n;
}

function leS32(bytes: number[], at: number) {
  const n = (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16) | ((bytes[at + 3] ?? 0) << 24);
  return n | 0;
}

function stackLiteral(bytes: number[], at: number): { value: string; next: number } {
  const kind = bytes[at] ?? 0;
  let p = at + 1;
  if (kind === 0) {
    const start = p;
    while (p < bytes.length && bytes[p] !== 0) p++;
    const text = String.fromCharCode(...bytes.slice(start, p));
    return { value: JSON.stringify(text), next: Math.min(bytes.length, p + 1) };
  }
  if (kind === 1) {
    const buf = new ArrayBuffer(4); const view = new DataView(buf);
    for (let i = 0; i < 4; i++) view.setUint8(i, bytes[p + i] ?? 0);
    return { value: String(view.getFloat32(0, true)), next: p + 4 };
  }
  if (kind === 2) return { value: 'null', next: p };
  if (kind === 3) return { value: 'undefined', next: p };
  if (kind === 4) return { value: `register(${bytes[p] ?? 0})`, next: p + 1 };
  if (kind === 5) return { value: bytes[p] ? 'true' : 'false', next: p + 1 };
  if (kind === 6) {
    const buf = new ArrayBuffer(8); const view = new DataView(buf);
    // SWF stores a double as two little-endian 32-bit words, high word first:
    // swap the halves to get a little-endian float64.
    for (let i = 0; i < 8; i++) view.setUint8((i + 4) % 8, bytes[p + i] ?? 0);
    return { value: String(view.getFloat64(0, true)), next: p + 8 };
  }
  if (kind === 7) return { value: String(leS32(bytes, p)), next: p + 4 };
  if (kind === 8) return { value: `constant8(${bytes[p] ?? 0})`, next: p + 1 };
  if (kind === 9) return { value: `constant16(${le16(bytes, p)})`, next: p + 2 };
  return { value: `pushType(${kind})`, next: p };
}

function popExpr(stack: string[], fallback = 'undefined') {
  return stack.pop() ?? fallback;
}

/** Decode the SWF ActionRecord stream when JPEXS did not export a .as file.
 * This is intentionally source-oriented, while the listing preserves offsets
 * and raw opcodes for anything that cannot be safely reconstructed. */
export function decodeActionBytes(raw: string): DecodedActionBytes {
  const bytes = cleanHex(raw);
  const stack: string[] = [];
  const source: string[] = [];
  const listing: string[] = [];
  const names: Record<number, string> = {
    0x04: 'NextFrame', 0x05: 'PreviousFrame', 0x06: 'Play', 0x07: 'Stop',
    0x0a: 'Add', 0x0b: 'Subtract', 0x0c: 'Multiply', 0x0d: 'Divide',
    0x0e: 'Equals', 0x0f: 'Less', 0x10: 'And', 0x11: 'Or', 0x12: 'Not',
    0x17: 'Pop', 0x1c: 'GetVariable', 0x1d: 'SetVariable', 0x20: 'SetTarget',
    0x21: 'StringEquals', 0x22: 'StringLength', 0x23: 'StringExtract',
    0x24: 'StringAdd', 0x26: 'Trace', 0x2d: 'Throw', 0x3d: 'CallFunction',
    0x3e: 'CallMethod', 0x42: 'InitArray', 0x43: 'InitObject', 0x44: 'TypeOf',
    0x46: 'Add2', 0x47: 'Less2', 0x48: 'Equals2', 0x4a: 'ToNumber',
    0x4b: 'ToString', 0x4c: 'PushDuplicate', 0x4d: 'StackSwap',
    0x4e: 'GetMember', 0x4f: 'SetMember', 0x50: 'Increment', 0x51: 'Decrement',
    0x52: 'CallMethod', 0x53: 'NewObject', 0x54: 'InstanceOf', 0x55: 'Enumerate',
    0x60: 'BitAnd', 0x61: 'BitOr', 0x62: 'BitXor', 0x63: 'ShiftLeft',
    0x64: 'ShiftRight', 0x65: 'ShiftRightUnsigned', 0x81: 'GotoFrame',
    0x83: 'GetURL', 0x87: 'StoreRegister', 0x88: 'ConstantPool',
    0x8a: 'WaitForFrame', 0x8b: 'SetTarget', 0x8c: 'GoToLabel',
    0x96: 'Push', 0x99: 'BranchIfTrue', 0x9d: 'GotoFrame2', 0x9e: 'Try',
    0x8d: 'WaitForFrame2', 0x94: 'With', 0x9b: 'DefineFunction', 0x9f: 'GotoFrame2',
  };
  const binary: Record<number, string> = {
    0x0a: '+', 0x0b: '-', 0x0c: '*', 0x0d: '/', 0x0f: '<', 0x46: '+',
    0x47: '<', 0x48: '==', 0x60: '&', 0x61: '|', 0x62: '^', 0x63: '<<',
    0x64: '>>', 0x65: '>>>',
  };

  let offset = 0;
  while (offset < bytes.length) {
    const start = offset;
    const opcode = bytes[offset++];
    if (opcode === 0) break;
    let payload: number[] = [];
    if (opcode >= 0x80) {
      const length = le16(bytes, offset);
      offset += 2;
      payload = bytes.slice(offset, offset + length);
      offset += length;
    }
    const name = names[opcode] ?? `UnknownAction0x${opcode.toString(16).padStart(2, '0')}`;
    const hex = bytes.slice(start, offset).map((n) => n.toString(16).padStart(2, '0')).join(' ');
    const addListing = (detail = '') => listing.push(`${String(start).padStart(5, '0')} ${name}${detail ? ` ${detail}` : ''} ; ${hex}`);

    if (opcode === 0x96) {
      const values: string[] = []; let p = 0;
      while (p < payload.length) { const v = stackLiteral(payload, p); values.push(v.value); stack.push(v.value); p = v.next; }
      addListing(values.join(', '));
    } else if (binary[opcode]) {
      const right = popExpr(stack); const left = popExpr(stack);
      stack.push(`(${left} ${binary[opcode]} ${right})`); addListing();
    } else if (opcode === 0x1c) {
      const nameExpr = popExpr(stack, '"unnamed"'); stack.push(`getVariable(${nameExpr})`); addListing();
    } else if (opcode === 0x1d) {
      const value = popExpr(stack); const nameExpr = popExpr(stack, '"unnamed"');
      source.push(`${nameExpr.replace(/^"|"$/g, '')} = ${value};`); addListing();
    } else if (opcode === 0x17) {
      const value = popExpr(stack); if (value !== 'undefined') source.push(`${value};`); addListing();
    } else if (opcode === 0x06 || opcode === 0x07 || opcode === 0x04 || opcode === 0x05) {
      source.push(`${name === 'PreviousFrame' ? 'prevFrame' : name === 'NextFrame' ? 'nextFrame' : name.toLowerCase()}();`); addListing();
    } else if (opcode === 0x4e) {
      const member = popExpr(stack, '"member"'); const object = popExpr(stack, 'this');
      stack.push(`${object}[${member}]`); addListing();
    } else if (opcode === 0x4f) {
      const value = popExpr(stack); const member = popExpr(stack, '"member"'); const object = popExpr(stack, 'this');
      source.push(`${object}[${member}] = ${value};`); addListing();
    } else if (opcode === 0x52 || opcode === 0x3e) {
      const method = popExpr(stack, '"method"'); const object = popExpr(stack, 'this');
      stack.push(`${object}[${method}]()`); addListing();
    } else if (opcode === 0x3d) {
      const fn = popExpr(stack, 'function'); stack.push(`${fn}()`); addListing();
    } else if (opcode === 0x26) {
      source.push(`trace(${popExpr(stack)});`); addListing();
    } else if (opcode === 0x81 && payload.length >= 2) {
      source.push(`gotoAndPlay(${le16(payload, 0)});`); addListing(`frame=${le16(payload, 0)}`);
    } else if (opcode === 0x83) {
      const urlEnd = payload.indexOf(0); const url = String.fromCharCode(...payload.slice(0, urlEnd < 0 ? payload.length : urlEnd));
      source.push(`getURL(${JSON.stringify(url)});`); addListing(JSON.stringify(url));
    } else if (opcode === 0x99 && payload.length >= 2) {
      source.push(`// if (${popExpr(stack, 'condition')}) goto byte ${start + 5 + leS16(payload, 0)};`); addListing(`offset=${leS16(payload, 0)}`);
    } else if (opcode === 0x9d) {
      source.push('// gotoFrame2();'); addListing();
    } else if (opcode === 0x4c) {
      const value = popExpr(stack); stack.push(value, value); addListing();
    } else if (opcode === 0x4d) {
      const a = popExpr(stack); const b = popExpr(stack); stack.push(a, b); addListing();
    } else {
      addListing(payload.length ? `payloadLength=${payload.length}` : '');
      source.push(`// ${name}${payload.length ? ` (payload ${payload.length} bytes)` : ''}`);
    }
  }

  while (stack.length) {
    const value = stack.shift();
    if (value && value !== 'undefined') source.push(`${value};`);
  }
  const sourceText = source.length ? source.map((line) => `  ${line}`).join('\n') : '  // No high-level operations decoded.';
  return { source: `// Decoded from ${bytes.length} raw action byte(s).\n${sourceText}\n\n// Raw ActionRecord listing:\n${listing.map((line) => `// ${line}`).join('\n')}`, listing };
}

function actionDetail(el: Element): string {
  const items = findAllData(el, (e) => {
    const t = e.getAttribute('type') ?? e.tagName;
    return /^Action/.test(t) || /^Stack/.test(t);
  });

  const stack: string[] = [];
  const code: string[] = [];

  const actualActions = items.filter((item) => {
    const t = item.getAttribute('type') ?? item.tagName;
    return !!(t && t.startsWith('Action'));
  });

  const actionBytesAttr = el.getAttribute('actionBytes') ?? findData(el, (e) => /actionBytes/i.test(e.tagName))?.textContent;
  // A raw byte dump can be executed by the AVM1 interpreter — always prefer it.
  // (FFDec stores DoInitAction actions without the sprite id that prefixes the tag.)
  if (actionBytesAttr && /^[0-9a-fA-F]+$/.test(actionBytesAttr.trim())) {
    return avm1ActionSource(hexToBytes(actionBytesAttr.trim()));
  }
  if (!actualActions.length) {
    if (actionBytesAttr) {
      return decodeActionBytes(actionBytesAttr).source;
    }
    return '  // script';
  }

  actualActions.forEach((item) => {
    const type = item.getAttribute('type') ?? item.tagName;
    if (!type || !type.startsWith('Action')) return;
    const name = type.replace(/^Action/, '');

    if (name === 'Push') {
      const foundVals = findAllData(item, (v) => {
        const t = v.getAttribute('type') ?? v.tagName;
        return !!(t && t.startsWith('Stack'));
      });
      foundVals.forEach((v) => {
        const str = v.getAttribute('string') || v.getAttribute('value') || v.textContent?.trim() || '';
        stack.push(isNaN(Number(str)) || str === '' ? `"${str}"` : str);
      });
      if (!foundVals.length) {
        const val = item.getAttribute('value') || '';
        stack.push(isNaN(Number(val)) || val === '' ? `"${val}"` : val);
      }
    } else if (name === 'GetVariable') {
      const v = stack.pop() ?? 'var';
      stack.push(v.replace(/^"|"$/g, ''));
    } else if (name === 'SetVariable') {
      const val = stack.pop() ?? 'null';
      const nameVar = (stack.pop() ?? 'var').replace(/^"|"$/g, '');
      code.push(`${nameVar} = ${val};`);
    } else if (name === 'CallFunction') {
      const numArgsStr = item.getAttribute('numArgs') || item.getAttribute('value');
      const numArgs = numArgsStr ? Number(numArgsStr) : 1;
      const fnName = (stack.pop() ?? 'function').replace(/^"|"$/g, '');
      const args: string[] = [];
      for (let i = 0; i < numArgs; i++) args.push(stack.pop() ?? 'undefined');
      args.reverse();
      stack.push(`${fnName}(${args.join(', ')})`);
    } else if (name === 'CallMethod') {
      const numArgs = Number(item.getAttribute('numArgs') || item.getAttribute('value') || 1);
      const methodName = (stack.pop() ?? 'method').replace(/^"|"$/g, '');
      const obj = stack.pop() ?? 'this';
      const args: string[] = [];
      for (let i = 0; i < numArgs; i++) args.push(stack.pop() ?? 'undefined');
      args.reverse();
      stack.push(`${obj}.${methodName}(${args.join(', ')})`);
    } else if (name === 'Play') {
      code.push('play();');
    } else if (name === 'Stop') {
      code.push('stop();');
    } else if (name === 'GotoFrame' || name === 'GotoFrame2') {
      const frameVal = item.getAttribute('frame') || stack.pop() || '0';
      code.push(`gotoAndPlay(${frameVal});`);
    } else if (name === 'GetMember') {
      const member = (stack.pop() ?? 'member').replace(/^"|"$/g, '');
      const obj = stack.pop() ?? 'this';
      stack.push(`${obj}.${member}`);
    } else if (name === 'SetMember') {
      const val = stack.pop() ?? 'null';
      const member = (stack.pop() ?? 'member').replace(/^"|"$/g, '');
      const obj = stack.pop() ?? 'this';
      code.push(`${obj}.${member} = ${val};`);
    } else if (name === 'Add' || name === 'Add2') {
      const b = stack.pop() ?? '0';
      const a = stack.pop() ?? '0';
      stack.push(`(${a} + ${b})`);
    } else if (name === 'Subtract') {
      const b = stack.pop() ?? '0';
      const a = stack.pop() ?? '0';
      stack.push(`(${a} - ${b})`);
    } else if (name === 'Multiply') {
      const b = stack.pop() ?? '1';
      const a = stack.pop() ?? '1';
      stack.push(`(${a} * ${b})`);
    } else if (name === 'Divide') {
      const b = stack.pop() ?? '1';
      const a = stack.pop() ?? '1';
      stack.push(`(${a} / ${b})`);
    } else if (name === 'Equals' || name === 'Equals2') {
      const b = stack.pop() ?? 'null';
      const a = stack.pop() ?? 'null';
      stack.push(`(${a} == ${b})`);
    } else if (name === 'Not') {
      const val = stack.pop() ?? 'false';
      stack.push(`!${val}`);
    } else if (name === 'Pop') {
      const val = stack.pop();
      if (val && !val.includes('=')) {
        code.push(`${val};`);
      }
    } else {
      const attrsStr = Array.from(item.attributes)
        .filter((a) => a.name !== 'type')
        .map((a) => `${a.name}="${a.value}"`)
        .join(' ');
      code.push(`${name.toLowerCase()}(${attrsStr});`);
    }
  });

  while (stack.length) {
    const val = stack.pop()!;
    if (val && !val.includes('=')) code.push(`${val};`);
  }

  return code.map((line) => '  ' + line).join('\n');
}

export function actionFileCandidates(characterId: number | undefined, frameIndex: number, tagType: string): string[] {
  const frame = frameIndex + 1;
  const names = tagType.includes('Init')
    ? ['DoInitAction.as', 'DoAction.as']
    : ['DoAction.as', 'DoInitAction.as'];
  const paths: string[] = [];
  const add = (prefix: string) => names.forEach((name) => paths.push(`${prefix}/${name}`));

  if (characterId != null) {
    add(`scripts/DefineSprite_${characterId}/frame_${frame}`);
    add(`scripts/DefineSpriteTag_${characterId}/frame_${frame}`);
    add(`scripts/DefineSprite_${characterId}/Frame_${frame}`);
  }

  // Root timeline exports vary by FFDec version, so keep a few deterministic
  // fallbacks. The asset resolver later normalizes case and separators.
  add(`scripts/frame_${frame}`);
  add(`scripts/Frame_${frame}`);
  add(`scripts/MainTimeline/frame_${frame}`);
  return paths;
}

// ---------------------------------------------------------------------------

export function parseSwfXml(xmlText: string, opts: ParseOptions): SwfDocument {
  const dom = new DOMParser().parseFromString(xmlText, 'application/xml');
  const err = dom.querySelector('parsererror');
  if (err) throw new Error('XML parse error: ' + (err.textContent ?? '').slice(0, 300));

  const P = new Parser();
  P.detectNumberFormat(dom);

  const rootEl = dom.documentElement;

  // ------------------------------------------------------------- header ----
  let stage: Rect = { xMin: 0, xMax: 550 * 20, yMin: 0, yMax: 400 * 20 };
  const dr =
    Array.from(rootEl.children).find((c) => /displayRect|frameSize|rect/i.test(c.tagName) && !tagTypeOf(c));
  if (dr) {
    const g = (n: string) => num(dr.getAttribute(n) ?? dr.getAttribute(n.toLowerCase()));
    stage = { xMin: g('Xmin'), xMax: g('Xmax'), yMin: g('Ymin'), yMax: g('Ymax') };
  }
  let frameRate = num(rootEl.getAttribute('frameRate'), 24);
  if (frameRate > 250) frameRate = frameRate / 256;      // 8.8 fixed
  if (!frameRate || frameRate < 0.5) frameRate = 24;

  // ------------------------------------------------------- tag traversal ---
  const rootTags = tagChildren(rootEl);

  const spriteQueue: { id: number; el: Element }[] = [];

  const registerCharacter = (el: Element, type: string) => {
    const kind = kindOfTag(type);
    if (!kind) return;
    const id = charIdOf(el);
    if (id == null) return;
    const existing = P.characters.get(id);
    const ch: SwfCharacter = existing ?? {
      id, tagType: type, kind, uses: [], attrs: {},
    };
    // A later, richer definition wins (e.g. DefineFontName after DefineFont)
    if (!existing) P.characters.set(id, ch);
    else if (existing.kind === 'font' && kind === 'font') { /* keep */ }
    ch.attrs = { ...ch.attrs, ...attrMap(el) };
    const ext = el.getAttribute('_externalFile');
    if (ext) ch.externalFile = ext;
    const bounds = P.rectOf(el);
    if (bounds && (bounds.xMax - bounds.xMin || bounds.yMax - bounds.yMin)) ch.bounds = ch.bounds ?? bounds;
    if (kind === 'text') readTextRecords(P, ch, el);
    if (kind === 'font') {
      const table = Array.from(el.children).find((c) => c.tagName === 'codeTable');
      if (table && table.children.length) ch.codeTable = Array.from(table.children).map((c) => num(c.getAttribute('value') ?? c.textContent));
    }
    if (kind === 'edittext') {
      const c = Array.from(el.children).find((x) => x.tagName === 'textColor');
      if (c) ch.attrs.textColor = rgbHex(c);
    }
    if (kind === 'sprite') {
      ch.frameCount = num(el.getAttribute('frameCount'), 0);
      ch.timelineId = `sprite:${id}`;
      spriteQueue.push({ id, el });
    }
    if (kind === 'button') {
      ch.timelineId = `button:${id}`;
      buildButtonTimeline(P, id, el);
    }
  };

  const walk = (parent: Element, depthGuard = 0) => {
    if (depthGuard > 24) return;
    for (const t of tagChildren(parent)) {
      const type = tagTypeOf(t)!;
      P.tagCount++;
      registerCharacter(t, type);
      if (type === 'SymbolClassTag' || type === 'ExportAssetsTag') {
        readSymbolClass(P, t, type === 'SymbolClassTag');
      }
      if (type === 'SetBackgroundColorTag') {
        const c = t.querySelector('backgroundColor') ?? t.firstElementChild;
        const ch = (k: string) => Math.max(0, Math.min(255, Number(c?.getAttribute(k) ?? 0) || 0));
        if (c) P.backgroundColor = (ch('red') << 16) | (ch('green') << 8) | ch('blue');
      }
      const kids = tagChildren(t);
      if (kids.length) walk(t, depthGuard + 1);
    }
  };
  walk(rootEl);

  // --------------------------------------------------------- timelines ----
  const root = buildTimeline(P, 'root', 'root', undefined, 'Main Timeline', rootTags);
  P.timelines.set('root', root);

  for (const { id, el } of spriteQueue) {
    const ch = P.characters.get(id)!;
    const tl = buildTimeline(P, `sprite:${id}`, 'sprite', id, `Sprite ${id}`, tagChildren(el));
    P.timelines.set(tl.id, tl);
    ch.frameCount = tl.frameCount;
    ch.specialFrames = tl.frames.filter((f) => f.special).length;
    const used = new Set<number>();
    for (const f of tl.frames) for (const o of f.ops) if (o.characterId != null) used.add(o.characterId);
    ch.uses = [...used];
  }

  // names from SymbolClass / ExportAssets
  for (const [id, n] of P.classNames) { const c = P.characters.get(id); if (c) c.className = n; }
  for (const [id, n] of P.exportNames) { const c = P.characters.get(id); if (c) c.exportName = n; }

  // sanity: unresolved references
  const missing = new Set<number>();
  for (const tl of P.timelines.values())
    for (const f of tl.frames)
      for (const o of f.ops)
        if (o.characterId != null && !P.characters.has(o.characterId)) missing.add(o.characterId);
  if (missing.size)
    P.warnings.push(`${missing.size} placed character id(s) have no definition in the XML: ${[...missing].slice(0, 12).join(', ')}${missing.size > 12 ? '…' : ''}`);
  if (!P.fixedMatrix) P.warnings.push('Matrices look like floats – reading scale/rotate as plain numbers instead of 16.16 fixed point.');

  const rootChar = P.characters.get(-1);
  void rootChar;

  return {
    header: {
      version: rootEl.getAttribute('version') ?? undefined,
      compression: rootEl.getAttribute('compression') ?? undefined,
      frameRate,
      frameCount: root.frameCount,
      stage,
      fileName: opts.fileName,
      backgroundColor: P.backgroundColor,
    },
    // Full SymbolClass table, including id 0 (the document class), which
    // has no character to hang a className on.
    symbolClasses: new Map(P.classNames),
    characters: P.characters,
    timelines: P.timelines,
    root,
    warnings: P.warnings,
    stats: { tags: P.tagCount, unknownTags: P.unknown },
  };
}

function rgbHex(c: Element): string {
  const ch = (k: string) => Math.max(0, Math.min(255, num(c.getAttribute(k)))).toString(16).padStart(2, '0');
  return `#${ch('red')}${ch('green')}${ch('blue')}`;
}

/** DefineText records: font, size, colour, offsets and glyph runs (chars resolved via the font's codeTable). */
function readTextRecords(P: Parser, ch: SwfCharacter, el: Element) {
  const tm = Array.from(el.children).find((c) => c.tagName === 'textMatrix');
  if (tm) ch.textMatrix = P.readMatrix(tm);
  const list = Array.from(el.children).find((c) => c.tagName === 'textRecords');
  if (!list) return;
  const records: TextRecord[] = [];
  for (const r of Array.from(list.children)) {
    const rec: TextRecord = { glyphs: [] };
    if (bool(r.getAttribute('styleFlagsHasFont'))) { rec.fontId = num(r.getAttribute('fontId')); rec.height = num(r.getAttribute('textHeight')); }
    if (bool(r.getAttribute('styleFlagsHasXOffset'))) rec.x = num(r.getAttribute('xOffset'));
    if (bool(r.getAttribute('styleFlagsHasYOffset'))) rec.y = num(r.getAttribute('yOffset'));
    const color = Array.from(r.children).find((c) => c.tagName === 'textColor');
    if (color && bool(r.getAttribute('styleFlagsHasColor'))) {
      rec.color = rgbHex(color);
      if (color.hasAttribute('alpha')) rec.alpha = num(color.getAttribute('alpha')) / 255;
    }
    const glyphs = Array.from(r.children).find((c) => c.tagName === 'glyphEntries');
    for (const g of Array.from(glyphs?.children ?? [])) rec.glyphs.push({ index: num(g.getAttribute('glyphIndex')), advance: num(g.getAttribute('glyphAdvance')) });
    records.push(rec);
  }
  ch.textRecords = records;
}

function readSymbolClass(P: Parser, el: Element, isClass: boolean) {
  const ids: number[] = [];
  const names: string[] = [];
  for (const c of Array.from(el.children)) {
    const isIds = /^(tags|characterIds|ids|characters)$/i.test(c.tagName);
    const isNames = /^(names|classNames|classes)$/i.test(c.tagName);
    if (!isIds && !isNames) continue;
    for (const g of Array.from(c.children)) {
      const v = (g.getAttribute('value') ?? g.textContent ?? '').trim();
      if (isIds) ids.push(Number(v));
      else names.push(v);
    }
  }
  for (let i = 0; i < Math.min(ids.length, names.length); i++) {
    if (!Number.isFinite(ids[i])) continue;
    (isClass ? P.classNames : P.exportNames).set(ids[i], names[i]);
  }
}

// ---------------------------------------------------------------------------

function snapshot(state: Map<number, DisplayItem>): DisplayItem[] {
  return [...state.values()].sort((a, b) => a.depth - b.depth).map((d) => ({ ...d }));
}

function buildTimeline(
  P: Parser, id: string, kind: Timeline['kind'], characterId: number | undefined,
  name: string, tags: Element[],
): Timeline {
  const frames: Frame[] = [];
  const state = new Map<number, DisplayItem>();
  let ops: PlaceOp[] = [];
  let events: FrameEvent[] = [];
  let special = false;
  let kinds = new Set<EventKind>();
  let label: string | undefined;
  let frameIndex = 0;

  const flush = () => {
    frames.push({
      index: frameIndex, label, ops, events, special,
      kinds: [...kinds], display: snapshot(state),
    });
    frameIndex++;
    ops = []; events = []; special = false; kinds = new Set(); label = undefined;
  };

  for (const el of tags) {
    const type = tagTypeOf(el)!;
    if (type === 'ShowFrameTag') { flush(); continue; }
    if (type === 'EndTag') continue;

    const k = classify(type);
    if (isSpecialTag(type)) { special = true; }
    kinds.add(k);

    if (PLACE_RE.test(type)) {
      const depth = num(el.getAttribute('depth'), -1);
      if (depth < 0) continue;
      const move = bool(el.getAttribute('placeFlagMove')) || bool(el.getAttribute('move'));
      const cidRaw = el.getAttribute('characterId') ?? el.getAttribute('characterID');
      const cid = cidRaw != null && cidRaw !== '' ? Number(cidRaw) : undefined;
      const hasChar = bool(el.getAttribute('placeFlagHasCharacter')) || (!move && cid != null) || (cid != null && cid > 0 && !move);
      const matrix = P.matrixOf(el);
      const ct = P.colorOf(el);
      const ratio = el.hasAttribute('ratio') ? num(el.getAttribute('ratio')) : undefined;
      const nm = el.getAttribute('name') || undefined;
      const clipDepth = el.hasAttribute('clipDepth') && num(el.getAttribute('clipDepth')) > 0
        ? num(el.getAttribute('clipDepth')) : undefined;
      const blend = el.getAttribute('blendMode') || undefined;
      const filters = !!findData(el, (e) => /Filter$/i.test(e.getAttribute('type') ?? e.tagName));

      const prev = state.get(depth);
      const creating = (hasChar || !prev) && cid != null && cid > 0;
      ops.push({
        op: creating && !move ? 'place' : 'move',
        tagType: type, depth, characterId: cid, matrix, colorTransform: ct,
        ratio, name: nm, clipDepth, blendMode: blend, hasFilters: filters,
      });
      if (creating) {
        state.set(depth, {
          depth, characterId: cid!, matrix: matrix ?? { ...IDENTITY },
          colorTransform: ct, ratio: ratio ?? 0, name: nm, clipDepth,
          blendMode: blend, hasFilters: filters, startFrame: frameIndex,
        });
      } else if (prev) {
        const next: DisplayItem = { ...prev };
        if (matrix) next.matrix = matrix;
        if (ct) next.colorTransform = ct;
        if (ratio != null) next.ratio = ratio;
        if (nm) next.name = nm;
        if (clipDepth != null) next.clipDepth = clipDepth;
        if (blend) next.blendMode = blend;
        if (filters) next.hasFilters = true;
        state.set(depth, next);
      }
      if (cid != null) events.push({ kind: 'place', tagType: type, detail: `depth ${depth}`, characterId: cid });
      continue;
    }

    if (REMOVE_RE.test(type)) {
      const depth = num(el.getAttribute('depth'), -1);
      const gone = state.get(depth);
      ops.push({ op: 'remove', tagType: type, depth, characterId: gone?.characterId });
      state.delete(depth);
      continue;
    }

    if (type === 'FrameLabelTag') {
      label = el.getAttribute('name') ?? el.getAttribute('label') ?? findData(el, (e) => /name/i.test(e.tagName))?.textContent ?? undefined;
      events.push({ kind: 'label', tagType: type, detail: label ?? '(unnamed)' });
      continue;
    }
    if (/^(DoAction|DoInitAction|DoABC|RawABC)/.test(type)) {
      const extAct = el.getAttribute('_externalActions') || undefined;
      events.push({
        kind: 'action',
        tagType: type,
        detail: actionDetail(el),
        externalActions: extAct,
        externalActionCandidates: actionFileCandidates(characterId ?? charIdOf(el), frameIndex, type),
      });
      continue;
    }
    if (/^StartSound/.test(type)) {
      const sid = num(el.getAttribute('soundId'), -1);
      const si = findData(el, isType('SOUNDINFO'));
      const bits: string[] = [];
      if (si) {
        if (bool(si.getAttribute('syncStop'))) bits.push('stop');
        if (bool(si.getAttribute('syncNoMultiple'))) bits.push('noMultiple');
        const lc = num(si.getAttribute('loopCount'));
        if (lc > 1) bits.push(`loop ×${lc}`);
      }
      events.push({
        kind: 'sound', tagType: type,
        detail: `sound ${sid >= 0 ? sid : '?'}${bits.length ? ' (' + bits.join(', ') + ')' : ''}`,
        characterId: sid >= 0 ? sid : undefined,
      });
      continue;
    }
    if (/^SoundStream/.test(type)) {
      events.push({ kind: 'sound', tagType: type, detail: 'streaming audio' });
      continue;
    }
    if (/^Define|^JPEGTables/.test(type)) {
      const cid = charIdOf(el);
      events.push({ kind: 'define', tagType: type, detail: cid != null ? `defines #${cid}` : '', characterId: cid });
      continue;
    }
    events.push({ kind: 'other', tagType: type, detail: summarizeAttrs(el) });
  }

  if (ops.length || events.length || frames.length === 0) flush();

  return { id, kind, characterId, name, frameCount: frames.length, frames };
}

function summarizeAttrs(el: Element): string {
  const skip = new Set(['type']);
  const parts: string[] = [];
  for (let i = 0; i < el.attributes.length && parts.length < 4; i++) {
    const a = el.attributes[i];
    if (skip.has(a.name) || a.value === 'false' || a.value === '') continue;
    parts.push(`${a.name}=${a.value.length > 24 ? a.value.slice(0, 24) + '…' : a.value}`);
  }
  return parts.join(' ');
}

/** DefineButton2 records → a synthetic 4 "frame" timeline (up/over/down/hit) */
function buildButtonTimeline(P: Parser, id: number, el: Element) {
  const states = ['Up', 'Over', 'Down', 'HitTest'] as const;
  const recs = findAllData(el, (e) =>
    e.hasAttribute('buttonStateUp') || e.getAttribute('type') === 'BUTTONRECORD');
  if (!recs.length) return;
  const frames: Frame[] = states.map((s, i) => {
    const display: DisplayItem[] = [];
    for (const r of recs) {
      const on = bool(r.getAttribute(`buttonState${s}`));
      if (!on) continue;
      const cid = num(r.getAttribute('characterId') ?? r.getAttribute('characterID'), -1);
      if (cid < 0) continue;
      display.push({
        depth: num(r.getAttribute('placeDepth')),
        characterId: cid,
        matrix: P.matrixOf(r) ?? { ...IDENTITY },
        colorTransform: P.colorOf(r),
        ratio: 0, startFrame: i,
      });
    }
    display.sort((a, b) => a.depth - b.depth);
    return {
      index: i, label: s === 'HitTest' ? 'hit' : s.toLowerCase(),
      ops: [], events: [], special: false, kinds: [], display,
    };
  });
  P.timelines.set(`button:${id}`, {
    id: `button:${id}`, kind: 'button', characterId: id,
    name: `Button ${id}`, frameCount: 4, frames,
  });
  const ch = P.characters.get(id);
  if (ch) {
    ch.uses = [...new Set(frames.flatMap((f) => f.display.map((d) => d.characterId)))];
    ch.frameCount = 4;
  }
}
