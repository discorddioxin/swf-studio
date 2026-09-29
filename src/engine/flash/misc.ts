// flash.ui, flash.net, flash.system, flash.filters and flash.external.
// These are small packages: they are complete enough for game code to run,
// and anything browser-restricted (external interfaces, sockets) is a
// harmless no-op.

import { runtime } from './context';
import { EventDispatcher } from './events';

// ------------------------------------------------------------------ ui --

export const Keyboard = {
  A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73, J: 74, K: 75, L: 76, M: 77,
  N: 78, O: 79, P: 80, Q: 81, R: 82, S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90,
  NUMBER_0: 48, NUMBER_1: 49, NUMBER_2: 50, NUMBER_3: 51, NUMBER_4: 52,
  NUMBER_5: 53, NUMBER_6: 54, NUMBER_7: 55, NUMBER_8: 56, NUMBER_9: 57,
  NUMPAD_0: 96, NUMPAD_1: 97, NUMPAD_2: 98, NUMPAD_3: 99, NUMPAD_4: 100, NUMPAD_5: 101, NUMPAD_6: 102,
  NUMPAD_7: 103, NUMPAD_8: 104, NUMPAD_9: 105, NUMPAD_MULTIPLY: 106, NUMPAD_ADD: 107, NUMPAD_ENTER: 108,
  NUMPAD_SUBTRACT: 109, NUMPAD_DECIMAL: 110, NUMPAD_DIVIDE: 111,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
  BACKSPACE: 8, TAB: 9, ENTER: 13, COMMAND: 15, SHIFT: 16, CONTROL: 17, ALTERNATE: 18, CAPS_LOCK: 20,
  ESCAPE: 27, SPACE: 32, PAGE_UP: 33, PAGE_DOWN: 34, END: 35, HOME: 36,
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, INSERT: 45, DELETE: 46,
  SEMICOLON: 186, EQUAL: 187, COMMA: 188, MINUS: 189, PERIOD: 190, SLASH: 191, BACKQUOTE: 192,
  LEFTBRACKET: 219, BACKSLASH: 220, RIGHTBRACKET: 221, QUOTE: 222,
  get capsLock() { return false; }, get numLock() { return false; },
  isAccessible() { return true; },
} as const;

export const KeyLocation = { STANDARD: 0, LEFT: 1, RIGHT: 2, NUM_PAD: 3 } as const;

export const Mouse = {
  cursor: 'auto',
  hide() { (runtime.player as unknown as { setCursorHidden?: (h: boolean) => void } | null)?.setCursorHidden?.(true); },
  show() { (runtime.player as unknown as { setCursorHidden?: (h: boolean) => void } | null)?.setCursorHidden?.(false); },
};
export const MouseCursor = { ARROW: 'arrow', AUTO: 'auto', BUTTON: 'button', HAND: 'hand', IBEAM: 'ibeam' } as const;

export class ContextMenu extends EventDispatcher {
  customItems: unknown[] = [];
  builtInItems = {};
  hideBuiltInItems() {}
}
export class ContextMenuItem extends EventDispatcher {
  constructor(public caption: string, public separatorBefore = false, public enabled = true, public visible = true) { super(); }
}

// ----------------------------------------------------------------- net --

export class URLRequest {
  url: string; method = 'GET'; data: unknown = null; contentType: string | null = null; requestHeaders: unknown[] = [];
  constructor(url: string | null = null) { this.url = url ?? ''; }
}
export class URLVariables {
  constructor(source?: string) { if (source) this.decode(source); }
  decode(source: string) {
    for (const [k, v] of new URLSearchParams(source)) (this as unknown as Record<string, string>)[k] = v;
  }
  toString() { return new URLSearchParams(Object.entries(this).map(([k, v]) => [k, String(v)])).toString(); }
}
export const URLRequestMethod = { GET: 'GET', POST: 'POST' } as const;
export function navigateToURL(request: URLRequest, window = '_blank') {
  if (typeof globalThis.open === 'function' && /^https?:/i.test(request.url)) globalThis.open(request.url, window, 'noopener');
}
export function sendToURL(_request: URLRequest) {}

