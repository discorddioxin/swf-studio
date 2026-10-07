// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { decodeActionBytes } from '../../decompiler/parser';
import { disassembleAVM1Source } from './avm1Disassembly';

describe('AVM1 source display', () => {
  it('shows a readable best-effort disassembly while preserving the executable wrapper', () => {
    const actionBytes = new Uint8Array([
      0x96, 0x07, 0x00, 0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, // Push "hello"
      0x26, 0x00, // Trace; End
    ]);
    const payload = btoa(String.fromCharCode(...actionBytes));
    const rawText = `avm1Actions("${payload}");`;

    const result = disassembleAVM1Source(rawText);

    expect(result).not.toBeNull();
    expect(result?.blockCount).toBe(1);
    expect(result?.rawText).toBe(rawText);
    expect(result?.text).toContain('trace("hello");');
    expect(result?.text).toContain('Raw ActionRecord listing');
    expect(result?.text).not.toContain(payload);
  });

  it('uses the AVM1 opcode numbers for arithmetic, returns, and conditional branches', () => {
    const arithmetic = decodeActionBytes('960a0007020000000703000000473e00');
    expect(arithmetic.listing.some((line) => line.includes('Add2'))).toBe(true);
    expect(arithmetic.listing.some((line) => line.includes('Return'))).toBe(true);
    expect(arithmetic.source).toContain('return (2 + 3);');
    expect(arithmetic.source).not.toContain('UnknownAction');

    const branches = decodeActionBytes('96020005019d02000000990200000000');
    expect(branches.listing.some((line) => line.includes('If offset=0'))).toBe(true);
    expect(branches.listing.some((line) => line.includes('Jump offset=0'))).toBe(true);
    expect(branches.source).toContain('if (true) goto byte 10;');
    expect(branches.source).toContain('jump to byte 15;');
  });

  it('leaves ordinary exported ActionScript unchanged', () => {
    const source = 'stop();\n';
    expect(disassembleAVM1Source(source)).toBeNull();
  });
});
