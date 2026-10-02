// Audio for the AS2 player: sounds come from the FFDec export (sounds/<id>_<name>.mp3|.flv).
// MP3 plays directly; ADPCM .flv files are decoded to WAV on first use.

import type { AudioBackend, AudioHandle } from '../flash/media';
import { HtmlAudioBackend, type AssetSource } from '../flash/player';
import { decodeFlvAudio, encodeWav } from './adpcm';

export class AS2AudioBackend implements AudioBackend {
  private readonly html: HtmlAudioBackend;
  private readonly decoded = new Map<number, Promise<string | null>>();
  private readonly urls: string[] = [];
  private disposed = false;
  muted = false;

  constructor(assets: AssetSource | null, private readonly soundFiles: Map<number, File>) {
    this.html = new HtmlAudioBackend(assets);
  }

  play(characterId: number | null, url: string | null, startMs: number, loops: number, volume: number): AudioHandle | null {
    if (this.disposed || this.muted) return null;
    if (url || characterId == null) return this.html.play(null, url, startMs, loops, volume);
    const file = this.soundFiles.get(characterId);
    if (!file || !/\.flv$/i.test(file.name)) {
      const src = file ? this.urlFor(file) : null;
      return this.html.play(src ? null : characterId, src, startMs, loops, volume);
    }
    // decode once, then play; the handle proxies the real one when it exists
    let real: AudioHandle | null = null;
    let stopped = false;
    let vol = volume;
    const handle: AudioHandle = {
      onended: null,
      get position() { return real?.position ?? 0; },
      stop() { stopped = true; real?.stop(); },
      setVolume(v) { vol = v; real?.setVolume(v); },
    };
    this.wav(characterId, file).then((wavUrl) => {
      if (this.disposed || stopped || !wavUrl) { if (!wavUrl) handle.onended?.(); return; }
      real = this.html.play(null, wavUrl, startMs, loops, vol);
      if (real) real.onended = () => handle.onended?.();
      else handle.onended?.();
    });
    return handle;
  }

  private fileUrls = new Map<File, string>();
  private urlFor(file: File): string | null {
    if (this.disposed || typeof URL === 'undefined' || !URL.createObjectURL) return null;
    let u = this.fileUrls.get(file);
    if (!u) { u = URL.createObjectURL(file); this.fileUrls.set(file, u); this.urls.push(u); }
    return u;
  }

  private wav(id: number, file: File): Promise<string | null> {
    if (this.disposed) return Promise.resolve(null);
    let p = this.decoded.get(id);
    if (!p) {
      p = file.arrayBuffer().then((buf) => {
        if (this.disposed) return null;
        const pcm = decodeFlvAudio(buf);
        if (!pcm) return null;
        const u = URL.createObjectURL(new Blob([encodeWav(pcm)], { type: 'audio/wav' }));
        this.urls.push(u);
        return u;
      }).catch(() => null);
      this.decoded.set(id, p);
    }
    return p;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.length = 0;
    this.decoded.clear();
    this.fileUrls.clear();
  }
}

/** sounds/<id>_<name>.<ext> → id → File */
export function soundFilesOf(files: { path: string; file: File }[]): Map<number, File> {
  const out = new Map<number, File>();
  for (const f of files) {
    const m = /(?:^|\/)sounds\/(\d+)(?:[_.][^/]*)?\.(mp3|flv|wav)$/i.exec(f.path);
    if (m && !out.has(Number(m[1]))) out.set(Number(m[1]), f.file);
  }
  return out;
}

/** Font family of an embedded font: "swf-font-<id>" (main movie) or "swf-font-<key>-<id>" (a loaded SWF). */
export const embeddedFontFamily = (id: number, key?: string) => (key ? `swf-font-${key}-${id}` : `swf-font-${id}`);

/** fonts/<id>_<name>.ttf → FontFace embeddedFontFamily(id, key) (best effort; returns the registered ids). */
export async function registerFonts(files: { path: string; file: File }[], key?: string, signal?: AbortSignal): Promise<Set<number>> {
  const done = new Set<number>();
  if (signal?.aborted || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return done;
  const fonts = document.fonts;
  const faces: FontFace[] = [];
  // A registration belongs to its mounted Execute session, including fonts
  // whose asynchronous read/load finishes after that session is gone.
  signal?.addEventListener('abort', () => {
    for (const face of faces) fonts.delete(face);
    faces.length = 0;
  }, { once: true });
  await Promise.all(files.map(async (f) => {
    const m = /(?:^|\/)fonts\/(\d+)_[^/]*\.(ttf|otf|woff2?)$/i.exec(f.path);
    if (!m) return;
    try {
      const bytes = await f.file.arrayBuffer();
      if (signal?.aborted) return;
      const face = new FontFace(embeddedFontFamily(Number(m[1]), key), bytes);
      await face.load();
      if (signal?.aborted) return;
      fonts.add(face);
      faces.push(face);
      done.add(Number(m[1]));
    } catch { /* unusable font file: fall back to the system font of the same name */ }
  }));
  return done;
}
