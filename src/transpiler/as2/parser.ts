// Recursive-descent parser for ActionScript 1/2 as written by FFDec.

import type { ClassDecl, ClassMember, Expr, Param, Stmt, TypeRef, VarDecl } from './ast';
import { tokenize, type Token } from './lexer';

export class ParseError extends Error {
  constructor(message: string, readonly line: number) { super(`${message} (line ${line})`); }
}

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=', '&=', '|=', '^=']);
const BINARY_PREC: Record<string, number> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '===': 6, '!==': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, instanceof: 7, in: 7, '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
// AS1 word operators (Flash 4 syntax) still accepted by the compiler.
const WORD_OPS: Record<string, string> = { and: '&&', or: '||', eq: '==', ne: '!=', lt: '<', gt: '>', le: '<=', ge: '>=', add: '+' };

export function parseProgram(src: string): Stmt[] {
  return new Parser(tokenize(src)).program();
}

class Parser {
  private i = 0;
  private noIn = false;
  constructor(private readonly t: Token[]) {}

  // ---------------------------------------------------------------- utils
  private get cur() { return this.t[this.i]; }
  private peek(o = 1) { return this.t[Math.min(this.i + o, this.t.length - 1)]; }
  private is(v: string) { const c = this.cur; return (c.type === 'punc' || c.type === 'keyword') && c.value === v; }
  private isWord(v: string) { return this.cur.type === 'ident' && this.cur.value === v; }
  private eat(v: string) { if (this.is(v)) { this.i++; return true; } return false; }
  private expect(v: string) {
    if (!this.eat(v)) throw new ParseError(`Expected "${v}" but found ${this.describe()}`, this.cur.line);
  }
  private describe() { return this.cur.type === 'eof' ? 'end of file' : `"${this.cur.value}"`; }
  private ident(): string {
    const c = this.cur;
    // Keywords are valid property/identifier names in several AS2 positions.
    if (c.type === 'ident' || c.type === 'keyword') { this.i++; return c.value; }
    throw new ParseError(`Expected a name but found ${this.describe()}`, c.line);
  }
  private semi() {
    if (this.eat(';')) return;
    if (this.is('}') || this.cur.type === 'eof' || this.cur.nlBefore) return;
    throw new ParseError(`Expected ";" but found ${this.describe()}`, this.cur.line);
  }
  private typeAnn(): TypeRef {
    if (!this.eat(':')) return null;
    let name = this.ident();
    while (this.eat('.')) name += '.' + this.ident();
    return name;
  }

  // ------------------------------------------------------------- program
  program(): Stmt[] {
    const body: Stmt[] = [];
    while (this.cur.type !== 'eof') body.push(this.statement());
    return body;
  }

