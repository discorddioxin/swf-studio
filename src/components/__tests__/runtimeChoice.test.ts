// @vitest-environment jsdom
// P-13: the runtime follows the movie. FileAttributes.ActionScript3 decides when
// the tag is there; a binary SWF without it is AVM1 (the tag is how a SWF asks for
// AVM2). Only an FFDec XML export without the tag falls back to the old guess
// (.as files and version ≤ 8 or no SymbolClass) — and every choice says which
// rule made it.
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '../../lib/swf/binary';
import { parseSwfXml } from '../../lib/parser';
import { tag, writeSwf } from '@/testing/swfWriter';
import type { AssetBundle } from '../../types';
import { chooseRuntime } from '../runtimeChoice';

const swf = async (version: number, tags: ReturnType<typeof tag.showFrame>[]) =>
  (await parseSwfBinary(writeSwf({ version, tags: [...tags, tag.showFrame(), tag.end()] }).buffer as ArrayBuffer, 'movie.swf')).doc;
/** An upload whose files include ActionScript sources. */
const withAs = { files: [{ path: 'scripts/frame_1/DoAction.as' }] } as unknown as AssetBundle;
const noFiles = { files: [] } as unknown as AssetBundle;

describe('chooseRuntime', () => {
  it('an AVM1 movie with no scripts runs on the AS2 player', async () => {
    const choice = chooseRuntime(await swf(6, []), noFiles);
    expect(choice.runtime).toBe('as2');
    expect(choice.rule).toMatch(/no FileAttributes tag/);
    // SWF 8 declares FileAttributes with ActionScript3 = 0
    const v8 = chooseRuntime(await swf(8, [tag.fileAttributes({ as3: false })]), noFiles);
    expect(v8).toEqual({ runtime: 'as2', rule: 'FileAttributes: ActionScript3 = 0' });
  });

  it('an AS3 movie with stray .as files in the upload runs on the AS3 engine', async () => {
    const doc = await swf(9, [tag.fileAttributes({ as3: true }), tag.symbolClass([[0, 'Main']])]);
    expect(chooseRuntime(doc, withAs)).toEqual({ runtime: 'as3', rule: 'FileAttributes: ActionScript3 = 1' });
  });

  it('an AS3 movie without SymbolClass runs on the AS3 engine', async () => {
    const doc = await swf(10, [tag.fileAttributes({ as3: true })]);
    expect(doc.symbolClasses?.size ?? 0).toBe(0);
    expect(chooseRuntime(doc, withAs).runtime).toBe('as3');
  });

  it('only FFDec XML without FileAttributes is guessed, and says so', () => {
    const bare = (version: number) => parseSwfXml(`<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="${version}" frameRate="24.0" frameCount="1">
  <displayRect type="RECT" Xmin="0" Xmax="6400" Ymin="0" Ymax="4800"/>
  <tags><item type="ShowFrameTag"/></tags>
</swf>`, { fileName: 'movie.xml' });
    const as2 = chooseRuntime(bare(8), withAs);
    expect(as2.runtime).toBe('as2');
    expect(as2.rule).toMatch(/^FFDec XML without FileAttributes/);
    expect(chooseRuntime(bare(8), noFiles).runtime).toBe('as3');
    // with the tag, the XML form decides exactly like the binary one
    const tagged = parseSwfXml(`<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="10" frameRate="24.0" frameCount="1">
  <displayRect type="RECT" Xmin="0" Xmax="6400" Ymin="0" Ymax="4800"/>
  <tags><item type="FileAttributesTag" actionScript3="true" useNetwork="false"/><item type="ShowFrameTag"/></tags>
</swf>`, { fileName: 'movie.xml' });
    expect(chooseRuntime(tagged, withAs)).toEqual({ runtime: 'as3', rule: 'FileAttributes: ActionScript3 = 1' });
  });
});
