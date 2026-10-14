// Sound effects and music, addressed by name — a movie's library symbol ids and
// `SoundChannel`s become one mixer with named cues and loops.

export interface Mixer {
  play(name: string, options?: { volume?: number; loop?: boolean }): unknown;
  stop(handle: unknown): void;
  stopAll(): void;
}

/** The default sink: a silent mixer the game can run headless with. */
export class SilentMixer implements Mixer {
  played: Array<{ name: string; volume: number; loop: boolean }> = [];
  play(name: string, options: { volume?: number; loop?: boolean } = {}): unknown {
    const handle = { name, volume: options.volume ?? 1, loop: options.loop ?? false };
    this.played.push(handle);
    if (this.played.length > 64) this.played.shift();
    return handle;
  }
  stop(): void {}
  stopAll(): void { this.played = []; }
}

export class AudioSystem {
  /** `sfx.bumper`, `music.main` — the names the lifted code asks for. */
  mixer: Mixer;
  volume = 1;

  constructor(mixer: Mixer = new SilentMixer()) { this.mixer = mixer; }

  /** Play a one-shot cue. */
  play(name: string, volume = 1): unknown {
    return this.mixer.play(name, { volume: volume * this.volume });
  }

  /** A named loop; returns a handle the caller stops with `stopLoop`. */
  loop(name: string, volume = 1): unknown {
    return this.mixer.play(name, { volume: volume * this.volume, loop: true });
  }

  stop(handle: unknown): void { this.mixer.stop(handle); }

  /** Every registered cue (`for each` over a movie's sound library). */
  cues = new Set<string>();
  registerCue(name: string): void { this.cues.add(name); }
}
