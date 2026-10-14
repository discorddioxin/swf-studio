// AS3 Dictionary and Object.prototype.toString as lifted code uses them.
import { describe, expect, it } from 'vitest';
import { Dictionary } from '../utils';
import { EventDispatcher } from '../events';

describe('Dictionary', () => {
  it('`delete d[k]` is true for a missing key, also in strict code', () => {
    'use strict';
    const d = new Dictionary() as unknown as Record<string, unknown>;
    d.a = 1;
    expect(delete d.a).toBe(true);
    expect('a' in d).toBe(false);
    expect(delete d.never).toBe(true); // threw "trap returned falsish" before
  });
});

it('event dispatchers print their own class, as in Flash', () => {
  class URLLoader extends EventDispatcher {}
  expect(String(new EventDispatcher())).toBe('[object EventDispatcher]');
  expect(String(new URLLoader())).toBe('[object URLLoader]');
});
