import { useEffect } from 'react';
import type { LogEntry, LogSource } from '../engine/flash/player';

/** Capture failures that happen outside a guarded frame/event callback. */
export function useExecutionDiagnostics(onProblem: (entry: LogEntry) => void) {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const error = event.error instanceof Error ? event.error : null;
      const detail = error?.stack;
      const source = classifySource(`${event.filename ?? ''}\n${detail ?? ''}`);
      onProblem({
        level: 'error',
        kind: 'problem',
        source,
        context: event.filename ? `${event.filename}${event.lineno ? `:${event.lineno}:${event.colno}` : ''}` : 'uncaught browser error',
        message: error?.message || event.message || 'Uncaught application error',
        detail,
        time: now(),
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      const source = classifySource(error.stack ?? '');
      onProblem({
        level: 'error',
        kind: 'problem',
        source,
        context: 'unhandled promise rejection',
        message: error.message,
        detail: error.stack,
        time: now(),
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [onProblem]);
}

function classifySource(context: string): LogSource {
  return /swf-code:\/\/\/|as2\/|DoAction\.as|onClipEvent/i.test(context) ? 'app' : 'engine';
}

function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
