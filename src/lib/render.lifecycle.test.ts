import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetCache, ingestFiles } from './assets';
import { flattenSpriteToPng } from './render';
import type { SwfDocument, Timeline } from '../types';

function fixture() {
  const timeline: Timeline = {
    id: 'sprite:1', kind: 'sprite', characterId: 1, name: 'empty', frameCount: 2,
    frames: [0, 1].map((index) => ({ index, display: [], ops: [], events: [], special: false, kinds: [] })),
  };
  const doc: SwfDocument = {
    header: { fileName: 'test', frameRate: 24, frameCount: 2, stage: { xMin: 0, xMax: 100, yMin: 0, yMax: 100 } },
    characters: new Map(), timelines: new Map([[timeline.id, timeline]]), root: timeline,
    warnings: [], stats: { tags: 0, unknownTags: {} },
  };
  const cache = new AssetCache(ingestFiles([]), vi.fn());
  const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(['png'])));
  const canvas = { getContext: () => ({ scale: vi.fn(), translate: vi.fn() }), toBlob };
  vi.stubGlobal('document', { createElement: () => canvas });
  return { doc, timeline, cache, toBlob };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('sprite flattening lifecycle', () => {
  it('transfers ownership of successful frame URLs to its caller', async () => {
    const { doc, cache, timeline } = fixture();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const result = await flattenSpriteToPng(doc, cache, timeline);
    expect(result.frames).toHaveLength(2);
    expect(revoke).not.toHaveBeenCalled();
    result.frames.forEach((frame) => URL.revokeObjectURL(frame.url));
    cache.dispose();
  });

  it('releases previously generated PNG URLs if a later frame fails', async () => {
    const { doc, cache, timeline, toBlob } = fixture();
    toBlob.mockImplementationOnce((callback) => callback(new Blob(['first'])));
    toBlob.mockImplementationOnce((callback) => callback(null));
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await expect(flattenSpriteToPng(doc, cache, timeline)).rejects.toThrow('Could not encode');
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledExactlyOnceWith(create.mock.results[0].value);
    cache.dispose();
  });

  it('aborts an in-flight encode without allocating late URLs and releases earlier frames', async () => {
    const { doc, cache, timeline, toBlob } = fixture();
    let complete: BlobCallback | undefined;
    toBlob.mockImplementationOnce((callback) => callback(new Blob(['first'])));
    toBlob.mockImplementationOnce((callback) => { complete = callback; });
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const controller = new AbortController();
    const pending = flattenSpriteToPng(doc, cache, timeline, controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    controller.abort();
    complete!(new Blob(['too late']));
    await rejection;
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledExactlyOnceWith(create.mock.results[0].value);
    cache.dispose();
  });
});
