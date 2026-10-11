import { useState } from 'react';
import { cn } from '../utils/cn';

export function ServerListInspect({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const [status, setStatus] = useState<'idle' | 'dumping' | 'done' | 'fail'>('idle');
  const [result, setResult] = useState('');

  const inspect = async () => {
    setStatus('dumping');
    try {
      const globalPlayer = (globalThis as any).__as2player;
      const root = globalPlayer?.root?.obj;
      const list = root?.gsecs?.mc_ServerChooser?.serverListing_lt;
      const dump = {
        time: new Date().toISOString(),
        listExists: !!list,
        listType: list ? typeof list : null,
        listLength: list ? (list.getLength ? list.getLength() : list.length) : null,
        listVisible: list ? (list._visible ?? list.visible ?? 'unknown') : null,
        listAlpha: list ? (list._alpha ?? list.alpha ?? 'unknown') : null,
        listDataProvider: list ? (list.dataProvider ?? 'not set') : null,
        rootGsecsExists: !!root?.gsecs,
        rootGsecsCurrentFrame: root?.gsecs?._currentframe ?? null,
      };
      const res = await fetch('/api/debug-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverState: dump, timestamp: Date.now() }),
      });
      const json = await res.json();
      setResult(`Saved to ${json.saved || 'debug/state.json'}`);
      setStatus('done');
    } catch (e: any) {
      setResult('Error: ' + (e.message || String(e)));
      setStatus('fail');
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={inspect}
        disabled={status === 'dumping'}
        className={cn('rounded-md px-2.5 py-1 text-[10px] font-medium transition',
          status === 'done' ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20' :
          status === 'fail' ? 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/20' :
          'bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/20 hover:bg-violet-500/25')}
        title="Dump mc_ServerChooser serverListing_lt state to debug/"
      >
        {status === 'dumping' ? 'Dumping...' : status === 'done' ? 'Dumped ✓' : status === 'fail' ? 'Failed' : 'Inspect List'}
      </button>
      {result && <span className="text-[10px] text-zinc-400 truncate max-w-[160px]" title={result}>{result}</span>}
    </div>
  );
}
