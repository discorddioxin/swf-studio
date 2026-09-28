// ---------------------------------------------------------------------------
// The pure SWF runtime. No React/DOM dependencies — a small, pure, testable
// unit that composes the FrameClock, the typed FlashScope, a renderer, and an
// event bus. The React layer (ExecuteTab) is a thin shell over this class.
// ---------------------------------------------------------------------------

import { FrameClock } from './clock';
import { createFlashScope, type FlashScope } from './scope';
import type { RuntimeBridge, RuntimeClock, RuntimeDiagnostic, RuntimeEvent } from './types';

export interface RuntimeOptions {
  frameRate: number;
  totalFrames: number;
  render: (ctx: CanvasRenderingContext2D, runtime: SwfRuntime) => void;
}

export type RuntimeEventHandler = (event: RuntimeEvent) => void;

/** A pure, framework-free SWF runtime. Composes a FrameClock and a typed
 *  FlashScope. React is a thin shell: it calls tick(dtMs), play/pause/step/
+goto, render(ctx), and subscribes via onEvent(cb). No React/DOM internals. */
export class SwfRuntime {
  readonly clock: FrameClock;
  readonly scope: FlashScope;
  readonly diagnostics: RuntimeDiagnostic[] = [];
  private readonly bridge: RuntimeBridge;
  private readonly options: RuntimeOptions;
  private readonly listeners = new Set<RuntimeEventHandler>();

  constructor(options: RuntimeOptions) {
    this.options = options;
    this.clock = new FrameClock(options.frameRate, options.totalFrames);
    this.bridge = {
      clock: this.clock,
      frame: 0,
      diagnostics: this.diagnostics,
      emit: (event: RuntimeEvent) => {
        this.bridge.frame = this.clock.frame;
        this.emitEvent(event);
      },
    };
    this.scope = createFlashScope(this.bridge);
  }

  private emitEvent(event: RuntimeEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  onEvent(handler: RuntimeEventHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  /** Advance the runtime by dtMs. Returns the number of frames advanced. */
  tick(dtMs: number): number {
    const advanced = this.clock.tick(dtMs);
    this.bridge.frame = this.clock.frame;
    return advanced;
  }

  play() {
    this.clock.play();
  }

  pause() {
    this.clock.pause();
  }

  stop() {
    this.clock.stop();
  }

  step() {
    this.clock.pause();
    this.clock.tick(1000 / this.clock.frameRate);
  }

  goto(frame: number) {
    this.clock.goto(frame);
  }

  reset() {
    this.clock.reset();
  }

  render(ctx: CanvasRenderingContext2D) {
    this.options.render(ctx, this);
  }

  get frame(): number {
    return this.clock.frame;
  }

  get playing(): boolean {
    return this.clock.playing;
  }

  get clockState(): RuntimeClock {
    return this.clock;
  }
}
