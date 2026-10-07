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
  keys: readonly unknown[] | undefined;
}

const changed = (a: readonly unknown[] = [], b: readonly unknown[] = []) =>
  a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

/**
 * Contains render errors to one workspace/panel. Without it a single failing
 * component (for example a parser edge case in the Code Editor) unmounts
 * the whole application and leaves a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, keys: this.props.resetKeys };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (changed(props.resetKeys, state.keys)) return { error: null, keys: props.resetKeys };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] render error`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className={this.props.className ?? 'flex h-full min-h-40 items-center justify-center p-4'}>
        <div className="max-w-md space-y-2 rounded-lg border border-rose-900/60 bg-rose-950/20 p-4 text-xs text-zinc-300">
          <div className="text-sm font-semibold text-rose-200">{this.props.label} failed to render</div>
          <p className="text-zinc-400">The rest of the app is unaffected. Details are in the browser console.</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-zinc-950/60 p-2 font-mono text-[10px] text-rose-200/80">{error.message}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-zinc-500"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
