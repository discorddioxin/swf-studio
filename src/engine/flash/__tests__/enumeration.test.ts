// @vitest-environment jsdom
// for-in over the engine's own objects (engine/flash/enumeration.ts). What the
// engine keeps on an instance — display-list state, timeline bookkeeping, a
// Vector's `fixed` — is never a dynamic property. Of the engine's classes only
// those Flash declares `dynamic` (MovieClip, Dictionary, URLVariables, the Error
// subclasses) and Vector enumerate anything. A Dictionary enumerates its object
// keys by identity. Reading which fields an engine class keeps makes one instance
// of it, which must not take an automatic `instanceN` name from the movie.
// (The transpiled side — sealed / dynamic program classes, the loop as ASC
// compiles it — is transcom/transpiler/avm2/forin.test.ts.)
import { describe, expect, it } from 'vitest';
import '../packages';
import { MovieClip, Sprite } from '../display';
import { __iterAdvance, __iterValue, enumerableKeys } from '../enumeration';
import { URLVariables } from '../misc';
import { ArgumentError, Dictionary, Vector } from '../utils';

/** The loop as the lifter emits it: the cursor starts at 0 and is the key. */
function forIn(o: unknown, each?: (key: unknown) => void): unknown[] {
  const keys: unknown[] = [];
  for (let cursor: unknown = 0; (cursor = __iterAdvance(o, cursor)) != null;) { keys.push(cursor); each?.(cursor); }
  return keys;
}

describe('for-in over engine objects', () => {
  // first: nothing has been enumerated yet, so this is when MovieClip's fields are read
  it('reading an engine class does not shift automatic instance names', () => {
    const before = Number(new MovieClip().name.replace('instance', ''));
    const clip = new MovieClip();
    (clip as unknown as Record<string, unknown>).score = 1;
    expect(forIn(clip)).toEqual(['score']);
    expect(new MovieClip().name).toBe(`instance${before + 2}`);
  });

  it('a MovieClip enumerates what a script added, not what the engine keeps', () => {
    const clip = new MovieClip() as MovieClip & Record<string, unknown>;
    expect(forIn(clip)).toEqual([]);
    clip.gotoAndStop(1);
    clip.x = 10;
    clip.cacheAsBitmap = true;
    clip.label = 'go';
    expect(forIn(clip)).toEqual(['label']);
  });

  it('a Sprite (sealed) enumerates nothing', () => {
    const sprite = new Sprite() as Sprite & Record<string, unknown>;
    sprite.label = 'x';
    expect(forIn(sprite)).toEqual([]);
  });

  it('a Vector enumerates its indices, not `fixed`', () => {
    const v = new Vector<number>();
    v.push(4, 5);
    expect(forIn(v)).toEqual(['0', '1']);
    expect(forIn(v).map((k) => __iterValue(v, k))).toEqual([4, 5]);
  });

  it('a Dictionary enumerates its keys, objects by identity, and reads values by them', () => {
    const d = new Dictionary() as Dictionary & Record<string, unknown> & { set?: never };
    const key = {};
    (d as unknown as Map<unknown, unknown>).set(key, 'object');
    d.name = 'string';
    const keys = forIn(d);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(key);
    expect(keys[1]).toBe('name');
    expect(keys.map((k) => __iterValue(d, k))).toEqual(['object', 'string']);
  });

  it('URLVariables and an Error subclass enumerate their dynamic properties only', () => {
    const vars = new URLVariables() as URLVariables & Record<string, unknown>;
    vars.user = 'a';
    expect(forIn(vars)).toEqual(['user']);
    const err = new ArgumentError('bad', 2001) as ArgumentError & Record<string, unknown>;
    err.detail = 'd';
    expect(forIn(err)).toEqual(['detail']);
  });

  it('a key deleted during the loop is skipped; nested loops over one object both run', () => {
    const o: Record<string, number> = { a: 1, b: 2, c: 3 };
    expect(forIn(o, (k) => { if (k === 'a') delete o.b; })).toEqual(['a', 'c']);
    const p = { x: 1, y: 2 };
    const pairs: string[] = [];
    forIn(p, (outer) => forIn(p, (inner) => pairs.push(`${outer}${inner}`)));
    expect(pairs).toEqual(['xx', 'xy', 'yx', 'yy']);
  });

  it('enumerableKeys: JavaScript objects keep every own key', () => {
    expect(enumerableKeys(Object.assign(new Error('m'), { code: 1 }))).toEqual(['code']);
    expect(enumerableKeys(new Date(0))).toEqual([]);
  });
});
