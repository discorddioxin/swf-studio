import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetCache, ingestFiles } from './assets';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const fixture = (path: string) => {
  const file = new File([''], path.split('/').pop()!);
  Object.defineProperty(file, 'webkitRelativePath', { value: `dump/${path}` });
  return file;
};
afterEach(() => vi.restoreAllMocks());

describe('AssetCache lifecycle', () => {
  it('does not allocate URLs or send updates when an SVG read finishes after disposal', async () => {
    const file = fixture('shapes/1.svg');
    const read = deferred<string>();
    vi.spyOn(file, 'text').mockReturnValue(read.promise);
    const create = vi.spyOn(URL, 'createObjectURL');
    const update = vi.fn();
    const cache = new AssetCache(ingestFiles([file]), update);
    expect(cache.get(1, 'shape').status).toBe('loading');
    cache.dispose();
    read.resolve('<svg xmlns="http://www.w3.org/2000/svg"/>');
    await flush();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(cache.get(1, 'shape').status).toBe('error');
  });

  it('ignores late text reads and handles rejected reads without an unhandled rejection', async () => {
    const file = fixture('texts/2.txt');
    const read = deferred<string>();
    vi.spyOn(file, 'text').mockReturnValue(read.promise);
    const update = vi.fn();
    const cache = new AssetCache(ingestFiles([file]), update);
    cache.get(2, 'text');
    cache.dispose();
    read.resolve('finished too late');
    await flush();
    expect(update).not.toHaveBeenCalled();

    const broken = fixture('texts/3.txt');
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('read failed'));
    const active = new AssetCache(ingestFiles([broken]), update);
    active.get(3, 'text');
    await flush();
    expect(active.get(3, 'text')).toMatchObject({ status: 'error', error: 'Error: read failed' });
    active.dispose();
  });

  it('revokes each object URL once and prevents reallocation through a disposed cache', () => {
    const bundle = ingestFiles([new File(['data'], '4.mp3')]);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const cache = new AssetCache(bundle, vi.fn());
    const url = cache.url(bundle.files[0]);
    expect(cache.url(bundle.files[0])).toBe(url);
    cache.dispose(); cache.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith(url);
    expect(cache.preview(4, 'sound')).toBeUndefined();
    expect(() => cache.url(bundle.files[0])).toThrow('disposed');
  });
});
