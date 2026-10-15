// Names from the ABC, as the emitter is allowed to print them.
//
// Every class, package, trait, multiname and parameter name comes out of the SWF's
// constant pool, which the SWF's author controls. A name is printed as code only
// when it is an identifier the printed position accepts; a key position quotes
// anything else; a quoted position always quotes. Anything that fails is an
// `UnsafeName`, which the emitter turns into a refusal (a loud stub plus a
// diagnostic) — never into text.

/** A name the emitter will not print in the position it was asked for. */
export class UnsafeName extends Error {
  constructor(readonly name: string, readonly role: string) {
    super(`unusable ${role} name ${JSON.stringify(name)}`);
  }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** ECMAScript reserved words, strict-mode ones included, plus `eval`. */
const RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export extends ' +
  'false finally for function if import in instanceof new null return super switch this throw true try typeof var void ' +
  'while with yield let static implements interface package private protected public await eval').split(' '));

/** Keywords that are values: printed where the lifter means them, never declared. */
const VALUE_WORDS = new Set(['this', 'super', 'null', 'true', 'false']);

/** Shaped like an identifier (reserved words included: fine as a member key). */
export function isIdentifierShaped(name: string): boolean { return IDENTIFIER.test(name); }

/** Usable as a declared name: a class, a variable, a parameter, a function. */
export function isBindable(name: string): boolean {
  return IDENTIFIER.test(name) && !RESERVED.has(name) && name !== 'arguments';
}

/** A name read as a value (`foo`, `this`, `arguments`). */
export function reference(name: string): string {
  if (VALUE_WORDS.has(name) || name === 'arguments' || isBindable(name)) return name;
  throw new UnsafeName(name, 'reference');
}

/** A declared name. */
export function binding(name: string, role = 'binding'): string {
  if (isBindable(name)) return name;
  throw new UnsafeName(name, role);
}

/**
 * A class member's key. Identifier-shaped names print bare (`delete()` is a fine
 * method name), `constructor` is bracketed so it stays a method, anything else is
 * a quoted key.
 */
export function memberKey(name: string): string {
  if (name === 'constructor') return '["constructor"]';
  return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

/** A string literal: single quotes for path-like text (the house style), JSON otherwise. */
export function quote(text: string): string {
  return /^[\w$./@-]*$/.test(text) ? `'${text}'` : JSON.stringify(text);
}

/**
 * A package path segment as a file name: itself when it is an identifier, an
 * encoded spelling otherwise — so no name can climb out of the project folder.
 */
export function pathSegment(segment: string): string {
  if (IDENTIFIER.test(segment)) return segment;
  return `_x${[...segment].map((c) => c.codePointAt(0)!.toString(16)).join('_')}`;
}
