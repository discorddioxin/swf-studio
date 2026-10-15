// The test-only ABC and SWF writers must write what the app's readers read back:
// parse → write → parse reproduces the model, for an embedded real ABC and for
// every ABC of the uploaded corpus when it is checked out.
import { describe, expect, it } from 'vitest';
import { parseAbc } from '@/lib/swf/abc';
import { parseSwfBinary } from '@/lib/swf/binary';
import { deckAbcPayload } from '@/engine/flash/__tests__/abcFixture';
import { abcFrom, abcPayloads } from './abcPayloads';
import { writeAbc } from './abcWriter';
import { corpusSwfs, describeCorpus } from './corpus';
import { tag, writeSwf } from './swfWriter';

describe('writeAbc', () => {
  it('round-trips a real ABC file (tiles/standardDeck.swf)', () => {
    const abc = parseAbc(deckAbcPayload().subarray(5));
    expect(parseAbc(writeAbc(abc))).toEqual(abc);
  });

  it('encodes every constant kind the reader decodes', () => {
    const abc = parseAbc(deckAbcPayload().subarray(5));
    abc.ints.push(-1, 0x7fffffff, -0x80000000);
    abc.uints.push(0xffffffff);
    abc.doubles.push(0.5, -Infinity);
    abc.strings.push('é ✓ 漢字');
    expect(parseAbc(writeAbc(abc))).toEqual(abc);
  });
});

describe('writeSwf', () => {
  it('writes a movie the SWF reader reads: header, sprite, symbol class, long tags', async () => {
    const long = new Uint8Array(200).fill(7);
    const swf = writeSwf({
      version: 9, width: 550, height: 400, frameRate: 30,
      tags: [tag.fileAttributes(), tag.backgroundColor(0x123456), tag.defineSprite(5, [tag.showFrame(), tag.end()]),
        tag.symbolClass([[5, 'a.B']]), { code: 777 & 0x3ff, body: long }, tag.showFrame(), tag.showFrame(), tag.end()],
    });
    const { doc } = await parseSwfBinary(swf.buffer as ArrayBuffer, 'w.swf');
    expect(doc.header).toMatchObject({ version: '9', frameRate: 30, frameCount: 2, backgroundColor: 0x123456 });
    expect(doc.header.stage).toEqual({ xMin: 0, xMax: 550 * 20, yMin: 0, yMax: 400 * 20 });
    expect(doc.symbolClasses).toEqual(new Map([[5, 'a.B']]));
  });
});

describeCorpus('writeAbc on the corpus', () => {
  it('round-trips every ABC file of every corpus SWF', () => {
    let files = 0;
    const failures: string[] = [];
    for (const { set, name, path } of corpusSwfs()) {
      for (const payload of abcPayloads(path)) {
        const abc = abcFrom(payload);
        files++;
        try { expect(parseAbc(writeAbc(abc))).toEqual(abc); } catch (e) { failures.push(`${set}/${name}: ${(e as Error).message.split('\n')[0]}`); }
      }
    }
    expect(failures).toEqual([]);
    expect(files).toBeGreaterThan(0);
  }, 300_000);
});
