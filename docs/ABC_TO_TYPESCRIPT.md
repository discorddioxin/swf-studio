# What is the issue with transpiling ABC to TypeScript?

> 2026‑10‑14 · the answer, the current pipeline, and the honest list of what still refuses

## 1. The answer, first

Nothing was wrong with the *idea* — the problem was that the pipeline had a chain
for AVM1 and **only a parser** for AVM2:

| | AVM1 (AS1/AS2) | AVM2 (AS3) — before |
|---|---|---|
| SWF tag | `DoAction`, `DoInitAction` | `DoABC` |
| bytecode reader | `transpiler/as2/*` (parse + expr) | `decompiler/swf/abc.ts` — existed |
| IR / AST | the shared `transpiler/as2/ast.ts` | none |
| code emitter | `transpiler/as2/emit.ts` → TS modules | none |
| engine side | the AS2 player drives the emitted code | nothing read `doc.abc` |

So an AS3 movie parsed correctly (tags, tags inside `DefineSprite`, the ABC
payload) and then **did nothing**: the `DoABC` bytes were read and dropped, no
classes were emitted, and no engine code ever looked at `doc.abc`. An AS2 movie
worked; an AS3 movie was a black screen with no error, which looks like "parsing
is broken" but was really "the second half of the pipeline does not exist".

The second (and real) difficulty is the *shape* of ABC: it is a stack machine
whose jumps are the compiler's own, and TypeScript has neither a stack nor
`goto`. Turning one into the other is four separate problems, and each of them
is where the remaining refusals come from (§4).

## 2. The chain today

```
SWF bytes
  └─ src/lib/swf/* … decompiler/swf/*        tags, DefineSprite, SymbolClass
       └─ decompiler/swf/abc.ts               parseAbc()   → AbcFile
       │    constants, methods, metadata, instances, classes, scripts, bodies
       │    disassemble()  → one record per instruction (operands, targets)
       └─ transpiler/avm2/lift.ts             liftMethod() → Stmt[]  (the shared AST)
       │    values-first: the operand stack becomes expressions as it walks
       └─ transpiler/avm2/emit.ts             TS module per class (+ imports)
       └─ src/engine/flash/loader.ts          compileSources() + linkProgram()
            └─ FlashPlayer (src/engine/flash/*)  the AS3 runtime and `flash.*`
```

`ExecuteTab` calls `abcSources()` (`src/engine/flash/abc.ts`) for the file list,
the loader compiles each module with `new Function`, links the classes against the
engine's `flash.*` definitions (`src/engine/flash/packages.ts`), and instantiates
the document class from `SymbolClass`. Nothing is written to disk; the same code
path serves the UI and the tests.

## 3. Where the difficulty actually lives

1. **Stack → expressions.** `get_local1; push_byte 3; add; set_local2` has to
   become `local2 = local1 + 3`. The lifter keeps a value stack of expressions and
   emits a statement when a value is consumed for effect. The hard part is a
   *branch*: both paths leave a value and the code after them reads it once. That
   is a phi, and the lifter materialises it (`__v0`, `__j1`) — which is why the
   generated code sometimes reads like the compiler's own scratch registers. It is
   honest: the alternative is guessing which arm "meant" to be the expression.
2. **Jumps → structured statements.** No `goto` in TypeScript, so loops and
   `switch` tables have to be *recovered*:
   * `while` — entry jump to the test, test jumps back into the body
     (`tryPreTestedWhile`), including the `for-in` shape (`hasnext2`);
   * `do…while`/latch loops — the branch at the bottom jumps back to the head;
   * `switch` — `lookupswitch` at the tail of the `switch`, case bodies laid out
     before it, arm targets sometimes *backwards*;
   * `break`/`continue` — a jump to the enclosing loop's exit or test, including
     from inside a `try`;
   * and the genuinely irreducible cases: a jump into the middle of a region that
     is still being lifted. These are refused **by name** rather than mis-lifted.
3. **Activations, scopes and closures.** AS3 has a scope chain, `newactivation`,
   captured locals, and `with`. The lifter builds the activation object, names the
   captured register, gives a nested function the enclosing scopes it closed over
   (`newfunction`/`newactivation`), and refuses `pushwith` out loud. `Object`
   gets `setPropertyIsEnumerable` because AVM2 has it and JavaScript does not.
