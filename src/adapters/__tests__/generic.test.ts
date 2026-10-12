// Running a game nobody wrote an adapter for: the fallback must be inert.
//
// This locks the contract that makes the pipeline game-agnostic — an unknown
// (or explicitly unadapted) SWF set gets no mocked gateway, no socket stand-in,
// no boot preset, no URL policy and no help panel, so it runs exactly as
// authored.
import { describe, expect, it } from 'vitest';
import { DEFAULT_ADAPTER_ID, GAME_ADAPTERS, adapterById, adapterScores, resolveAdapter } from '..';
import { genericAdapter } from '../generic';
import type { GameContext } from '../types';

const foreign = (declaredId?: string): GameContext => ({
  main: { name: 'somegame', doc: { header: { fileName: 'somegame.swf' } } as never, paths: [] },
  externals: [],
  bundled: true,
  declaredId,
});

describe('adapter resolution for an unknown game', () => {
  it('the generic adapter is the fallback and the default', () => {
    expect(genericAdapter.detect(foreign())).toBe(0);
    expect(resolveAdapter(foreign(), undefined)).toBe(genericAdapter);
    expect(resolveAdapter(foreign('no-such-adapter'), undefined)).toBe(genericAdapter);
    expect(adapterById('no-such-adapter')).toBeUndefined();
    expect(adapterById('auto')).toBeUndefined();
    expect(DEFAULT_ADAPTER_ID).toBe(genericAdapter.id);
    expect(GAME_ADAPTERS[GAME_ADAPTERS.length - 1]).toBe(genericAdapter);
  });

  it('another game’s set does not activate a game adapter', () => {
    // detection is content-based: a foreign set must score 0 everywhere, so
    // nothing game-specific is installed for it
    for (const { adapter, score } of adapterScores(foreign())) {
      expect(score, adapter.id).toBe(0);
    }
    expect(resolveAdapter(foreign())).toBe(genericAdapter);
  });

  it('an explicit pick wins over detection', () => {
    const picked = GAME_ADAPTERS.find((a) => a.id !== genericAdapter.id)!;
    expect(resolveAdapter(foreign(), picked.id)).toBe(picked);
    expect(resolveAdapter(foreign(), genericAdapter.id)).toBe(genericAdapter);
  });

  it('the generic adapter installs nothing', () => {
    expect(genericAdapter.bootPresets).toBeUndefined();
    expect(genericAdapter.createNetwork).toBeUndefined();
    expect(genericAdapter.onStart).toBeUndefined();
    expect(genericAdapter.helpPanel).toBeUndefined();
    expect(genericAdapter.isHelpUrl).toBeUndefined();
    expect(genericAdapter.isOptionalExternal).toBeUndefined();
  });
});
