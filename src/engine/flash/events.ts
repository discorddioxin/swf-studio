// flash.events: the AS3 event model (capture → target → bubble), with
// priorities, stopPropagation/stopImmediatePropagation and preventDefault.

import { runtime } from './context';

export type Listener = (event: Event) => unknown;
interface Registration { listener: Listener; capture: boolean; priority: number; order: number }

export class Event {
  static readonly ACTIVATE = 'activate';
  static readonly ADDED = 'added';
  static readonly ADDED_TO_STAGE = 'addedToStage';
  static readonly CANCEL = 'cancel';
  static readonly CHANGE = 'change';
  static readonly CLOSE = 'close';
  static readonly COMPLETE = 'complete';
  static readonly DEACTIVATE = 'deactivate';
  static readonly ENTER_FRAME = 'enterFrame';
  static readonly EXIT_FRAME = 'exitFrame';
  static readonly FRAME_CONSTRUCTED = 'frameConstructed';
  static readonly INIT = 'init';
  static readonly MOUSE_LEAVE = 'mouseLeave';
  static readonly OPEN = 'open';
  static readonly REMOVED = 'removed';
  static readonly REMOVED_FROM_STAGE = 'removedFromStage';
  static readonly RENDER = 'render';
  static readonly RESIZE = 'resize';
  static readonly SCROLL = 'scroll';
  static readonly SELECT = 'select';
  static readonly SOUND_COMPLETE = 'soundComplete';
  static readonly TAB_CHILDREN_CHANGE = 'tabChildrenChange';
  static readonly UNLOAD = 'unload';

  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  /** @internal */ _target: EventDispatcher | null = null;
  /** @internal */ _currentTarget: EventDispatcher | null = null;
  /** @internal */ _phase = 0;
  /** @internal */ _stopped = false;
  /** @internal */ _stoppedNow = false;
  /** @internal */ _prevented = false;

  constructor(type: string, bubbles = false, cancelable = false) {
    this.type = type;
    this.bubbles = bubbles;
    this.cancelable = cancelable;
  }

  get target() { return this._target; }
  get currentTarget() { return this._currentTarget; }
  get eventPhase() { return this._phase; }
  stopPropagation() { this._stopped = true; }
  stopImmediatePropagation() { this._stopped = true; this._stoppedNow = true; }
  preventDefault() { if (this.cancelable) this._prevented = true; }
  isDefaultPrevented() { return this._prevented; }
  clone(): Event { return new Event(this.type, this.bubbles, this.cancelable); }
  formatToString(className: string, ...args: string[]) {
    const self = this as unknown as Record<string, unknown>;
    return `[${className} ${args.map((a) => `${a}=${JSON.stringify(self[a])}`).join(' ')}]`;
  }
  toString() { return this.formatToString('Event', 'type', 'bubbles', 'cancelable', 'eventPhase'); }
}

export const EventPhase = { CAPTURING_PHASE: 1, AT_TARGET: 2, BUBBLING_PHASE: 3 } as const;

export class EventDispatcher {
  /** @internal */ _listeners: Map<string, Registration[]> | null = null;
  private _order = 0;
  private readonly _dispatchTarget: EventDispatcher;

  constructor(target?: EventDispatcher | null) {
    this._dispatchTarget = target ?? this;
  }

  addEventListener(type: string, listener: Listener, useCapture = false, priority = 0, _useWeakReference = false) {
    if (typeof listener !== 'function') throw new TypeError(`addEventListener("${type}"): listener is not a function`);
    this._listeners ??= new Map();
    const list = this._listeners.get(type) ?? [];
    if (list.some((r) => r.listener === listener && r.capture === useCapture)) return;
    list.push({ listener, capture: useCapture, priority, order: this._order++ });
    list.sort((a, b) => b.priority - a.priority || a.order - b.order);
    this._listeners.set(type, list);
    runtime.player?.listenerAdded(this, type);
  }

