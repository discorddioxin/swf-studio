// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionConsole } from '../ExecutionConsole';
import { useExecutionDiagnostics } from '../useExecutionDiagnostics';
import type { LogEntry } from '../../engine/flash/player';

afterEach(cleanup);

const entries: LogEntry[] = [
  { level: 'trace', source: 'app', message: 'trace from game', time: 12 },
  { level: 'error', kind: 'problem', source: 'app', context: 'frame 4', message: 'game script failed', detail: 'TypeError: game script failed', time: 18 },
  { level: 'error', kind: 'problem', source: 'engine', context: 'render loop', message: 'renderer failed', time: 22 },
  { level: 'warn', kind: 'problem', source: 'forge', context: 'scripts/Main.ts', message: 'compile warning', time: 25 },
  { level: 'info', kind: 'request', source: 'network', transport: 'http', direction: 'outgoing', requestId: 'http-1', method: 'POST', url: 'https://example.invalid/gateway', status: 'sent', payload: 'm=50', message: 'POST request', time: 30 },
  { level: 'info', kind: 'response', source: 'network', transport: 'http', direction: 'incoming', requestId: 'http-1', method: 'POST', url: 'https://example.invalid/gateway', status: 'mocked', payload: 'server-list', message: 'POST response', time: 31 },
];

function DiagnosticsHarness() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const append = useCallback((entry: LogEntry) => setItems((previous) => [...previous, entry]), []);
  useExecutionDiagnostics(append);
  return <ExecutionConsole entries={items} onClear={() => setItems([])} />;
}

describe('ExecutionConsole', () => {
  it('switches between Logs, Req/Res, and source-labeled Problems without an Actions report view', () => {
    render(<ExecutionConsole entries={entries} onClear={() => {}} />);

    expect(screen.getByRole('tab', { name: /^Logs/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('trace from game')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Actions/ })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /^Req\/Res/ }));
    expect(screen.getAllByText('POST').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/REQUEST/)).toBeTruthy();
    expect(screen.getByText(/RESPONSE/)).toBeTruthy();
    expect(screen.queryByText('game script failed')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /^Problems/ }));
    expect(screen.getByText('App')).toBeTruthy();
    expect(screen.getByText('Engine')).toBeTruthy();
    expect(screen.getByText('Forge')).toBeTruthy();
    expect(screen.getByText('renderer failed')).toBeTruthy();
    expect(screen.queryByText('https://example.invalid/gateway')).toBeNull();
  });

  it('filters Logs to errors without changing the problem count', () => {
    render(<ExecutionConsole entries={entries} onClear={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'errors only' }));
    expect(screen.queryByText('trace from game')).toBeNull();
    expect(screen.getByText('game script failed')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^Problems 3$/ })).toBeTruthy();
  });

  it('captures uncaught browser errors and labels generated game code as App', () => {
    render(<DiagnosticsHarness />);
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'uncaught script failure',
        filename: 'swf-code:///game/Main.ts',
        error: new TypeError('uncaught script failure'),
      }));
    });
    fireEvent.click(screen.getByRole('tab', { name: /^Problems/ }));
    expect(screen.getByText('App')).toBeTruthy();
    expect(screen.getByText('uncaught script failure')).toBeTruthy();
    expect(screen.getByText('swf-code:///game/Main.ts')).toBeTruthy();
  });

  it('clears runtime entries through the supplied callback', () => {
    let cleared = false;
    render(<ExecutionConsole entries={entries} onClear={() => { cleared = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(cleared).toBe(true);
  });
});
