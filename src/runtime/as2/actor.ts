/** Migration boundary: composition-based actors over an existing Flash sprite.
 * No display-list ownership or second animation clock is introduced here. The
 * host still renders exported vector/bitmap assets and advances animations.
 * Replace these small ports when moving to Canvas, Pixi, Phaser, etc.
 */
import type { AS2Clip, AS2TimelineModule } from './index';

export interface SpritePort {
  x: number; y: number;
  scaleX: number; scaleY: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}
export interface AnimationPort {
  play(animation?: string | number): void;
  pause(): void;
  seek(frame: string | number): void;
  readonly frame: number;
}
export interface GraphicsPort {
  clear(): void;
  lineStyle(width: number, color: number, opacity?: number): void;
  beginFill(color: number, opacity?: number): void;
  endFill(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  curveTo(controlX: number, controlY: number, x: number, y: number): void;
}
export interface ActorPorts {
  sprite: SpritePort;
  animation: AnimationPort;
  graphics?: GraphicsPort;
}

/** A modern actor is behavior + sprite/animation/graphics ports, not a MovieClip subclass. */
export class Actor {
  readonly sprite: SpritePort;
  readonly animation: AnimationPort;
  readonly graphics?: GraphicsPort;
  readonly children = new Map<string, Actor>();
  constructor(readonly name: string, ports: ActorPorts) {
    this.sprite = ports.sprite;
    this.animation = ports.animation;
    this.graphics = ports.graphics;
  }
  /** Called by your game loop, in seconds. Override with game-specific behavior. */
  update(_deltaSeconds: number): void {}
  moveTo(x: number, y: number): void { this.sprite.x = x; this.sprite.y = y; }
}

/** Explicit compatibility adapter; new code uses normalized units and named animations. */
export function flashActorPorts(clip: AS2Clip, labels: Readonly<Record<number, string>> = {}): ActorPorts {
  const frame = (value: string | number): string | number => {
    if (typeof value !== 'string') return value;
    const found = Object.entries(labels).find(([, name]) => name === value);
    return found ? Number(found[0]) : value;
  };
  const sprite: SpritePort = {
    get x() { return clip._x; }, set x(v) { clip._x = v; },
    get y() { return clip._y; }, set y(v) { clip._y = v; },
    get scaleX() { return clip._xscale / 100; }, set scaleX(v) { clip._xscale = v * 100; },
    get scaleY() { return clip._yscale / 100; }, set scaleY(v) { clip._yscale = v * 100; },
    get rotation() { return clip._rotation; }, set rotation(v) { clip._rotation = v; },
    get opacity() { return clip._alpha / 100; }, set opacity(v) { clip._alpha = v * 100; },
    get visible() { return !!clip._visible; }, set visible(v) { clip._visible = v; },
  };
  const animation: AnimationPort = {
    play(value) { if (value === undefined) clip.play(); else clip.gotoAndPlay(frame(value)); },
    pause() { clip.stop(); },
    seek(value) { clip.gotoAndStop(frame(value)); },
    get frame() { return clip._currentframe; },
  };
  const graphics: GraphicsPort | undefined = typeof clip.clear !== 'function' ? undefined : {
    clear: () => clip.clear(),
    lineStyle: (width, color, opacity = 1) => clip.lineStyle(width, color, opacity * 100),
    beginFill: (color, opacity = 1) => clip.beginFill(color, opacity * 100),
    endFill: () => clip.endFill(),
    moveTo: (x, y) => clip.moveTo(x, y),
    lineTo: (x, y) => clip.lineTo(x, y),
    curveTo: (cx, cy, x, y) => clip.curveTo(cx, cy, x, y),
  };
  return { sprite, animation, graphics };
}

/** Bridge used by generated actors. Legacy action callbacks stay explicit so
 * they can be moved into update()/game methods one at a time. Nothing is run on
 * construction, and actions are never run twice alongside the timeline host.
 */
export class TimelineActor extends Actor {
  constructor(name: string, readonly legacy: AS2Clip, private behavior: AS2TimelineModule,
    readonly animationLabels: Readonly<Record<number, string>> = {}) {
    super(name, flashActorPorts(legacy, animationLabels));
  }
  /** Manually run a decoded behavior WITHOUT moving the animation playhead.
   * Do not call this for frames already dispatched by the compatibility host.
   */
  runFrameAction(frame: number): void { this.behavior.frames?.[frame]?.call(this.legacy); }
}
