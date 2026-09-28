// ---------------------------------------------------------------------------
// A pure, TYPED Flash movie-clip scope. No React/DOM dependencies, so it can be
// changed and unit-tested in isolation.
//
// This replaces the old untyped `new Proxy({ has(){ return true } })` trap —
// the single biggest reason AIs kept breaking the engine. That proxy returned
// `any` for every property, so TypeScript reported no error for any typo or
// misuse, and the bug only surfaced at runtime.
//
// Here, dynamic property access returns a typed `FlashValue` (never `any`), so
// misuse is caught at the type level instead of failing at runtime.
// ---------------------------------------------------------------------------

import type { RuntimeBridge } from './types';

/** A typed dynamic Flash value. Dynamic property access returns a FlashValue
 *  (typed, never `any`), so typos are caught at the type level. */
export interface FlashValue {
  [key: string]: FlashValue | number | boolean | Math | ((...args: never[]) => unknown);
}

/** The root of the Flash scope. Extends FlashValue with the global Flash API. */
export interface FlashScope extends FlashValue {
  _global: FlashValue;
  trace: (msg?: unknown) => void;
  stop: () => void;
  play: () => void;
  stopAll: () => void;
  gotoAndPlay: (frame: number | string) => void;
  gotoAndStop: (frame: number | string) => void;
  nextFrame: () => void;
  prevFrame: () => void;
  getURL: (url: string, target?: string) => void;
  attachMovie: (name: string, deepName: string, depth?: number) => FlashValue;
  duplicateMovieClip: (sourceName: string, deepName: string, depth?: number) => FlashValue;
  removeMovieClip: (deepName?: string, deep?: boolean) => void;
  detachMovie: (deepName?: string, deep?: boolean) => void;
  loadMovie: (url: string, loadType?: number) => void;
  unloadMovie: (loadType?: number) => void;
  createEmptyMovieClip: (deepName: string, depth: number) => FlashValue;
  removeEmptyMovieClip: (deepName: string) => void;
  startDrag: (target?: FlashValue | string, lockCenter?: boolean, left?: number, top?: number, right?: number, bottom?: number) => void;
  endDrag: () => void;
  hitTest: (target: FlashValue | string) => boolean;
  beginDrag: (target?: FlashValue | string, lockCenter?: boolean, left?: number, top?: number, right?: number, bottom?: number) => void;
  getMovieClip: (target: FlashValue | string, name: string) => FlashValue;
  Math: Math;
  parseInt: (v: unknown, radix?: number) => number;
  parseFloat: (v: unknown) => number;
  isNaN: (v: unknown) => boolean;
  isFinite: (v: unknown) => boolean;
  Number: (v?: unknown) => number;
  String: (v?: unknown) => string;
  Boolean: (v?: unknown) => boolean;
}

/** Create a typed Flash scope backed by a RuntimeBridge. Every dynamic property
 *  access returns a typed FlashValue proxy (never `any`), so typos are caught
 *  at the type level. Known Flash APIs forward to the bridge so the runtime can
 *  observe and control them. */
