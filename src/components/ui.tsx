import { type ReactNode, useState } from 'react';
import { cn } from '../utils/cn';
import type { CharacterKind, EventKind } from '../types';

export const KIND_COLOR: Record<CharacterKind, string> = {
  shape: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  morphshape: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
  sprite: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  button: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  bitmap: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  font: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  text: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  edittext: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
  sound: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30',
  video: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
  binary: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
  other: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30',
};

export const EVENT_COLOR: Record<EventKind, { dot: string; text: string; label: string }> = {
  action: { dot: 'bg-rose-500', text: 'text-rose-300', label: 'ActionScript' },
  sound: { dot: 'bg-cyan-400', text: 'text-cyan-300', label: 'Sound' },
  label: { dot: 'bg-amber-400', text: 'text-amber-300', label: 'Frame label' },
  other: { dot: 'bg-violet-400', text: 'text-violet-300', label: 'Other tag' },
  define: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Definition' },
  place: { dot: 'bg-emerald-500', text: 'text-emerald-300', label: 'Place' },
  remove: { dot: 'bg-zinc-600', text: 'text-zinc-400', label: 'Remove' },
};

export function Chip({ children, className, onClick, title }: {
  children: ReactNode; className?: string; onClick?: () => void; title?: string;
}) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        onClick && 'cursor-pointer hover:brightness-125',
        className ?? 'border-zinc-700 bg-zinc-800 text-zinc-300',
      )}
    >
      {children}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-zinc-600">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500';

export function Button({ children, onClick, variant = 'default', className, disabled, title }: {
  children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger';
  className?: string; disabled?: boolean; title?: string;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40',
        variant === 'primary' && 'bg-violet-600 text-white hover:bg-violet-500',
        variant === 'default' && 'border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
        variant === 'ghost' && 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
        variant === 'danger' && 'border border-rose-900 bg-rose-950/60 text-rose-300 hover:bg-rose-900/60',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Section({ title, children, right, defaultOpen = true }: {
  title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-200">
          <span className={cn('transition', open ? 'rotate-90' : '')}>▸</span>
          {title}
        </button>
        {right}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export function TagInput({ tags, onChange, suggestions = [] }: {
  tags: string[]; onChange: (t: string[]) => void; suggestions?: string[];
}) {
  const [v, setV] = useState('');
  const add = (t: string) => {
    const clean = t.trim().toLowerCase().replace(/\s+/g, '-');
    if (clean && !tags.includes(clean)) onChange([...tags, clean]);
    setV('');
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <Chip key={t} className="border-violet-500/40 bg-violet-500/10 text-violet-200" onClick={() => onChange(tags.filter((x) => x !== t))}>
            {t} <span className="text-violet-400">×</span>
          </Chip>
        ))}
      </div>
      <input
        className={inputCls}
        value={v}
        placeholder="add tag + Enter"
        list="tag-suggestions"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(v); }
          if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1));
        }}
      />
      <datalist id="tag-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
