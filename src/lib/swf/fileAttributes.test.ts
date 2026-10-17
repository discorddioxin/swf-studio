// @vitest-environment jsdom
// P-13: FileAttributes (tag 69, SWF 19) is read for its flags — ActionScript3
// (0x08) picks the VM, UseNetwork (0x01) and HasMetadata (0x10) are kept too.
// A binary SWF without the tag says so (as3 stays unset, source 'swf'); the
// FFDec XML form carries the same flags as attributes.
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from './binary';
import { parseSwfXml } from '../parser';
import { tag, writeSwf } from '@/testing/swfWriter';

const binary = async (tags: ReturnType<typeof tag.showFrame>[], version = 10) =>
  (await parseSwfBinary(writeSwf({ version, tags: [...tags, tag.showFrame(), tag.end()] }).buffer as ArrayBuffer, 'x.swf')).doc;

/** FileAttributesTag as FFDec exports it: every field, in alphabetical order. */
const ffdecFileAttributes = (f: { as3?: boolean; metadata?: boolean; network?: boolean }) =>
  `<item type="FileAttributesTag" actionScript3="${!!f.as3}" forceWriteAsLong="false" hasMetadata="${!!f.metadata}" noCrossDomainCache="false" reservedA="false" reservedB="0" swfRelativeUrls="false" useDirectBlit="false" useGPU="false" useNetwork="${!!f.network}"/>`;
const xml = (tags: string, version = 10) => parseSwfXml(`<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="${version}" frameRate="24.0" frameCount="1">
  <displayRect type="RECT" Xmin="0" Xmax="6400" Ymin="0" Ymax="4800"/>
  <tags>${tags}<item type="ShowFrameTag"/></tags>
</swf>`, { fileName: 'x.xml' });

describe('FileAttributes', () => {
  it('binary: the flags land in the header', async () => {
    const as3 = await binary([tag.fileAttributes({ as3: true, metadata: true })]);
    expect(as3.header).toMatchObject({ source: 'swf', as3: true, useNetwork: false, hasMetadata: true });
    const avm1 = await binary([tag.fileAttributes({ as3: false, network: true })], 8);
    expect(avm1.header).toMatchObject({ source: 'swf', as3: false, useNetwork: true, hasMetadata: false });
  });

  it('binary without the tag: as3 is unset and the source is known', async () => {
    const doc = await binary([], 6);
    expect(doc.header.source).toBe('swf');
    expect(doc.header.as3).toBeUndefined();
  });

  it('FFDec XML: the same flags; without the tag nothing is claimed', () => {
    expect(xml(ffdecFileAttributes({ as3: true, metadata: true })).header)
      .toMatchObject({ source: 'xml', as3: true, useNetwork: false, hasMetadata: true });
    expect(xml(ffdecFileAttributes({ network: true }), 8).header)
      .toMatchObject({ source: 'xml', as3: false, useNetwork: true, hasMetadata: false });
    const bare = xml('');
    expect(bare.header.source).toBe('xml');
    expect(bare.header.as3).toBeUndefined();
  });

  it('the frame event reads the same from both forms (it was fixed text)', async () => {
    for (const f of [{ as3: true, metadata: true }, { network: true }, { as3: true, network: true }]) {
      const fromSwf = (await binary([tag.fileAttributes({ as3: !!f.as3, network: !!f.network, metadata: !!f.metadata })])).root.frames[0].events
        .find((e) => e.tagType === 'FileAttributesTag');
      const fromXml = xml(ffdecFileAttributes(f)).root.frames[0].events.find((e) => e.tagType === 'FileAttributesTag');
      expect(fromSwf?.detail).toBe(fromXml?.detail);
    }
  });
});
