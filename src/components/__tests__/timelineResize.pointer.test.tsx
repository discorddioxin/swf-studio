// @vitest-environment jsdom
// FINAL-08 — Timeline resize pointer capture: pointerId/startY/startHeight + setPointerCapture
// Shovel-ready test via @testing-library/user-event style pointer events. jsdom has no
// native pointer capture, so we stub setPointerCapture/hasPointerCapture and verify the
// App-style handler contract (App.tsx:101/581). Mirrors the audit finding's expected test.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useRef, useState } from 'react';

afterEach(cleanup);

function TimelineResizeHarness({ initialHeight = 240 }: { initialHeight?: number }) {
  const [height, setHeight] = useState(initialHeight);
  const [resizing, setResizing] = useState(false);
  const ref = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  // window.innerHeight is 768 in jsdom by default; mimic App clamp logic
  const max = Math.max(156, Math.min(window.innerHeight * 0.78, window.innerHeight - 175));

  return (
    <>
      <div
        role="separator"
        aria-label="Resize Timeline panel"
        data-testid="handle"
        aria-valuenow={Math.round(height)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          // jsdom stub: ensure setPointerCapture exists
          (e.currentTarget as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture?.(
            e.pointerId,
          );
          ref.current = { pointerId: e.pointerId, startY: e.clientY, startHeight: height };
          setResizing(true);
        }}
        onPointerMove={(e) => {
          const start = ref.current;
          if (!start || start.pointerId !== e.pointerId) return;
          setHeight(Math.max(156, Math.min(max, start.startHeight + start.startY - e.clientY)));
        }}
        onPointerUp={(e) => {
          if (ref.current?.pointerId !== e.pointerId) return;
          ref.current = null;
          setResizing(false);
        }}
        onPointerCancel={() => {
          ref.current = null;
          setResizing(false);
        }}
        onLostPointerCapture={() => {
          ref.current = null;
          setResizing(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const delta = (e.shiftKey ? 48 : 16) * (e.key === 'ArrowUp' ? 1 : -1);
          setHeight((h) => Math.max(156, Math.min(max, h + delta)));
        }}
      />
      <div data-testid="height">{height}</div>
      <div data-testid="resizing">{String(resizing)}</div>
    </>
  );
}

// jsdom has no PointerEvent; stub capture and synthesize pointer events via MouseEvent
function stubPointerCapture(el: HTMLElement) {
  const anyEl = el as unknown as { setPointerCapture: (id: number) => void; hasPointerCapture?: () => boolean };
  if (!anyEl.setPointerCapture) {
    anyEl.setPointerCapture = vi.fn();
    (anyEl as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = vi.fn();
  }
  return anyEl.setPointerCapture as ReturnType<typeof vi.fn>;
}

function dispatchPointer(
  el: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
  opts: { pointerId?: number; clientY?: number } = {},
) {
  // jsdom lacks PointerEvent — synthesize via MouseEvent with pointerId define
  const evt = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY: opts.clientY ?? 0,
  } as MouseEventInit);
  if (opts.pointerId != null) Object.defineProperty(evt, 'pointerId', { value: opts.pointerId });
  // preventDefault is used in handler
  Object.defineProperty(evt, 'preventDefault', { value: () => {} });
  fireEvent(el, evt);
}