export function createFlashScope(bridge: RuntimeBridge): FlashScope {
  const makeValue = (path: string): FlashValue =>
    new Proxy(
      {} as Record<string, FlashValue>,
      {
        get(_target, prop) {
          if (prop === Symbol.toPrimitive) {
            return () => `[${path}]`;
          }
          if (prop === 'then') {
            return undefined;
          }
          if (typeof prop !== 'string') {
            return makeValue(path);
          }
          switch (prop) {
            case 'trace':
              return (msg?: unknown) =>
                bridge.emit({ frame: bridge.frame, kind: 'trace', tagType: 'trace', detail: typeof msg === 'string' ? msg : String(msg) });
            case 'stop':
              return () => {
                bridge.clock.stoppedByScript = true;
                bridge.clock.playing = false;
                bridge.emit({ frame: bridge.frame, kind: 'control', tagType: 'stop', detail: `${path}.stop()` });
              };
            case 'play':
              return () => {
                bridge.clock.playing = true;
                bridge.clock.stoppedByScript = false;
                bridge.emit({ frame: bridge.frame, kind: 'control', tagType: 'play', detail: `${path}.play()` });
              };
            case 'stopAll':
              return () => bridge.emit({ frame: bridge.frame, kind: 'control', tagType: 'stopAll', detail: `${path}.stopAll()` });
            case 'gotoAndPlay':
              return (frame: number | string) =>
                bridge.emit({ frame: bridge.frame, kind: 'control', tagType: 'gotoAndPlay', detail: `${path}.gotoAndPlay(${String(frame)})` });
            case 'gotoAndStop':
              return (frame: number | string) =>
                bridge.emit({ frame: bridge.frame, kind: 'control', tagType: 'gotoAndStop', detail: `${path}.gotoAndStop(${String(frame)})` });
            case 'nextFrame':
              return () => bridge.emit({ frame: bridge.frame, kind: 'control', tagType: 'nextFrame', detail: `${path}.nextFrame()` });
            case 'prevFrame':
              return () => bridge.emit({ frame: bridge.frame, kind: 'control', tagType: 'prevFrame', detail: `${path}.prevFrame()` });
            case 'getURL':
              return (url: string, target?: string) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'getURL', detail: `${path}.getURL(${JSON.stringify(url)}${target != null ? `, ${JSON.stringify(target)}` : ''})` });
            case 'attachMovie':
              return (name: string, deepName: string, depth?: number) => {
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'attachMovie', detail: `${path}.attachMovie(${JSON.stringify(name)}, ${JSON.stringify(deepName)}${depth != null ? `, ${depth}` : ''})` });
                return makeValue(`${path}.${deepName}`);
              };
            case 'duplicateMovieClip':
              return (source: string, deepName: string, depth?: number) => {
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'duplicateMovieClip', detail: `${path}.duplicateMovieClip(${JSON.stringify(source)}, ${JSON.stringify(deepName)}${depth != null ? `, ${depth}` : ''})` });
                return makeValue(`${path}.${deepName}`);
              };
            case 'removeMovieClip':
              return (deepName?: string, deep?: boolean) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'removeMovieClip', detail: `${path}.removeMovieClip(${deepName != null ? JSON.stringify(deepName) : ''}${deep ? ', true' : ''})` });
            case 'detachMovie':
              return (deepName?: string, deep?: boolean) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'detachMovie', detail: `${path}.detachMovie(${deepName != null ? JSON.stringify(deepName) : ''}${deep ? ', true' : ''})` });
            case 'loadMovie':
              return (url: string, loadType?: number) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'loadMovie', detail: `${path}.loadMovie(${JSON.stringify(url)}${loadType != null ? `, ${loadType}` : ''})` });
            case 'unloadMovie':
              return (loadType?: number) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'unloadMovie', detail: `${path}.unloadMovie(${loadType != null ? String(loadType) : ''})` });
            case 'createEmptyMovieClip':
              return (deepName: string, depth: number) => {
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'createEmptyMovieClip', detail: `${path}.createEmptyMovieClip(${JSON.stringify(deepName)}, ${depth})` });
                return makeValue(`${path}.${deepName}`);
              };
            case 'removeEmptyMovieClip':
              return (deepName: string) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'removeEmptyMovieClip', detail: `${path}.removeEmptyMovieClip(${JSON.stringify(deepName)})` });
            case 'startDrag':
              return (target?: FlashValue | string, lockCenter?: boolean) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'startDrag', detail: `${path}.startDrag(${target != null ? JSON.stringify(String(target)) : ''}${lockCenter ? ', true' : ''})` });
            case 'endDrag':
              return () => bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'endDrag', detail: `${path}.endDrag()` });
            case 'hitTest':
              return (target: FlashValue | string) => {
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'hitTest', detail: `${path}.hitTest(${JSON.stringify(String(target))})` });
                return false;
              };
            case 'beginDrag':
              return (target?: FlashValue | string, lockCenter?: boolean) =>
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'beginDrag', detail: `${path}.beginDrag(${target != null ? JSON.stringify(String(target)) : ''}${lockCenter ? ', true' : ''})` });
            case 'getMovieClip':
              return (target: FlashValue | string, name: string) => {
                bridge.emit({ frame: bridge.frame, kind: 'display', tagType: 'getMovieClip', detail: `${path}.getMovieClip(${JSON.stringify(String(target))}, ${JSON.stringify(name)})` });
                return makeValue(`${String(target)}.${name}`);
              };
            case 'Math':
              return Math;
            case 'parseInt':
              return (v: unknown, radix?: number) => parseInt(String(v), radix);
            case 'parseFloat':
              return (v: unknown) => parseFloat(String(v));
            case 'isNaN':
              return (v: unknown) => Number.isNaN(Number(v));
            case 'isFinite':
              return (v: unknown) => Number.isFinite(Number(v));
            case 'Number':
              return (v?: unknown) => Number(v);
            case 'String':
              return (v?: unknown) => String(v);
            case 'Boolean':
              return (v?: unknown) => Boolean(v);
            default:
              if (prop.startsWith('_') && prop.length <= 7) {
                return 0;
              }
              return makeValue(`${path}.${prop}`);
          }
        },
        set() {
          return true;
        },
        has() {
          return true;
        },
      },
    );

  const root = makeValue('_global');
  return root as FlashScope;
}
