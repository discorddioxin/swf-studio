// Dev harness for the ABC (AVM2) reader — the spec-based path, no external tools.
//
// Reads the DoABC payloads straight out of the uploaded AS3 game movies and
// reports what is inside, then checks our class list against the FFDec-style
// `.as` export the same SWF produced (ground truth, used only for verification).
//
//   git clone --depth 1 --branch swf-uploads \
//     https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2
//   npx vitest run debug/tools/vitest/avm2abc.dev.test.ts
//
// Skips cleanly when the corpus is not checked out.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { abcClassNames, abcSurface, parseAbc, type AbcFile } from '@/../decompiler/swf/abc';

const CORPUS = process.env.SWF_CORPUS ?? '/tmp/swf-forge2/games-swfs';
const SCRIPTS = process.env.SWF_SCRIPTS ?? '/tmp/swf-forge2/games-swfs-scripts';
const MOVIES = [
  'pinball-swfs/game.swf', 'pinball-swfs/gameShell.swf', 'tiles-swfs/assets.swf',
  'towns2-swfs/towns2.swf', 'towns2-swfs/gambinoMarket.swf',
];

/** Every DoABC (82) / DoABC2 (72) tag body in a SWF, decompressed. */
function abcPayloads(file: string): Uint8Array[] {
  const raw = readFileSync(file);
  const buf = raw.subarray(0, 3).toString() === 'CWS'
    ? Buffer.concat([raw.subarray(0, 8), inflateSync(raw.subarray(8))])
    : raw;
  const u16 = (p: number) => buf[p] | (buf[p + 1] << 8);
  const nbits = buf[8] >> 3;
  const p = 8 + Math.ceil((5 + 4 * nbits) / 8) + 4;
  const out: Uint8Array[] = [];
  const walk = (start: number, end: number) => {
    let q = start;
    while (q + 2 <= end) {
      const h = u16(q); const type = h >> 6; let len = h & 0x3f; let hdr = 2;
      if (len === 0x3f) { len = buf[q + 2] | (buf[q + 3] << 8) | (buf[q + 4] << 16) | (buf[q + 5] << 24); hdr = 6; }
      const body = q + hdr;
      if (type === 39 && len > 4) walk(body + 4, body + len);
      else if (type === 82 || type === 72) out.push(new Uint8Array(buf.subarray(body, body + len)));
      q += hdr + len;
      if (type === 0 && len === 0) break;
    }
  };
  walk(p, buf.length);
  return out;
}

/**
 * A DoABC payload carries a flags word and a name before the ABC file itself,
 * so find the first offset that actually parses as an ABC file.
 */
