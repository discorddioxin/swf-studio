// @vitest-environment jsdom
// Round-trip oracle: FFDec XML → xml2swf → binary bytes → parseSwfBinary,
// then structurally compare with parseSwfXml for the same movie.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSwfXml } from '../parser';
import { parseSwfBinary } from './binary';
import { xmlToSwf } from '../../../tools/xml2swf/xml2swf.mjs';

const EXTERNAL = resolve(__dirname, '../../../game-files/fish-full/external');
const EXPORTS = [
  'bassken_fish4.20', 'bassken_overview', 'bassken_pier',
  'bassken_scene', 'game_chat', 'gsecs2.9',
];

/** deep-normalize: drop undefined, sort keys, unify null-ish matrices */
function norm(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = norm(val);
      if (n !== undefined) out[k] = n;
    }
    return out;
  }
  if (typeof v === 'number' && Object.is(v, -0)) return 0;
  return v;
}

function stable(v: unknown): string {
  return JSON.stringify(norm(v), (_k, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

function normOp(op: Record<string, unknown>) {
  const out = { ...op };
  if (out.ratio === undefined || out.ratio === null) out.ratio = 0;
  if (out.matrix === null) delete out.matrix;
  if (out.colorTransform === null) delete out.colorTransform;
  if (out.name === '') delete out.name;
  if (out.clipDepth === 0) delete out.clipDepth;
  if (out.hasFilters == null) out.hasFilters = false;
  return out;
}

function normDisplay(d: Record<string, unknown>) {
  const out = { ...d };
  if (out.matrix === null || out.matrix === undefined) out.matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  if (out.colorTransform === null) delete out.colorTransform;
  if (out.ratio == null) out.ratio = 0;
  return out;
}

/** locate the first difference between two stable strings for readable errors */
function expectSame(received: string, expected: string, ctx: string) {
  if (received === expected) return;
  let i = 0;
  while (i < received.length && i < expected.length && received[i] === expected[i]) i++;
  const lo = Math.max(0, i - 120);
  throw new Error(
    `${ctx} differs at char ${i}\n  xml: …${expected.slice(lo, i)}【${expected.slice(i, i + 160)}】\n  bin: …${received.slice(lo, i)}【${received.slice(i, i + 160)}】`,
  );
}

function compareDocs(xmlDoc: any, binDoc: any, name: string) {
  // header (compression differs by design: the writer always emits FWS)
  const hdr = (h: any) => stable({ ...h, fileName: '', compression: '' });
  expect(hdr(binDoc.header), `${name} header`).toBe(hdr(xmlDoc.header));
  expect(binDoc.header.fileName, `${name} fileName`).toBe(xmlDoc.header.fileName);

  // timelines (keyed — Map insertion order may differ)
  const xmlTlIds = [...xmlDoc.timelines.keys()].sort();
  const binTlIds = [...binDoc.timelines.keys()].sort();
  expect(binTlIds, `${name} timeline ids`).toEqual(xmlTlIds);
  for (const id of xmlTlIds) {
    const a = xmlDoc.timelines.get(id);
    const b = binDoc.timelines.get(id);
    expect(b.frameCount, `${name} ${id} frameCount`).toBe(a.frameCount);
    const fa = a.frames.map((f: any) => ({
      index: f.index, label: f.label ?? null, special: f.special,
      kinds: [...f.kinds].sort(),
      ops: f.ops.map((o: any) => normOp(o)),
      events: f.events.map((e: any) => norm(e)),
      display: f.display.map((d: any) => normDisplay(d)),
    }));
    const fb = b.frames.map((f: any) => ({
      index: f.index, label: f.label ?? null, special: f.special,
      kinds: [...f.kinds].sort(),
      ops: f.ops.map((o: any) => normOp(o)),
      events: f.events.map((e: any) => norm(e)),
      display: f.display.map((d: any) => normDisplay(d)),
    }));
    // externalActionCandidates are FFDec script-path hints — root-level
    // DoInitActions carry sprite scope as exporter metadata that cannot be
    // recovered from binary payloads, so they are compared loosely. The binary
    // parser also pins each action event to the script file it synthesized for
    // it (externalActions, "…/DoAction_2.as" for a frame's second DoAction),
    // which an XML export has no reason to name, so that is compared loosely too.
    const stripCand = (frames: any[]) => frames.map((f) => ({
      ...f,
      events: f.events.map((e: any) =>
        e.externalActionCandidates || e.externalActions
          ? { ...e, externalActionCandidates: e.externalActionCandidates ? [...e.externalActionCandidates].sort() : e.externalActionCandidates }
          : e),
    }));
    const stripCandStr = (frames: any[]) => stable(stripCand(frames))
      .replace(/,"externalActionCandidates":\[[^\]]*\]/g, '')
      .replace(/,"externalActions":"[^"]*"/g, '');
    expectSame(stripCandStr(fb), stripCandStr(fa), `${name} ${id} frames`);
  }

  // characters
  const xmlIds = [...xmlDoc.characters.keys()].sort((x, y) => x - y);
  const binIds = [...binDoc.characters.keys()].sort((x, y) => x - y);
  expect(binIds, `${name} character ids`).toEqual(xmlIds);
  for (const id of xmlIds) {
    const a: any = xmlDoc.characters.get(id);
    const b: any = binDoc.characters.get(id);
    const pick = (c: any) => stable({
      id: c.id, tagType: c.tagType, kind: c.kind,
      bounds: c.bounds, frameCount: c.frameCount, timelineId: c.timelineId,
      exportName: c.exportName, className: c.className,
      codeTable: c.codeTable, textRecords: c.textRecords?.map((r: any) =>
        Object.fromEntries(Object.entries(r).sort(([a], [b]) => String(a).localeCompare(String(b))))),
      textMatrix: c.textMatrix,
      uses: [...(c.uses ?? [])].sort((x: number, y: number) => x - y),
      specialFrames: c.specialFrames,
    });
    expect(pick(b), `${name} character ${id}`).toBe(pick(a));
  }

  // symbol classes
  expect(stable([...(binDoc.symbolClasses ?? [])]), `${name} symbolClasses`)
    .toBe(stable([...(xmlDoc.symbolClasses ?? [])]));
}

function fileIds(files: { path: string; name: string }[], category: string): number[] {
  return files
    .filter((f) => f.path.startsWith(category + '/'))
    .map((f) => Number(f.name))
    .sort((x, y) => x - y);
}

describe.each(EXPORTS)('swf round-trip: %s', (name) => {
  const xmlPath = resolve(EXTERNAL, name, `${name}.xml`);
  const xmlText = readFileSync(xmlPath, 'utf8');

  it('parseSwfXml ≡ xmlToSwf → parseSwfBinary', async () => {
    const xmlDoc = parseSwfXml(xmlText, { fileName: `${name}.xml` });
    const bytes = xmlToSwf(xmlText);
    expect(bytes[0]).toBe(0x46); // FWS
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true)).toBe(bytes.length);

    const { doc: binDoc, files } = await parseSwfBinary(
      bytes.slice().buffer as ArrayBuffer,
      `${name}.xml`,
    );
    compareDocs(xmlDoc, binDoc, name);

    // asset file parity by category + id (ext may differ: jpeg3 → png in FFDec)
    for (const category of ['shapes', 'images', 'texts']) {
      const exported = readdirIds(resolve(EXTERNAL, name, category)).sort((a, b) => a - b);
      expect(fileIds(files, category), `${name} ${category} ids`).toEqual(exported);
    }
  }, 60000);
});

import { readdirSync } from 'node:fs';
/** ids of files committed in the FFDec export directory */
function readdirIds(dir: string): number[] {
  try {
    // FFDec appends export names to files (e.g. `1_ic_warning_icon.png`)
    return readdirSync(dir)
      .map((f) => Number(/^(\d+)/.exec(f)?.[1] ?? NaN))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}