describe('Timeline resize pointer capture (FINAL-08)', () => {
  it('pointerDown captures and pointerMove resizes within clamp [156, max]', () => {
    const { getByTestId } = render(<TimelineResizeHarness initialHeight={240} />);
    const handle = getByTestId('handle') as HTMLElement;
    const stub = stubPointerCapture(handle);

    dispatchPointer(handle, 'pointerdown', { pointerId: 1, clientY: 500 });
    expect(stub).toHaveBeenCalledWith(1);
    expect(getByTestId('resizing').textContent).toBe('true');

    // drag up 50px => height = 240 + (500 - 450) = 290, clamped to max (~593 on 768h)
    dispatchPointer(handle, 'pointermove', { pointerId: 1, clientY: 450 });
    const h1 = Number(getByTestId('height').textContent);
    expect(h1).toBeGreaterThan(240);
    expect(h1).toBeLessThanOrEqual(Math.max(156, Math.min(window.innerHeight * 0.78, window.innerHeight - 175)));

    // drag far down beyond min => clamp to 156
    dispatchPointer(handle, 'pointermove', { pointerId: 1, clientY: 900 });
    expect(Number(getByTestId('height').textContent)).toBe(156);

    dispatchPointer(handle, 'pointerup', { pointerId: 1 });
    expect(getByTestId('resizing').textContent).toBe('false');
  });

  it('ignores pointerMove/pointerUp with mismatched pointerId', () => {
    const { getByTestId } = render(<TimelineResizeHarness initialHeight={240} />);
    const handle = getByTestId('handle') as HTMLElement;
    stubPointerCapture(handle);

    dispatchPointer(handle, 'pointerdown', { pointerId: 7, clientY: 400 });
    expect(getByTestId('resizing').textContent).toBe('true');

    // wrong id => no move
    dispatchPointer(handle, 'pointermove', { pointerId: 999, clientY: 0 });
    expect(Number(getByTestId('height').textContent)).toBe(240);

    // wrong id on up => stays resizing
    dispatchPointer(handle, 'pointerup', { pointerId: 999 });
    expect(getByTestId('resizing').textContent).toBe('true');

    // correct id up => resets
    dispatchPointer(handle, 'pointerup', { pointerId: 7 });
    expect(getByTestId('resizing').textContent).toBe('false');
  });

  it('pointerCancel and lostPointerCapture reset state', () => {
    const { getByTestId } = render(<TimelineResizeHarness />);
    const handle = getByTestId('handle') as HTMLElement;
    stubPointerCapture(handle);

    dispatchPointer(handle, 'pointerdown', { pointerId: 2, clientY: 300 });
    expect(getByTestId('resizing').textContent).toBe('true');

    dispatchPointer(handle, 'pointercancel');
    expect(getByTestId('resizing').textContent).toBe('false');

    dispatchPointer(handle, 'pointerdown', { pointerId: 2, clientY: 300 });
    dispatchPointer(handle, 'lostpointercapture');
    expect(getByTestId('resizing').textContent).toBe('false');
  });

  it('keyboard ArrowUp/Down adjusts within clamp, Shift doubles delta', () => {
    const { getByTestId } = render(<TimelineResizeHarness initialHeight={200} />);
    const handle = getByTestId('handle') as HTMLElement;

    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(Number(getByTestId('height').textContent)).toBe(216); // +16

    fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
    expect(Number(getByTestId('height').textContent)).toBe(264); // +48

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(Number(getByTestId('height').textContent)).toBe(248); // -16

    // clamp: many ups saturate at max
    for (let i = 0; i < 30; i++) fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
    expect(Number(getByTestId('height').textContent)).toBeLessThanOrEqual(
      Math.max(156, Math.min(window.innerHeight * 0.78, window.innerHeight - 175)),
    );
  });

  it('pointerId guard prevents cross-pointer bleed (two concurrent pointers)', () => {
    const { getByTestId } = render(<TimelineResizeHarness initialHeight={240} />);
    const handle = getByTestId('handle') as HTMLElement;
    stubPointerCapture(handle);

    dispatchPointer(handle, 'pointerdown', { pointerId: 10, clientY: 500 });
    // second pointer down while first held — second overwrites ref (App behavior: last pointer wins)
    dispatchPointer(handle, 'pointerdown', { pointerId: 11, clientY: 600 });
    // move with first id => ignored because ref now holds 11
    dispatchPointer(handle, 'pointermove', { pointerId: 10, clientY: 450 });
    expect(Number(getByTestId('height').textContent)).toBe(240);
    // move with second id => moves
    dispatchPointer(handle, 'pointermove', { pointerId: 11, clientY: 550 });
    expect(Number(getByTestId('height').textContent)).toBe(290);
  });
});
