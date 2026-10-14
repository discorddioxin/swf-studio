// A material is what a MovieClip's timeline becomes once the timeline is gone: a
// list of frames, a frame rate, and a way to play them. Nothing here draws or
// knows about a renderer — the animation system advances the frame and the
// renderer asks what to show.

export type LoopMode = 'loop' | 'once' | 'hold' | 'pingpong';

export interface MaterialFrame {
  /** The frame's name in the source timeline (`frame1`, …), for traceability. */
  name: string;
  /** Renderer-specific payload: a texture id, a sprite frame, a draw command. */
  art: unknown;
  /** How long this frame stays up, in seconds. 0 = the material's frame time. */
  hold?: number;
}

export interface MaterialOptions {
  loop?: LoopMode;
  /** Seconds per frame, defaulting to the game's 1/frameRate. */
  frameTime?: number;
  /** Frame the material starts on (a MovieClip timeline's first frame is 1). */
  firstFrame?: number;
  /** Timelines play; a material built for a still frame starts stopped. */
  play?: boolean;
}

/**
 * A playable animation. TheMovieClip's `gotoAndStop` / `play` / `stop` are
 * `hold()` / `play()` / `stop()` here, and the frames are just data.
 */
export class Material {
  readonly name: string;
  readonly frames: MaterialFrame[];
  loop: LoopMode;
  frameTime: number;
  /** Seconds spent on the current frame. */
  private elapsed = 0;
  private index: number;
  private direction = 1;
  /** Called when a `once` run finishes. */
  onComplete?: (material: Material) => void;

  constructor(name: string, frames: MaterialFrame[], options: MaterialOptions = {}) {
    this.name = name;
    this.frames = frames;
    this.loop = options.loop ?? 'loop';
    this.frameTime = options.frameTime ?? 1 / 24;
    const first = Math.max(0, (options.firstFrame ?? 1) - 1);
    this.index = Math.min(first, Math.max(0, frames.length - 1));
    if (options.play === false) this.playingFlag = false;
  }

  get length(): number { return this.frames.length; }
  get frameIndex(): number { return this.index; }
  get frame(): MaterialFrame | undefined { return this.frames[this.index]; }
  get finished(): boolean { return this.loop === 'once' && this.index >= this.frames.length - 1 && this.elapsed >= (this.frame?.hold || this.frameTime); }
  /** True while the material still advances (a still picture is not animated). */
  get playing(): boolean { return this.playingFlag; }

  /** A timeline plays from the frame it starts on; `play: false` is `stop()`. */
  private playingFlag = true;

  /** Start playing from where it is (`MovieClip.play`). */
  play(loop?: LoopMode): this {
    if (loop) this.loop = loop;
    this.playingFlag = true;
    if (this.loop === 'once' && this.index >= this.frames.length - 1) { this.index = 0; this.elapsed = 0; }
    return this;
  }

  /** Stop on the current frame (`MovieClip.stop`). */
  stop(): this { this.playingFlag = false; return this; }

  /** Show a frame (`gotoAndStop`); negative indexes count back from the end. */
  goto(frame: number, play = false): this {
    const count = this.frames.length;
    if (!count) return this;
    const index = frame < 0 ? count + frame : frame - 1;
    this.index = Math.max(0, Math.min(count - 1, index));
    this.elapsed = 0;
    if (play) this.playingFlag = true; else this.playingFlag = false;
    return this;
  }

  /** The next frame (`nextFrame` / `prevFrame`). */
  step(delta: number): this {
    const count = this.frames.length;
    if (!count) return this;
    this.index = ((this.index + delta) % count + count) % count;
    this.elapsed = 0;
    return this;
  }

  /** Advance time. The animation system calls this once per frame, per actor. */
  advance(dt: number): void {
    if (!this.playingFlag || this.frames.length < 2) return;
    this.elapsed += dt;
    const hold = this.frame?.hold || this.frameTime;
    while (this.elapsed >= hold) {
      this.elapsed -= hold;
      if (this.loop === 'once') {
        if (this.index >= this.frames.length - 1) { this.playingFlag = false; this.onComplete?.(this); return; }
        this.index += 1;
      } else if (this.loop === 'pingpong') {
        if (this.index + this.direction >= this.frames.length || this.index + this.direction < 0) this.direction *= -1;
        this.index += this.direction;
      } else {
        this.index = (this.index + 1) % this.frames.length;
      }
    }
  }
}

/** Turn a timeline's frames into materials: one per symbol, one per label range. */
export class MaterialLibrary {
  private materials = new Map<string, Material>();

  add(material: Material): Material { this.materials.set(material.name, material); return material; }

  make(name: string, frames: MaterialFrame[], options?: MaterialOptions): Material {
    return this.add(new Material(name, frames, options));
  }

  get(name: string): Material | undefined { return this.materials.get(name); }

  require(name: string): Material {
    const material = this.materials.get(name);
    if (!material) throw new Error(`material ${name} is not in the library`);
    return material;
  }

  names(): string[] { return [...this.materials.keys()].sort(); }

  get size(): number { return this.materials.size; }
}
