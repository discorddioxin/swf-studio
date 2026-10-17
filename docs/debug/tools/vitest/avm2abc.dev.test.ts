// Dev harness for the ABC (AVM2) reader — the spec-based path, no external tools.
//
// Reads the DoABC payloads straight out of the uploaded AS3 game movies and
// reports what is inside. (The exact-walk and FFDec class-list checks are tests now:
// src/lib/swf/corpus.test.ts.)
//
//   git clone --depth 1 --branch swf-uploads \
//     https://github.com/discorddioxin/swf-forge.git /tmp/swf-forge2
//   npx vitest run docs/debug/tools/vitest/avm2abc.dev.test.ts
//
// Skips cleanly when the corpus is not checked out.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { abcSurface } from '@/../transcom/decompiler/swf/abc';
import { abcFrom, abcPayloads } from '@/testing/abcPayloads';
import { corpusRoot } from '@/testing/corpus';

const CORPUS = corpusRoot() ?? '';
const MOVIES = [
  'pinball-swfs/game.swf', 'pinball-swfs/gameShell.swf', 'tiles-swfs/assets.swf',
  'towns2-swfs/towns2.swf', 'towns2-swfs/gambinoMarket.swf',
];

/** Optional independent corpus of ABC payloads (any tree of SWFs), for cross-checks. */
const EXTRA = process.env.ABC_EXTRA_CORPUS ?? '/tmp/ruffle-master/tests';
const haveCorpus = !!CORPUS && existsSync(join(CORPUS, MOVIES[0]));
const haveExtra = existsSync(EXTRA);

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
