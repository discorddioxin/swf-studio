// Debugger expressions: breakpoint conditions and watch expressions.
//
// These are text the *developer* typed into the debugger, so they are compiled
// with `new Function` in the page realm on purpose — that is the feature. What
// must not reach the compiler is anything the *movie* chose: the scope a frame
// reports carries the movie's variable names, and those become parameter names
// here. Only plain identifiers are bound, so no name from a SWF can change the
// parameter list (or the expression) that gets compiled.

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export extends ' +
  'false finally for function if import in instanceof new null return super switch this throw true try typeof var void ' +
  'while with yield let static implements interface package private protected public await eval arguments').split(' '));

/** Evaluate a developer-typed `expression` with `scope`'s plain-identifier entries in scope. */
export function evaluateInScope(expression: string, scope: Record<string, unknown>): unknown {
  const entries = Object.entries(scope).filter(([name]) => IDENTIFIER.test(name) && !RESERVED.has(name));
  const fn = new Function(...entries.map(([name]) => name), `return (${expression});`);
  return fn(...entries.map(([, value]) => value));
}
