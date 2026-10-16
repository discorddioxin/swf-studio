# SWF Studio — Resolution Plan

> The step-by-step plan the AI agent will follow to resolve every item in
> [`PROBLEMS.md`](./PROBLEMS.md). Written 2026-10-14 against `main` @ `aaa927b` plus
> commit `c6142af` on branch `arena/2de7d6c6-swf-studio`.
>
> Each problem has a goal, numbered steps, the files touched, the test that proves the
> fix, and a "done when" condition. Problems are grouped into nine phases, in the order
> they will be done. A phase is committed only when its verification gate passes.

---

## 0. Ground rules for every step

These come from your standing instructions and apply to every phase.

1. **Fix at the root.** Never silence, filter, downgrade a severity or wrap in `try/catch`
   to make a symptom disappear. When a catch stays, it must report through the console or
   Problems pipeline.
2. **Test first.** Every behavioural fix starts with a test that fails on current `main`
   and passes after the fix. No mocked solutions: SWF-level tests boot real SWFs.
3. **SWFs alone.** The app must work from the SWFs plus whatever they require, and must
   list anything still missing as *Missing Dependencies*. No step may introduce a
   dependency on FFDec `.as` exports, haXe or Ruffle. Specs and those sources remain
   reference material only.
4. **Game-agnostic pipeline.** Game-specific behaviour goes only into `src/adapters/<game>/`.
5. **Troubleshooter placement.** The UI troubleshooter stays in the Execute tab.
6. **Browser code never references `process`.** `browserLift.test.ts` stays green.
7. **Git and process discipline.**
   - Work only on `arena/2de7d6c6-swf-studio`, with one commit per problem (or per small
     group). Commit messages start with the problem id, e.g. `P-09: …`.
   - Push after each phase.
   - Open PRs only when you ask, and merge only on your explicit request.
   - Never run two Vitest processes at once.
8. **Keep the docs current.** Each fix updates the status table in §10 and any doc it
   touches, so no stale references come back (P-29).

### 0.1 Verification gate

The same gate runs after every phase:

```bash
npx tsc --noEmit -p .                                   # must stay 0 errors
timeout 900 ./node_modules/.bin/vitest run              # default suite (no corpus)
SWF_CORPUS=/tmp/swf-forge2/games-swfs \
  timeout 900 ./node_modules/.bin/vitest run            # with the corpus
npm run test:debug                                      # developer suite
npx vite build                                          # must build; bundle size recorded
```

The baseline recorded in `PROBLEMS.md` is:
- default suite: 53 failed / 314 passed / 32 skipped;
- with the corpus: 39 failed / 351 passed / 9 skipped.

**No phase may increase the failure count.** From the end of Phase 2 on, the target is
**0 failures** in both modes.

### 0.2 Decisions that need your input

Each decision has a default. The agent proceeds with the default unless you say otherwise
before that phase starts.

| # | Decision | Options | Default |
|---|---|---|---|
| D1 | Where the fishing sample lives (P-02) | **A.** restore `game-files/` · **B.** read the identical set from the `swf-forge` corpus (`games-swfs/fishing-swfs` has the same 8 SWFs) · **C.** commit a small fixture subset | **B.** You deleted `game-files/` on purpose, so it is not restored. |
| D2 | Ruffle tooling in `src/adapters/gaiaFishing/tools/` (P-19) | delete · move out of the repo | **Delete** (recoverable from git history) |
| D3 | Isolation of game code (P-03, part b) | sandboxed iframe now · later | **Later** (Phase 7). Name and member guards land in Phase 1 regardless. |
| D4 | Tier-2 scope (P-08) | one game end-to-end first · all games | **Fishing first** (AS2), then pinball (AS3) |
| D5 | Project storage key migration (P-18) | migrate silently · ask on first load | **Migrate silently**, keeping the old key until the first successful save |
| D6 | LZMA decoder (P-12) | own implementation · small npm package | **Own implementation** (~300 lines, spec-driven, no new dependency) |

---

## Phase 1 — Security: stop untrusted SWF code from running as JavaScript

Covers **P-01, P-03 (part a), P-06, P-26**. P-06 is here because the probe link on Execute
mount is what turns P-01 into "opening the tab is enough".

### P-01 — ABC names emitted verbatim (code injection)

**Goal:** no string from an ABC constant pool can appear in generated code except as a
valid identifier or a JSON-quoted string literal. Unresolved globals never resolve to
browser globals.

1. **Write the failing test.** Add `transcom/transpiler/avm2/injection.test.ts`, built
   with `testAbc.ts`, using the reproduction from P-01: a class `cinit` doing
   `findpropstrict N; callpropvoid N 0`, where `N` is a JavaScript payload. Assert:
   - (a) the payload text never appears unquoted in any emitted file;
   - (b) `linkProgram(compileSources(files))` leaves `globalThis.__pwned` undefined;
   - (c) calling the class reports AVM2 `ReferenceError: Error #1065: Variable … is not defined`.
2. **Extend the test into a fuzz table.** Put the payload in every name slot the emitter
   prints:
   - multiname (QName, Multiname, RTQName);
   - class name and package;
   - superclass;
   - trait, slot and method names;
   - parameter names (`HAS_PARAM_NAMES`);
   - activation slot names;
   - metadata;
   - string constants.
   
   Use payloads such as `a;b`, `a'b`, `` a`b ``, `a\u2028b`, `__proto__` and
   `constructor`. Each case asserts that the output parses (sucrase) and that evaluation
   has no side effect.
3. **Route unresolved globals through an explicit scope object.**
   - **In the lifter:** in `transcom/transpiler/avm2/lift.ts` `reference()` (lines
     2420-2459), the two final fallbacks `return { k: 'id', name }` become
     `member(id('__global'), name)`. Only names in `GLOBALS`, known locals, captured
     names and imported class identifiers stay bare.
   - **In the printer:** `emit.ts` `case 'member'` already brackets non-identifiers with
     `JSON.stringify`.
4. **Validate identifiers at the printer.**
   - In `emit.ts`, `case 'id'` (line 879) asserts `/^[A-Za-z_$][\w$]*$/` and not a
     reserved word. On failure it throws an emit diagnostic and the method becomes a
     *refusal* (the existing mechanism that throws loudly when the method is called),
     never raw text.
   - Apply the same check to every place that prints a declaration name: `export class X`,
     method and field names (bracket-quote when needed), parameter lists, and `require('…')`
     specifiers. `classPath()` must reject or escape `'`, `\` and `..`; the specifier is
     printed with `JSON.stringify`, not hand-written quotes.
5. **Provide `__global` in the linker.**
   - `src/engine/flash/loader.ts` `linkProgram` adds a `__global` parameter: a `Proxy` over
     a null-prototype object holding `TOP_LEVEL`, `FLASH_DEFINITIONS` and the program's own
     definitions (the same index `getDefinition` uses).
   - A missing name `get` throws the AVM2 `ReferenceError #1065`.
   - `has` follows AVM2 `findproperty` semantics, so `typeof`-style probes still work.
6. **Audit `GLOBALS`.** The list at `lift.ts:168` must hold only AVM2 top-level names
   (`Math`, `int`, `trace`, …), never browser objects. Add a test that scans every emitted
   file for free identifiers and asserts each is in an allow-list (`GLOBALS` ∪ locals ∪
   imports ∪ runtime helpers).
