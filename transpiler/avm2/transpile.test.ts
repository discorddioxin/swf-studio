// ABC (AVM2 bytecode) → TypeScript, end to end on a real payload.
//
// The AVM1 side of this repo has always lifted code out of the SWF itself; for
// AVM2 the code lives in a `DoABC` blob, so `decompiler/swf/abc.ts` reads the
// container and `transpiler/avm2/*` lifts every method body back into source.
// This test keeps that promise honest on the smallest real movie we have: the
// timeline script of `games-swfs/tiles-swfs/standardDeck.swf` (one class `deck`,
// one body calling `addFrameScript(0, this.frame1)` and `stop()`), and it runs
// the emitted module through the *real* engine loader — the same `compileSources`
// / `linkProgram` pair the player uses — so a regression in either the emitter
// or the module contract it has to satisfy shows up here.
import { describe, expect, it } from 'vitest';
import { parseAbc } from '../../decompiler/swf/abc';
import { compileSources, linkProgram } from '../../src/engine/flash/loader';
import { transpileAbc } from './index';

/** The same payload `src/lib/swf/abc.test.ts` documents: DoABC tag body of
 *  standardDeck.swf, ABC at offset 5, AVM2 46.16, 351 bytes. */
const STANDARD_DECK_ABC =
  'EAAuAAAAAA8ABGRlY2sNZmxhc2guZGlzcGxheQlNb3ZpZUNsaXAGZnJhbWUxBHN0b3AOYWRkRnJhbWVTY3JpcHQGT2JqZWN0DGZsYXNoLmV2ZW50cw9FdmVudERpc3BhdGNoZXINRGlzcGxheU9iamVjdBFJbnRlcmFjdGl2ZU9iamVjdBZEaXNwbGF5T2JqZWN0Q29udGFpbmVyBlNwcml0ZQYWARYDGAIXARYJAAwHAQIHAgQHBAUHAQYHAQcHAQgHBQoHAgsHAgwHAg0HAg4EAAAAAAAAAAAAAAAAAAAAAAABAQIIAwACAQMBAAEAAAEDAQEEAQAEAAEBCQoD0DBHAAABAQEKCwjQMF0ETwQARwAAAgMBCgsP0DDQSQBdBSQAYANPBQJHAAADAgEBCSfQMGUAYAYwYAcwYAgwYAkwYAowYAswYAIwYAJYAB0dHR0dHR1oAUcAAA==';

const deck = () => parseAbc(new Uint8Array(Buffer.from(STANDARD_DECK_ABC, 'base64')));

describe('transpileAbc', () => {
  it('turns a real ABC class into a TypeScript module the loader accepts', () => {
    const result = transpileAbc({ abc: deck() });
    const file = result.files.find((f) => f.path === 'deck.ts');
    expect(file, `files: ${result.files.map((f) => f.path).join(', ')}`).toBeTruthy();
    const text = file!.text;

    // The superclass is a real import, the class is exported under its own name.
    expect(text).toContain("import { MovieClip } from 'flash/display/MovieClip';");
    expect(text).toContain('export class deck extends MovieClip {');

    // The constructor is the script's `addFrameScript(0, this.frame1)`, and the
    // frame body is a method the frame can call. The frame function is handed over as
    // a *method value*, which AVM2 binds to its receiver — the sprite the frames run
    // on — so the read is `__method(this, "frame1")`.
    expect(text).toContain('super();');
    expect(text).toContain('this.addFrameScript(0, __method(this, "frame1"));');
    expect(text).toContain('public frame1(): any {');
    expect(text).toContain('this.stop();');

    // Nothing about it is a stub: no refusal was reported for this movie.
    expect(result.diagnostics).toEqual([]);
  });

  it('links through the engine and constructs', () => {
    const result = transpileAbc({ abc: deck() });
    const program = linkProgram(compileSources(result.files));
    expect(program.errors).toEqual([]);

    const Deck = program.getDefinition('deck') as (new () => { frame1?: () => void; stop?: () => void }) | undefined;
    expect(typeof Deck).toBe('function');
    const instance = new Deck!();
    expect(typeof instance.frame1).toBe('function');
    // `stop()` on a MovieClip the engine provides: the frame body runs, which is
    // the whole point of lifting the ABC instead of only parsing it.
    expect(() => instance.frame1!()).not.toThrow();
  });
});
