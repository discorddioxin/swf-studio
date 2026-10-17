// @vitest-environment jsdom
// DefineEditText's InitialText is a SWF STRING: it ends at its NUL, and from
// SWF 6 on it is UTF-8 (SWF spec v19, "Basic data types" / "DefineEditText").
// It was read as every remaining byte, latin-1, so each text field started with
// a trailing "\0" — Pinball's LCD digits re-entered as "0\0", one character too
// long — and non-ASCII initial text came out garbled.
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './binary';
import { tag, writeSwf } from '@/testing/swfWriter';

const initialText = async (field: ReturnType<typeof tag.defineEditText>, version: number) => {
  const { doc } = await parseSwfBinary(writeSwf({ version, tags: [field, tag.showFrame(), tag.end()] }).buffer as ArrayBuffer, 'x.swf');
  return doc.characters.get(7)?.attrs.initialText;
};

describe('DefineEditText initial text', () => {
  it('stops at the terminating NUL', async () => {
    expect(await initialText(tag.defineEditText(7, '0'), 9)).toBe('0');
    expect(await initialText(tag.defineEditText(7, 'Score: 100', 'score'), 9)).toBe('Score: 100');
  });

  it('is UTF-8 from SWF 6 on', async () => {
    expect(await initialText(tag.defineEditText(7, 'café © ★'), 6)).toBe('café © ★');
  });

  it('is latin-1 before SWF 6', async () => {
    expect(await initialText(tag.defineEditText(7, Uint8Array.from([0x63, 0x61, 0x66, 0xe9])), 5)).toBe('café');
  });
});