  removeEventListener(type: string, listener: Listener, useCapture = false) {
    const list = this._listeners?.get(type);
    if (!list) return;
    const next = list.filter((r) => !(r.listener === listener && r.capture === useCapture));
    if (next.length) this._listeners!.set(type, next);
    else { this._listeners!.delete(type); runtime.player?.listenerRemoved(this, type); }
  }

  hasEventListener(type: string) { return !!this._listeners?.get(type)?.length; }

  willTrigger(type: string): boolean {
    for (let node: EventDispatcher | null = this; node; node = parentOf(node)) if (node.hasEventListener(type)) return true;
    return false;
  }

  dispatchEvent(event: Event): boolean {
    // AS3 re-dispatching an event that was already dispatched uses a clone.
    const ev = event._target ? event.clone() : event;
    const target = this._dispatchTarget;
    ev._target = target;
    const path: EventDispatcher[] = [];
    for (let node = parentOf(target); node; node = parentOf(node)) path.push(node);

    for (let i = path.length - 1; i >= 0 && !ev._stopped; i--) invoke(path[i], ev, EventPhase.CAPTURING_PHASE);
    if (!ev._stopped) invoke(target, ev, EventPhase.AT_TARGET);
    if (ev.bubbles) for (let i = 0; i < path.length && !ev._stopped; i++) invoke(path[i], ev, EventPhase.BUBBLING_PHASE);

    ev._currentTarget = null;
    ev._phase = 0;
    return !ev._prevented;
  }

  toString() { return '[object EventDispatcher]'; }
}

/** Display objects override this through `_eventParent`. */
function parentOf(node: EventDispatcher): EventDispatcher | null {
  return (node as unknown as { _eventParent?: EventDispatcher | null })._eventParent ?? null;
}

function invoke(node: EventDispatcher, ev: Event, phase: number) {
  const list = node._listeners?.get(ev.type);
  if (!list?.length) return;
  ev._currentTarget = node;
  ev._phase = phase;
  for (const reg of [...list]) {
    if (phase === EventPhase.CAPTURING_PHASE && !reg.capture) continue;
    if (phase === EventPhase.BUBBLING_PHASE && reg.capture) continue;
    if (phase === EventPhase.AT_TARGET && reg.capture) continue;
    runtime.guard(() => reg.listener.call(node, ev), `${ev.type} listener`);
    if (ev._stoppedNow) break;
  }
}

export class MouseEvent extends Event {
  static readonly CLICK = 'click';
  static readonly DOUBLE_CLICK = 'doubleClick';
  static readonly MOUSE_DOWN = 'mouseDown';
  static readonly MOUSE_MOVE = 'mouseMove';
  static readonly MOUSE_OUT = 'mouseOut';
  static readonly MOUSE_OVER = 'mouseOver';
  static readonly MOUSE_UP = 'mouseUp';
  static readonly MOUSE_WHEEL = 'mouseWheel';
  static readonly ROLL_OUT = 'rollOut';
  static readonly ROLL_OVER = 'rollOver';
  static readonly RIGHT_CLICK = 'rightClick';
  static readonly RIGHT_MOUSE_DOWN = 'rightMouseDown';
  static readonly RIGHT_MOUSE_UP = 'rightMouseUp';
  static readonly MIDDLE_CLICK = 'middleClick';
  static readonly RELEASE_OUTSIDE = 'releaseOutside';

  localX: number; localY: number;
  relatedObject: unknown;
  ctrlKey: boolean; altKey: boolean; shiftKey: boolean;
  buttonDown: boolean; delta: number;
  /** @internal */ _stageX = 0; /** @internal */ _stageY = 0;

  constructor(type: string, bubbles = true, cancelable = false, localX = 0, localY = 0, relatedObject: unknown = null,
    ctrlKey = false, altKey = false, shiftKey = false, buttonDown = false, delta = 0) {
    super(type, bubbles, cancelable);
    this.localX = localX; this.localY = localY; this.relatedObject = relatedObject;
    this.ctrlKey = ctrlKey; this.altKey = altKey; this.shiftKey = shiftKey; this.buttonDown = buttonDown; this.delta = delta;
  }
  get stageX() { return this._stageX; }
  get stageY() { return this._stageY; }
  updateAfterEvent() {}
  clone(): Event {
    const e = new MouseEvent(this.type, this.bubbles, this.cancelable, this.localX, this.localY, this.relatedObject,
      this.ctrlKey, this.altKey, this.shiftKey, this.buttonDown, this.delta);
    e._stageX = this._stageX; e._stageY = this._stageY;
    return e;
  }
  toString() { return this.formatToString('MouseEvent', 'type', 'localX', 'localY', 'stageX', 'stageY', 'buttonDown'); }
}