/** Local shared objects persist in localStorage, namespaced per SWF. */
export class SharedObject extends EventDispatcher {
  readonly data: Record<string, unknown>;
  private constructor(private readonly key: string) {
    super();
    let stored: Record<string, unknown> = {};
    try { stored = JSON.parse(globalThis.localStorage?.getItem(key) ?? '{}') ?? {}; } catch { stored = {}; }
    this.data = stored;
  }
  static getLocal(name: string, localPath: string | null = null): SharedObject {
    const swf = (runtime.player as unknown as { doc?: { header?: { fileName?: string } } } | null)?.doc?.header?.fileName ?? 'swf';
    return new SharedObject(`swf-studio:so:${swf}:${localPath ?? ''}:${name}`);
  }
  get size() { return JSON.stringify(this.data).length; }
  flush(_minDiskSpace = 0) {
    try { globalThis.localStorage?.setItem(this.key, JSON.stringify(this.data)); } catch { /* quota / privacy mode */ }
    return 'flushed';
  }
  clear() {
    for (const k of Object.keys(this.data)) delete this.data[k];
    try { globalThis.localStorage?.removeItem(this.key); } catch { /* ignore */ }
  }
  close() {}
  setProperty(name: string, value: unknown) { this.data[name] = value; }
}
export const SharedObjectFlushStatus = { FLUSHED: 'flushed', PENDING: 'pending' } as const;

/** Network loading is not available to the offline player: loads fail with IO_ERROR. */
export class URLLoader extends EventDispatcher {
  data: unknown = null; dataFormat = 'text'; bytesLoaded = 0; bytesTotal = 0;
  constructor(_request: URLRequest | null = null) { super(); }
  load(request: URLRequest) {
    (runtime.player as unknown as { failLoad?: (t: EventDispatcher, url: string) => void } | null)?.failLoad?.(this, request.url);
  }
  close() {}
}
export const URLLoaderDataFormat = { BINARY: 'binary', TEXT: 'text', VARIABLES: 'variables' } as const;

// -------------------------------------------------------------- system --

export const Capabilities = {
  playerType: 'StandAlone', version: 'WEB 32,0,0,0', os: 'Web', language: 'en', manufacturer: 'SWF Studio',
  screenResolutionX: 1920, screenResolutionY: 1080, screenDPI: 72, isDebugger: false, hasAudio: true,
  hasMP3: true, localFileReadDisable: true, pixelAspectRatio: 1, cpuArchitecture: 'x86',
};
export const System = {
  get totalMemory() { return 0; }, get freeMemory() { return 0; }, get privateMemory() { return 0; },
  gc() {}, pause() {}, resume() {}, exit() {}, setClipboard(s: string) { void globalThis.navigator?.clipboard?.writeText(s); },
  useCodePage: false,
};
export const Security = { allowDomain() {}, allowInsecureDomain() {}, loadPolicyFile() {}, sandboxType: 'localTrusted', LOCAL_TRUSTED: 'localTrusted' };
export class ApplicationDomain {
  static currentDomain = new ApplicationDomain();
  getDefinition(name: string) { return (runtime.player as unknown as { getDefinition(n: string): unknown }).getDefinition(name); }
  hasDefinition(name: string) { return this.getDefinition(name) != null; }
}
export class LoaderContext { constructor(public checkPolicyFile = false, public applicationDomain: unknown = null) {} }
export const fscommand = (_command: string, _args = '') => {};

// ------------------------------------------------------------- filters --
// Stored on DisplayObject.filters; not rendered (canvas filter support
// differs per browser), so they never break game logic.

export class BitmapFilter { clone() { return Object.assign(Object.create(Object.getPrototypeOf(this)), this); } }
export class GlowFilter extends BitmapFilter { constructor(public color = 0xff0000, public alpha = 1, public blurX = 6, public blurY = 6, public strength = 2, public quality = 1, public inner = false, public knockout = false) { super(); } }
export class DropShadowFilter extends BitmapFilter { constructor(public distance = 4, public angle = 45, public color = 0, public alpha = 1, public blurX = 4, public blurY = 4, public strength = 1, public quality = 1, public inner = false, public knockout = false, public hideObject = false) { super(); } }
export class BlurFilter extends BitmapFilter { constructor(public blurX = 4, public blurY = 4, public quality = 1) { super(); } }
export class ColorMatrixFilter extends BitmapFilter { constructor(public matrix: number[] = []) { super(); } }
export class BevelFilter extends BitmapFilter {}
export class GradientGlowFilter extends BitmapFilter {}
export class GradientBevelFilter extends BitmapFilter {}
export class ConvolutionFilter extends BitmapFilter {}
export class DisplacementMapFilter extends BitmapFilter {}
export const BitmapFilterQuality = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;

// ------------------------------------------------------------ external --

export const ExternalInterface = { available: false, objectID: null, call() { return null; }, addCallback() {}, marshallExceptions: false };
