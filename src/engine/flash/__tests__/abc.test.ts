// The movie's own ActionScript 3 code reaching the flash loader.
//
// `doc.abc` holds the raw DoABC payloads the SWF reader found; `abcSources()`
// lifts them to TypeScript modules the loader compiles and links. That is the
// whole point of the AVM2 path: an AS3 movie runs without a folder of exported
// sources. The fixture is the timeline code of `games-swfs/tiles-swfs/
// standardDeck.swf` (one class `deck`), wrapped in the tag header a real DoABC
// carries: a flags word, the tag's name, then the ABC file.
import { describe, expect, it } from 'vitest';
import { compileSources, linkProgram } from '../loader';
import { abcSources } from '../abc';
import { deckAbcPayload } from './abcFixture';

describe('abcSources', () => {
  it('lifts a DoABC payload into modules the loader can link and run', () => {
    const result = abcSources([deckAbcPayload()]);
    expect(result.payloads).toBe(1);
    expect(result.classes).toEqual(['deck']);
    expect(result.sources.map((f) => f.path)).toContain('deck.ts');
    expect(result.refusals).toEqual([]);
    expect(result.unsupported).toEqual([]);

    const program = linkProgram(compileSources(result.sources));
    expect(program.errors).toEqual([]);
    const Deck = program.getDefinition('deck') as (new () => { frame1(): void; stop(): void }) | undefined;
    expect(typeof Deck).toBe('function');
    const deck = new Deck!();
    expect(() => deck.frame1()).not.toThrow();          // `stop()` inside the frame body
  });

  it('reads a payload whose tag name is not empty', () => {
    const result = abcSources([deckAbcPayload('deck')]);
    expect(result.classes).toEqual(['deck']);
    expect(linkProgram(compileSources(result.sources)).errors).toEqual([]);
  });

  it('reports a payload that is not an ABC file instead of taking the rest down', () => {
    const result = abcSources([new Uint8Array(8), deckAbcPayload()]);
    expect(result.payloads).toBe(1);
    expect(result.sources.map((f) => f.path)).toContain('deck.ts');
    expect(result.unreadable).toEqual([{ index: 0, bytes: 8, message: expect.stringMatching(/no ABC file in a 8-byte DoABC payload/) }]);
  });

  it('reports nothing for a movie with no AVM2 code', () => {
    const result = abcSources([]);
    expect(result).toMatchObject({ payloads: 0, classes: [], sources: [], refusals: [], unreadable: [] });
  });
});