export class KeyboardEvent extends Event {
  static readonly KEY_DOWN = 'keyDown';
  static readonly KEY_UP = 'keyUp';
  charCode: number; keyCode: number; keyLocation: number;
  ctrlKey: boolean; altKey: boolean; shiftKey: boolean;
  constructor(type: string, bubbles = true, cancelable = false, charCode = 0, keyCode = 0, keyLocation = 0,
    ctrlKey = false, altKey = false, shiftKey = false) {
    super(type, bubbles, cancelable);
    this.charCode = charCode; this.keyCode = keyCode; this.keyLocation = keyLocation;
    this.ctrlKey = ctrlKey; this.altKey = altKey; this.shiftKey = shiftKey;
  }
  updateAfterEvent() {}
  clone(): Event {
    return new KeyboardEvent(this.type, this.bubbles, this.cancelable, this.charCode, this.keyCode, this.keyLocation, this.ctrlKey, this.altKey, this.shiftKey);
  }
  toString() { return this.formatToString('KeyboardEvent', 'type', 'charCode', 'keyCode'); }
}

export class TimerEvent extends Event {
  static readonly TIMER = 'timer';
  static readonly TIMER_COMPLETE = 'timerComplete';
  constructor(type: string, bubbles = false, cancelable = false) { super(type, bubbles, cancelable); }
  updateAfterEvent() {}
  clone(): Event { return new TimerEvent(this.type, this.bubbles, this.cancelable); }
}

export class FocusEvent extends Event {
  static readonly FOCUS_IN = 'focusIn';
  static readonly FOCUS_OUT = 'focusOut';
  static readonly KEY_FOCUS_CHANGE = 'keyFocusChange';
  static readonly MOUSE_FOCUS_CHANGE = 'mouseFocusChange';
  relatedObject: unknown;
  constructor(type: string, bubbles = true, cancelable = false, relatedObject: unknown = null) {
    super(type, bubbles, cancelable);
    this.relatedObject = relatedObject;
  }
  clone(): Event { return new FocusEvent(this.type, this.bubbles, this.cancelable, this.relatedObject); }
}

export class TextEvent extends Event {
  static readonly LINK = 'link';
  static readonly TEXT_INPUT = 'textInput';
  text: string;
  constructor(type: string, bubbles = false, cancelable = false, text = '') { super(type, bubbles, cancelable); this.text = text; }
  clone(): Event { return new TextEvent(this.type, this.bubbles, this.cancelable, this.text); }
}

export class ErrorEvent extends TextEvent {
  static readonly ERROR = 'error';
  errorID: number;
  constructor(type: string, bubbles = false, cancelable = false, text = '', id = 0) { super(type, bubbles, cancelable, text); this.errorID = id; }
}

export class IOErrorEvent extends ErrorEvent { static readonly IO_ERROR = 'ioError'; }
export class SecurityErrorEvent extends ErrorEvent { static readonly SECURITY_ERROR = 'securityError'; }

export class ProgressEvent extends Event {
  static readonly PROGRESS = 'progress';
  static readonly SOCKET_DATA = 'socketData';
  bytesLoaded: number; bytesTotal: number;
  constructor(type: string, bubbles = false, cancelable = false, bytesLoaded = 0, bytesTotal = 0) {
    super(type, bubbles, cancelable);
    this.bytesLoaded = bytesLoaded; this.bytesTotal = bytesTotal;
  }
  clone(): Event { return new ProgressEvent(this.type, this.bubbles, this.cancelable, this.bytesLoaded, this.bytesTotal); }
}
