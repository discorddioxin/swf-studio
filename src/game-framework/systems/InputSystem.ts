// One place reads input. Actions are named ('left', 'right', 'jump'), mapped to
// keys, and broadcast — no actor listens to the keyboard, and a generated actor
// never needs to know whether a human or a replay is playing.

import { Signals } from '../core/Signal';

export type ActionState = Record<string, boolean>;

export class InputSystem {
  readonly signals = new Signals();
  private bindings = new Map<string, Set<string>>();
  private state: ActionState = {};
  /** Set each step, cleared at the end: `pressed` is true only on the key's first frame. */
  private pressed: ActionState = {};
  private target?: EventTarget;
  private onKeyDown?: (event: Event) => void;
  private onKeyUp?: (event: Event) => void;

  /** Bind an action name to key names (`left` → `ArrowLeft`, `a`). */
  bind(action: string, ...keys: string[]): this {
    const set = this.bindings.get(action) ?? new Set<string>();
    for (const key of keys) set.add(key);
    this.bindings.set(action, set);
    return this;
  }

  /** Read the world's actions this step (and remember what changed). */
  beginStep(): ActionState {
    this.pressed = {};
    return this.state;
  }

  /** What the actors see: a plain object of action names. */
  get actions(): ActionState { return this.state; }

  isDown(action: string): boolean { return this.state[action] === true; }
  wasPressed(action: string): boolean { return this.pressed[action] === true; }

  /** Feed an action directly (a replay, a test, an on-screen button). */
  press(action: string): void { if (!this.state[action]) this.pressed[action] = true; this.state[action] = true; }
  release(action: string): void { this.state[action] = false; }

  /** Listen to a real keyboard. Returns an unsubscribe function. */
  attach(target: EventTarget): () => void {
    this.detach();
    this.target = target;
    this.onKeyDown = (event) => { for (const action of this.actionsFor((event as KeyboardEvent).key)) { this.press(action); this.signals.define<string>('pressed').emit(action); } };
    this.onKeyUp = (event) => { for (const action of this.actionsFor((event as KeyboardEvent).key)) { this.release(action); this.signals.define<string>('released').emit(action); } };
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    return () => this.detach();
  }

  detach(): void {
    if (this.target && this.onKeyDown) {
      this.target.removeEventListener('keydown', this.onKeyDown);
      this.target.removeEventListener('keyup', this.onKeyUp!);
    }
    this.target = undefined;
    this.onKeyDown = undefined;
    this.onKeyUp = undefined;
  }

  private actionsFor(key: string): string[] {
    const actions: string[] = [];
    for (const [action, keys] of this.bindings) if (keys.has(key)) actions.push(action);
    return actions;
  }
}