4. **Multinames and namespaces.** A name in ABC can be a QName, a runtime QName, a
   Multiname, a TypeName, or carry a namespace that only exists as a constant
   (`E4X` `dxns`). Simple cases print as `a.b`; runtime-qualified ones become
   dynamic property access; E4X's namespace instructions have no JavaScript
   equivalent and are refused.
5. **The class model and the engine API.** AVM2 classes carry traits (slots,
   methods, getters/setters, constants), interfaces and `Class` objects; the
   emitted TypeScript uses classes and `Object.defineProperty`. On the other side,
   everything a movie *calls* has to exist: `flash.display.MovieClip`, `flash.text`,
   `flash.net.URLRequest`, … The engine reports the missing ones by name
   (`engine APIs missing: …`), which is a work list, not a mystery.

## 4. The refusals, by name (pinball `game.swf`, 2026‑10‑14)

3,690 method bodies; **11 refused**, 0 syntax/type errors, 0 link errors, every
symbol class linked. Tiles is at 0/35; towns2 at 80 refused of its bodies.

| count | reason | what it is |
|---|---|---|
| 5 | control flow re-enters a region still being lifted | a loop whose condition sits *before* the head and whose latch jumps back to it: the already-emitted statements need to be wrapped in a loop, not refused |
| 2 | if/else arms leave different numbers of values | two arms that produce *different* stack shapes (a phi the lifter cannot materialise) |
| 1 | if without else leaves values on the stack | same, one-armed |
| 1 | `with` (`pushwith`) | AS3's `with` re-binds name lookup; JavaScript cannot express the AVM2 rule |
| 1 | `slot 32 has no trait in Ball` | a slot written that the class never declares (generated/obfuscated code) |
| 1 | short-circuit join does not produce a single value | a `&&`/`\|\|` chain whose join pushes something other than the two operands |

Each of those is a *statement* in the emitted module's diagnostics, so a game
that half-works says exactly which method of which class is missing, at which
byte. Nothing is silently dropped: a body either lifts or is refused.

## 5. How the lift is validated

* **Oracle**: 435 hand-decompiled `.as` files for the pinball movie (FFDec
  output, `_loc2_` naming) — compared structurally, class by class and member by
  member, in `transpiler/avm2/__tests__` and `zz_proof`. The oracle is a check,
  never an input: it is not in the repo and nothing reads it at runtime.
* **Specification**: the ABC layout and opcode table are taken from the AVM2
  overview and cross-checked against Ruffle's reader (`swf/src/avm2/read.rs`,
  `opcode.rs`) and verifier (`core/src/avm2/verify.rs`) — including the details
  that bite: branches are end-relative, `lookupswitch` targets start-relative,
  metadata is `key,value` pairs, a `trait`'s kind is `flags & 0xF`.
* **Behaviour**: `avm2game.dev.test.ts` boots the real bundled SWFs through
  `FlashPlayer` and prints what each one hits (document class, size, frame rate,
  frame scripts, symbol classes, runtime errors) — that is the gate that says
  whether a lift is *right*, not just complete.
* **Types**: every emitted module is compiled by the engine's own loader, and
  `zz_files`/`zz_proof` check for syntax/type errors across the whole movie.

## 6. What is left, in order

1. **Condition-before-head loops** (the 5 `irreducible` refusals in pinball, 37 in
   towns2): when a latch jumps back to a point inside the region being lifted, wrap
   the statements already emitted for that region in a `while` whose condition is
   the branch that closes it. That is one structural change in `emitRegionInner`
   and it is the largest remaining class by far.
2. **Mismatched joins** (`if`/`if-else` value counts, short-circuit joins): these
   need a real phi/materialisation of *n* values instead of the current
   single-value rule.
3. **`with`**: either model the scope-object lookup (the AVM2 rule: an object
   becomes a scope that name resolution consults first) or keep refusing it.
4. **Engine surface**: `Class` as a global (a `ReferenceError` in the towns2
   controls), `flash.text.StyleSheet`, `flash.geom.Vector3D`,
   `flash.accessibility.*`, `flash.events.{HTTPStatusEvent,NetStatusEvent}`,
   `flash.system.IME`, `flash.xml.XMLDocument` — these are the remaining
   "is not implemented by this engine" messages.
5. **Fidelity vs clean code**: the 1:1 output is the measurement above; the
   actor/system target and its mapping live in `docs/GAME_FRAMEWORK.md`.
