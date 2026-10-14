import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { it } from 'vitest';
import { abcClassNames } from '@/../decompiler/swf/abc';
import { abcOf, payloads } from './swfAbc';
import { transpileAbc } from '@/../transpiler/avm2';
import { compileSources, linkProgram } from '@/../src/engine/flash/loader';

it('per-file compile: attribute every error to its file', () => {
  const abc = abcOf(payloads(process.env.SWF_FILE ?? '/tmp/swf-forge2/games-swfs/pinball-swfs/game.swf')[0]);
  const result = transpileAbc({ abc, projectClasses: new Set(abcClassNames(abc)) });
  const text = new Map(result.files.map((f) => [f.path, f.text]));
  // SWF_DUMP=<dir> writes every emitted module there, for grepping whole outputs.
  const dump = process.env.SWF_DUMP;
  if (dump) for (const f of result.files) { const out = join(dump, f.path); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, f.text); }
  const bad: string[] = [];
  for (const f of result.files) {
    const program = linkProgram(compileSources([f]));
    for (const e of program.errors) {
      if (/Cannot resolve import/.test(e.message) && /unsupported|__flash/.test(e.message)) continue;
      if (/Cannot resolve import/.test(e.message)) continue;
      bad.push(`${f.path}: ${e.message}`);
      const m = /\((\d+):(\d+)\)/.exec(e.message);
      if (m && !/super|left-hand/.test(e.message)) {
        const line = Number(m[1]);
        console.log(`${f.path}\n${f.text.split('\n').slice(Math.max(0, line - 2), line + 1).map((l, i) => `  ${line - 1 + i}| ${l}`).join('\n')}`);
      }
    }
  }
  console.log(`files with syntax/type errors: ${bad.length}`);
  const kinds = new Map<string, number>();
  const bucket = (m: string) => m.replace(/ at byte \d+/, '').replace(/\(.*$/, '').trim();
  for (const d of result.diagnostics) kinds.set(bucket(d.message), (kinds.get(bucket(d.message)) ?? 0) + 1);
  console.log('lift refusals by kind:');
  for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`  ${count}  ${kind}`);
  // SWF_LIST=<substring of the reason> lists each refusal with its method.
  if (process.env.SWF_LIST) for (const d of result.diagnostics) if (d.message.includes(process.env.SWF_LIST)) console.log(`REFUSE ${d.where} @${d.offset}: ${d.message}`);
  for (const b of [...new Set(bad.map((x) => x.replace(/\(.*?\)/, '').replace(/from .*$/, '')))].slice(0, 20)) console.log(`  ${b}`);
  // locate 'super' / 'left-hand side' problems: show the offending lines
  for (const [path, t] of text) {
    const lines = t.split('\n');
    lines.forEach((l, i) => {
      if (/\bsuper\b/.test(l) && !/^\s*(export class|export interface|import)/.test(l) && !/extends [A-Za-z_$]/.test(lines[0])) {
        console.log(`SUPER ${path}:${i + 1}: ${l.trim()} | header: ${lines[0]}`);
      }
    });
  }
});