  private block(): Stmt[] {
    this.expect('{');
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.cur.type === 'eof') throw new ParseError('Unexpected end of file (missing "}")', this.cur.line);
      body.push(this.statement());
    }
    this.expect('}');
    return body;
  }

  private statement(): Stmt {
    const c = this.cur;
    if (c.type === 'punc') {
      if (c.value === '{') return { k: 'block', body: this.block() };
      if (c.value === ';') { this.i++; return { k: 'empty' }; }
      if (c.value === '#') return this.directive();
    }
    if (c.type === 'keyword') {
      switch (c.value) {
        case 'var': { this.i++; const s = this.varDecls(); this.semi(); return s; }
        case 'function':
          if (this.peek().type === 'ident' || this.peek().type === 'keyword') return this.functionDecl();
          break;
        case 'if': return this.ifStmt();
        case 'for': return this.forStmt();
        case 'while': { this.i++; this.expect('('); const test = this.expression(); this.expect(')'); return { k: 'while', test, body: this.statement() }; }
        case 'do': {
          this.i++; const body = this.statement(); if (!this.is('while')) throw new ParseError('Expected "while"', this.cur.line);
          this.i++; this.expect('('); const test = this.expression(); this.expect(')'); this.eat(';');
          return { k: 'dowhile', body, test };
        }
        case 'switch': return this.switchStmt();
        case 'break': case 'continue': {
          this.i++;
          const label = this.cur.type === 'ident' && !this.cur.nlBefore ? this.ident() : null;
          this.semi();
          return c.value === 'break' ? { k: 'break', label } : { k: 'continue', label };
        }
        case 'return': {
          this.i++;
          const arg = this.is(';') || this.is('}') || this.cur.nlBefore || this.cur.type === 'eof' ? null : this.expression();
          this.semi();
          return { k: 'return', arg };
        }
        case 'throw': { this.i++; const arg = this.expression(); this.semi(); return { k: 'throw', arg }; }
        case 'try': return this.tryStmt();
        case 'with': { this.i++; this.expect('('); const obj = this.expression(); this.expect(')'); return { k: 'with', obj, body: this.statement() }; }
        case 'import': {
          this.i++;
          let path = this.ident();
          while (this.eat('.')) path += '.' + (this.eat('*') ? '*' : this.ident());
          this.semi();
          return { k: 'import', path };
        }
        case 'class': case 'dynamic': case 'intrinsic': return { k: 'class', decl: this.classDecl() };
        case 'interface': return this.interfaceDecl();
      }
    }
    if (c.type === 'ident') {
      // AS2 handler blocks: name(args) { … } directly followed by a block.
      if ((c.value === 'on' || c.value === 'onClipEvent' || c.value === 'tellTarget' || c.value === 'ifFrameLoaded')
        && this.peek().value === '(' && this.handlerHasBlock()) return this.handler(c.value);
      if (this.peek().value === ':' && this.peek().type === 'punc') {
        const label = this.ident(); this.expect(':');
        return { k: 'label', label, body: this.statement() };
      }
    }
    const e = this.expression();
    this.semi();
    return { k: 'expr', e };
  }

  private directive(): Stmt {
    this.expect('#');
    const word = this.ident();
    if (word === 'include' && this.cur.type === 'str') { const path = this.cur.value; this.i++; this.eat(';'); return { k: 'include', path }; }
    // #initclip / #endinitclip and friends: no runtime meaning.
    while (this.cur.type !== 'eof' && !this.cur.nlBefore) this.i++;
    return { k: 'empty' };
  }

  /** Does `name( … )` continue with a `{`? (distinguishes on(press){} from a call on(x);) */
  private handlerHasBlock(): boolean {
    let depth = 0;
    for (let j = this.i + 1; j < this.t.length; j++) {
      const v = this.t[j];
      if (v.type !== 'punc') continue;
      if (v.value === '(') depth++;
      else if (v.value === ')' && --depth === 0) return this.t[j + 1]?.value === '{' && this.t[j + 1].type === 'punc';
    }
    return false;
  }

  private handler(kind: string): Stmt {
    this.i++; // name
    this.expect('(');
    if (kind === 'on') {
      const events: string[] = [];
      do {
        if (this.cur.type === 'ident' && this.cur.value === 'keyPress') { this.i++; events.push(`keyPress ${this.cur.value}`); this.i++; }
        else events.push(this.ident());
      } while (this.eat(','));
      this.expect(')');
      return { k: 'on', events, body: this.block() };
    }
    if (kind === 'onClipEvent') {
      const event = this.ident();
      this.expect(')');
      return { k: 'onClipEvent', event, body: this.block() };
    }
    const target = this.expression();
    this.expect(')');
    const body = this.block();
    return kind === 'tellTarget' ? { k: 'tellTarget', target, body } : { k: 'ifFrameLoaded', body };
  }

  private varDecls(): Stmt {
    const decls: VarDecl[] = [];
    do {
      const name = this.ident();
      const type = this.typeAnn();
      const init = this.eat('=') ? this.assignment() : null;
      decls.push({ name, type, init });
    } while (this.eat(','));
    return { k: 'var', decls };
  }

  private params(): Param[] {
    this.expect('(');
    const out: Param[] = [];
    if (!this.is(')')) {
      do {
        const rest = this.eat('...');
        const name = this.ident();
        out.push({ name, type: this.typeAnn(), rest });
      } while (this.eat(','));
    }
    this.expect(')');
    return out;
  }

  private functionDecl(): Stmt {
    this.expect('function');
    const name = this.ident();
    const params = this.params();
    const ret = this.typeAnn();
    return { k: 'function', name, params, ret, body: this.block() };
  }

  private ifStmt(): Stmt {
    this.expect('if'); this.expect('(');
    const test = this.expression(); this.expect(')');
    const then = this.statement();
    const els = this.eat('else') ? this.statement() : null;
    return { k: 'if', test, then, else: els };
  }

  private forStmt(): Stmt {
    this.expect('for');
    this.expect('(');
    let init: Stmt | Expr | null = null;
    if (!this.is(';')) {
      this.noIn = true;
      if (this.eat('var')) init = this.varDecls(); else init = this.expression();
      this.noIn = false;
      if (this.eat('in')) {
        const obj = this.expression();
        this.expect(')');
        const left = (init as Stmt).k === 'var'
          ? { decl: true, target: { k: 'id', name: (init as Extract<Stmt, { k: 'var' }>).decls[0].name, line: this.cur.line } as Expr }
          : { decl: false, target: init as Expr };
        return { k: 'forin', left, obj, body: this.statement() };
      }
    }
    this.expect(';');
    const test = this.is(';') ? null : this.expression();
    this.expect(';');
    const update = this.is(')') ? null : this.expression();
    this.expect(')');
    return { k: 'for', init, test, update, body: this.statement() };
  }

  private switchStmt(): Stmt {
    this.expect('switch'); this.expect('(');
    const disc = this.expression(); this.expect(')'); this.expect('{');
    const cases: { test: Expr | null; body: Stmt[] }[] = [];
    while (!this.eat('}')) {
      let test: Expr | null = null;
      if (this.eat('case')) test = this.expression();
      else if (!this.eat('default')) throw new ParseError(`Expected "case" but found ${this.describe()}`, this.cur.line);
      this.expect(':');
      const body: Stmt[] = [];
      while (!this.is('case') && !this.is('default') && !this.is('}')) body.push(this.statement());
      cases.push({ test, body });
    }
    return { k: 'switch', disc, cases };
  }

  private tryStmt(): Stmt {
    this.expect('try');
    const block = this.block();
    let param: string | null = null, handler: Stmt[] | null = null, finalizer: Stmt[] | null = null;
    if (this.eat('catch')) { this.expect('('); param = this.ident(); this.typeAnn(); this.expect(')'); handler = this.block(); }
    if (this.eat('finally')) finalizer = this.block();
    return { k: 'try', block, param, handler, finalizer };
  }

  private qualifiedName(): string {
    let n = this.ident();
    while (this.eat('.')) n += '.' + this.ident();
    return n;
  }

  private classDecl(): ClassDecl {
    let dynamic = false, intrinsic = false;
    for (;;) {
      if (this.eat('dynamic')) dynamic = true;
      else if (this.eat('intrinsic')) intrinsic = true;
      else break;
    }
    this.expect('class');
    const name = this.qualifiedName();
    const ext = this.eat('extends') ? this.qualifiedName() : null;
    const impl: string[] = [];
    if (this.eat('implements')) do impl.push(this.qualifiedName()); while (this.eat(','));
    this.expect('{');
    const members: ClassMember[] = [];
    while (!this.eat('}')) {
      if (this.eat(';')) continue;
      let isStatic = false, isPrivate = false;
      for (;;) {
        if (this.eat('static')) isStatic = true;
        else if (this.eat('private')) isPrivate = true;
        else if (this.eat('public')) isPrivate = false;
        else break;
      }
      if (this.eat('var')) {
        do {
          const n = this.ident();
          const type = this.typeAnn();
          const init = this.eat('=') ? this.assignment() : null;
          members.push({ kind: 'field', name: n, isStatic, isPrivate, type, init, params: [], body: [] });
        } while (this.eat(','));
        this.semi();
        continue;
      }
      if (this.eat('function')) {
        let kind: ClassMember['kind'] = 'method';
        if ((this.isWord('get') || this.isWord('set')) && this.peek().type !== 'punc') { kind = this.cur.value === 'get' ? 'getter' : 'setter'; this.i++; }
        const n = this.ident();
        const params = this.params();
        const type = this.typeAnn();
        const body = this.is('{') ? this.block() : (this.semi(), []); // intrinsic declarations have no body
        members.push({ kind, name: n, isStatic, isPrivate, type, init: null, params, body });
        continue;
      }
      throw new ParseError(`Unexpected ${this.describe()} in class body`, this.cur.line);
    }
    return { name, extends: ext, implements: impl, dynamic, intrinsic, members };
  }

  private interfaceDecl(): Stmt {
    this.expect('interface');
    const name = this.qualifiedName();
    const ext: string[] = [];
    if (this.eat('extends')) do ext.push(this.qualifiedName()); while (this.eat(','));
    // Interfaces have no runtime effect: skip the body.
    this.expect('{');
    for (let depth = 1; depth > 0 && this.cur.type !== 'eof'; this.i++) {
      if (this.is('{')) depth++;
      else if (this.is('}')) depth--;
      if (depth === 0) { this.i++; break; }
    }
    return { k: 'interface', name, extends: ext };
  }

  // ---------------------------------------------------------- expressions
  expression(): Expr {
    const first = this.assignment();
    if (!this.is(',')) return first;
    const items = [first];
    while (this.eat(',')) items.push(this.assignment());
    return { k: 'seq', items };
  }

  private assignment(): Expr {
    const left = this.conditional();
    const c = this.cur;
    if (c.type === 'punc' && ASSIGN_OPS.has(c.value)) {
      this.i++;
      return { k: 'assign', op: c.value, target: left, value: this.assignment() };
    }
    return left;
  }

  private conditional(): Expr {
    const test = this.binary(0);
    if (!this.eat('?')) return test;
    const saved = this.noIn; this.noIn = false;
    const then = this.assignment();
    this.noIn = saved;
    this.expect(':');
    return { k: 'cond', test, then, else: this.assignment() };
  }

  private binaryOp(): string | null {
    const c = this.cur;
    if (c.type === 'punc' && BINARY_PREC[c.value] != null) return c.value;
    if (c.type === 'keyword' && (c.value === 'instanceof' || (c.value === 'in' && !this.noIn))) return c.value;
    if (c.type === 'ident' && WORD_OPS[c.value]) return WORD_OPS[c.value];
    return null;
  }

  private binary(minPrec: number): Expr {
    let left = this.unary();
    for (;;) {
      const op = this.binaryOp();
      if (!op) return left;
      const prec = BINARY_PREC[op];
      if (prec <= minPrec) return left;
      this.i++;
      const right = this.binary(prec);
      left = { k: 'binary', op, left, right };
    }
  }

  private unary(): Expr {
    const c = this.cur;
    if (c.type === 'punc' && (c.value === '!' || c.value === '-' || c.value === '+' || c.value === '~')) {
      this.i++; return { k: 'unary', op: c.value, arg: this.unary() };
    }
    if (c.type === 'punc' && (c.value === '++' || c.value === '--')) {
      this.i++; return { k: 'update', op: c.value, prefix: true, arg: this.unary() };
    }
    if (c.type === 'keyword' && (c.value === 'typeof' || c.value === 'delete' || c.value === 'void')) {
      this.i++; return { k: 'unary', op: c.value, arg: this.unary() };
    }
    if (c.type === 'ident' && c.value === 'not') { this.i++; return { k: 'unary', op: '!', arg: this.unary() }; }
    const e = this.postfix();
    return e;
  }

  private postfix(): Expr {
    const e = this.callMember(this.primaryOrNew());
    const c = this.cur;
    if (c.type === 'punc' && (c.value === '++' || c.value === '--') && !c.nlBefore) {
      this.i++; return { k: 'update', op: c.value, prefix: false, arg: e };
    }
    return e;
  }

  private primaryOrNew(): Expr {
    if (this.eat('new')) {
      const callee = this.memberOnly(this.primaryOrNew());
      const args = this.is('(') ? this.args() : [];
      return { k: 'new', callee, args };
    }
    return this.primary();
  }

  private memberOnly(e: Expr): Expr {
    for (;;) {
      if (this.eat('.')) e = { k: 'member', obj: e, prop: this.ident() };
      else if (this.eat('[')) { const index = this.expression(); this.expect(']'); e = { k: 'index', obj: e, index }; }
      else return e;
    }
  }

  private callMember(e: Expr): Expr {
    for (;;) {
      if (this.eat('.')) e = { k: 'member', obj: e, prop: this.ident() };
      else if (this.eat('[')) { const index = this.expression(); this.expect(']'); e = { k: 'index', obj: e, index }; }
      else if (this.is('(')) e = { k: 'call', callee: e, args: this.args() };
      else return e;
    }
  }

  private args(): Expr[] {
    this.expect('(');
    const out: Expr[] = [];
    if (!this.is(')')) do out.push(this.assignment()); while (this.eat(','));
    this.expect(')');
    return out;
  }

  private primary(): Expr {
    const c = this.cur;
    switch (c.type) {
      case 'num': this.i++; return { k: 'num', v: c.value };
      case 'str': this.i++; return { k: 'str', v: c.value };
      case 'ident': this.i++; return { k: 'id', name: c.value, line: c.line };
      case 'keyword':
        if (c.value === 'true' || c.value === 'false' || c.value === 'null' || c.value === 'undefined' || c.value === 'this') {
          this.i++; return { k: 'lit', v: c.value };
        }
        if (c.value === 'function') {
          this.i++;
          const name = this.cur.type === 'ident' ? this.ident() : null;
          const params = this.params();
          const ret = this.typeAnn();
          return { k: 'func', name, params, ret, body: this.block() };
        }
        break;
      case 'punc':
        if (c.value === '(') {
          this.i++;
          const saved = this.noIn; this.noIn = false;
          const e = this.expression();
          this.noIn = saved;
          this.expect(')');
          return e;
        }
        if (c.value === '[') {
          this.i++;
          const items: (Expr | null)[] = [];
          while (!this.is(']')) {
            if (this.is(',')) { this.i++; items.push(null); continue; }
            items.push(this.assignment());
            if (!this.is(']')) this.expect(',');
          }
          this.expect(']');
          return { k: 'array', items };
        }
        if (c.value === '{') {
          this.i++;
          const props: { key: string; value: Expr }[] = [];
          while (!this.is('}')) {
            const kt = this.cur;
            let key: string;
            if (kt.type === 'str' || kt.type === 'num') { key = kt.value; this.i++; } else key = this.ident();
            this.expect(':');
            props.push({ key, value: this.assignment() });
            if (!this.is('}')) this.expect(',');
          }
          this.expect('}');
          return { k: 'object', props };
        }
        break;
    }
    // Contextual keywords used as identifiers (e.g. a variable named "dynamic").
    if (c.type === 'keyword' && ['dynamic', 'intrinsic', 'static', 'private', 'public', 'implements', 'interface', 'import', 'extends'].includes(c.value)) {
      this.i++; return { k: 'id', name: c.value, line: c.line };
    }
    throw new ParseError(`Unexpected ${this.describe()}`, c.line);
  }
}
