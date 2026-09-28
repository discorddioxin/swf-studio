// A pure, framework-free frame clock for the SWF runtime.
//
// This module has NO dependencies on React or the DOM, so it can be changed and
// unit-tested in isolation. Keeping the clock framework-free is the core of the
// fix for "AIs keep breaking the engine": the clock is a small, pure, testable
// unit that no UI change can accidentally break.

export class FrameClock {
  frame = 0;
  playing = true;
  stoppedByScript = false;
  readonly frameRate: number;
  readonly totalFrames: number;
  private acc = 0;

  constructor(frameRate: number, totalFrames: number) {
    this.frameRate = Math.max(1, frameRate);
    this.totalFrames = Math.max(1, totalFrames);
  }

  reset() {
    this.frame = 0;
    this.playing = true;
    this.stoppedByScript = false;
    this.acc = 0;
  }

  play() {
    this.playing = true;
    this.stoppedByScript = false;
  }

  pause() {
    this.playing = false;
  }

  stop() {
    this.playing = false;
    this.stoppedByScript = true;
  }

  goto(frame: number) {
    this.frame = Math.max(0, Math.min(this.totalFrames - 1, Math.round(frame)));
  }

  /** Advances the clock by dtMs. Returns the number of frames advanced this tick. */
  tick(dtMs: number): number {
    if (!this.playing) return 0;
    this.acc += dtMs;
    const spf = 1000 / this.frameRate;
    let advanced = 0;
    while (this.acc >= spf && advanced < 8) {
      this.acc -= spf;
      if (this.stoppedByScript) {
        this.playing = false;
        this.stoppedByScript = false;
        break;
      }
      this.frame = (this.frame + 1) % this.totalFrames;
      advanced++;
    }
    return advanced;
  }
}
