// Census of the uploaded game corpus: every SWF in every set is parsed, its code
// lifted (AVM2) or decompiled (AVM1), compiled, linked and booted, and the result
// written as one JSON line per SWF — the raw data behind docs/GAME_CHECKLIST.md.
//
//   SWF_CORPUS=/tmp/swf-forge2/games-swfs npx vitest run debug/tools/vitest/zz_census.dev.test.ts
//   (SWF_SET=towns2 limits it to one set; output goes to CENSUS_OUT, default /tmp/census.jsonl)
//
// @vitest-environment jsdom
import { describeDependency } from '@/../src/engine/flash/dependencies';
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { parseSwfBinary } from '@/../decompiler/swf/binary';
import { abcSources } from '@/../src/engine/flash/abc';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';
import { FlashPlayer, type LogEntry } from '@/../src/engine/flash/player';
import { AssetCache, ingestFiles } from '@/../src/lib/assets';
import { swfFilesToFiles } from '@/../src/lib/bundled';
import { buildAS2Program, type SourceInput } from '@/../src/engine/as2/program';
import { AS2Player } from '@/../src/engine/as2/player';
import { createExternalResolver, type ExternalSwf } from '@/../src/engine/as2/externals';

const CORPUS = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';
const OUT = process.env.CENSUS_OUT ?? '/tmp/census.jsonl';
const FRAMES = Number(process.env.SWF_FRAMES ?? 120);

/** The movie each set is started from, and the FlashVars it is started with. */
const ENTRY: Record<string, { file: string; vars?: Record<string, string> }> = {
  'blackjack-swfs': { file: 'blackjack4.14.swf' },
  'fishing-swfs': { file: 'bassken_game4.21.swf' },
  'pinball-swfs': { file: 'gameShell.swf', vars: { game: 'pinball' } },
  'tiles-swfs': { file: 'gameShell.swf', vars: { game: 'tiles' } },
  'towns2-swfs': { file: 'towns2.swf' },
  'word-bump-swfs': { file: 'wordbump1.4.swf' },
};

type Bucket = Record<string, number>;
const bucket = (logs: LogEntry[] | { level: string; message: string }[], level: RegExp): Bucket => {
  const out: Bucket = {};
  for (const e of logs) {
    if (!level.test(e.level)) continue;
    // Collapse numbers and quoted values so the same failure counts once.
    const key = e.message.replace(/\s+/g, ' ').replace(/\(byte \d+: /, '(').replace(/ @\d+/, '').slice(0, 160);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 15));
};
const countNodes = (o: unknown, kids: (o: any) => unknown[] | undefined): number =>
  1 + (kids(o) ?? []).reduce<number>((n, k) => n + countNodes(k, kids), 0);

async function parse(path: string) {
  const raw = readFileSync(path);
  return parseSwfBinary(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, path.split('/').pop()!);
}
const as2Sources = (files: { path: string; bytes: Uint8Array }[]): SourceInput[] =>
  files.filter((f) => /\.as$/i.test(f.path)).map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) }));

async function avm2(path: string, vars: Record<string, string> = {}, others: string[] = []) {
  const { doc, files } = await parse(path);
  const lifted = abcSources(doc.abc ?? []);
  const compiled = compileSources(lifted.sources);
  const program = linkProgram(compiled);
  const r: Record<string, unknown> = {
    modules: lifted.sources.length,
    refusals: lifted.refusals.length,
    refusalMessages: bucket(lifted.refusals.map((x) => ({ level: 'e', message: x.message })), /./),
    refusalWhere: lifted.refusals.slice(0, 10).map((x) => x.path),
    unsupported: lifted.unsupported,
    compileErrors: compiled.modules.filter((m) => m.error).length,
    linkErrors: program.errors.filter((e) => !/^Compile error/.test(e.message)).length,
    linkErrorMessages: bucket(program.errors.map((e) => ({ level: 'e', message: e.message })), /./),
  };
  const logs: LogEntry[] = [];
  const t = Date.now();
  let player: FlashPlayer | null = null;
  try {
    const cache = new AssetCache(ingestFiles(swfFilesToFiles(files, path.split('/').pop()!)), () => {});
    player = new FlashPlayer({ doc, program, assets: cache, onLog: (e) => logs.push(e), parameters: vars, externalSwfs: others });
    player.start();
    for (let i = 0; i < FRAMES; i += 1) player.step();
  } catch (e) {
    r.bootThrew = (e as Error).message.slice(0, 200);
  }
  r.bootMs = Date.now() - t;
  r.document = player?.documentClassName ?? null;
  r.dependencies = player ? player.dependencies.list().map(describeDependency) : [];
  r.displayObjects = player?.root ? countNodes(player.root, (o) => o._children) : 0;
  r.errors = bucket(logs, /error/);
  r.errorCount = logs.filter((e) => /error/.test(e.level)).length;
  r.warnings = bucket(logs, /warn/);
  r.infos = bucket(logs, /info|log|trace/);
  return r;
}

