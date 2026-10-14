import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Shown in the fallback, e.g. "Code Editor". */
  label: string;
  children: ReactNode;
  /** When any value changes (new document, other tab…), the boundary resets. */
  resetKeys?: readonly unknown[];
  className?: string;
}

interface State {
  error: Error | null;
  /** React's component stack: which component, inside which, failed */
  componentStack: string | null;
  copied: boolean;
  keys: readonly unknown[] | undefined;
}

/** Everything known about the failure, as plain text (shown, and copied). */
export function errorReport(label: string, error: Error, componentStack: string | null): string {
  return [
    `${label} failed to render`,
    `${error.name}: ${error.message}`,
    '',
    'Stack:',
    (error.stack ?? '(no stack)').trim(),
    ...(componentStack ? ['', 'Component stack:', componentStack.trim()] : []),
  ].join('\n');
}

const changed = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

/**
 * Contains render errors to one workspace/panel. Without it a single failing
 * component (for example a parser edge case in the Code Editor) unmounts
 * the whole application and leaves a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null, copied: false, keys: this.props.resetKeys };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)), copied: false };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (changed(props.resetKeys, state.keys)) return { error: null, componentStack: null, copied: false, keys: props.resetKeys };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] render error`, error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => this.setState({ copied: true }), () => {});
  };

  render() {
    const { error, componentStack, copied } = this.state;
    if (!error) return this.props.children;
    const report = errorReport(this.props.label, error, componentStack);
    return (
      <div role="alert" className={this.props.className ?? 'flex h-full min-h-40 items-start justify-center overflow-auto p-4'}>
        <div className="w-full max-w-2xl space-y-2 rounded-lg border border-rose-900/60 bg-rose-950/20 p-4 text-xs text-zinc-300">
          <div className="text-sm font-semibold text-rose-200">{this.props.label} failed to render</div>
          <p className="text-zinc-400">The rest of the app is unaffected; the other tabs still work.</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-zinc-950/60 p-2 font-mono text-[10px] text-rose-200/80">{error.name}: {error.message}</pre>
          <details open>
            <summary className="cursor-pointer select-none text-[11px] text-zinc-400 hover:text-zinc-200">Details</summary>
            <pre aria-label="Error details" className="mt-1 max-h-72 overflow-auto whitespace-pre rounded bg-zinc-950/60 p-2 font-mono text-[10px] text-zinc-300">{report}</pre>
          </details>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null, componentStack: null, copied: false })}
              className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-zinc-500"
            >
              Try again
            </button>
            <button
              onClick={() => this.copy(report)}
              className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-zinc-500"
            >
              {copied ? 'Copied' : 'Copy details'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
