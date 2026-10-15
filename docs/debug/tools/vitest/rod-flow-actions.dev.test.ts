// @vitest-environment node
// Targeted raw ActionRecord inspection for the bundled sample's rod timeline
// (sample-scoped probe: the rod clips live in the bundled game set).
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { decodeActionBytes } from '../../../../transcom/decompiler/parser';
import { parseSwfBinary } from '../../../../transcom/decompiler/swf/binary';
import { SAMPLE_MAIN, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

it('lists rod-related AVM1 ActionRecords from the bundled sample main SWF', async () => {
  const file = new Uint8Array(readFileSync(sampleSwfPath(SAMPLE_MAIN)));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const parsed = await parseSwfBinary(buffer, `${SAMPLE_MAIN}.swf`);
  const report: string[] = [];
  const calls = /\bavm1Actions\s*\(\s*(?:[^,()]+,\s*)?(["'])([A-Za-z0-9+/=_-]*)\1/g;
  for (const script of parsed.files.filter((candidate) => candidate.category === 'scripts')) {
    const text = new TextDecoder().decode(script.bytes);
    for (const match of text.matchAll(calls)) {
      const actionBytes = new Uint8Array(Buffer.from(match[2], 'base64'));
      const decoded = decodeActionBytes(bytesToHex(actionBytes));
      if (/gameMode|startThrow|startRelease|hooked|escape|rodPlacement|fish/i.test(decoded.source)) {
        report.push(`## ${script.path} (${actionBytes.length} bytes)\n\n${decoded.source}\n\nRaw listing:\n${decoded.listing.join('\n')}`);
      }
    }
  }
  writeFileSync('/tmp/rod-flow-actions.txt', report.join('\n\n'));
  console.log(`Found ${report.length} rod-related action streams; wrote /tmp/rod-flow-actions.txt`);
}, 120_000);
