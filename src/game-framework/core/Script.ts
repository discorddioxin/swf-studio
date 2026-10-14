// A Script is what a MovieClip's frame code becomes: named behaviours, each one a
// function that runs on its actor, plus the signals that ask for it. There is no
// frame loop here — the systems decide when a behaviour runs, by name.

import type { Actor } from './Actor';

/** One behaviour: what it does, what asks for it, and whether it repeats. */
export interface Action<T extends Actor = Actor> {
  name: string;
  /** The lifted code. It may only call its own actor. */
  run: (actor: T) => void;
  /** Signals that trigger it (`onSolidGround`, `bounce`, …). */
  on?: string[];
  /** Repeat until `stop(name)` is called. */
  loop?: boolean;
  /** The material the actor shows while this runs. */
  material?: string;
}

/**
 * The recorded behaviours of one actor. `Script` holds the code; the actor holds
 * the body it runs on; the systems hold the timing.
 */
export class Script<T extends Actor = Actor> {
  private actions = new Map<string, Action<T>>();
  private running = new Set<string>();
  private unhook: Array<() => void> = [];
  /** The behaviour currently playing, if any. */
  current?: Action<T>;

  constructor(readonly name: string) {}

  /** Record a behaviour. Signal names in `on` are wired up in `attach`. */
  behaviour(name: string, run: (actor: T) => void, options: { on?: string[]; loop?: boolean; material?: string } = {}): this {
    this.actions.set(name, { name, run, on: options.on, loop: options.loop, material: options.material });
    return this;
  }

  action(action: Action<T>): this {
    this.actions.set(action.name, action);
    return this;
  }

  /**
   * Give the script its actor: every declared signal is subscribed to, and each
   * one plays the behaviour it names. This is the only place an actor's code is
   * connected to the outside world.
   */
  attach(actor: T): void {
    this.actor = actor;
    for (const action of this.actions.values()) {
      for (const signalName of action.on ?? []) {
        this.unhook.push(actor.signal(signalName).on(() => this.play(action, actor)));
      }
    }
  }

  /** Run a behaviour; `actor` is needed when it was not attached to one. */
  play(action: Action<T>, actor?: T): void {
    if (this.running.has(action.name) && action.loop) return;
    const target = actor ?? (this.actor as T | undefined);
    if (!target) throw new Error(`script ${this.name}: no actor to run ${action.name} on`);
    this.current = action;
    this.running.add(action.name);
    if (action.material) target.play(action.material, () => { if (!action.loop) this.running.delete(action.name); });
    try {
      action.run(target);
    } finally {
      if (!action.loop) this.running.delete(action.name);
    }
  }

  /** The actor this script was attached to (`attach` sets it). */
  actor?: T;

  /** Run a behaviour by name. */
  start(name: string): boolean {
    const action = this.actions.get(name);
    if (!action) return false;
    this.play(action);
    return true;
  }

  stop(name?: string): void {
    if (name) this.running.delete(name);
    else this.running.clear();
    this.current = undefined;
  }

  get(name: string): Action<T> | undefined { return this.actions.get(name); }
  names(): string[] { return [...this.actions.keys()].sort(); }
  get isRunning(): boolean { return this.running.size > 0; }

  dispose(): void {
    for (const off of this.unhook) off();
    this.unhook = [];
    this.running.clear();
  }
}