7. **Regression check on real games.** Run `docs/debug/tools/vitest/avm2game.dev.test.ts`
   and `avm2emitter.dev.test.ts` against the corpus.

**Done when:**
- the injection and fuzz tests pass;
- pinball and tiles still boot to the same state;
- pinball's refusal count stays at 11 of 3,690 (or drops).

**As implemented (2026-10-15).** Two deviations from the steps above, both deliberate:
- *No `__global` routing (steps 3 and 5).* The emitter's import machinery finds the names
  a module needs by scanning the printed text for bare identifiers, so turning unresolved
  names into `__global.x` would have broken import resolution. Instead, the loader wraps
  each module in a sloppy outer function whose parameters shadow **every** name the
  page's global object answers, other than ECMAScript builtins: `window`, `document`,
  `fetch`, `eval`, `globalThis`, `Reflect` and the rest are `undefined` inside a module.
  `Function`, `Object` and the four timers get AVM2 stand-ins (`src/runtime/shared/hostGuard.ts`).
  An unknown name therefore reads as `undefined`, not as AVM2's `ReferenceError #1065`.
- *Reflection is guarded too.* `.constructor` reads print as `__ctor(x)`, which never
  returns a host compiler. Computed keys that are not plainly numeric print as
  `o[__key(k)]`, which holds `"constructor"` apart. `__proto__` is **not** guarded,
  because AVM2 reads it as the prototype and pinball's Sushi `Serializer` relies on it.
- Name checks live in `transcom/transpiler/avm2/names.ts`. An unprintable name refuses the
  member (body) or the module (class, base or interface name) with a diagnostic.
- Corpus result: identical file, class, refusal and link counts. The emitted text changes
  only by the `__key`/`__ctor` wraps: all 5,396 changed lines map back to the old text
  mechanically.
- This remains a guard inside the page's realm. P-03b (iframe isolation) is the boundary;
  once it lands, the `__key` wraps can be reconsidered.

### P-03 (part a) — AS2 reaches JavaScript's `Function` through `constructor`

**Goal:** AS2 and AVM1 code can read `constructor` and `prototype` with Flash semantics,
but can never obtain a host JavaScript intrinsic (`Function`, `eval`, `globalThis`).

1. **Write the failing tests.**
   - In `transcom/transpiler/as2/__tests__/sandbox.test.ts`, run through the real
     `buildAS2Program` and `AS2Player`:
     - `"".constructor.constructor("globalThis.__x=1")()`;
     - `this.constructor.constructor(...)`;
     - `o["constr"+"uctor"]["constructor"](...)`;
     - `__proto__` writes;
     - `Function("…")`.
   - Each must leave `globalThis.__x` undefined. Where real Flash returns `undefined`, so
     must we.
   - Write the same cases as raw AVM1 bytecode for the interpreter
     (`src/runtime/as2/__tests__/avm1.sandbox.test.ts`).
2. **Add a guarded member read** in `src/runtime/as2/index.ts`:
   `$rt.member(obj, name)`.
   - It returns the AS2 `Function` stand-in (a real AS2 object whose call does **not**
     compile strings) whenever the JavaScript lookup would yield `Function`,
     `Function.prototype.constructor` or any native constructor.
   - It blocks `__proto__`, `__defineGetter__` and similar, mapping them to the AS2
     `__proto__` semantics already implemented in the runtime.
