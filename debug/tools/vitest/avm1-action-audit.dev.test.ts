import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeActionBytes } from '../../../decompiler/parser';
import { parseSwfBinary } from '../../../decompiler/swf/binary';

const root = process.cwd();
const swfDir = path.join(root, 'game-files/fish-full/swfs');
const outDir = path.join(root, 'debug/tools/e2e-output/avm1-action-audit');

function actionBytes(source: string): Uint8Array[] {
  const calls: Uint8Array[] = [];
  const call = /\bavm1Actions\s*\(\s*(?:[^,()]+,\s*)?(["'])([A-Za-z0-9+/=_-]*)\1/g;
  for (const match of source.matchAll(call)) calls.push(new Uint8Array(Buffer.from(match[2], 'base64')));
  return calls;
}

function asHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('bundled AVM1 call audit (developer tool)', () => {
  it('extracts, hashes, and statically disassembles raw avm1Actions payloads', async () => {
    const swfs = readdirSync(swfDir).filter((name) => name.endsWith('.swf')).sort();
    const sections: string[] = [];
    let totalCalls = 0;
    const globalPayloads = new Map<string, { bytes: Uint8Array; paths: string[]; swfs: Set<string> }>();
    const bySwf: { name: string; callCount: number; uniqueCount: number; payloads: { hash: string; byteLength: number; paths: string[] }[] }[] = [];

    for (const name of swfs) {
      const file = new Uint8Array(readFileSync(path.join(swfDir, name)));
      const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      const parsed = await parseSwfBinary(buffer, name);
      let callCount = 0;
      const local = new Map<string, { byteLength: number; paths: string[] }>();
      for (const script of parsed.files.filter((candidate) => candidate.category === 'scripts')) {
        const text = new TextDecoder().decode(script.bytes);
        for (const bytes of actionBytes(text)) {
          callCount++;
          totalCalls++;
          const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
          const localHit = local.get(hash) ?? { byteLength: bytes.length, paths: [] };
          localHit.paths.push(script.path);
          local.set(hash, localHit);
          const hit = globalPayloads.get(hash) ?? { bytes, paths: [], swfs: new Set<string>() };
          hit.paths.push(script.path);
          hit.swfs.add(name);
          globalPayloads.set(hash, hit);
        }
      }
      bySwf.push({
        name,
        callCount,
        uniqueCount: local.size,
        payloads: [...local.entries()].map(([hash, item]) => ({ hash, ...item })),
      });
    }

    sections.push('# Bundled fish-full AVM1 call audit', '',
      `Extracted ${totalCalls} avm1Actions call sites across ${swfs.length} bundled SWFs; ${globalPayloads.size} distinct payload hashes.`,
      '', 'This is static decoding only: ActionRecords are parsed as encoded and are not executed.');
    sections.push('', '## Per-SWF counts', '', '| SWF | call sites | distinct payloads |', '|---|---:|---:|');
    for (const row of bySwf) sections.push(`| ${row.name} | ${row.callCount} | ${row.uniqueCount} |`);

    const sorted = [...globalPayloads.entries()].sort((a, b) => a[1].bytes.length - b[1].bytes.length || a[0].localeCompare(b[0]));
    sections.push('', '## Distinct payloads, grouped by exact bytes', '');
    for (const [hash, item] of sorted) {
      const bytes = item.bytes;
      const hex = asHex(bytes);
      const decoded = decodeActionBytes(hex);
      const actionRows = decoded.listing.map((line) => `  ${line}`);
      sections.push(`### ${hash} · ${bytes.length} bytes`, '',
        `SWFs: ${[...item.swfs].sort().join(', ')}`,
        `Call sites (${item.paths.length}): ${item.paths.slice(0, 14).join(', ')}${item.paths.length > 14 ? `, … +${item.paths.length - 14}` : ''}`,
        `Base64: \`${Buffer.from(bytes).toString('base64')}\``, '',
        '```text', ...decoded.source.split('\n').slice(0, 80), '```', '',
        '<details><summary>raw ActionRecord listing</summary>', '', '```text', ...actionRows.slice(0, 240), '```', '', '</details>', '');
    }

    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'audit.md'), sections.join('\n'));
    writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ totalCalls, payloads: globalPayloads.size, bySwf }, null, 2));
    console.log(JSON.stringify({
      totalCalls,
      payloads: globalPayloads.size,
      bySwf: bySwf.map(({ payloads: _payloads, ...counts }) => counts),
      audit: path.relative(root, path.join(outDir, 'audit.md')),
    }, null, 2));
    expect(totalCalls).toBe(534);
    expect(globalPayloads.size).toBe(249);
    const omniture = bySwf.find((entry) => entry.name === 'OmnitureActionSource.swf');
    expect(omniture).toMatchObject({ callCount: 4, uniqueCount: 3 });
    expect(omniture?.payloads).toEqual(expect.arrayContaining([
      { hash: 'd154fe2abf32', byteLength: 10640, paths: ['scripts/frame_1/DoAction.as'] },
      { hash: '0a6361b3a802', byteLength: 2, paths: ['scripts/frame_1/DoAction_2.as', 'scripts/frame_3/DoAction.as'] },
      { hash: '716191c9222d', byteLength: 38, paths: ['scripts/frame_2/DoAction.as'] },
    ]));
  }, 120_000);
});