async function avm1(dir: string, file: string, all: string[], vars: Record<string, string> = {}) {
  const { doc, files } = await parse(join(dir, file));
  const sources = as2Sources(files);
  const build = buildAS2Program(sources);
  const r: Record<string, unknown> = {
    scripts: sources.length,
    buildErrors: build.errors.length,
    buildErrorMessages: bucket(build.errors.map((e) => ({ level: 'e', message: `${e.file}: ${e.message}` })), /./),
    buildWarnings: build.warnings.length,
    buildWarningMessages: bucket(build.warnings.map((e) => ({ level: 'w', message: e.message })), /./),
  };
  // The rest of the set is what `loadMovie` can reach, as in the Execute tab.
  const externals: ExternalSwf[] = [];
  for (const other of all.filter((f) => f !== file)) {
    const parsed = await parse(join(dir, other));
    externals.push({ name: other.replace(/\.swf$/i, ''), doc: parsed.doc, assets: null, sources: () => as2Sources(parsed.files) });
  }
  const externalErrors: string[] = [];
  const loaded: string[] = [];
  const resolver = createExternalResolver(externals, {
    onBuild: (swf, b) => { loaded.push(swf.name); externalErrors.push(...b.errors.map((e) => `${swf.name}: ${e.message}`)); },
  });
  const logs: { level: string; message: string }[] = [];
  const network: string[] = [];
  const t = Date.now();
  let player: AS2Player | null = null;
  try {
    player = new AS2Player({
      doc, program: build.program, assets: null, audio: null, resolveExternal: resolver, missingExternal: 'empty',
      onLog: (e) => logs.push(e), flashVars: vars,
      fetchText: async (url, method) => { network.push(`${method} ${url}`); return null; },
      onExternalUrl: (url: string) => { network.push(`getURL ${url}`); return true; },
    });
    player.start();
    // `step(now)` is what the app drives: it runs timers (`setInterval`) as well as frames.
    let now = 0; (player as any).last = 0;
    for (let i = 0; i < FRAMES; i++) { now += 1000 / 24; player.step(now); player.runQueue(); await new Promise((res) => setTimeout(res, 1)); }
  } catch (e) {
    r.bootThrew = (e as Error).message.slice(0, 200);
  }
  r.bootMs = Date.now() - t;
  const root = (player as any)?.root;
  r.displayObjects = root ? countNodes(root, (o) => o.children) : 0;
  r.topLevel = (root?.children ?? []).map((c: any) => c.name).filter(Boolean).slice(0, 12);
  r.currentFrame = root?.obj?._currentframe ?? null;
  r.totalFrames = root?.obj?._totalframes ?? null;
  r.externalsLoaded = loaded;
  r.externalBuildErrors = externalErrors.length;
  r.externalBuildErrorSample = externalErrors.slice(0, 5);
  r.dependencies = player ? player.dependencies.list().map(describeDependency) : [];
  r.network = [...new Set(network)].slice(0, 10);
  r.errors = bucket(logs, /error/);
  r.errorCount = logs.filter((e) => /error/.test(e.level)).length;
  r.warnings = bucket(logs, /warn/);
  player?.dispose();
  return r;
}

describe.skipIf(!existsSync(CORPUS))('game corpus census', () => {
  it('measures every SWF', async () => {
    if (!process.env.CENSUS_APPEND) writeFileSync(OUT, '');
    const sets = readdirSync(CORPUS).filter((s) => !process.env.SWF_SET || s.includes(process.env.SWF_SET)).sort();
    for (const set of sets) {
      const dir = join(CORPUS, set);
      const all = readdirSync(dir).filter((f) => f.endsWith('.swf')).sort();
      for (const file of all) {
        const row: Record<string, unknown> = { set, file, bytes: readFileSync(join(dir, file)).length };
        try {
          const { doc, files } = await parse(join(dir, file));
          row.version = doc.header.version;
          row.frames = doc.header.frameCount;
          row.characters = doc.characters.size;
          row.abc = doc.abc?.length ?? 0;
          row.as2Scripts = files.filter((f) => /\.as$/i.test(f.path)).length;
          row.parseWarnings = doc.warnings.length;
          row.vm = row.abc ? 'AVM2' : row.as2Scripts ? 'AVM1' : 'none';
          const entry = ENTRY[set]?.file === file;
          row.entry = entry;
          if (row.vm === 'AVM2') Object.assign(row, await avm2(join(dir, file), entry ? ENTRY[set].vars : {}, all.filter((f) => f !== file)));
          else if (row.vm === 'AVM1') Object.assign(row, await avm1(dir, file, all, entry ? ENTRY[set].vars : {}));
          else {
            // No code: what a host gets is its library. Count exported symbols.
            row.symbolClasses = doc.symbolClasses?.size ?? 0;
          }
        } catch (e) {
          row.failed = (e as Error).message.slice(0, 300);
        }
        appendFileSync(OUT, `${JSON.stringify(row)}\n`);
        console.log(`${set}/${file}: ${row.vm} ${row.failed ?? ''}`);
      }
    }
  }, 3_600_000);
});