function abcFrom(payload: Uint8Array): AbcFile {
  const looksLikeAbc = (o: number) => o + 4 <= payload.length
    && (payload[o + 2] | (payload[o + 3] << 8)) >= 40
    && (payload[o + 2] | (payload[o + 3] << 8)) <= 70
    && (payload[o] | (payload[o + 1] << 8)) <= 32;
  let lastError: unknown;
  for (let o = 0; o < Math.min(payload.length, 512); o++) {
    if (!looksLikeAbc(o)) continue;
    try {
      return parseAbc(payload.subarray(o));
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`no ABC start found in a ${payload.length}-byte DoABC payload (${lastError})`);
}

/** Optional independent corpus of ABC payloads (any tree of SWFs), for cross-checks. */
const EXTRA = process.env.ABC_EXTRA_CORPUS ?? '/tmp/ruffle-master/tests';
const haveCorpus = existsSync(join(CORPUS, MOVIES[0]));
const haveExtra = existsSync(EXTRA);
const haveScripts = existsSync(join(SCRIPTS, 'gaia-pinball-game-swf-as/scripts'));

it.skipIf(!haveCorpus)('reports the ABC surface of every uploaded AS3 movie', () => {
  for (const rel of MOVIES) {
    const file = join(CORPUS, rel);
    if (!existsSync(file)) { console.log(`${rel}: missing`); continue; }
    const payloads = abcPayloads(file);
    console.log(`\n=== ${rel}: ${payloads.length} ABC module(s)`);
    payloads.forEach((payload, i) => {
      const abc = abcFrom(payload);
      const s = abcSurface(abc);
      console.log(`  [${i}] ABC ${abc.version} · ${payload.length} bytes · classes=${s.classes} (interfaces=${s.interfaces}) scripts=${s.scripts} methods=${s.methods} bodies=${s.bodies}`);
      console.log(`      walk errors: ${s.walkErrors.length}; off-boundary jump targets: ${s.badTargets}; dead instructions: ${s.deadInstructions}`);
      for (const e of s.walkErrors.slice(0, 3)) console.log(`        ${e}`);
      console.log(`      opcodes: ${s.opcodes.slice(0, 12).map(([n, c]) => `${n}:${c}`).join(' ')}`);
      console.log(`      metadata: ${s.metadata.join(', ') || '(none)'}`);
    });
  }
});

it.skipIf(!haveCorpus)('walks every method body of each movie exactly (opcode-table proof)', () => {
  for (const rel of MOVIES) {
    if (!existsSync(join(CORPUS, rel))) continue;
    for (const payload of abcPayloads(join(CORPUS, rel))) {
      const s = abcSurface(abcFrom(payload));
      expect(s.walkErrors, rel).toEqual([]);
      expect(s.badTargets, rel).toBe(0);
      expect(s.classes, rel).toBeGreaterThan(0);
    }
  }
});

it.skipIf(!haveCorpus || !haveScripts)('matches the uploaded AS3 source tree (FFDec ground truth)', () => {
  const fromAs = new Set<string>();
  const walk = (root: string, prefix: string) => {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(root, entry.name), prefix ? `${prefix}.${entry.name}` : entry.name);
      else if (entry.name.endsWith('.as')) {
        const stem = entry.name.slice(0, -3);
        const pkg = prefix === '_assets' || prefix === 'scripts' || prefix === '' ? '' : prefix;
        fromAs.add(pkg ? `${pkg}.${stem}` : stem);
      }
    }
  };
  walk(join(SCRIPTS, 'gaia-pinball-game-swf-as/scripts'), '');

  let matchedTotal = 0;
  for (const rel of MOVIES) {
    if (!existsSync(join(CORPUS, rel))) continue;
    for (const payload of abcPayloads(join(CORPUS, rel))) {
      const fromAbc = abcClassNames(abcFrom(payload));
      const matched = fromAbc.filter((n) => fromAs.has(n));
      matchedTotal += matched.length;
      console.log(`${rel}: ABC ${fromAbc.length} classes, ${matched.length} in the uploaded .as tree; sample: ${matched.slice(0, 3).join(', ')}`);
    }
  }
  // Pinball's movie alone ships 435 class files; a reader that mislays the
  // instance/class split cannot match a single one of them.
  expect(matchedTotal).toBeGreaterThan(400);
});

it.skipIf(!haveExtra)('walks every ABC payload of an independent corpus exactly', () => {
  const files: string[] = [];
  const scan = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) scan(full);
      else if (entry.name.endsWith('.swf')) files.push(full);
    }
  };
  scan(EXTRA);
  let payloads = 0; let classes = 0; let bodies = 0; let instructions = 0;
  const walkErrors: string[] = [];
  const badTargets: string[] = [];
  for (const file of files) {
    let list: Uint8Array[] = [];
    try { list = abcPayloads(file); } catch { continue; }
    for (const payload of list) {
      let abc;
      try { abc = abcFrom(payload); } catch { continue; }  // not an ABC payload
      payloads++;
      const s = abcSurface(abc);
      classes += s.classes;
      bodies += s.bodies;
      instructions += s.opcodes.reduce((n, [, c]) => n + c, 0);
      if (s.walkErrors.length) walkErrors.push(`${file}: ${s.walkErrors[0]}`);
      if (s.badTargets) badTargets.push(`${file}: ${s.badTargets}`);
    }
  }
  console.log(`corpus ${EXTRA}: ${files.length} SWFs, ${payloads} ABC payloads, ${classes} classes, ${bodies} method bodies, ${instructions} instructions`);
  for (const e of walkErrors) console.log(`  decode failure: ${e}`);
  for (const e of badTargets) console.log(`  off-boundary target: ${e}`);
  console.log(`  payloads with an off-boundary jump target: ${badTargets.length}${badTargets.length ? ` (e.g. ${badTargets[0]})` : ''}`);
  expect(payloads).toBeGreaterThan(100);
  // The only payloads this corpus rejects are the ones the corpus itself built
  // to be invalid, and the gate names the same defects Flash does:
  // verification/test.swf carries illegal opcode 107 (Error #1011),
  // verify_illegal_opcode/test.swf carries illegal opcode 10, and
  // verify_jump_to_middle_of_op/test.swf jumps into the middle of an
  // instruction (Error #1021). Everything else decodes exactly.
  const EXPECTED_BAD = ['avm2/verification/test.swf', 'avm2/verify_illegal_opcode/test.swf'];
  expect(walkErrors.every((e) => EXPECTED_BAD.some((p) => e.includes(p)))).toBe(true);
  expect(badTargets.every((e) => e.includes('verify_jump_to_middle_of_op'))).toBe(true);
  expect(walkErrors.length).toBeLessThanOrEqual(EXPECTED_BAD.length);
  expect(badTargets.length).toBe(1);
});
