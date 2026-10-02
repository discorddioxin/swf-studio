import { afterEach, describe, expect, it, vi } from 'vitest';
import { AS2AudioBackend, registerFonts } from '../audio';
import { HtmlAudioBackend } from '../../flash/player';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AS2 media lifecycle', () => {
  it('cannot decode or start audio after its backend was disposed', async () => {
    const file = new File([''], '1_sound.flv');
    const read = deferred<ArrayBuffer>();
    vi.spyOn(file, 'arrayBuffer').mockReturnValue(read.promise);
    const create = vi.spyOn(URL, 'createObjectURL');
    const play = vi.spyOn(HtmlAudioBackend.prototype, 'play').mockReturnValue(null);
    const backend = new AS2AudioBackend(null, new Map([[1, file]]));
    expect(backend.play(1, null, 0, 1, 100)).not.toBeNull();
    backend.dispose();
    read.resolve(new ArrayBuffer(0));
    await flush();
    expect(create).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(backend.play(1, null, 0, 1, 100)).toBeNull();
  });

  it('clears file URL caches and revokes URLs exactly once', () => {
    vi.spyOn(HtmlAudioBackend.prototype, 'play').mockReturnValue(null);
    const file = new File(['data'], '2_sound.mp3');
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const backend = new AS2AudioBackend(null, new Map([[2, file]]));
    backend.play(2, null, 0, 1, 100);
    backend.play(2, null, 0, 1, 100);
    expect(create).toHaveBeenCalledTimes(1);
    backend.dispose(); backend.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith(create.mock.results[0].value);
  });

  it('unregisters session fonts on abort and ignores late font loading', async () => {
    const fonts = new Set();
    const loading = deferred<void>();
    let delay = false;
    class Face {
      constructor(public family: string) {}
      async load() { if (delay) await loading.promise; return this; }
    }
    vi.stubGlobal('document', { fonts });
    vi.stubGlobal('FontFace', Face);
    const file = new File(['font'], '1_test.ttf');
    const files = [{ path: 'fonts/1_test.ttf', file }];
    const session = new AbortController();
    expect(await registerFonts(files, 'main', session.signal)).toEqual(new Set([1]));
    expect(fonts.size).toBe(1);
    session.abort();
    expect(fonts.size).toBe(0);

    delay = true;
    const lateSession = new AbortController();
    const pending = registerFonts(files, 'external', lateSession.signal);
    await flush();
    lateSession.abort();
    loading.resolve();
    expect(await pending).toEqual(new Set());
    expect(fonts.size).toBe(0);
  });
});
