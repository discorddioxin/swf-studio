// Shared helpers shared by all inspector panels. No external deps except React.
import type { ReactNode } from 'react';

export function Head({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="p-6 text-center text-xs text-zinc-600">{children}</p>;
}

export const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
