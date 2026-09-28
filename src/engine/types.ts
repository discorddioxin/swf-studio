// ---------------------------------------------------------------------------
// Shared types for the SWF runtime engine.
//
// This module has NO dependencies on any other module. Keeping the runtime's
// shared contracts in a dependency-free leaf module is what breaks the
// orchestrator <-> runtimeProxy circular dependency that kept breaking edits:
// the runtime imports these types, and the Flash scope proxy imports these
// types too — neither imports the other.
// ---------------------------------------------------------------------------

export type LogLevel =
  | 'trace'
  | 'output'
  | 'display'
  | 'audio'
  | 'control'
  | 'label'
  | 'script'
  | 'error';

export interface RuntimeEvent {
  frame: number;
  kind: LogLevel;
  tagType?: string;
  detail: string;
  source?: string;
}

export interface RuntimeDiagnostic {
  level: 'info' | 'warn' | 'error';
  message: string;
  frame?: number;
  source?: string;
}

export interface RuntimeClock {
  frame: number;
  playing: boolean;
  stoppedByScript: boolean;
}

/** The bridge the transpiled ActionScript talks to. It never exposes the raw
 *  browser global object — the transpiled code only ever sees a FlashScope
 *  that forwards to this bridge, so a typo or runaway self-reference fails
 *  loudly here instead of silently mutating window. */
export interface RuntimeBridge {
  clock: RuntimeClock;
  frame: number;
  sourceName?: string;
  emit: (event: RuntimeEvent) => void;
  diagnostics: RuntimeDiagnostic[];
}
