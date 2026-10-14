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

## 4. The refusals, by name (re-measured 2026‑10‑13)

| movie | method bodies | emitted modules | refused | syntax/type errors | link errors |
|---|---|---|---|---|---|
| pinball `game.swf` | 3,690 | 436 | **7** | 0 | 0 |
| tiles `assets.swf` | 116 | 35 | **0** | 0 | 0 |
| towns2 `towns2.swf` | 8,372 | 769 | **55** | 0 | 0 |

Pinball:

| count | reason | what it is |
|---|---|---|
| 2 | if/else arms leave different numbers of values | two arms that produce *different* stack shapes (a phi the lifter cannot materialise) |
| 1 | control flow re-enters a region still being lifted | a latch that jumps back into a region whose statements are already emitted |
| 1 | if without else leaves values on the stack | same as the first row, one-armed |
| 1 | `with` (`pushwith`) | AS3's `with` re-binds name lookup; JavaScript cannot express the AVM2 rule |
| 1 | `slot 32 has no trait in Ball` | a slot written that the class never declares (generated/obfuscated code) |
| 1 | short-circuit join does not produce a single value | a `&&`/`\|\|` chain whose join pushes something other than the two operands |

towns2: 12 re-entered regions, 9 mismatched if/else arms, 9 operand-stack
underflows, 8 E4X default namespace (`dxns`), 4 jumps that leave the method body,
3 `with`, 3 unknown loop edges, 3 short-circuit joins, 2 switch cases that jump out
early, 1 `dup` on an empty stack, 1 one-armed `if` that leaves a value.

Each of those is a *statement* in the emitted module's diagnostics, so a game
that half-works says exactly which method of which class is missing, at which
byte. Nothing is silently dropped: a body either lifts or is refused.

## 5. How the lift is validated

* **Oracle**: 435 hand-decompiled `.as` files for the pinball movie (FFDec
  output, `_loc2_` naming) — compared structurally, class by class and member by
  member, in `transpiler/avm2/__tests__` and `zz_proof`. The oracle is a check,
  never an input: it is not in the repo and nothing reads it at runtime.
* **Specification**: the ABC layout and opcode table are taken from the AVM2
  overview, with Ruffle's reader studied as a reference only (`swf/src/avm2/read.rs`,
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

1. **Mismatched joins and re-entered regions** (pinball 5 of 7, towns2 ~25 of 55):
   a real phi/materialisation of *n* values instead of the single-value rule, and
   wrapping already-emitted statements in a loop when a latch jumps back into them.
2. **Stack underflow / jumps out of the body / unknown loop edges** (towns2 17):
   mostly `try`/`finally` and compiler-generated tails; each needs its own look.
3. **E4X** (`dxns`, towns2 8) and **`with`** (4): model the AVM2 scope rule or
   keep refusing by name.
4. **Engine surface for towns2** (the boot gate): 18 log entries on boot.
   `flash.text.StyleSheet` is missing (PhoneScreen/PalBox); `HistorySettings`,
   `Phone`, `SettingScreen` and `TownsDoc` read members that are still
   `undefined` (not yet diagnosed; timeline-placed children are the likely cause); `NumericStepper` reads `toString` of an unset style; the gateway
   host resolves to `undefined.gaiaonline.com` (a FlashVars/loader parameter the
   page used to supply). The `TownsDoc` constructor fails, so towns2 does not run.
   Pinball and tiles boot 120 frames with no log entries.
5. **Clean code**: the 1:1 output is the measurement above; the actor/system
   target and its mapping live in `docs/GAME_FRAMEWORK.md` and are not emitted yet.
