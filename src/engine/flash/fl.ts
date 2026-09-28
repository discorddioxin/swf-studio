// fl.transitions (Flash Pro's Tween + easing): common in timeline games.

import { Event, EventDispatcher } from './events';
import { getTimer } from './utils';
import { Shape } from './display';

type Ease = (t: number, b: number, c: number, d: number, ...rest: number[]) => number;

const make = (inFn: Ease) => {
  const easeIn: Ease = inFn;
  const easeOut: Ease = (t, b, c, d) => c - inFn(d - t, 0, c, d) + b;
  const easeInOut: Ease = (t, b, c, d) => (t < d / 2 ? easeIn(t * 2, 0, c, d) * 0.5 + b : easeOut(t * 2 - d, 0, c, d) * 0.5 + c * 0.5 + b);
  return { easeIn, easeOut, easeInOut, easeNone: (t: number, b: number, c: number, d: number) => (c * t) / d + b };
};

export const None = make((t, b, c, d) => (c * t) / d + b);
export const Regular = make((t, b, c, d) => c * (t /= d) * t + b);
export const Strong = make((t, b, c, d) => c * (t /= d) * t * t * t * t + b);
export const Back = make((t, b, c, d, s = 1.70158) => c * (t /= d) * t * ((s + 1) * t - s) + b);
export const Elastic = make((t, b, c, d) => {
  if (t === 0) return b;
  if ((t /= d) === 1) return b + c;
  const p = d * 0.3, s = p / 4;
  return -(c * Math.pow(2, 10 * (t -= 1)) * Math.sin(((t * d - s) * (2 * Math.PI)) / p)) + b;
});
const bounceOut: Ease = (t, b, c, d) => {
  if ((t /= d) < 1 / 2.75) return c * (7.5625 * t * t) + b;
  if (t < 2 / 2.75) return c * (7.5625 * (t -= 1.5 / 2.75) * t + 0.75) + b;
  if (t < 2.5 / 2.75) return c * (7.5625 * (t -= 2.25 / 2.75) * t + 0.9375) + b;
  return c * (7.5625 * (t -= 2.625 / 2.75) * t + 0.984375) + b;
};
export const Bounce = make((t, b, c, d) => c - bounceOut(d - t, 0, c, d) + b);

export class TweenEvent extends Event {
  static readonly MOTION_CHANGE = 'motionChange';
  static readonly MOTION_FINISH = 'motionFinish';
  static readonly MOTION_LOOP = 'motionLoop';
  static readonly MOTION_RESUME = 'motionResume';
  static readonly MOTION_START = 'motionStart';
  static readonly MOTION_STOP = 'motionStop';
  constructor(type: string, public time = NaN, public position = NaN, bubbles = false, cancelable = false) { super(type, bubbles, cancelable); }
}

/** Driven by ENTER_FRAME of a private ticker, like Flash Pro's Tween. */
export class Tween extends EventDispatcher {
  obj: Record<string, number>;
  prop: string;
  func: Ease;
  begin: number;
  finish: number;
  duration: number;
  useSeconds: boolean;
  looping = false;
  isPlaying = false;
  private _time = 0;
  private _startedAt = 0;
  private readonly ticker = new Shape();
  private readonly onFrame = () => this.update();

  constructor(obj: object, prop: string, func: Ease | null, begin: number, finish: number, duration: number, useSeconds = false) {
    super();
    this.obj = obj as Record<string, number>; this.prop = prop; this.func = func ?? None.easeNone;
    this.begin = begin; this.finish = finish; this.duration = duration <= 0 ? Infinity : duration; this.useSeconds = useSeconds;
    this.start();
  }
  get time() { return this._time; }
  set time(t: number) { this._time = Math.max(0, Math.min(t, this.duration)); this.apply(); }
  get position() { return this.obj[this.prop]; }
  start() { this._time = 0; this.resume(); this.apply(); this.dispatchEvent(new TweenEvent(TweenEvent.MOTION_START, this._time, this.position)); }
  resume() {
    this._startedAt = getTimer() - (this.useSeconds ? this._time * 1000 : 0);
    if (!this.isPlaying) { this.isPlaying = true; this.ticker.addEventListener(Event.ENTER_FRAME, this.onFrame); }
  }
  stop() { this.isPlaying = false; this.ticker.removeEventListener(Event.ENTER_FRAME, this.onFrame); this.dispatchEvent(new TweenEvent(TweenEvent.MOTION_STOP, this._time, this.position)); }
  continueTo(finish: number, duration: number) { this.begin = this.position; this.finish = finish; this.duration = duration; this.start(); }
  yoyo() { this.continueTo(this.begin, this.duration); }
  rewind(t = 0) { this.time = t; }
  fforward() { this.time = this.duration; }
  nextFrame() { this.time = this._time + 1; }
  prevFrame() { this.time = this._time - 1; }
  private apply() {
    const d = this.duration;
    this.obj[this.prop] = this._time >= d ? this.finish : this.func(this._time, this.begin, this.finish - this.begin, d);
    this.dispatchEvent(new TweenEvent(TweenEvent.MOTION_CHANGE, this._time, this.position));
  }
  private update() {
    this._time = this.useSeconds ? (getTimer() - this._startedAt) / 1000 : this._time + 1;
    if (this._time >= this.duration) {
      this._time = this.duration;
      this.apply();
      if (this.looping) { this.dispatchEvent(new TweenEvent(TweenEvent.MOTION_LOOP, this._time, this.position)); this.start(); return; }
      this.isPlaying = false;
      this.ticker.removeEventListener(Event.ENTER_FRAME, this.onFrame);
      this.dispatchEvent(new TweenEvent(TweenEvent.MOTION_FINISH, this._time, this.position));
      return;
    }
    this.apply();
  }
}
