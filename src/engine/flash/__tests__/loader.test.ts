import { describe, expect, it } from 'vitest';
import { compileSources, expectedClasses, linkProgram, mergeSources } from '../loader';

const file = (path: string, text: string) => ({ path, text });

describe('expectedClasses', () => {
  it('lists the SymbolClass entries and the classes named on characters', () => {
    const doc = {
      symbolClasses: new Map([[0, 'com.game.Main'], [10, 'com.game.Hero']]),
      characters: new Map([[11, { className: 'com.game.Enemy' }], [12, {}]]),
    };
    expect(expectedClasses(doc)).toEqual(['com.game.Main', 'com.game.Hero', 'com.game.Enemy']);
  });

  it('copes with a movie that carries no linkage at all', () => {
    expect(expectedClasses({ characters: new Map() })).toEqual([]);
  });
});

describe('mergeSources', () => {
  it('appends the dependency files and names the SWFs that contributed', () => {
    const main = [file('com/game/Main.ts', 'export class Main {}')];
    const merged = mergeSources(main, [
      { name: 'library.xml', files: [file('com/game/Enemy.ts', 'export class Enemy {}'), file('util/Config.ts', 'export class Config {}')] },
      { name: 'empty.xml', files: [file('unused/Thing.ts', 'export class Thing {}')] },
    ]);
    expect(merged.sources.map((s) => s.path)).toEqual([
      'com/game/Main.ts', 'com/game/Enemy.ts', 'util/Config.ts', 'unused/Thing.ts',
    ]);
    expect(merged.used).toEqual(['library.xml', 'empty.xml']);
  });

  it('never lets a dependency shadow the main movie, whichever spelling the path uses', () => {
    const main = [file('transpiled/com/game/Main.ts', 'export class Main { tag = "main"; }')];
    const merged = mergeSources(main, [{ name: 'library.xml', files: [file('./transpiled\\com\\game\\Main.ts', 'export class Main { tag = "dep"; }')] }]);
    expect(merged.sources).toHaveLength(1);
    expect(merged.used).toEqual([]);
  });

  it('resolves a relative import that points into a dependency package', () => {
    const main = [file('main/com/game/Main.ts', 'import { Config } from "../../util/Config"; export class Main { c = Config; }')];
    const dependency = [file('external/library/transpiled/util/Config.ts', 'export class Config { static ok = true; }')];
    const merged = mergeSources(main, [{ name: 'library.xml', files: dependency }]).sources;
    const program = linkProgram(compileSources(merged));
    expect(program.errors).toEqual([]);
    expect(typeof program.getDefinition('com.game.Main')).toBe('function');
  });
});
