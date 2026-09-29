// AST for ActionScript 1/2 (ECMAScript 3 + AS2 classes and handler blocks).

export type TypeRef = string | null; // AS2 type annotation as written ("Number", "com.x.Y")

export type Expr =
  | { k: 'num'; v: string }
  | { k: 'str'; v: string }
  | { k: 'lit'; v: 'true' | 'false' | 'null' | 'undefined' | 'this' }
  | { k: 'id'; name: string; line: number }
  | { k: 'array'; items: (Expr | null)[] }
  | { k: 'object'; props: { key: string; value: Expr }[] }
  | { k: 'func'; name: string | null; params: Param[]; ret: TypeRef; body: Stmt[] }
  | { k: 'member'; obj: Expr; prop: string }
  | { k: 'index'; obj: Expr; index: Expr }
  | { k: 'call'; callee: Expr; args: Expr[] }
  | { k: 'new'; callee: Expr; args: Expr[] }
  | { k: 'unary'; op: string; arg: Expr }
  | { k: 'update'; op: '++' | '--'; prefix: boolean; arg: Expr }
  | { k: 'binary'; op: string; left: Expr; right: Expr }
  | { k: 'assign'; op: string; target: Expr; value: Expr }
  | { k: 'cond'; test: Expr; then: Expr; else: Expr }
  | { k: 'seq'; items: Expr[] };

export interface Param { name: string; type: TypeRef; rest?: boolean }
export interface VarDecl { name: string; type: TypeRef; init: Expr | null }

export type Stmt =
  | { k: 'expr'; e: Expr }
  | { k: 'var'; decls: VarDecl[] }
  | { k: 'function'; name: string; params: Param[]; ret: TypeRef; body: Stmt[] }
  | { k: 'block'; body: Stmt[] }
  | { k: 'if'; test: Expr; then: Stmt; else: Stmt | null }
  | { k: 'for'; init: Stmt | Expr | null; test: Expr | null; update: Expr | null; body: Stmt }
  | { k: 'forin'; left: { decl: boolean; target: Expr }; obj: Expr; body: Stmt }
  | { k: 'while'; test: Expr; body: Stmt }
  | { k: 'dowhile'; body: Stmt; test: Expr }
  | { k: 'switch'; disc: Expr; cases: { test: Expr | null; body: Stmt[] }[] }
  | { k: 'break'; label: string | null }
  | { k: 'continue'; label: string | null }
  | { k: 'return'; arg: Expr | null }
  | { k: 'throw'; arg: Expr }
  | { k: 'try'; block: Stmt[]; param: string | null; handler: Stmt[] | null; finalizer: Stmt[] | null }
  | { k: 'with'; obj: Expr; body: Stmt }
  | { k: 'label'; label: string; body: Stmt }
  | { k: 'empty' }
  /** on(press, release) { … } – button / clip mouse handlers */
  | { k: 'on'; events: string[]; body: Stmt[] }
  /** onClipEvent(enterFrame) { … } */
  | { k: 'onClipEvent'; event: string; body: Stmt[] }
  /** tellTarget("path") { … } (AS1) */
  | { k: 'tellTarget'; target: Expr; body: Stmt[] }
  /** ifFrameLoaded(n) { … } (AS1) – always true offline */
  | { k: 'ifFrameLoaded'; body: Stmt[] }
  | { k: 'import'; path: string }
  | { k: 'include'; path: string }
  | { k: 'class'; decl: ClassDecl }
  | { k: 'interface'; name: string; extends: string[] };

export interface ClassMember {
  kind: 'field' | 'method' | 'getter' | 'setter';
  name: string;
  isStatic: boolean;
  isPrivate: boolean;
  type: TypeRef;
  init: Expr | null;
  params: Param[];
  body: Stmt[];
}

export interface ClassDecl {
  name: string; // qualified as written: com.x.Y
  extends: string | null;
  implements: string[];
  dynamic: boolean;
  intrinsic: boolean;
  members: ClassMember[];
}
