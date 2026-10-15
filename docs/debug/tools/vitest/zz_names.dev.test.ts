// Free names the emitted modules use but nothing defines — each one is a
// ReferenceError waiting for its code path to run (a member the lifter left bare,
// an undeclared register, a closure variable under the wrong name). Syntax checks
// and linking cannot see them; the TypeScript checker can.
//
//   SWF_FILE=<swf>      the movie (default: pinball game.swf)
//   SWF_SHOW=<n>        how many occurrences to print with context (default 40)
//
// The modules run inside `new Function(…)` with the runtime's TOP_LEVEL names as
// parameters and the JS globals behind them, so those are declared; only the
// "cannot find name" family is reported (2304, 2552, 2662 `this.x`, 2663 `C.x`).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { it } from 'vitest';
import { abcClassNames } from '@/../transcom/decompiler/swf/abc';
import { transpileAbc } from '@/../transcom/transpiler/avm2';
import { TOP_LEVEL } from '@/../src/engine/flash/packages';
import { abcOf, payloads, swfFile } from './swfAbc';

const NAME_CODES = new Set([2304, 2552, 2662, 2663]);

/** Is the identifier at `pos` only a type (`x: Foo`, `as Foo`)? sucrase erases those. */
function inTypePosition(sf: ts.SourceFile, pos: number): boolean {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    if (pos < node.getStart(sf) || pos >= node.getEnd()) return;
    found = node;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (let n = found; n; n = n.parent) {
    if (ts.isTypeNode(n) && !ts.isExpressionWithTypeArguments(n)) return true;
    // `implements I` and an interface's `extends` are erased too (a class's `extends` is a value).
    if (ts.isHeritageClause(n)) return n.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(n.parent);
  }
  return false;
}

it('lists names the emitted code uses but nothing defines', () => {
  const abc = abcOf(payloads(swfFile())[0]);
  const result = transpileAbc({ abc, projectClasses: new Set(abcClassNames(abc)) });
  const files = new Map(result.files.filter((f) => f.path.endsWith('.ts')).map((f) => [`/src/${f.path}`, f.text]));
  const declared = Object.keys(TOP_LEVEL).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && !(n in globalThis));
  files.set('/src/__globals.d.ts', [
    'declare const require: any;',
    ...declared.map((n) => `declare const ${n}: any;`),
  ].join('\n'));

  const libDir = dirname(require.resolve('typescript/lib/lib.d.ts'));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts'], noResolve: true, noEmit: true,
    skipLibCheck: true, strict: false, noImplicitAny: false, types: [],
  };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name, lang) => {
    const text = files.get(name) ?? (name.startsWith(libDir) || name.includes('/typescript/lib/') ? readFileSync(name, 'utf8') : undefined);
    return text == null ? undefined : ts.createSourceFile(name, text, lang, true);
  };
  host.fileExists = (name) => files.has(name) || name.includes('/typescript/lib/');
  host.getDefaultLibLocation = () => libDir;
  host.getDefaultLibFileName = () => join(libDir, 'lib.es2020.d.ts');
  const program = ts.createProgram([...files.keys()], options, host);

  const byName = new Map<string, { count: number; files: Set<string> }>();
  const shown: string[] = [];
  const limit = Number(process.env.SWF_SHOW ?? 40);
  for (const sf of program.getSourceFiles()) {
    if (!files.has(sf.fileName)) continue;
    for (const d of program.getSemanticDiagnostics(sf)) {
      if (!NAME_CODES.has(d.code) || d.start == null || inTypePosition(sf, d.start)) continue;
      const name = sf.text.slice(d.start, d.start + (d.length ?? 0));
      const entry = byName.get(name) ?? { count: 0, files: new Set<string>() };
      entry.count++;
      entry.files.add(sf.fileName.slice(5));
      byName.set(name, entry);
      if (shown.length < limit) {
        const { line } = sf.getLineAndCharacterOfPosition(d.start);
        shown.push(`${sf.fileName.slice(5)}:${line + 1}  ${name}  | ${sf.text.split('\n')[line].trim().slice(0, 140)}`);
      }
    }
  }
  const total = [...byName.values()].reduce((s, e) => s + e.count, 0);
  console.log(`unresolved names: ${byName.size} distinct, ${total} uses`);
  for (const [name, e] of [...byName].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(e.count).padStart(4)}  ${name}  (${[...e.files].slice(0, 3).join(', ')}${e.files.size > 3 ? ', …' : ''})`);
  }
  if (shown.length) console.log(shown.join('\n'));
}, 600_000);
