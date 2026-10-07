// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { decodeActionBytes } from '../../../decompiler/parser';

const inputPath = process.env.ROD_ON_ENTER_FRAME_JSON;
const outputPath = process.env.ROD_ON_ENTER_FRAME_DISASSEMBLY ?? '/tmp/rod-onenterframe-disassembly.txt';
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

it.skipIf(!inputPath)('disassembles the onEnterFrame functions captured by the Puppeteer flow', () => {
  const handlers = JSON.parse(readFileSync(inputPath!, 'utf8'));
  const report = handlers.map((entry: any) => {
    const bytes = new Uint8Array(entry.code);
    const decoded = decodeActionBytes(bytesToHex(bytes));
    return `## ${entry.path} · ${bytes.length} bytes\n\nConstants:\n${entry.constants.map((v: string, i: number) => `  ${i}: ${v}`).join('\n')}\n\n${decoded.source}\n\nRaw listing:\n${decoded.listing.join('\n')}`;
  }).join('\n\n');
  writeFileSync(outputPath, report);
  console.log(`Disassembled ${handlers.length} onEnterFrame handlers to ${outputPath}`);
});
