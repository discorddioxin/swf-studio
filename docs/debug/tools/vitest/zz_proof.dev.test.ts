import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { it } from 'vitest';
import { abcClassNames, parseAbc, type AbcFile } from '@/../transcom/decompiler/swf/abc';
import { transpileAbc } from '@/../transcom/transpiler/avm2';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';
import { corpusPath, corpusScripts } from '@/testing/corpus';

function payloads(file: string): Uint8Array[] {
  const raw = readFileSync(file);
  const buf = raw.subarray(0, 3).toString() === 'CWS' ? Buffer.concat([raw.subarray(0, 8), inflateSync(raw.subarray(8))]) : raw;
  const u16 = (p: number) => buf[p] | (buf[p + 1] << 8);
  const out: Uint8Array[] = [];
  const walk = (s: number, e: number) => {
    let q = s;
    while (q + 2 <= e) {
      const h = u16(q); const t = h >> 6; let len = h & 0x3f; let hdr = 2;
      if (len === 0x3f) { len = buf[q + 2] | (buf[q + 3] << 8) | (buf[q + 4] << 16) | (buf[q + 5] << 24); hdr = 6; }
      const b = q + hdr;
      if (t === 39 && len > 4) walk(b + 4, b + len);
      else if (t === 82 || t === 72) { let end = b + 4; while (buf[end] !== 0) end++; out.push(new Uint8Array(buf.subarray(end + 1, b + len))); }
      q += hdr + len;
      if (t === 0 && len === 0) break;
    }
  };
  walk(8 + Math.ceil((5 + 4 * (buf[8] >> 3)) / 8) + 4, buf.length);
  return out;
}
function abcOf(p: Uint8Array): AbcFile {
  let last: unknown;
  for (let o = 0; o < Math.min(p.length, 512); o++) {
    if ((p[o + 2] | (p[o + 3] << 8)) < 40 || (p[o + 2] | (p[o + 3] << 8)) > 70) continue;
    try { return parseAbc(p.subarray(o)); } catch (e) { last = e; }
  }
  throw last;
}

const ORACLE = join(corpusScripts() ?? '', 'gaia-pinball-game-swf-as/scripts');

it('whole-project link + oracle comparison', () => {
  const abc = abcOf(payloads(corpusPath('pinball-swfs/game.swf'))[0]);
  const result = transpileAbc({
    abc,
    projectClasses: new Set(abcClassNames(abc)),
  });
  const program = linkProgram(compileSources(result.files));
  console.log(`files ${result.files.length} lines ${result.files.reduce((n, f) => n + f.text.split('\n').length, 0)}`);
  console.log(`lift refusals ${result.diagnostics.length} / bodies ${abc.bodies.length}`);
  console.log(`link errors ${program.errors.length}`);
  for (const e of program.errors.slice(0, 4)) {
    const detail = (e as unknown as { detail?: string }).detail;
    if (detail) {
      const lines = detail.split('\n').filter((l) => /swf-code:/.test(l)).slice(0, 3);
      console.log(`  DETAIL ${e.path}: ${(lines.length ? lines.join(' || ') : detail.split('\n').slice(0, 3).join(' || ')).slice(0, 300)}`);
    }
  }
  for (const e of program.errors.slice(0, 20)) {
    const f = result.files.find((x) => x.path === e.path);
    const header = f ? f.text.split('\n').find((l) => /^export (class|interface)/.test(l)) : '(no file)';
    const imports = f ? f.text.split('\n').filter((l) => /^import|^const .*unsupportedFlash/.test(l)) : [];
    console.log(`  ${e.path}: ${e.message.slice(0, 140)}\n     ${header}\n     ${imports.join(' | ')}`);
  }
  console.log(`classes linked: ${program.classes.length}`);
  const defines = ['com.gaiaonline.games.gPinball.Pinball', 'com.gaiaonline.games.gPinball.Ball', 'game_fla.mcRampBank_Gate_113', 'com.pixel.motion.Tweener'];
  for (const d of defines) console.log(`  definition ${d}: ${program.getDefinition(d) ? 'ok' : 'MISSING'}`);
  for (const path of ['game_fla/mcRampBank_Gate_113.ts', 'com/gaiaonline/games/gPinball/vector2d.ts']) {
    const f = result.files.find((x) => x.path === path);
    if (f) console.log(`=== ${path}\n${f.text}`);
  }
  // verify the cycle hypothesis: eager import graph → SCCs
  {
    const resolvePath = (from: string, spec: string) => {
      const parts = from.split('/'); parts.pop();
      for (const seg of spec.split('/')) {
        if (seg === '.' || seg === '') continue;
        if (seg === '..') parts.pop();
        else parts.push(seg);
      }
      return parts.join('/');
    };
    const files = new Map(result.files.map((f) => [f.path.replace(/\.ts$/, ''), f]));
    const graph = new Map<string, string[]>();
    for (const f of result.files) {
      const deps: string[] = [];
      for (const line of f.text.split('\n')) {
        const m = /^import (?!type )\{[^}]*\} from '(\.\/[^']+)';/.exec(line);
        if (!m) continue;
        const target = resolvePath(f.path, m[1]);
        if (files.has(target)) deps.push(target);
      }
      graph.set(f.path.replace(/\.ts$/, ''), deps);
    }
    // iterative DFS colouring → back edges
    const state = new Map<string, number>();               // 0 unvisited, 1 on stack, 2 done
    const cyclic = new Set<string>();
    const visit = (node: string, stack: string[]) => {
      state.set(node, 1);
      stack.push(node);
      for (const dep of graph.get(node) ?? []) {
        const st = state.get(dep) ?? 0;
        if (st === 1) {                                     // back edge: everything from dep on the stack is in the cycle
          const from = stack.indexOf(dep);
          for (const n of stack.slice(from)) cyclic.add(n);
          continue;
        }
        if (st === 0) visit(dep, stack);
      }
      stack.pop();
      state.set(node, 2);
    };
    for (const node of graph.keys()) if (!state.get(node)) visit(node, []);
    console.log(`modules in import cycles: ${cyclic.size}`);
    const failing = new Set(program.errors.map((e) => e.path.replace(/\.ts$/, '')));
    let inCycle = 0;
    for (const p of failing) if (cyclic.has(p)) inCycle++;
    console.log(`failing modules: ${failing.size}, of them in a cycle: ${inCycle}`);
    console.log(`sample cycle members: ${[...cyclic].slice(0, 12).join(', ')}`);
  }
  for (const name of ['game_fla.mcRampBank_Gate_113', 'com.custom.KeyCheck', 'com.gaiaonline.games.gPinball.BetterArray']) {
    const Ctor = program.getDefinition(name) as (new () => Record<string, unknown>) | undefined;
    if (!Ctor) { console.log(`  run ${name}: no definition`); continue; }
    try {
      const instance = new Ctor();
      const keys = Object.keys(instance).slice(0, 6).join(', ');
      console.log(`  run ${name}: constructed ok (members: ${keys})`);
    } catch (e) {
      console.log(`  run ${name}: constructor threw ${(e as Error).message.slice(0, 120)}`);
    }
  }
  const oracle = readFileSync(`${ORACLE}/com/gaiaonline/games/gPinball/vector2d.as`, 'utf8');
  console.log(`=== oracle vector2d.as\n${oracle}`);
});
