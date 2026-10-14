// Missing Dependencies on the real bundled set: the main movie booted with every
// SWF it loads reports none; booted with one held back, it reports exactly that SWF
// with the API that asked and the movie that asked. Every request nothing answered
// (no adapter here) is listed — files and service endpoints apart.
//
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { AS2Player } from '@/engine/as2/player';
import { createExternalResolver, type ExternalSwf } from '@/engine/as2/externals';
import { dependencyPath, isServiceEndpoint } from '@/engine/flash/dependencies';
import { dependencyProblems } from '@/components/MissingDependencies';
import { bundledMainName, bundledSwfFile, bundledSwfNames } from '@/lib/__tests__/bundledSet';

async function load(name: string) {
  const buf = readFileSync(bundledSwfFile(name));
  const { doc, files } = await parseSwfBinary(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, `${name}.swf`);
  const sources: SourceInput[] = files.filter((f) => /\.as$/i.test(f.path)).map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) }));
  return { name, doc, sources };
}

async function boot(withheld: string | null) {
  const main = await load(bundledMainName());
  const others = await Promise.all(bundledSwfNames().filter((n) => n !== main.name && n !== withheld).map(load));
  const built: string[] = [];
  const externals: ExternalSwf[] = others.map((o) => ({ name: o.name, doc: o.doc, assets: null, sources: () => o.sources }));
  const player = new AS2Player({
    doc: main.doc, program: buildAS2Program(main.sources).program, assets: null, audio: null,
    resolveExternal: createExternalResolver(externals, { onBuild: (swf) => built.push(swf.name) }), missingExternal: 'empty',
  });
  const blocked: string[] = [];
  const record = player.recordNetwork.bind(player);
  player.recordNetwork = (event) => { if (event.status === 'blocked offline' && event.url) blocked.push(event.url); record(event); };
  player.start();
  for (let i = 0; i < 80; i++) {
    player.advanceTime();
    player.runQueue();
    await new Promise((r) => setTimeout(r, 2));
  }
  player.dispose();
  return { player, built, blocked, mainFile: `${main.name}.swf` };
}

describe('Missing Dependencies (AVM1, bundled SWFs)', () => {
  it('lists a SWF the movie loads that is not in the load, with its API and requester', async () => {
    const full = await boot(null);
    expect(full.player.dependencies.files().filter((d) => d.kind === 'swf' && !d.optional)).toEqual([]);
    expect(full.built.length).toBeGreaterThan(0);

    const withheld = full.built[0];
    const partial = await boot(withheld);
    const missing = partial.player.dependencies.files().filter((d) => d.kind === 'swf' && !d.optional);
    const entry = missing.find((d) => dependencyPath(d.url).toLowerCase().endsWith(`${withheld.toLowerCase()}.swf`));
    expect(entry, `${withheld}.swf is listed`).toBeTruthy();
    expect(entry!.apis.some((api) => api === 'loadMovie' || api === 'MovieClipLoader.loadClip')).toBe(true);
    expect(entry!.requestedBy.length).toBeGreaterThan(0);
    expect(partial.player.missingExternals.has(entry!.url)).toBe(true);

    // …and it is a Problem, worded as a missing dependency
    const problems = dependencyProblems(partial.player.dependencies.list());
    expect(problems.some((p) => p.context === 'Missing Dependencies' && p.message.includes(entry!.path))).toBe(true);
  }, 120_000);

  it('lists every request nothing answered, service endpoints apart from files', async () => {
    const { player, blocked } = await boot(null);
    expect(blocked.length, 'the movie made requests no adapter answered').toBeGreaterThan(0);
    for (const url of blocked) {
      expect(player.dependencies.has(url), url).toBe(true);
    }
    for (const d of player.dependencies.services()) expect(isServiceEndpoint(d.url, 'POST')).toBe(true);
  }, 120_000);
});
