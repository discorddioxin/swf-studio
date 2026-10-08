// as2ts – ActionScript 1/2 -> TypeScript transpiler (no DOM dependencies).

export { decodeAVM1Actions } from './avm1';
export type { ActionDecodeResult, ActionDecodeOptions } from './avm1';

export { tokenize, LexError } from './lexer';
export { parseProgram, ParseError } from './parser';
export { ModuleEmitter, relativeModule } from './emit';
export type { Diagnostic, EmitOptions, KnownClass } from './emit';
export { transpileProject, classify } from './project';
export type { ProjectFile, ProjectOptions, ProjectResult, FileReport } from './project';
export type * from './ast';

import { ModuleEmitter } from './emit';
import { parseProgram } from './parser';

/**
 * Transpile a single script.
 * - A file containing an AS2 class becomes a class module.
 * - Anything else becomes a module exporting `script`, a timeline function (`this` = the clip).
 */
export function transpileScript(source: string, options: { runtime?: string; module?: string; avm1?: 'decode' | 'interpret' } = {}) {
  const body = parseProgram(source);
  const em = new ModuleEmitter({ runtime: options.runtime ?? '@/runtime/as2', selfModule: options.module ?? 'script', avm1: options.avm1 });
  const cls = body.find((s) => s.k === 'class');
  if (cls && cls.k === 'class') {
    const imports = body.filter((s) => s.k === 'import');
    const code = em.classModule({ ...cls.decl, members: cls.decl.members.map((m) => ({ ...m, body: [...imports, ...m.body] })) });
    return { code, diagnostics: em.diagnostics };
  }
  const handlers = body.filter((s) => s.k === 'on' || s.k === 'onClipEvent');
  const rest = body.filter((s) => s.k !== 'on' && s.k !== 'onClipEvent');
  const parts: string[] = [];
  if (rest.length || !handlers.length) parts.push(`export const script = ${em.timelineFunction(rest)};`);
  if (handlers.length) {
    em.useRuntime('AS2Handler', true);
    const items = handlers.map((s) => {
      const fn = em.timelineFunction(s.k === 'on' || s.k === 'onClipEvent' ? s.body : []).replace(/\n/g, '\n    ');
      const events = s.k === 'on' ? s.events : s.k === 'onClipEvent' ? [s.event] : [];
      return `  { kind: '${s.k}', events: ${JSON.stringify(events)}, run: ${fn} },`;
    });
    parts.push(`export const handlers: AS2Handler[] = [\n${items.join('\n')}\n];`);
  }
  return { code: em.header() + parts.join('\n\n') + '\n', diagnostics: em.diagnostics };
}
