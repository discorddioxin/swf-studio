import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoutOptions {
  title?: string;
  width?: number;
  height?: number;
}

export function usePopout({ title = 'Popout', width = 900, height = 700 }: PopoutOptions = {}) {
  const winRef = useRef<Window | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPopped, setIsPopped] = useState(false);
  const [, force] = useState(0);

  const open = useCallback(() => {
    if (winRef.current && !winRef.current.closed) {
      winRef.current.focus();
      return;
    }
    const features = `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes`;
    const win = window.open('', '_blank', features);
    if (!win) {
      alert('Pop-out was blocked. Please allow popups for this site.');
      return;
    }
    win.document.title = title;
    // copy styles
    const head = win.document.head;
    // copy all <link rel="stylesheet"> and <style>
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
      head.appendChild(node.cloneNode(true));
    });
    // ensure Tailwind / base styles are present: also inject a minimal reset
    const container = win.document.createElement('div');
    container.id = 'popout-root';
    container.style.cssText = 'height:100vh;display:flex;flex-direction:column;background:#0b0d12;color:#e4e4e7;';
    win.document.body.style.margin = '0';
    win.document.body.style.background = '#0b0d12';
    win.document.body.appendChild(container);
    containerRef.current = container;
    winRef.current = win;
    setIsPopped(true);
    force(x => x + 1);
    const checkClosed = setInterval(() => {
      if (win.closed) {
        clearInterval(checkClosed);
        setIsPopped(false);
        containerRef.current = null;
        winRef.current = null;
      }
    }, 500);
    win.addEventListener('beforeunload', () => {
      setIsPopped(false);
      containerRef.current = null;
      winRef.current = null;
    });
  }, [title, width, height]);

  const close = useCallback(() => {
    if (winRef.current && !winRef.current.closed) winRef.current.close();
    setIsPopped(false);
    containerRef.current = null;
    winRef.current = null;
  }, []);

  useEffect(() => () => {
    if (winRef.current && !winRef.current.closed) winRef.current.close();
  }, []);

  const portal = useCallback((children: React.ReactNode) => {
    if (!isPopped || !containerRef.current || !winRef.current) return null;
    return createPortal(children, containerRef.current);
  }, [isPopped]);

  return { isPopped, open, close, portal, window: winRef.current, container: containerRef.current };
}

export function PopoutButton({ popped, onPop, onRestore, label }: { popped: boolean; onPop: () => void; onRestore: () => void; label: string }) {
  return popped ? (
    <button
      type="button"
      onClick={onRestore}
      title={`Restore ${label}`}
      aria-label={`Restore ${label}`}
      className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-200 hover:bg-amber-500/20"
    >
      ↙ Restore {label}
    </button>
  ) : (
    <button
      type="button"
      onClick={onPop}
      title={`Pop out ${label} to a separate window`}
      aria-label={`Pop out ${label}`}
      className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-700"
    >
      ↗ Pop out {label}
    </button>
  );
}
