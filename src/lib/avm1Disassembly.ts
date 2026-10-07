import { decodeActionBytes } from '../../decompiler/parser';

export interface AVM1Disassembly {
  /** Best-effort pseudo-source and ActionRecord listing for an encoded block. */
  text: string;
  /** The executable wrapper kept unchanged for raw inspection. */
  rawText: string;
  blockCount: number;
}

const ACTION_CALL = /\bavm1Actions\s*\(\s*(?:[^,()]+,\s*)?(["'])([A-Za-z0-9+/=_-]*)\1\s*\)\s*;?/g;
const MAX_DISPLAY_ACTION_BYTES = 128 * 1024;

function base64ToHex(base64: string): string {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const estimatedLength = Math.floor(base64.length * 3 / 4) - padding;
  if (estimatedLength > MAX_DISPLAY_ACTION_BYTES) {
    throw new Error(`block exceeds the ${MAX_DISPLAY_ACTION_BYTES / 1024} KiB display limit`);
  }
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = globalThis.atob(normalized);
  const chunks: string[] = [];
  for (let start = 0; start < binary.length; start += 8192) {
    let chunk = '';
    const end = Math.min(start + 8192, binary.length);
    for (let i = start; i < end; i++) chunk += binary.charCodeAt(i).toString(16).padStart(2, '0');
    chunks.push(chunk);
  }
  return chunks.join('');
}

/**
 * Raw SWFs store AVM1 ActionRecords, not `.as` source. The asset parser keeps
 * them as avm1Actions(base64) calls so Execute can interpret the exact bytes.
 * Generated TypeScript adds the owning timeline as a first argument, so this
 * display-only helper recognizes both wrapper shapes and replaces each with a
 * best-effort decoder listing; `rawText` remains available for inspection.
 */
export function disassembleAVM1Source(rawText: string): AVM1Disassembly | null {
  let blockCount = 0;
  const text = rawText.replace(ACTION_CALL, (_call, _quote: string, payload: string) => {
    blockCount++;
    try {
      const hex = base64ToHex(payload);
      return [
        `// AVM1 ActionRecord block ${blockCount}: ${hex.length / 2} byte(s).`,
        '// Best-effort pseudo-source followed by the original opcode listing.',
        decodeActionBytes(hex).source,
      ].join('\n');
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');
      return `// Could not disassemble AVM1 block ${blockCount}: ${message}. Use “Show raw bytecode” to inspect the original wrapper.`;
    }
  });
  return blockCount ? { text, rawText, blockCount } : null;
}