3. **Make the emitter use it.** `transcom/transpiler/as2/emit.ts` emits `$rt.member(...)`
   for:
   - literal property names in the guarded set (`constructor`, `__proto__`,
     `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `caller`, `callee`);
   - **all** computed accesses `o[k]` with a non-literal key.
   
   Literal-name fast paths stay unchanged for every other name, so generated code stays
   readable.
4. **Apply the same guard in the AVM1 interpreter.** `src/runtime/as2/avm1.ts`:
   `GetMember`, `CallMethod` and `GetVariable` (slash and dot paths) go through the same
   helper.
5. **Clean up loose `new Function` sites.** Debugger expression evaluation
   (`src/debug/store.tsx:240,345`) is user-authored and stays, but runs through one
   documented helper. The AS2 boot script is handled by P-26.

**Done when:** the sandbox tests pass in both the transpiled and interpreted modes, and
the fishing real-game tests stay green.

**As implemented (2026-10-15).**
- The guard is shared with P-01: `src/runtime/shared/hostGuard.ts`. It lives under
  `runtime/` rather than `engine/shared/` because the engine depends on the runtime,
  never the reverse.
- **Interpreter.** Every member read (`getProp`, `findMember`) and every call or construct
  (`callFunctionValue`, `constructValue`, `runConstructor`) maps a host compiler to
  `Avm1Function`. This covers reflective routes too, such as a property descriptor's
  `.value`.
- **Transpiled code.** It prints `$rt.ctor(x)` for `.constructor` reads and
  `[$rt.key(k)]` for computed keys that are not plainly numeric. `program.ts` links
  modules through the same host-shadowing wrapper as the AS3 loader.
- **Stand-ins.** `_global.Function` is `Avm1Function`: source text gives `undefined`
  (AVM1 never threw), while AVM2's `AvmFunction` throws EvalError #1066. Both use the real
  `Function.prototype`, so `Function.prototype.x = …` extensions keep working.
- **Not guarded.** `__proto__` reads and writes keep their AS2 meaning.
- **Debugger.** Both expression sites go through `src/debug/evaluate.ts`, which binds only
  plain-identifier scope names. That stops a movie-chosen variable name from rewriting the
  compiled parameter list.
- **Verification.** The census of all 43 corpus SWFs (120 frames each) is identical before
  and after P-01 and P-03a. The fishing real-game tests still cannot run here: they need
  `game-files/fish-full` (P-02).

### P-06 — AS3 programs linked repeatedly; static initializers run on mount

**Goal:** an AS3 program is evaluated exactly once, when the player starts.

1. **Write the failing test.**
   - Extract the analysis that the `ExecuteTab.tsx:143-198` effect performs into a pure
     function, `analyzeAs3Program()`, in `src/engine/flash/analyze.ts`.
   - Test it with a hand-built ABC whose `cinit` calls `trace()` (counted through a
     `TOP_LEVEL.trace` spy installed by the test harness, not a mock of the code under
     test).
   - Assert 0 `cinit` runs after analysis, and exactly 1 after `FlashPlayer` starts.
2. **Make the analysis static.** `analyzeAs3Program` computes everything the UI shows
   without evaluating anything:
   - **Compile errors:** from `compileSources`, as today.
   - **Resolvable classes:** `expectedClasses(doc)` checked against the declared class
     names from `abcSources().classes`, plus exported class names from uploaded code
     files (read from sucrase output with a declaration scan).
   - **Display classes:** extend `AbcSources` with `supers: Map<qualified, superQualified>`
     (from `instance.superName`). Walk each chain to a `flash.display.*` base from
     `FLASH_DEFINITIONS`. This replaces `prototype instanceof DisplayObject`.
   - **Dependency fold:** the same unresolved-names comparison, done statically.
3. **Link once.** `ExecuteTab` stops calling `linkProgram`. `FlashPlayer` remains the only
   caller (`program: () => linkProgram(compiled)`). Its link errors are already logged;
   route them into the `linkErrors` state through the player's log callback, so the UI
   panel is unchanged.
4. **Report unreadable payloads.** `abcSources()` currently swallows payloads it cannot
   read (`src/engine/flash/abc.ts:81-86`). It now returns them as diagnostics, shown in the
   AS3 summary (this also counts toward P-25).

**Done when:**
- the test passes;
- opening Execute on pinball shows the same class, display-class and dependency summary
  as before;
- pinball boots.

**As implemented (2026-10-15).**
- **`src/engine/flash/analyze.ts`.** `analyzeAs3Program` / `analyzeCompiled` read the
  compiled (sucrase) module text and never evaluate it:
  - exported `class` / `function` declarations; interfaces are objects, so they are
    not counted;
  - `var _x = require(…)` import bindings;
  - `extends` expressions, used to walk superclass chains to the engine's
    `flash.display` classes.
- **Shared rules.** Names are indexed by the linker's own `indexClasses`, which was
  extracted from `linkProgram`, and imports are resolved with its `moduleFinder` /
  `resolveFlash`. So analysis and linking cannot disagree on a name or a path.
- **Corpus check.** `docs/debug/tools/vitest/as3analysis.dev.test.ts` compares the static
  result with a real link for all 43 corpus SWFs. Classes, display classes, unresolved
  symbol classes and import errors are equal on every one.
- **Order change.** The document-class dropdown now lists classes in file order instead
  of the linker's load order.
- **Supers map not needed.** The plan's `AbcSources.supers` map turned out unnecessary:
  walking the compiled `extends` chains covers lifted and hand-written code with one
  mechanism.
- **Execute tab.** It folds dependency code on the static errors and unresolved names
  (same criteria as before). The player is the only caller of `linkProgram`, and its link
  errors feed the Problems list.
- **Unreadable payloads.** `abcSources` returns them as `unreadable`, shown in the
  Program summary and as Problems entries.
- **Tests.**
  - `analyze.test.ts`: a lifted `cinit` that traces runs 0 times during analysis and once
    in the player.
  - `executeTab.ui.test.tsx`: a module body runs once per run; the old tab ran it twice.

### P-26 — global AS2 boot script

1. **Write the failing test** (UI test with jsdom). Save a boot script while game A is
   loaded; load game B. Assert the script does not run and the field is empty.
2. **Scope the key per game.** The key becomes
   `swf-studio.as2.boot:<adapterId>:<main SWF name>`.
3. **Migrate the old key.** If the old key's value equals an adapter preset's code, move it
   to that adapter. Otherwise keep it as an *unassigned* script, shown with a one-click
   "use for this game" action. Then delete the old key.
4. **Show it.** Display a visible "custom boot script active" badge in the Execute toolbar
   while a non-preset script runs, plus a console info line (that line already exists).

**As implemented (2026-10-15).**
- **Storage.** The rules live in `src/components/bootScripts.ts`; the key is
  `swf-studio.as2.boot:<adapterId>:<main SWF>`.
- **Per-game value.** `As2Execute` derives the script from that key while rendering, so a
  player created for a newly loaded game never sees the previous game's script.
- **Migration (D5).** The old global key is migrated when a game opens:
  - empty: deleted;
  - one of this adapter's presets: moved to this game silently;
  - another adapter's preset: left for that adapter;
  - anything else: kept *unassigned*. It never runs, and a notice offers "Use for this
    game" or "Discard".
- **Visibility.** The toolbar shows "Custom boot script active" for a non-preset script,
  and the console line says it is the script saved for this game.
- **Loop fix.** Writing the UI test exposed a render loop: `As2Execute` defaulted
  `externals` to a fresh `[]`, which the player effect depends on, so a caller that
  omitted the prop got a new player on every render. The default is now one shared array.
- **Tests.** `src/components/__tests__/as2BootScript.ui.test.tsx`: game A's script
  neither runs nor shows in game B; the legacy script stays idle until assigned; plus the
  migration rules. Both UI tests fail against the old component.

**Phase 1 gate:** §0.1. Commit messages `P-01 …`, `P-03a …`, `P-06 …`, `P-26 …`. Push.

---

## Phase 2 — Restore a green test suite

Covers **P-02, P-21**.

### P-21 — one corpus resolver, skip when absent

This is done first, because P-02 builds on it.

1. **Add one resolver,** `src/testing/corpus.ts`, used by tests only and excluded from the
   bundle because nothing in `src/` imports it at run time. It exports:
   - `corpusRoot()`: `SWF_CORPUS` env → `/tmp/swf-forge2/games-swfs` →
     `../swf-forge/games-swfs` → `~/swf-forge/games-swfs` → `null`;
   - `corpusScripts()`: `SWF_SCRIPTS`, or the root's sibling `games-swfs-scripts`;
   - `corpusSet(id)`: absolute paths of one game set;
   - `hasCorpus`.
2. **Replace the hard-coded paths.** All 32 files that hard-code `/tmp/swf-forge2`, plus
   `uploadedCorpus.dev.test.ts`'s three-path probe, switch to the resolver. Wrap every
   corpus test in `describe.skipIf(!hasCorpus)`. The skip message names the clone command
   from `APP_SUMMARY.md` §10.
3. **Remove the dumpers from the default run.** `vite.config.ts` `test.include` drops
   `docs/debug/tools/vitest/*.dev.test.ts`. They keep running under `npm run test:debug`.
   Real assertions that only live in dev tests are first promoted into
   `src/**/__tests__/` (identify them with `grep -l "expect(" docs/debug/tools/vitest`
   and review each one; pure dumpers stay in `docs/debug`).
4. **Add a CI-sized AS3 fixture.** Add a small, hand-assembled AS3 SWF fixture under
   `src/engine/flash/__tests__/fixtures/`, written by a script from `testAbc.ts` builders
   plus a minimal SWF wrapper. It covers the AVM2 path without the corpus: document
   class, a `SymbolClass`-linked sprite, `enterFrame`, `trace`.

**Done when:** without the corpus the suite has 0 failures (corpus tests skip with a
message); with the corpus, every corpus test runs.

### P-02 — the bundled sample is gone (default D1 = B)

1. **Confirm the corpus set is identical.**
   - `git fetch --unshallow`, then compare the SHA-256 of each deleted
     `game-files/fish-full/swfs/*.swf` (from `95c4978^`) with
     `games-swfs/fishing-swfs/*.swf`. Record the result in the commit message.
   - If any file differs, stop and ask (D1 becomes A or C).
2. **Re-point the test helpers** at the corpus:
   - `src/lib/__tests__/bundledSet.ts` and `src/adapters/gaiaFishing/sample.ts` resolve
     the fishing set through `corpusSet('fishing-swfs')`;
   - `SAMPLE_ROOT` and `SAMPLE_SWF_DIR` become resolver-backed functions;
   - every importer is updated.
3. **Handle the oracle-backed tests** (`swf-roundtrip`, `lossless-oracle`, the 2
   `fixtures/ffdec` ENOENTs).
   - The corpus has FFDec exports only for pinball (`games-swfs-scripts`). These tests
     switch to that oracle where it covers the same assertion.
   - Otherwise they are rewritten to a self-contained form: build the XML with
     `tools/xml2swf` from a parsed SWF's own data model, parse it back, and compare
     structures.
   - None reintroduces a runtime dependency on FFDec output; oracles stay test-only.
4. **Make the app's bundled feature optional and truthful.**
   - **Build:** in `vite.config.ts`, `publicDir` is used only if `game-files/` exists
     (`existsSync` at config time). Otherwise it is `false`.
   - **Errors:** `fetchGameIndex` distinguishes *no bundled games* (404, or the HTML
     fallback) from *broken index* (anything else) by returning a typed
     `BundledIndexState`.
   - **Loader:** the bundled section renders only when the index loaded. A broken index
     is shown as an error line in the Loader, instead of being swallowed at
     `Loader.tsx:93`.
   - **Uploads:** `App.mergeBundledExternals` skips without a warning when there are no
     bundled games (not an error), and logs a real warning when the index is broken.
5. **Update every reference** listed in P-02:
   - `src/adapters/README.md`, `src/engine/as2/README.md`;
   - `docs/NEXT_STEPS.md`, `docs/GAME_CHECKLIST.md`, `docs/debug/README.md`;
   - `src/adapters/gaiaFishing/{index.ts,sample.ts}`;
   - `generate-bundled.mjs`, which reads from the corpus and writes `game-files/` only
     when explicitly run;
   - the `docs/debug` `.mjs` dumpers, which take a path argument or `SWF_CORPUS`.
   
   Then add a test that greps tracked text files for `game-files/fish-full` and
   `fixtures/ffdec` and expects 0 hits outside `docs/audits/archive`.

**Phase 2 gate:** both suite modes show 0 failures. Test counts are recorded in the commit
and in §10.

---

## Phase 3 — Small, contained correctness fixes

Covers **P-05, P-35, P-17, P-09, P-10, P-11, P-13**. Each is a single commit with its own
test.

### P-05 — Workbench keys hijack game input
1. **Write the UI test** (`src/components/__tests__/workspaceKeys.ui.test.tsx`). In the
   Execute workspace, dispatch Space and ArrowRight on the game canvas. Assert that the
   Workbench frame and `playing` are unchanged, and that the App renders no further times.
2. **Guard the handler.** In `App.tsx:341-354`, install it only while
   `workspace === 'workbench'`, and return early on `e.defaultPrevented`.
3. **Stop background playback.** In `App.tsx:290-315`, add `workspace === 'workbench'` to
   the playback effect's condition, and `setPlaying(false)` when leaving the Workbench.
   The audio effect (`App.tsx:317-339`) gets the same guard.
4. **Stop propagation at the source.** The game canvases also call `e.stopPropagation()`
   for keys they consume (`engine/as2/player.ts:1600`, `As2Execute.tsx:454`,
   `ExecuteTab.tsx:325`).

### P-35 — "New folder" keeps the adapter pick
1. **Write the test.** Pick an adapter, press "New folder", load an unrelated SWF, and
   assert the resolved adapter is `auto`-detected.
2. **Reset everything.** The button calls one `resetSession()` that resets `adapterId`,
   `gameSetId`, `filters`, `timelineId`, `frame`, `playing`, `loopRange`, selections and
   `error`. `installPackages` reuses the same function.

### P-17 — `%` in URL-encoded data
1. **Write the tests.** `loadVariables` and `LoadVars.load` serving `a=100%&b=2` from an
   uploaded file must yield `a="100%"`, `b="2"`, fire the `data` clip event and call
   `onLoad(true)`.
2. **Decode tolerantly.** Add `decodeFormComponent` in `builtins.ts`, with Flash
   `unescape` semantics: `+` becomes a space, valid `%XX` sequences decode, an invalid `%`
   stays literal. `decodeVars` uses it.
3. **Guard `loadVariables`.** Wrap its body in `p.guard('loadVariables …', …)`, so any
   future throw reaches the Problems tab, as `LoadVars` already does.

### P-09 — `RemoveObject` (tag 5)
1. **Write the unit test** in `src/lib/swf/removeObject.test.ts` (it moves next to the
   decompiler in P-23). Build a two-frame SWF in memory with `PlaceObject2` at depth 3
   (character 7) and `RemoveObject(char 7, depth 3)`, and assert frame 2's display list is
   empty.
2. **Read the right layout.** In `binary.ts:1545-1551`, for `tag.type === 5` read
   `characterId = u16()`, then `depth = u16()`. Keep the existing path for tag 28.

### P-10 — `PlaceObject` (tag 4)
1. **Write the unit test.** A frame with a `PlaceObject` (character, depth, matrix,
   CXFORM) must yield a `DisplayItem` with that matrix and colour transform.
2. **Name the missing tags** in `TAG_NAMES`: 4 `PlaceObjectTag`, 13 `DefineFontInfoTag`,
   62 `DefineFontInfo2Tag`, 72 `DoABCDefineTag`, 91 `DefineFont4Tag`, 41 `ProductInfoTag`,
   63 `DebugIDTag`, 66 `SetTabIndexTag`, 71 `ImportAssets2Tag`.
3. **Parse PlaceObject v1.** Add `parsePlace1` (CharacterId u16, Depth u16, MATRIX, and an
   optional CXFORM without alpha if bytes remain). In the timeline loop, dispatch on
   `tag.type === 4`. `isSpecialTag` treats `PlaceObjectTag` and `RemoveObjectTag` as plain
   place/remove, like their v2 forms.
4. **Check the FFDec path.** Confirm `parseSwfXml` handles the FFDec `PlaceObjectTag`
   element the same way (round-trip test).

### P-11 — tag 17 and button sounds
1. **Write the tests.**
   - **Parser:** tag 17 is named `DefineButtonSoundTag`, and its 4 sound records
     (`OverUpToIdle`, `IdleToOverUp`, `OverUpToOverDown`, `OverDownToOverUp`: sound id plus
     `SOUNDINFO`) are attached to the button character.
   - **Player:** an AS2 test that moves the mouse over a button and presses it asserts the
     audio backend received the matching sound ids. The backend is the real
     `AudioBackend` interface with a recording implementation; the code under test is not
     mocked.
2. **Fix the classification.** Correct `TAG_NAMES[17]`. `classify` treats
   `DefineButtonSound` as `define` and `DefineButtonCxform` as `define` (not `action`).
3. **Implement the sounds.**
   - Add `buttonSounds?: (ButtonSound | null)[]` to `SwfCharacter`, filled by both the
     binary and the XML parser.
   - `AS2Player` plays the matching sound on each button state transition through the
     movie's `AudioBackend`, honouring `SOUNDINFO` (stop sync, no-multiple, loops,
     envelope where the backend supports it).
4. **Check the AS3 side.** `SimpleButton` in `src/engine/flash/display.ts` uses the same
   data for timeline-placed buttons.

### P-13 — runtime chosen by heuristic
1. **Write the tests.**
   - An AVM1 movie with no scripts runs on the AS2 player.
   - An AS3 movie with stray `.as` files in the upload runs on the AS3 engine.
   - An AS3 movie with no `SymbolClass` runs on the AS3 engine.
2. **Decode `FileAttributes`.** Read tag 69 in both parsers:
   - `header.as3 = (flags & 0x08) !== 0`;
   - `header.useNetwork = (flags & 0x01) !== 0`;
   - `header.hasMetadata = (flags & 0x10) !== 0`.
   
   Add the fields to `SwfHeader`.
3. **Dispatch on the flag.** `ExecuteTab` uses `header.as3` when the tag is present.
   Without the tag (SWF ≤ 7), the movie is AVM1. The old heuristic remains only for FFDec
   XML inputs lacking the attribute, and it logs which rule decided.

**Phase 3 gate:** §0.1.

---

## Phase 4 — Rendering fidelity: filters and blend modes (P-04)

**Goal:** the visual output matches Flash for the filters and blend modes the corpus uses.

1. **Measure first.** Write a census dev test (`docs/debug/tools/vitest/filters.census.dev.test.ts`)
   that counts filter types and blend modes per corpus SWF, so the work starts with what
   the games actually use.
2. **Add a data model** to `types.ts`:
   - `SwfFilter`, a union of `DropShadow | Blur | Glow | Bevel | GradientGlow |
     Convolution | ColorMatrix | GradientBevel`, with spec fields;
   - `PlaceOp.filters?`, `DisplayItem.filters?` and `blendMode` as a `BlendMode` enum
     (the spec values 0–14).
3. **Parse instead of skip.**
   - `binary.ts` replaces `skipFilterList` with `readFilterList`, which keeps the existing
     size checks and warnings. The `BlendMode` byte from `PlaceObject3` is stored.
   - `parser.ts` reads the same fields from FFDec XML, and the round-trip test asserts
     both paths agree.
4. **Build a shared compositor,** `src/lib/compositor.ts`, used by all three renderers
   (Workbench `render.ts`, `AS2Player`, `flash/display.ts`):
   - **Blend modes:** `normal`, `layer`, `multiply`, `screen`, `lighten`, `darken`,
     `difference`, `add` (`lighter`), `subtract`, `invert`, `alpha`, `erase`, `overlay`,
     `hardlight`. These map to `globalCompositeOperation`. `layer`, `alpha` and `erase`
     render the subtree to an offscreen canvas first.
   - **Filters:** render the subtree into an offscreen canvas sized to the filter-expanded
     bounds. Blur uses canvas `filter: blur()`, with box-blur passes per `quality`.
     DropShadow and Glow tint the alpha mask and blur it, honouring
     `inner`/`knockout`/`hideObject`/`strength`. ColorMatrix is a per-pixel 4×5 matrix.
     Bevel and gradient variants combine shadow and highlight passes.
   - **Caching:** results are cached per node until its transform or contents change. A
     cached subtree reuses the same cache (this also gives a correct `cacheAsBitmap`).
5. **Add the runtime APIs.**
   - **AS2:** `flash.filters.*` constructors in `src/runtime/as2/index.ts` and
     `MovieClip.filters` get/set (copy semantics as in Flash 8), plus `blendMode`.
   - **AS3:** `DisplayObject.filters` and `blendMode` in `flash/display.ts` feed the same
     compositor, and the "not rendered" comment in `misc.ts:199` is removed.
6. **Write tests.**
   - **Pixel tests** with the jsdom canvas shim, or a node-canvas dev dependency if needed
     (jsdom lacks `getContext`): a 20×20 red square with DropShadow(distance 4, angle 45)
     must have shadow pixels at the expected offset; `multiply` over white equals the
     source.
   - **Real-game check:** a corpus scene whose art uses filters, comparing screenshots
     before and after via `docs/debug` tooling.

**Done when:** the census types the corpus uses all render, and the Workbench, AS2 and AS3
output agree for the same frame.

---

## Phase 5 — AS3 adapters and offline network (P-07), then resume the Pinball mock

1. **Write the failing test.** An AS3 fixture (from P-21 step 4) that `URLLoader.load`s
   `http://example.invalid/api` must receive a response from a test adapter's `fetchText`,
   and must appear in Missing Dependencies when no adapter answers.
2. **Make the network interface player-agnostic.** Move the network interface out of
   `engine/as2/player.ts:239-265` into `src/adapters/types.ts`
   (`AdapterNetwork { fetchText, gameServer, openSocket? }`). `AS2Player` keeps consuming
   it unchanged.
3. **Add `FlashPlayer` options** for `network?: AdapterNetwork`, `dependencyFiles` and
   `isOptionalExternal`, then wire:
   - `URLLoader` / `URLStream`: uploaded file → adapter `fetchText` → blocked offline,
     recorded as a missing dependency (the same order as AS2's `fetchText`);
   - `flash.net.Socket` / `XMLSocket`: adapter `gameServer`;
   - `NetConnection` (AMF): an adapter hook `callAmf?`, with an AMF0/AMF3
     encoder/decoder in `src/engine/flash/amf.ts`, spec-based.
   
   The `runtime.player as unknown as { loadUrl? }` cast (`misc.ts:115`) is replaced by a
   typed player port.
4. **Resolve adapters for both paths.** Move `resolveAdapter` up into `ExecuteTab`, so both
   paths share the adapter picker UI and `adapterScores`.
5. **Resume the paused Pinball mock-server task.**
   - Create `src/adapters/gaiaPinball/`, with `detect()` on `gameShell.swf`, `game.swf`,
     and the `game=pinball` FlashVar.
   - Reverse-engineer the GSI gateway protocol from the lifted pinball code (requests built
     in `URLRequest`/`URLVariables` or AMF), never from external `.as` exports.
   - Implement the mock gateway in `gameServer.ts`, as `gaiaFishing` does.
   - Add tests that boot the real `gameShell.swf` + `game.swf` from the corpus (skip if
     absent), drive login → table → play, and assert no blocked requests remain.
6. **Implement FlashVars.** Execute gets a FlashVars field (both paths), so
   `game=pinball` / `game=tiles` no longer needs `SWF_VARS` in tests. Tests read
   `loaderInfo.parameters` and `_root` variables.

**Done when:** pinball reaches gameplay offline in Execute with no Missing Dependencies
except optional externals, and the AS2 fishing tests are unchanged.

---

## Phase 6 — Architecture clean-up

Covers **P-14, P-22, P-23, P-24, P-25**. These are broad refactors, done in small,
behaviour-neutral commits, each keeping the gate green.

### P-23 — layering (first, because it moves files the others touch)
1. **Create a shared core.** Add `core/` at the repo root, with a `tsconfig` path `@core/*`
   and the vite alias. Move into it:
   - `src/types.ts` → `core/types.ts`;
   - `src/lib/swfFont.ts` → `core/swfFont.ts`;
   - `src/engine/as2/adpcm.ts` → `core/adpcm.ts`;
   - the package *name table* from `src/engine/flash/packages.ts` (names only, no
     implementations) → `core/flashNames.ts`.
2. **Enforce the direction.** After this, `transcom` imports only `core`, and `src`
   imports `core` and `transcom`. Add a test (`core/layering.test.ts`) that parses
   imports and fails on `transcom → src`.
3. **Delete the facades.** Remove `src/lib/parser.ts` and `src/lib/swf/{abc,binary,bitio,shapeSvg}.ts`;
   their 5 importers import `transcom` directly.
4. **Move the decompiler tests.** `src/lib/swf/*.test.ts` moves to
   `transcom/decompiler/**/__tests__/`. `vite.config.ts` `test.include` gains
   `transcom/**/*.test.ts` and `core/**/*.test.ts`.

### P-22 — duplicated logic
1. **Share one action-record reader.** Add `transcom/decompiler/avm1/actions.ts`: a
   `readActions(bytes) → ActionRecord[]` with typed operands per opcode (spec table,
   SWF 19 §Actions). The lifter (`transcom/transpiler/as2/avm1.ts`), the interpreter
   (`src/runtime/as2/avm1.ts`) and `decodeActionBytes` (`parser.ts:311`) all consume it.
2. **Add a parity test.** For every AVM1 block in the corpus, the reader round-trips
   (offsets and lengths), and the old and new decoders agree before the old ones are
   deleted.
3. **Share guarded execution.** Add `src/engine/shared/guardedExecution.ts`
   (guard → breakpoint → pause/resume → `reportProblem`), used by both
   `engine/as2/player.ts:430-506` and `engine/flash/player.ts:496-545`. Its tests cover
   ordering on resume and error reporting, which also resolves P-34.

### P-14 — module-level singletons
1. **Introduce a runtime context,** `RuntimeContext { host, avm1Env, debugger, log }`,
   created per player.
   - Generated AS2 code receives it through the existing `$rt` import, which becomes a
     per-program binding: `program.ts` passes `$rt` into the module function, so there is
     no global `installHost`.
   - `avm1.ts` takes the env as a parameter instead of `setAvm1Env`.
   - `_constructStack` moves onto the context.
   - The AS3 `runtime.player` becomes a context field passed through `linkProgram`.
2. **Turn the debugger into a port.** The engine depends on a `DebuggerPort` interface in
   `src/engine/shared/`. `src/debug/store.tsx` implements it, and the engine no longer
   imports the UI store.
3. **Test it.** Run two `AS2Player` instances on different SWFs in one test, interleaving
   ticks, and assert there is no cross-talk.

### P-24 — type safety
1. **Split the TypeScript configs:**
   - `tsconfig.app.json`: `src`, `core`, `transcom`; `lib: ["ES2022", "DOM"]`; **no**
     `types: ["node"]`;
   - `tsconfig.node.json`: `server`, `tools`, `docs/debug`, tests, `vite.config.ts`, with
     `allowJs` + `checkJs` for the `.mjs` files;
   - `tsconfig.json` references both.
   
   A browser file that uses `process` then fails `tsc`.
2. **Complete the debugger type.** Export the full store type (`popFrame`, `pushFrame`,
   `clearSkip`, `clearStack`) and remove every `(dbg as any)` and `(RT as any)` cast.
3. **Type the AVM1 value model.** Add `AVM1Value = undefined | null | boolean | number |
   string | AS2Object | AS2Function | MovieClipRef` and convert `avm1.ts` (180 `any`s),
   then `builtins.ts` (311), file by file. Track the count in the commit messages;
   **target ≤ 50 `any` in non-test code**, each justified with a comment.

### P-25 — swallowed errors
1. **List them.** Enumerate all 58 empty or comment-only catches
   (`grep -nE 'catch *(\([^)]*\))? *\{ *(/\*[^*]*\*/)? *\}'`).
2. **Classify and fix each one.**
   - **Storage availability** (`localStorage` in private mode): stays silent, but behind
     one helper, `safeStorage`.
   - **Engine and game paths** (`as2/player.ts:482,506,649-658,725`,
     `As2Execute.tsx:145,415`, `flash/player.ts:496,515,523,543`): `reportProblem` or
     `log('warn')` with context.
   - **Truly impossible cases:** removed (no try).
3. **Lock it in.** A test greps for empty catches outside `safeStorage` and expects 0.

**Phase 6 gate:** §0.1, plus a bundle-size check (no growth beyond 2%).

---

## Phase 7 — Performance, robustness, isolation

Covers **P-15, P-12, P-16, P-18, P-20, P-03 (part b)**.

### P-15 — Web Worker
1. **Write the test.** `loadUploadedPackages` returns identical `SwfDocument`s whether run
   inline or through the worker (structural compare on the fishing set).
2. **Move parsing into a worker.** Add `src/workers/parse.worker.ts`, which runs
   `parseSwfBinary`, `parseSwfXml` and `abcSources` / `transpileProject`. The main thread
   sends `ArrayBuffer`s (transferred) and receives the document plus asset `Uint8Array`s
   (transferred). `Map` fields survive structured clone.
3. **Report progress.** The worker posts progress messages, which replace the 30 ms
   `setTimeout` paint hack (`swfLoading.ts:76`).
4. **Keep the single-file build.** `vite-plugin-singlefile` needs the worker inlined:
   `new Worker(new URL(...), { type: 'module' })` with `?worker&inline`.

### P-12 — LZMA (`ZWS`)
1. **Write the test.** Add a fixture: a corpus SWF re-compressed to `ZWS` by a test-time
   encoder script in `docs/debug` (written once, output committed as a small fixture). It
   must parse identically to the `FWS` version.
2. **Implement the decoder** (default D6): `transcom/decompiler/swf/lzma.ts`, a range
   decoder plus LZ window, following the LZMA SDK spec. `ZWS` header: 4-byte compressed
   length, 5-byte properties, payload. The output is capped at the header's declared
   length.

### P-16 — ZIP and CWS limits
1. **Write the tests.**
   - A ZIP with one entry whose declared size exceeds the cap is rejected *before*
     inflation.
   - Truncation shows a Loader error.
   - A CWS whose inflated size exceeds the header length is cut and warned.
2. **Check before inflating.** Read each entry's declared uncompressed size
   (`entry._data.uncompressedSize`, the JSZip internal API, wrapped in one function with
   a test). Skip or refuse before `entry.async`. Rewrite the comment block to match the
   real behaviour.
3. **Make the limits visible.** Turn `MAX_ZIP_BYTES` into a real limit with a clear error,
   or remove it (the expanded-size cap is the meaningful one). Truncation becomes an
   `UploadProgress.onWarning`, shown in the Loader.
4. **Cap CWS output.** `inflate()` in `binary.ts` stops at `fileLength - 8` bytes.

### P-18 — project persistence
1. **Write the tests.**
   - Two different SWFs with the same name get separate projects.
   - A quota failure surfaces a visible notice.
   - An edit followed within 400 ms by a SWF switch is saved.
2. **Key by content.** The key becomes `swf-studio:project:<sha1 of SWF bytes>`, computed
   in the worker. The file name is stored inside the record. Migrate the old
   `swfforge:project:<name>` keys (D5).
3. **Make saving reliable.** The save path reports failure to the UI (a toast in the
   header). The debounce is flushed on `pagehide`, `visibilitychange` and SWF switch.
4. **Unify the prefix.** Every key moves under `swf-studio:` (`so`, `boot`, `dismissed`,
   `debugger`, `net`), with a one-time migration.

### P-20 — room relay
1. **Write the tests** in `server/engine-server.test.mjs`:
   - a connection with a disallowed `Origin` is refused;
   - with no token, the default bind is `127.0.0.1`;
   - chat ids are server-assigned.
2. **Harden the server.** Add `verifyClient` with an `ALLOWED_ORIGINS` env (default: same
   host). The default `HOST` is `127.0.0.1` unless `ROOM_TOKEN` is set. Chat `id` becomes
   `${userId}:${counter}` and `at` uses the server time.
3. **Fix the client URL.** In `src/lib/networkConfig.ts`, derive `wss:`/`ws:` from
   `location.protocol` and support a same-origin path (`/room`) that the preview or dev
   server can proxy. Add the Vite `server.proxy` entry for `/room`.

### P-03 (part b) — isolate game execution (default D3 = here)
1. **Run games in an iframe.** Execute renders the game in
   `<iframe sandbox="allow-scripts">` loaded from a `srcdoc` with a strict CSP. The
   transpiled program and the player run inside. Rendering stays inside the iframe canvas.
2. **Bridge it.** Logs, debugger, troubleshooter, Missing Dependencies and adapter network
   calls cross a typed `postMessage` RPC, `src/engine/bridge/`. The adapter network stays
   on the parent side, so game code never touches app storage.
3. **SharedObject.** Storage moves to the parent via the bridge, namespaced as today.
4. **Test it.** Inside the iframe, `parent.localStorage` and `top.document` are
   inaccessible (opaque origin). The existing Execute UI tests pass through the bridge.

**Phase 7 gate:** §0.1, plus a manual load-time measurement on pinball (before and after),
recorded in the commit.

---

## Phase 8 — Tier 2: clean actor code on `game-framework` (P-08)

Default D4: fishing first.

1. **Pick one model.** `src/game-framework` becomes the single actor model. Write an ADR in
   `docs/` that maps `types.ts Actor`/`RunActor` and `runtime/as2/actor.ts` concepts onto
   it.
2. **Run the Sandbox on it.** `GameEngine.tsx` instantiates framework actors from
   `Project.actors`, replacing `runActorTick` in `lib/render.ts`. Its UI tests must pass
   unchanged.
3. **Add an emitter stage,** `transcom/transpiler/actors/`:
   - **Input:** the AS2 project result (or the AVM2 lift), plus `actorHeuristics`
     proposals and Workbench labels.
   - **Output:** framework modules, one actor class per proposed actor:
     - animations from its timelines' labelled ranges;
     - behaviours from its frame scripts and event handlers (rewritten from `this._x` to
       `sprite.x`, as in the `tools/codemod` prototype, which this replaces);
     - signals for `_root` and global cross-actor writes;
     - systems for input and collision.
   - Code that cannot be expressed cleanly stays as a named 1:1 escape hatch, never
     silently dropped.
4. **Expose it in the Code Editor.** Add a "Clean (Tier 2)" tree next to the 1:1 output,
   plus a "Run clean" button that runs the emitted fishing actors in the Sandbox.
5. **Write tests.**
   - **Golden test:** fishing's main scene emits stable framework code.
   - **Behaviour test:** the emitted fishing actors reach the same observable states (cast
     → bite → reel) as the 1:1 run, driven by the same inputs.
   - **Lint:** `tools/lint/actors.mjs` is folded into a test (no runtime internals in
     actor code).
6. **Do pinball (AS3) second,** using the same emitter fed by the AVM2 lift.

**Done when:** fishing runs from emitted Tier-2 code in the Sandbox, and the two older
actor models are deleted.

---

## Phase 9 — Policy, hygiene, docs and polish

Covers **P-19, P-27 to P-34, P-36**.

| ID | Steps | Done when |
|---|---|---|
| **P-19** | 1. Delete `src/adapters/gaiaFishing/tools/ruffle-oracle/` and `gaia-capture/` (D2). 2. Port any dev script that does **not** use Ruffle (`appshot`, `probe-*` that drive our own app) to `docs/debug/tools/`. 3. Add a test asserting no tracked file outside `docs/audits/archive` depends on `ruffle`/`haxe` packages or loads `ruffle.js`. | `git grep -il "@ruffle-rs\|ruffle.js"` finds nothing outside the archive |
| **P-27** | 1. Add negative globs (`'!**/__tests__/**'`, `'!**/*.test.ts'`) in `CodeWorkspace.tsx` and `typescriptExport.ts`. 2. Make the raw engine sources lazy (`eager: false`) and load them when the Code Editor opens. 3. Add a test that checks `dist/index.html` has no `from 'vitest'`. 4. Record the bundle size. | the bundle contains no tests and the size drops ≥ 80 KB |
| **P-28** | 1. Pick the product name with you (default **SWF Studio**). 2. Apply it to `index.html`, the Loader, the header and storage keys (with P-18). 3. Make the workspace labels consistent ("Sandbox" everywhere, or "Game Engine" everywhere). 4. Update the Loader tagline to describe all four workspaces. | one name and one label set across the UI |
| **P-29** | 1. Fix every stale reference listed in P-29. 2. Add `docs/check-links.test.ts`, which extracts repo paths from tracked `.md` files and code comments and asserts they exist, excluding `docs/audits/archive`. 3. Rewrite the `docs/NEXT_STEPS.md` gate line from §0.1's real output. | the link test passes |
| **P-30** | 1. Write a root `README.md` (what it is, setup, scripts, corpus clone, links to `docs/`). 2. Add a LICENSE: ask you which one; none is assumed. 3. Add `.github/workflows/ci.yml` running tsc, vitest (no corpus) and the build. 4. Add eslint (flat config, `typescript-eslint`, `react-hooks`) with an `npm run lint` script, and fix or justify the 7 existing `eslint-disable` comments. 5. Move `ws` to `devDependencies`, or into a `server/package.json`. | CI is green on the branch |
| **P-31** | Delete `tools/codemod/` and `tools/lint/`, superseded in Phase 8. Label `tools/ffdec-export/` as study tooling in its README, or delete it if you prefer. | no orphaned scripts |
| **P-32** | This follows from Phases 6 and 8. Then split what remains: `lift.ts` into stack/CFG/structuring/names modules; `player.ts` into timeline/display/input/text; `binary.ts` into tags/shapes/bitmaps/sounds/fonts; `App.tsx` session state into a `useSession` reducer; `GameEngine.tsx`, `As2Execute.tsx` and `RunningTimelinesSidebar.tsx` into hooks plus views. Behaviour-neutral commits only. | no non-generated file over 1,000 lines |
| **P-33** | Build `scopeHint` lazily, only when a breakpoint or watch needs it. Replace `queue.shift()` with a head index. Add a micro-benchmark dev test that runs 10k queued actions. | the benchmark is ≥ 2× faster with the same behaviour |
| **P-34** | Resolved by the shared `guardedExecution` (P-22). Add a test: a breakpoint mid-queue, Continue, and the action order equals the order with no breakpoint; an exception in the resumed action reaches the Problems tab. | the test passes |
| **P-36** | Return the full health details only to loopback clients, or behind `PREVIEW_HEALTH_TOKEN`; public callers get `{status:"ok"}`. Gate Vite `allowedHosts: true` on an env var (`E2B_SANDBOX_ID` or `VITE_ALLOW_ALL_HOSTS`), otherwise use the default. | the server test covers both |

---

## 10. Tracking

The agent updates this table as each item lands (commit hash, date).

| ID | Phase | Status | Commit |
|---|---|---|---|
| P-01 | 1 | done 2026-10-15 | `d13900e` |
| P-03a | 1 | done 2026-10-15 | `f352959` |
| P-06 | 1 | done 2026-10-15 | `78abc38` |
| P-26 | 1 | done 2026-10-15 | `5196584` |
| P-21 | 2 | done 2026-10-15 | `5da10a1` — corpus resolver `src/testing/corpus.ts`; AVM2/ABC gates promoted to `src/**`; dumpers out of `npm test`; AS3 fixture movie. Without the corpus, failures 58 → 19 (all P-02 `game-files`) |
| P-02 | 2 | done 2026-10-15 | `a29cf4f` — sample read from the corpus (`fishing-swfs`, SHA-identical to the old bundle); bundled index optional (`BundledIndexState`); FFDec only via `SWF_FFDEC`; spec-based `lossless.test.ts` + `movies.ts`. 0 failures with the corpus (668 passed / 3 skipped) and without (595 / 34) |
| P-05 | 3 | done 2026-10-15 | `f4e48f8` — Workbench keys only while the Workbench is open and not already handled; its playback/audio stop outside it; game canvases stop propagation of their keys. `workspaceKeys.ui.test.tsx` (first full-App UI test) |
| P-35 | 3 | done 2026-10-15 | `d3ecb94` — one `resetSession()` (adapter pick, game set, filters, timeline/frame/playback/loop, selections, flattened sprites, error) used by "New folder" and every load. `newFolder.ui.test.tsx`; shared full-App harness `appHarness.tsx` |
| P-17 | 3 | done 2026-10-15 | `a2d09fa` — `decodeFormComponent` (Flash-tolerant: `+`, UTF-8 `%XX` runs, stray `%` literal) for loadVariables/LoadVars; `loadVariables` guarded. `src/engine/as2/__tests__/loadVars.test.ts` |
| P-09 | 3 | done 2026-10-15 | `ceba4e9` — tag 5 read as CharacterId, Depth (tag 28 unchanged). `src/lib/swf/removeObject.test.ts`; the corpus has no tag 5 |
| P-10 | 3 | done 2026-10-15 | `06fe615` — `parsePlace1` (tag 4: id, depth, MATRIX, optional CXFORM); Place/RemoveObject v1 are plain place/remove; tag names follow FFDec's tag classes (4, 13, 41, 62, 63, 66, 71, 91 added; 72 = `DoABCTag`, 82 = `DoABC2Tag` — the plan's `DoABCDefineTag` does not exist in FFDec, and 82 had been mislabelled). `src/lib/swf/placeObject.test.ts` incl. FFDec XML comparison; the corpus has no tag 4 |
| P-11 | 3 | done 2026-10-15 | `97fb168` — tag 17 = `DefineButtonSoundTag` (was mislabelled `DefineButtonCxformTag`, which is 23); `classify` puts both under `define`; `kindOfTag` no longer makes them buttons — in FFDec XML a `DefineButtonSoundTag` used to overwrite its button's attributes and rebuild its timeline from an empty record list. `SwfCharacter.buttonSounds` (shared `readSoundInfo`, which also fixes the StartSound envelope skip: EnvPoints is a u8 of 8-byte records) filled by both parsers. AS2: every enabled button is a mouse target (states and sounds need no script); `buttonEvent` plays IdleToOverUp on rollOver, OverUpToOverDown on press, OverDownToOverUp on release, OverUpToIdle on rollOut / releaseOutside, through a shared `startSound` (SyncStop, SyncNoMultiple, LoopCount, InPoint) also used by frame sounds. AS3 `SimpleButton` plays the same records. xml2swf / x2s: 17 and 23 corrected, a `DefineButtonSoundTag` writer, SOUNDINFO envelope written as FFDec names it. OutPoint and envelopes are parsed but not applied (no backend support). Tests: `src/lib/swf/buttonSound.test.ts`, `src/engine/as2/__tests__/buttonSound.test.ts`, `src/engine/flash/__tests__/buttonSound.test.ts`. The corpus has 286 buttons, none with sounds; DefineButton (tag 7) is still not registered by the binary parser |
| P-13 | 3 | done 2026-10-15 | FileAttributes (tag 69) decoded by both parsers into `header.as3` / `useNetwork` / `hasMetadata`, plus `header.source` (`swf` / `xml`); its frame-event detail is derived from the flags in FFDec's attribute order (was fixed text, right only for AS2 + UseNetwork). `chooseRuntime` (`src/components/runtimeChoice.ts`) replaces `isAs2Bundle`: the flag decides, a binary SWF without the tag is AVM1, and only FFDec XML without the tag keeps the old guess; both runtimes log `runtime: … — <rule>` in the Execute console. Tests: `src/lib/swf/fileAttributes.test.ts`, `src/components/__tests__/runtimeChoice.test.ts` (the three plan cases + the XML fallback), `runtimeChoice.ui.test.tsx` (end to end) |
| P-04 | 4 | open | |
| P-07 | 5 | open | |
| P-23 | 6 | open | |
| P-22 | 6 | open | |
| P-14 | 6 | open | |
| P-24 | 6 | open | |
| P-25 | 6 | open (unreadable DoABC payloads already reported, P-06) | |
| P-15 | 7 | open | |
| P-12 | 7 | open | |
| P-16 | 7 | open | |
| P-18 | 7 | open | |
| P-20 | 7 | open | |
| P-03b | 7 | open | |
| P-08 | 8 | open | |
| P-19 | 9 | open | |
| P-27 | 9 | open | |
| P-28 | 9 | open | |
| P-29 | 9 | open | |
| P-30 | 9 | open | |
| P-31 | 9 | open | |
| P-32 | 9 | open | |
| P-33 | 9 | open | |
| P-34 | 9 | open | |
| P-36 | 9 | open | |
| P-37 | 2 | done 2026-10-15 | `61436a3` — v1 RGB colormaps, big-endian PIX15, missing palette index → transparent/black; 3 failing-first spec tests in `lossless.test.ts`. Corpus: 1 v1 colormap bitmap (towns2) was wrong; no format-4 bitmaps |
| P-38 | 2 | done 2026-10-15 | `1254f08` — the AS2 player starts once the movie's (and external SWFs') embedded fonts are registered, instead of being rebuilt when they arrive; failing-first UI test holds font registration back until the game started (2 starts → 1) |

## 11. Risks and rollback

| Risk | Mitigation |
|---|---|
| P-01's `__global` routing changes how real games resolve names | Run the pinball and tiles corpus boots before and after; refusal counts are compared in the commit message. The change lives behind one lifter function, so a revert is one commit. |
| P-03a's guarded member reads slow AS2 hot paths | Only guarded names and computed keys go through the helper. The P-33 benchmark covers it. |
| P-02 option B makes default tests depend on an external repo | Corpus tests skip cleanly (P-21), and the committed AS3 fixture plus unit tests keep the default suite meaningful. |
| Phase 6 refactors break behaviour subtly | Each refactor commit must be behaviour-neutral, with the full gate (including the corpus) run per commit, not per phase. |
| Phase 7 iframe isolation breaks debugger and troubleshooter UX | The bridge is introduced behind a flag first. The flag flips only when all Execute UI tests pass through the bridge. |
| Tier-2 emitter scope grows | Only fishing is in scope until it runs end-to-end (D4). Anything not expressible stays as a named 1:1 escape hatch. |
