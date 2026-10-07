// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { decodeActionBytes } from '../../../decompiler/parser';

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const capturedDiagnostics = process.env.ROD_ACTION_DIAGNOSTICS ?? '/tmp/rod-e2e-recast/action-diagnostics.json';

it.skipIf(!existsSync(capturedDiagnostics))('disassembles the captured fishing control functions', () => {
  const dump = JSON.parse(readFileSync(capturedDiagnostics, 'utf8'));
  const report = dump.functions.map((entry: any) => {
    const bytes = new Uint8Array(entry.avm1?.code ?? []);
    const decoded = decodeActionBytes(bytesToHex(bytes));
    return `## ${entry.name} (${bytes.length} bytes)\n\n${decoded.source}\n\n${decoded.listing.join('\n')}`;
  }).join('\n\n');
  writeFileSync('/tmp/rod-functions-disassembled.txt', report);
  console.log(report);
});
