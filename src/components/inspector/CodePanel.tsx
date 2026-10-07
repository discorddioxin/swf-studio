import type { AssetBundle } from '../../types';
import { Button } from '../ui';

export function CodePanel({ assets, onOpenCode }: { assets: AssetBundle | null; onOpenCode: () => void }) {
  const actionScriptCount = assets?.files.filter((file) => /\.as$/i.test(file.path)).length ?? 0;
  const projectName = (assets?.rootName || 'Loaded project').replace(/\.(?:xml|swf)$/i, '');

  return (
    <div className="flex h-full flex-col gap-4 p-3 text-xs">
      <div>
        <div className="text-sm font-semibold text-zinc-100">Project code</div>
        <p className="mt-1 leading-relaxed text-zinc-500">
          Browse the original ActionScript export and the generated TypeScript project used by Execute in the full Code Editor.
        </p>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{projectName}</div>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400">ActionScript source files</span>
          <span className="font-mono text-amber-200">{actionScriptCount}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-zinc-400">Project views</span>
          <span className="font-mono text-zinc-300">TypeScript · ActionScript</span>
        </div>
      </div>
      <Button variant="primary" className="w-full" onClick={onOpenCode}>Open Code Editor <span aria-hidden="true">↗</span></Button>
      <div className="mt-auto rounded-md border border-sky-900/50 bg-sky-950/20 p-2.5 text-[10px] leading-relaxed text-sky-200/70">
        The TypeScript Application view is generated with the same AS2 build used by Execute. Switch to Engine to inspect the player, runtime and transpiler sources.
      </div>
    </div>
  );
}
