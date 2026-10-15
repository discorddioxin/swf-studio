import { afterEach, describe, expect, it } from 'vitest';
import { evaluateInScope } from '../evaluate';

declare global { var __x: unknown }
afterEach(() => { delete globalThis.__x; });

describe('evaluateInScope', () => {
  it('evaluates a developer expression over the frame scope', () => {
    expect(evaluateInScope('a + b', { a: 2, b: 3 })).toBe(5);
  });

  it('never lets a movie-chosen scope name into the compiled text', () => {
    const scope = { 'a){globalThis.__x=1}//': 1, 'this': 2, ok: 4 };
    expect(evaluateInScope('ok', scope)).toBe(4);
    expect(globalThis.__x).toBeUndefined();
  });
});
