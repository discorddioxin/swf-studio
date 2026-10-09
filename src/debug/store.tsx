import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Breakpoint, DebuggerState, PauseReason, StackFrame, WatchExpression } from './types';

type DebuggerCallbacks = {
  onContinue?: () => void;
  onStepOver?: () => void;
  onStepInto?: () => void;
  onStepOut?: () => void;
  onPause?: () => void;
};

class DebuggerStore {
  private state: DebuggerState;
  private listeners = new Set<() => void>();
  private resumeResolvers: (() => void)[] = [];
  private callbacks = new Map<string, DebuggerCallbacks>();
  private activeCallbackId: string | null = null;
  // step request
  stepRequest: 'over' | 'into' | 'out' | null = null;
  stepStackDepth = 0;
  // continue() should not immediately re-hit the same breakpoint
  private skipNextBpId: string | null = null;
  private skipNextKey: string | null = null;

  constructor() {
    this.state = {
      paused: false,
      pauseReason: null,
      pausedAt: null,
      breakpoints: [],
      watches: [],
      stack: [],
      selectedFrameId: null,
      breakOnExceptions: false,
      breakOnUncaught: false,
      stepDepth: null,
      exception: null,
    };
    // restore from storage
    try {
      const raw = localStorage.getItem('swf-debugger');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.breakpoints)) this.state.breakpoints = parsed.breakpoints;
        if (Array.isArray(parsed.watches)) this.state.watches = parsed.watches;
        if (typeof parsed.breakOnExceptions === 'boolean') this.state.breakOnExceptions = parsed.breakOnExceptions;
        if (typeof parsed.breakOnUncaught === 'boolean') this.state.breakOnUncaught = parsed.breakOnUncaught;
      }
    } catch { /* ignore */ }
  }

  getState(): DebuggerState { return this.state; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of [...this.listeners]) {
      try { l(); } catch (e) { console.error('[DebuggerStore] listener threw', e); }
    }
    // persist breakpoints/watches/settings
    try {
      localStorage.setItem('swf-debugger', JSON.stringify({
        breakpoints: this.state.breakpoints,
        watches: this.state.watches,
        breakOnExceptions: this.state.breakOnExceptions,
        breakOnUncaught: this.state.breakOnUncaught,
      }));
    } catch { /* ignore */ }
  }

  setCallbacks(cb: DebuggerCallbacks, id: string = 'default') {
    if (!cb || Object.keys(cb).length === 0) {
      this.callbacks.delete(id);
      if (this.activeCallbackId === id) this.activeCallbackId = this.callbacks.size ? [...this.callbacks.keys()].pop()! : null;
    } else {
      this.callbacks.set(id, cb);
      this.activeCallbackId = id;
    }
  }

  registerCallbacks(id: string, cb: DebuggerCallbacks) {
    this.callbacks.set(id, cb);
    this.activeCallbackId = id;
  }

  unregisterCallbacks(id: string) {
    this.callbacks.delete(id);
    if (this.activeCallbackId === id) this.activeCallbackId = this.callbacks.size ? [...this.callbacks.keys()].pop()! : null;
  }

  setActiveCallbacks(id: string | null) {
    if (id && this.callbacks.has(id)) this.activeCallbackId = id;
    else this.activeCallbackId = null;
  }

  private forEachCallback(fn: (cb: DebuggerCallbacks) => void) {
    if (this.activeCallbackId && this.callbacks.has(this.activeCallbackId)) {
      try { fn(this.callbacks.get(this.activeCallbackId)!); } catch (e) { console.error('[DebuggerStore] callback threw', e); }
      return;
    }
    for (const cb of this.callbacks.values()) {
      try { fn(cb); } catch (e) { console.error('[DebuggerStore] callback threw', e); }
    }
  }

  // breakpoints
  addBreakpoint(path: string, line: number): Breakpoint {
    const existing = this.state.breakpoints.find(b => b.path === path && b.line === line);
    if (existing) return existing;
    const bp: Breakpoint = { id: `bp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, path, line, enabled: true };
    this.state = { ...this.state, breakpoints: [...this.state.breakpoints, bp] };
    this.emit();
    return bp;
  }

  removeBreakpoint(id: string) {
    this.state = { ...this.state, breakpoints: this.state.breakpoints.filter(b => b.id !== id) };
    this.emit();
  }

  toggleBreakpoint(path: string, line: number) {
    const existing = this.state.breakpoints.find(b => b.path === path && b.line === line);
    if (existing) {
      this.state = { ...this.state, breakpoints: this.state.breakpoints.filter(b => b.id !== existing.id) };
    } else {
      this.addBreakpoint(path, line);
      return;
    }
    this.emit();
  }

  updateBreakpoint(id: string, patch: Partial<Breakpoint>) {
    this.state = { ...this.state, breakpoints: this.state.breakpoints.map(b => b.id === id ? { ...b, ...patch } : b) };
    this.emit();
  }

  clearBreakpoints(path?: string) {
    if (path) {
      this.state = { ...this.state, breakpoints: this.state.breakpoints.filter(b => b.path !== path) };
    } else {
      this.state = { ...this.state, breakpoints: [] };
    }
    this.emit();
  }

  hasEnabledBreakpoint(path: string, line: number): Breakpoint | undefined {
    return this.state.breakpoints.find(b => b.enabled && b.path === path && b.line === line);
  }

  hasBreakpointForFile(path: string): boolean {
    return this.state.breakpoints.some(b => b.enabled && b.path === path);
  }

  // watches
  addWatch(expression: string): WatchExpression {
    const w: WatchExpression = { id: `w-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, expression };
    this.state = { ...this.state, watches: [...this.state.watches, w] };
    this.emit();
    return w;
  }

  removeWatch(id: string) {
    this.state = { ...this.state, watches: this.state.watches.filter(w => w.id !== id) };
    this.emit();
  }

  updateWatch(id: string, expression: string) {
    this.state = { ...this.state, watches: this.state.watches.map(w => w.id === id ? { ...w, expression } : w) };
    this.emit();
  }

  setWatchResults(results: WatchExpression[]) {
    this.state = { ...this.state, watches: results };
    this.emit();
  }

  // stack / pause
  setStack(stack: StackFrame[]) {
    this.state = { ...this.state, stack, selectedFrameId: stack[0]?.id ?? null };
    this.emit();
  }

  selectFrame(id: number | null) {
    this.state = { ...this.state, selectedFrameId: id };
    this.emit();
  }

  setBreakOnExceptions(v: boolean) { this.state = { ...this.state, breakOnExceptions: v }; this.emit(); }
  setBreakOnUncaught(v: boolean) { this.state = { ...this.state, breakOnUncaught: v }; this.emit(); }

  // pause/resume logic
  pause(reason: PauseReason, at?: { path: string; line: number }, stack?: StackFrame[], exception?: { message: string; stack?: string }) {
    if (this.state.paused) return;
    this.state = {
      ...this.state,
      paused: true,
      pauseReason: reason,
      pausedAt: at ?? null,
      stack: stack ?? this.state.stack,
      selectedFrameId: (stack ?? this.state.stack)[0]?.id ?? this.state.selectedFrameId,
      exception: exception ?? null,
    };
    // evaluate watches lazily; consumers will evaluate against selected frame scope
    this.emit();
  }

  /** Let a guard skip the breakpoint that just caused the pause when the user hits Continue. */
  private shouldSkipHit(hit: Breakpoint | undefined, fallbackKey?: string): boolean {
    if (!hit && !fallbackKey) return false;
    if (hit && this.skipNextBpId === hit.id) { this.skipNextBpId = null; this.skipNextKey = null; return true; }
    const key = fallbackKey ?? (hit ? `${hit.path}:${hit.line}` : null);
    if (key && this.skipNextKey === key) { this.skipNextBpId = null; this.skipNextKey = null; return true; }
    return false;
  }

  /** Called by player guards to honour the same skip logic without duplicating it. */
  shouldSkipFor(hit: Breakpoint): boolean {
    return this.shouldSkipHit(hit);
  }

  clearSkip() {
    this.skipNextBpId = null;
    this.skipNextKey = null;
  }

  async maybePauseAt(path: string, line: number, scope: Record<string, unknown>, label: string): Promise<void> {
    const bp = this.hasEnabledBreakpoint(path, line);
    const shouldBreakForStep = this.stepRequest != null;
    // simple file-level breakpoint: if any breakpoint in file and no line-specific, still break on function entry (line 1)
    const fileBp = !bp && line === 1 ? this.state.breakpoints.find(b => b.enabled && b.path === path) : undefined;
    if (!bp && !fileBp && !shouldBreakForStep) return;
    // check condition
    const hit = bp ?? fileBp;
    if (hit && this.shouldSkipHit(hit)) return;
    if (hit?.condition) {
      try {
        const fn = new Function(...Object.keys(scope), `return (${hit.condition});`);
        const res = fn(...Object.values(scope));
        if (!res) return;
      } catch { /* condition error -> break anyway */ }
    }
    // build stack entry if not already
    const frame: StackFrame = { id: Date.now() + Math.floor(Math.random()*1000), name: label, source: path, line, scope };
    const newStack = [frame, ...this.state.stack].slice(0, 32);
    this.pause(hit ? 'breakpoint' : 'step', { path, line }, newStack);
    await this.waitForResume();
  }

  handleException(error: unknown, where: string, scope?: Record<string, unknown>) {
    if (!this.state.breakOnExceptions && !this.state.breakOnUncaught) return false;
    const e = error instanceof Error ? error : new Error(String(error));
    // if breakOnUncaught only, we would need to know if caught; for now treat all as breakable if either enabled
    const should = this.state.breakOnExceptions || this.state.breakOnUncaught;
    if (!should) return false;
    const frame: StackFrame = { id: Date.now(), name: where, source: 'exception', line: 1, scope: scope ?? {} };
    this.pause('exception', undefined, [frame, ...this.state.stack], { message: e.message, stack: e.stack });
    // we don't await here; caller should await waitForResume if they want to pause
    return true;
  }

  // step controls set request and resume
  stepOver() {
    this.skipNextBpId = null;
    this.skipNextKey = null;
    this.stepRequest = 'over';
    this.stepStackDepth = this.state.stack.length;
    this.resume();
    this.forEachCallback(cb => cb.onStepOver?.());
  }
  stepInto() {
    this.skipNextBpId = null;
    this.skipNextKey = null;
    this.stepRequest = 'into';
    this.resume();
    this.forEachCallback(cb => cb.onStepInto?.());
  }
  stepOut() {
    this.skipNextBpId = null;
    this.skipNextKey = null;
    this.stepRequest = 'out';
    this.stepStackDepth = this.state.stack.length;
    this.resume();
    this.forEachCallback(cb => cb.onStepOut?.());
  }
  continue() {
    // Don't immediately re-break on the breakpoint we just left.
    if (this.state.paused && this.state.pauseReason === 'breakpoint' && this.state.pausedAt) {
      const at = this.state.pausedAt;
      const exact = this.state.breakpoints.find(b => b.enabled && b.path === at.path && b.line === at.line);
      if (exact) {
        this.skipNextBpId = exact.id;
        this.skipNextKey = `${exact.path}:${exact.line}`;
      } else {
        const fileBp = this.state.breakpoints.find(b => b.enabled && b.path === at.path);
        if (fileBp) {
          this.skipNextBpId = fileBp.id;
          this.skipNextKey = `${fileBp.path}:${fileBp.line}`;
        } else {
          this.skipNextKey = `${at.path}:${at.line}`;
        }
      }
    } else {
      this.skipNextBpId = null;
      this.skipNextKey = null;
    }
    this.stepRequest = null;
    this.resume();
    this.forEachCallback(cb => cb.onContinue?.());
  }
  requestPause() {
    if (this.state.paused) return;
    // will pause at next instrumented point
    this.stepRequest = 'into';
    // also immediate pause if no upcoming instrument
    this.pause('pause');
  }

  resume() {
    if (!this.state.paused) {
      this.stepRequest = null;
      return;
    }
    this.state = { ...this.state, paused: false, pauseReason: null, pausedAt: null, exception: null };
    this.emit();
    const resolvers = this.resumeResolvers.splice(0);
    resolvers.forEach(r => r());
  }

  waitForResume(): Promise<void> {
    if (!this.state.paused) return Promise.resolve();
    return new Promise<void>(resolve => this.resumeResolvers.push(resolve));
  }

  // evaluate expression in scope of selected frame
  evaluateWatch(expression: string, scope: Record<string, unknown>): { value: string; error?: string } {
    if (!expression.trim()) return { value: '' };
    try {
      // create function with scope variables available
      const keys = Object.keys(scope);
      const vals = Object.values(scope);
      // allow `this` as alias to scope.this if present
      const fn = new Function(...keys, `return (${expression});`);
      const result = fn(...vals);
      let str: string;
      if (result === undefined) str = 'undefined';
      else if (result === null) str = 'null';
      else if (typeof result === 'object') {
        try { str = JSON.stringify(result, null, 2)?.slice(0, 1000) ?? String(result); } catch { str = String(result); }
      } else str = String(result);
      return { value: str };
    } catch (e) {
      return { value: '', error: e instanceof Error ? e.message : String(e) };
    }
  }

  evaluateAllWatches() {
    const frame = this.state.stack.find(f => f.id === this.state.selectedFrameId) ?? this.state.stack[0];
    const scope = frame?.scope ?? {};
    const updated = this.state.watches.map(w => {
      const res = this.evaluateWatch(w.expression, scope);
      return { ...w, value: res.value, error: res.error };
    });
    // don't emit loop if not changed? just update
    this.state = { ...this.state, watches: updated };
    this.emit();
    return updated;
  }

  // push/pop stack manually
  pushFrame(frame: StackFrame) {
    this.state = { ...this.state, stack: [frame, ...this.state.stack].slice(0, 64), selectedFrameId: frame.id };
    this.emit();
  }
  popFrame() {
    if (!this.state.stack.length) return;
    const [, ...rest] = this.state.stack;
    this.state = { ...this.state, stack: rest, selectedFrameId: rest[0]?.id ?? null };
    this.emit();
  }
  clearStack() {
    this.state = { ...this.state, stack: [], selectedFrameId: null };
    this.emit();
  }
}

