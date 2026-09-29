// Audio for the AS2 player: sounds come from the FFDec export (sounds/<id>_<name>.mp3|.flv).
// MP3 plays directly; ADPCM .flv files are decoded to WAV on first use.

import type { AudioBackend, AudioHandle } from '../flash/media';
import { HtmlAudioBackend, type AssetSource } from '../flash/player';
import { decodeFlvAudio, encodeWav } from './adpcm';

export class AS2AudioBackend implements AudioBackend {
  private readonly html: HtmlAudioBackend;
  private readonly decoded = new Map<number, Promise<string | null>>();
  private readonly urls: string[] = [];
  muted = false;

  constructor(assets: AssetSource | null, private readonly soundFiles: Map<number, File>) {
    this.html = new HtmlAudioBackend(assets);
  }

  play(characterId: number | null, url: string | null, startMs: number, loops: number, volume: number): AudioHandle | null {
    if (this.muted) return null;
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
      if (stopped || !wavUrl) { if (!wavUrl) handle.onended?.(); return; }
      real = this.html.play(null, wavUrl, startMs, loops, vol);
      if (real) real.onended = () => handle.onended?.();
      else handle.onended?.();
    });
    return handle;
  }

  private fileUrls = new Map<File, string>();
  private urlFor(file: File): string | null {
    if (typeof URL === 'undefined' || !URL.createObjectURL) return null;
    let u = this.fileUrls.get(file);
    if (!u) { u = URL.createObjectURL(file); this.fileUrls.set(file, u); this.urls.push(u); }
    return u;
  }

  private wav(id: number, file: File): Promise<string | null> {
    let p = this.decoded.get(id);
    if (!p) {
      p = file.arrayBuffer().then((buf) => {
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
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.length = 0;
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

/** fonts/<id>_<name>.ttf → FontFace "swf-font-<id>" (best effort; returns the registered ids). */
export async function registerFonts(files: { path: string; file: File }[]): Promise<Set<number>> {
  const done = new Set<number>();
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return done;
  await Promise.all(files.map(async (f) => {
    const m = /(?:^|\/)fonts\/(\d+)_[^/]*\.(ttf|otf|woff2?)$/i.exec(f.path);
    if (!m) return;
    try {
      const face = new FontFace(`swf-font-${m[1]}`, await f.file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      done.add(Number(m[1]));
    } catch { /* unusable font file: fall back to the system font of the same name */ }
  }));
  return done;
}
