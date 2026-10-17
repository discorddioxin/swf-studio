// @vitest-environment jsdom
// The AVM2 path without the game corpus (P-21): a small AS3 movie, assembled by
// fixtures/as3Fixture.ts, read and run the way the app reads and runs an
// uploaded SWF. avm2Games.corpus.test.ts runs the same path on real games.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetCache, ingestFiles } from '@/lib/assets';
import { swfFilesToFiles } from '@/lib/bundled';
import { parseSwfBinary } from '@/lib/swf/binary';
import { abcPayloads, abcFrom } from '@/testing/abcPayloads';
import { abcSources } from '../abc';
import { runtime } from '../context';
import { DisplayObjectContainer } from '../display';
import { compileSources, linkProgram } from '../loader';
import { TOP_LEVEL } from '../packages';
import { FlashPlayer, type LogEntry } from '../player';
import { AS3_FIXTURE, as3FixtureAbc, as3FixtureSwf } from './fixtures/as3Fixture';

const FIXTURE = join(__dirname, 'fixtures', 'as3Fixture.swf');
const bytes = () => new Uint8Array(readFileSync(FIXTURE));
const buffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const originalTrace = TOP_LEVEL.trace;
let player: FlashPlayer | null = null;
afterEach(() => { TOP_LEVEL.trace = originalTrace; player?.dispose(); player = null; runtime.player = null; });

describe('the AS3 fixture movie', () => {
  it('is the movie fixtures/as3Fixture.ts writes', () => {
    if (process.env.UPDATE_FIXTURES) writeFileSync(FIXTURE, as3FixtureSwf());
    expect(Buffer.from(bytes()).equals(Buffer.from(as3FixtureSwf())), 'run UPDATE_FIXTURES=1 npx vitest run avm2Fixture').toBe(true);
  });

  it('reads like a compiled movie: AS3, one DoABC, the document class and a linked sprite', async () => {
    const { doc } = await parseSwfBinary(buffer(bytes()), 'as3Fixture.swf');
    expect(doc.warnings).toEqual([]);
    expect(doc.header).toMatchObject({ version: '10', frameRate: 24, frameCount: 1, compression: 'UNCOMPRESSED', backgroundColor: AS3_FIXTURE.background });
    expect(doc.abc).toHaveLength(1);
    expect(doc.symbolClasses).toEqual(new Map([[0, AS3_FIXTURE.documentClass], [...AS3_FIXTURE.linked]]));

    // The ABC reader gets back the program that was written.
    const [payload] = abcPayloads(FIXTURE);
    const abc = abcFrom(payload);
    const model = as3FixtureAbc();
    expect(abc.classes.map((c) => [c.instance.name, c.instance.superName])).toEqual(model.classes.map((c) => [c.instance.name, c.instance.superName]));
    expect(abc.bodies.map((b) => [...b.code])).toEqual(model.bodies.map((b) => [...b.code]));
    expect(abc.multinames).toEqual(model.multinames);
    expect(abc.strings).toEqual(model.strings);
  });

  it('lifts and links with nothing refused', async () => {
    const { doc } = await parseSwfBinary(buffer(bytes()), 'as3Fixture.swf');
    const lifted = abcSources(doc.abc ?? []);
    expect(lifted.unreadable).toEqual([]);
    expect(lifted.refusals).toEqual([]);
    expect([...lifted.classes].sort()).toEqual(['fixture.Ball', 'fixture.Main']);
    const program = linkProgram(compileSources(lifted.sources));
    expect(program.errors).toEqual([]);
    expect(typeof program.getDefinition('fixture.Main')).toBe('function');
    expect(typeof program.getDefinition('fixture.Ball')).toBe('function');
  });

  it('boots: document class, the linked sprite on frame 1, enterFrame and trace', async () => {
    const traces: string[] = [];
    TOP_LEVEL.trace = (...args: unknown[]) => { traces.push(args.join(' ')); };
    const { doc, files } = await parseSwfBinary(buffer(bytes()), 'as3Fixture.swf');
    const program = linkProgram(compileSources(abcSources(doc.abc ?? []).sources));
    const logs: LogEntry[] = [];
    player = new FlashPlayer({ doc, program, assets: new AssetCache(ingestFiles(swfFilesToFiles(files, 'fixture')), () => {}), onLog: (e) => logs.push(e) });
    player.start();
    const FRAMES = 10;
    for (let i = 0; i < FRAMES; i++) player.step();

    expect(logs.filter((l) => l.level === 'error')).toEqual([]);
    const root = player.root as unknown as DisplayObjectContainer & { frames: number };
    expect(root.constructor.name).toBe('Main');
    expect(traces.filter((t) => t === 'main')).toHaveLength(1);
    expect(traces.filter((t) => t === 'ball')).toHaveLength(1);

    // the placed sprite is an instance of its SymbolClass-linked class
    const Ball = program.getDefinition('fixture.Ball') as new () => unknown;
    const children = Array.from({ length: root.numChildren }, (_, i) => root.getChildAt(i));
    expect(children.filter((c) => c instanceof Ball)).toHaveLength(1);

    // the listener is a method closure: `this` is the movie, and the int slot started at 0
    const frameTraces = traces.filter((t) => t === 'frame').length;
    expect(frameTraces).toBeGreaterThan(0);
    expect(frameTraces).toBeLessThanOrEqual(FRAMES);
    expect(root.frames).toBe(frameTraces);
  });
});