export const globalDebugger = new DebuggerStore();

export function createDebuggerStore(): DebuggerStore {
  return new DebuggerStore();
}

export { DebuggerStore };

// React context
const DebuggerContext = createContext<DebuggerStore>(globalDebugger);

export function DebuggerProvider({ children, store }: { children: React.ReactNode; store?: DebuggerStore }) {
  const s = store ?? globalDebugger;
  return <DebuggerContext.Provider value={s}>{children}</DebuggerContext.Provider>;
}

export function useDebugger(): DebuggerStore {
  return useContext(DebuggerContext);
}

export function useDebuggerState(): DebuggerState {
  const store = useDebugger();
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const getSnapshot = useCallback(() => store.getState(), [store]);
  // for server rendering fallback
  const getServerSnapshot = useCallback(() => store.getState(), [store]);
  // useSyncExternalStore is not available in this React version? We polyfill with useState+effect
  const [state, setState] = useState<DebuggerState>(() => store.getState());
  useEffect(() => store.subscribe(() => setState(store.getState())), [store]);
  // ensure we return latest; alternative: useSyncExternalStore if available
  void subscribe; void getSnapshot; void getServerSnapshot;
  return state;
}

// helper for instrumentation
export async function debugHit(path: string, line: number, scope: Record<string, unknown>, label: string, store: DebuggerStore = globalDebugger) {
  if (!store.getState().paused) {
    await store.maybePauseAt(path, line, scope, label);
  } else {
    // already paused: still need to allow step logic? For now wait
    if (store.stepRequest) {
      // handle step semantics simplistically: always pause on next hit when stepping
      store.pause('step', { path, line }, [{ id: Date.now(), name: label, source: path, line, scope }, ...store.getState().stack.slice(0, 31)]);
      await store.waitForResume();
    }
  }
}
