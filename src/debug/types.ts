export type Breakpoint = {
  id: string;
  path: string;
  line: number; // 1-based
  enabled: boolean;
  condition?: string;
};

export type WatchExpression = {
  id: string;
  expression: string;
  value?: string;
  error?: string;
};

export type StackFrame = {
  id: number;
  name: string;
  source: string; // file path
  line: number;
  column?: number;
  // scope snapshot at pause time
  scope?: Record<string, unknown>;
  // whether this is the current frame (top)
  isCurrent?: boolean;
};

export type PauseReason = 'breakpoint' | 'exception' | 'step' | 'pause' | 'entry' | null;

export type DebuggerState = {
  paused: boolean;
  pauseReason: PauseReason;
  pausedAt: { path: string; line: number } | null;
  breakpoints: Breakpoint[];
  watches: WatchExpression[];
  stack: StackFrame[];
  selectedFrameId: number | null;
  breakOnExceptions: boolean;
  breakOnUncaught: boolean;
  stepDepth: number | null; // for step over/out tracking
  exception: { message: string; stack?: string } | null;
};

export type DebugAction =
  | { type: 'pause'; reason: PauseReason; at?: { path: string; line: number }; stack?: StackFrame[]; exception?: { message: string; stack?: string } }
  | { type: 'resume' }
  | { type: 'addBreakpoint'; breakpoint: Breakpoint }
  | { type: 'removeBreakpoint'; id: string }
  | { type: 'toggleBreakpoint'; id: string }
  | { type: 'updateBreakpoint'; id: string; patch: Partial<Breakpoint> }
  | { type: 'clearBreakpoints' }
  | { type: 'addWatch'; watch: WatchExpression }
  | { type: 'removeWatch'; id: string }
  | { type: 'updateWatch'; id: string; expression: string }
  | { type: 'setWatches'; watches: WatchExpression[] }
  | { type: 'setStack'; stack: StackFrame[] }
  | { type: 'selectFrame'; id: number | null }
  | { type: 'setBreakOnExceptions'; value: boolean }
  | { type: 'setBreakOnUncaught'; value: boolean }
  | { type: 'setException'; exception: { message: string; stack?: string } | null };
