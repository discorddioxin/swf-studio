# SWF Studio — Problems

> Found during the code-base analysis of `main` @ `aaa927b` (2026-10-14). See
> [`APP_SUMMARY.md`](./APP_SUMMARY.md) for how the pieces fit together.
>
> Severity: **Critical** = security hole or the main path is broken · **High** = wrong
> behaviour users will hit, or a large stated goal is unmet · **Medium** = real defect with
> limited reach, or a structural risk · **Low** = hygiene, docs, polish.
>
> Every entry gives evidence (file:line, a command, or a reproduction) and a fix
> direction. Nothing here has been fixed yet; this document only records.

## Index

| ID | Sev | Area | Problem |
|---|---|---|---|
| [P-01](#p-01) | Critical | Security / AVM2 | ABC multiname strings are emitted verbatim → arbitrary JS runs when an AS3 SWF is opened in Execute |
| [P-02](#p-02) | Critical | Loading / tests | Bundled sample deleted from `main`: "Use bundled SWFs" fails with HTTP 404, 39 tests fail |
| [P-03](#p-03) | High | Security / AS2 | AS2 code escapes to JS `Function` via `constructor.constructor`; no isolation of game code |
| [P-04](#p-04) | High | Rendering | Filters and blend modes are parsed but never rendered by any renderer |
| [P-05](#p-05) | High | UI / perf | Workbench's global keyboard handler reacts to game input in Execute (Space starts hidden playback) |
| [P-06](#p-06) | High | AVM2 runtime | AS3 programs are linked 2–3×; static initializers run on tab mount, before Play |
| [P-07](#p-07) | High | Adapters | Adapters / offline network exist only on the AS2 path; AS3 games get none |
| [P-08](#p-08) | High | Tier 2 | `src/game-framework` (clean-code target) is not connected to any pipeline; three parallel actor models |
| [P-09](#p-09) | Medium | SWF parser | `RemoveObject` (tag 5) reads the character id as the depth |
| [P-10](#p-10) | Medium | SWF parser | `PlaceObject` (tag 4) is unnamed and silently ignored |
| [P-11](#p-11) | Medium | SWF parser / audio | Tag 17 mislabelled; `DefineButtonSound` unsupported (button sounds never play) |
| [P-12](#p-12) | Medium | SWF parser | LZMA-compressed SWFs (`ZWS`) are rejected |
| [P-13](#p-13) | Medium | Execute | AS2 vs AS3 runtime chosen by heuristic; `FileAttributes.ActionScript3` never read |
| [P-14](#p-14) | Medium | Architecture | Runtimes rely on module-level singletons; the engine imports the UI debugger store |
| [P-15](#p-15) | Medium | Performance | All parsing, encoding, transpiling and execution on the main thread (0 workers) |
| [P-16](#p-16) | Medium | Loading | ZIP size limits are ineffective; a zip bomb inflates before the check; truncation is silent |
| [P-17](#p-17) | Medium | AS2 builtins | `decodeVars` throws `URIError` on a stray `%`; `loadVariables` rejection is unhandled |
| [P-18](#p-18) | Medium | Persistence | Projects keyed by file name only; quota errors swallowed; last 400 ms of edits can be lost |
| [P-19](#p-19) | Medium | Policy | Ruffle tooling (an npm package depending on `@ruffle-rs/ruffle`) lives inside `src/` |
| [P-20](#p-20) | Medium | Security / network | Room relay has no Origin check and no auth by default; client builds `ws://` under HTTPS |
| [P-21](#p-21) | Medium | Tests | Corpus tests fail instead of skipping; 32 files hard-code `/tmp/swf-forge2`; dev dumpers in `npm test` |
| [P-22](#p-22) | Medium | Duplication | Three independent AVM1 decoders; duplicated guard/debugger code in both players |
| [P-23](#p-23) | Medium | Layering | `src` ↔ `transcom` import each other; compatibility facades; decompiler tests outside `transcom` |
| [P-24](#p-24) | Medium | Type safety | 582 `: any` + 69 `as any`; browser code type-checked with Node types; servers/tools untyped |
| [P-25](#p-25) | Medium | Error handling | 58 empty or comment-only `catch` blocks, several on game-execution paths |
| [P-26](#p-26) | Medium | Execute | AS2 boot script: arbitrary JS under one global key, runs for every game |
| [P-27](#p-27) | Low | Build | Production bundle ships ~81 KB of test sources; 1.95 MB single file, no splitting |
| [P-28](#p-28) | Low | UX / branding | "SWF Forge — JPEXS XML workbench" vs `swf-studio`; "Game Engine" vs "Sandbox" |
| [P-29](#p-29) | Low | Docs | Stale paths, numbers and descriptions in docs and code comments |
| [P-30](#p-30) | Low | Repo hygiene | No root README, LICENSE, CI or linter; 7 inert `eslint-disable` comments |
| [P-31](#p-31) | Low | Tools | Orphaned "P8" codemod/lint scripts; FFDec export wrapper kept in `tools/` |
| [P-32](#p-32) | Low | Maintainability | Very large files (six over 1,100 lines) |
| [P-33](#p-33) | Low | Performance | AS2 action queue builds a debug scope per action and uses `Array.shift` |
| [P-34](#p-34) | Low | Debugger | Breakpoint-resume path is provisional and swallows errors |
| [P-35](#p-35) | Low | App state | "New folder" keeps the adapter pick; it silently applies to the next game |
| [P-36](#p-36) | Low | Servers | Preview health endpoint exposes pid/memory; dev server `allowedHosts: true` |

---

## Critical

### P-01
**ABC multiname strings are emitted verbatim → arbitrary JavaScript execution.**

- **Where:** `transcom/transpiler/avm2/lift.ts:2420-2459`. In `reference()`, an unresolved
  global name falls through to `{ k: 'id', name }`. The printer emits it unchanged at
  `transcom/transpiler/avm2/emit.ts:879-885` (`case 'id': … return e.name`). Only `member`
  and object keys are identifier-checked (`emit.ts:902`, `959`).
- **Why it matters:**
  - A multiname is an arbitrary string from the SWF.
  - `src/engine/flash/loader.ts:89` runs each module with `new Function` in the app's origin.
  - `ExecuteTab.tsx:163` performs a *probe* `linkProgram` as soon as the Execute tab
    mounts, so **opening Execute is enough**; the user never has to press Play.
  - Even without injection, ordinary names like `window`, `document`, `fetch` and
    `localStorage` resolve to the real browser globals.
- **Reproduction:** run during this analysis as a throwaway Vitest file, since removed. A class whose `cinit` is
  `findpropstrict N; callpropvoid N 0`, where multiname `N` =
  `Object;globalThis.__pwned="yes";(function(){})`. The emitted TypeScript and the result:
  ```ts
  public static __cinit(): void {
    Object;globalThis.__pwned="yes";(function(){})();
    return;
  }
  // after linkProgram(compileSources(files)):  globalThis.__pwned === "yes"
  ```
- **Fix direction:**
  1. In the lifter or printer, refuse or escape every name that is not
     `/^[A-Za-z_$][\w$]*$/`. Emit `__global["…"]` for anything else.
  2. Never emit a bare free identifier. Route unresolved globals through an explicit
     global-scope object that contains only the AVM2 top level.
  3. Run transpiled game code in a sandboxed iframe or worker with a strict CSP (see P-03).
  4. Do not link the program on mount (P-06).

### P-02
**The bundled sample is gone from `main`, but the app and tests still depend on it.**

- **Where:** commits `e3914a5`, `d3bf8e1`, `ac6d291` and `95c4978` (2026-10-14) deleted
  `game-files/games`, `game-files/fish-full/swfs`, `game-files/manifest.json` and
  `fixtures/ffdec/gaia-fishing`.
- **Effects:**
  - **Loader.** `vite.config.ts:15` still sets `publicDir: 'game-files'`. The "Use bundled
    SWFs" button (`Loader.tsx:180`) is rendered unconditionally; `fetchGameIndex`
    failures are swallowed in the Loader (`Loader.tsx:93`). Clicking the button fails with
    `manifest.json: HTTP 404` (`src/lib/bundled.ts:76`).
  - **Uploads.** `App.mergeBundledExternals` logs `bundled externals unavailable` on every
    upload.
  - **Tests.** `vitest run` with the corpus present gives **39 failed / 351 passed / 9
    skipped** in 30 files. The causes are ENOENT on `game-files/fish-full` (25),
    `game-files/manifest.json` (13) and `fixtures/ffdec` (2). Failing files include:
    - `src/lib/swfLoading.test.ts` (6)
    - `transcom/transpiler/as2/__tests__/actorHeuristics.test.ts` (4)
    - `src/lib/swfFont.test.ts` (2), `src/lib/bundled.test.ts` (2),
      `src/engine/as2/__tests__/dependencies.test.ts` (2)
    - `swf-roundtrip`, `lossless-oracle`
    - gaiaFishing `sample`, `symbolLibraries`, `game421`, `chooserUi`
    - 18 `docs/debug` dev tests
  - **Collection.** Only 399 tests are collected, against 435 before the deletion.
  - **Standing rule.** This conflicts with "tests boot the real bundled SWFs, no mocks".
  - **Stale references.** These still point at the missing files:
    - `src/adapters/gaiaFishing/sample.ts:4-22`
    - `src/adapters/gaiaFishing/index.ts:2`
    - `src/adapters/gaiaFishing/tools/generate-bundled.mjs`
    - `src/lib/__tests__/bundledSet.ts:3-75`
    - `src/adapters/README.md:11-59`
    - `src/engine/as2/README.md:47`
    - `docs/NEXT_STEPS.md:4,35,94,102,108`
    - `docs/GAME_CHECKLIST.md:111`
    - `docs/debug/README.md:4,69-70`
    - `docs/debug/tools/{etdump,tagcmp,txtdump}.dev.mjs`
    - `docs/debug/tools/vitest/__actorStats.dev.test.ts`
- **Fix direction:** decide on the sample's home.
  - **Option A:** restore `game-files/` (or move it to Git LFS).
  - **Option B:** point the tests at the `swf-forge` corpus with `skipIf`, drop or
    make optional `publicDir` and the bundled button, and hide the button when
    `fetchGameIndex` fails.

  Then update every reference listed above.

---

## High

### P-03
**AS2 code can reach the JavaScript `Function` constructor; game code has no isolation.**

- **Where:** the AS2 emitter (`transcom/transpiler/as2/emit.ts`) correctly scopes free
  names (`fetch(…)` → `$t.fetch?.(…)`). Property chains pass through unchanged, though:
  `"".constructor.constructor("…")` transpiles to
  `"".constructor?.constructor?.("…")`, which is JavaScript's `Function`. That is
  arbitrary code, where real Flash's `Function` would not compile a string. Execution
  happens via `new Function` at `src/engine/as2/program.ts:90`.
- **Also:**
  - The debugger evaluates expressions and conditions with `new Function`
    (`src/debug/store.tsx:240,345`). That input is user-authored, so it's acceptable.
  - The whole app (projects, `SharedObject` data, debugger settings) shares one origin
    and one `localStorage` with untrusted game code.
- **Fix direction:**
  - Map `constructor`, `__proto__` and `prototype` access on host values through runtime
    helpers that return AS2 objects.
  - Longer term, execute games inside a sandboxed `<iframe sandbox="allow-scripts">`
    with a separate origin and a CSP, talking to the UI over `postMessage`.

### P-04
**Filters and blend modes are never rendered.**

- **Evidence:**
  - `PlaceOp.blendMode` and `hasFilters` exist (`src/types.ts:107-135`).
  - The parser skips filter lists (`transcom/decompiler/swf/binary.ts:973`,
    `skipFilterList`).
  - `src/lib/render.ts` has no reference to `blendMode` or filters.
  - `src/engine/as2/player.ts` has no reference to either.
  - `src/engine/flash/display.ts:146-148` stores `filters`, `blendMode` and
    `cacheAsBitmap` without using them.
  - `src/engine/flash/misc.ts:199` says explicitly: "Stored on DisplayObject.filters;
    not rendered".
  - In AS2, `flash.filters` is an empty object (`src/runtime/as2/index.ts:619`), so
    `new flash.filters.DropShadowFilter()` throws.
- **Impact:** drop shadows, glows, bevels, blurs, colour matrices and
  multiply/screen/add/erase/layer blends are all missing. These are common in Flash
  8+ UI art. This is the "visual wrongness" class you asked to prioritise.
- **Fix direction:**
  1. Parse filter lists into the data model instead of skipping them.
  2. Render with canvas `filter` or `shadow*` for blur, drop shadow and glow, and an
     offscreen pass for colour matrix and bevel.
  3. Map blend modes to `globalCompositeOperation`.
  4. Implement the AS2 `flash.filters.*` constructors.

### P-05
**The Workbench's global keyboard handler hijacks game input.**

- **Where:** `src/App.tsx:341-354` installs a `window` `keydown` handler: Space toggles
  `playing`, arrows step the frame, Home/End jump. It ignores only INPUT, TEXTAREA and
  SELECT targets, and it checks neither `workspace` nor `e.defaultPrevented`. The game
  canvases call `preventDefault()` but not `stopPropagation()`
  (`src/engine/as2/player.ts:1600`, `As2Execute.tsx:454`, `ExecuteTab.tsx:325`).
- **Impact:**
  - Pressing Space or an arrow in a running game also drives the hidden Workbench.
  - The playback effect (`App.tsx:290-315`) has no workspace guard. Once `playing` is
    toggled on, a `requestAnimationFrame` loop calls `setFrame` at the movie frame rate.
    That re-renders the entire App tree, including the live Execute tab (not memoised),
    for the rest of the session.
  - If "Audio on" was enabled, frame sounds also play over the game
    (`App.tsx:317-339`).
- **Fix direction:**
  - Install the handler only while `workspace === 'workbench'`, and return early on
    `e.defaultPrevented`.
  - Stop playback when leaving the Workbench.

### P-06
**AS3 programs are linked repeatedly; static initializers run before Play.**

- **Where:**
  - `ExecuteTab.tsx:162-185`: `compileSources` → `linkProgram` (probe). When dependencies
    exist, it compiles and links a second time.
  - `ExecuteTab.tsx:218`: the player then links again
    (`program: () => linkProgram(code.compiled)`).
  - Every link evaluates every module, and modules end with `X.__cinit();` (see the P-01
    output).
- **Impact:**
  - Class static initializers and script-init code run two or three times, the first
    time just because the tab opened.
  - Side effects on the shared `flash.*` packages (`resolveFlash`), on `SharedObject` and
    on timers are duplicated.
  - Pinball-sized programs (435 classes) pay the evaluation cost several times.
- **Fix direction:**
  - Answer "does it link / which classes resolve" statically from the transpile result
    (class tables, imports) instead of executing.
  - Link exactly once, when the player starts.

### P-07
**Game adapters and the offline network are not available to AS3 games.**

- **Where:** `resolveAdapter` is used only in `src/components/As2Execute.tsx:124`. The
  `fetchText` and `gameServer` hooks exist only in `src/engine/as2/player.ts:239-265`.
  `As3Execute` receives no adapter, and `URLLoader` reaches the player through
  `runtime.player as unknown as { loadUrl? }` (`src/engine/flash/misc.ts:115`).
- **Impact:** a networked AS3 game, such as Pinball's GSI gateway
  `http://null.gaiaonline.com/chat/gsi/gateway.php`, cannot be served by a mock. The
  paused Pinball mock-server task needs this first. `NetConnection` and `Socket` have no
  backend either.
- **Fix direction:**
  - Lift the adapter network interface to a player-agnostic type in `src/adapters/types.ts`.
  - Accept it in `FlashPlayer` options (`URLLoader`, `Socket`/`XMLSocket`, `NetConnection`).
  - Resolve adapters in `ExecuteTab` for both paths.

### P-08
**Tier 2 (clean actor code) is an island; three parallel actor models.**

- **Evidence:**
  - Nothing outside `src/game-framework/` imports it: `grep -rn game-framework src
    transcom tools` finds only its own files. That's 1,359 source lines plus tests.
  - No transpiler emits code against it.
  - Meanwhile, two other actor models exist:
    1. `types.ts` `Actor`/`RunActor` + `GameEngine.tsx` + `lib/render.ts runActorTick`
       (the Sandbox);
    2. `src/runtime/as2/actor.ts` (the in-host AVM1 bridge).
  - `docs/GAME_FRAMEWORK.md` describes the framework as the target that "the AVM1 and
    AVM2 transcriptions both aim at".
- **Impact:** the stated deliverable ("actual actors who have behaviors, animations, and
  who communicate … through proper systems") is not produced for any game. The three
  models will keep diverging.
- **Fix direction:**
  - Pick `game-framework` as the single model.
  - Make the Sandbox run on it.
  - Add an emitter stage (AS2 project and AVM2 lift → framework actors), starting from
    the `actorHeuristics` proposals.

---

## Medium

### P-09
**`RemoveObject` (tag 5) is decoded with the `RemoveObject2` layout.**

- **Where:** `transcom/decompiler/swf/binary.ts:1545-1551` reads `depth = u16()` from
  offset 0 for every tag classified as `remove`. `classify` matches both
  `RemoveObjectTag` and `RemoveObject2Tag` (`transcom/decompiler/parser.ts:226`).
- **Spec:** tag 5 is `CharacterId u16, Depth u16`; tag 28 is `Depth u16`.
- **Impact:** in SWFs that use tag 5, the wrong depth is removed. The intended object
  stays on stage, and an unrelated one may vanish.
- **Fix:** for `tag.type === 5`, skip 2 bytes before reading the depth. Add a unit test.

### P-10
**`PlaceObject` (tag 4) is ignored.**

- **Where:** `TAG_NAMES` (`binary.ts:17-37`) has no entry for 4, so it becomes `Unknown4`,
  is classified `other` and never reaches `parsePlace2`. Tags 13 (`DefineFontInfo`), 62
  (`DefineFontInfo2`), 72 (`DoABCDefine`, handled by number only at `binary.ts:1761`) and
  91 (`DefineFont4`) are also unnamed.
- **Impact:** objects placed with PlaceObject v1 (SWF 1–2, and some generators) never
  appear.
- **Fix:** name the tags and add a `parsePlace1` (CharacterId, Depth, Matrix, optional
  CXFORM without alpha).

### P-11
**Tag 17 is mislabelled, and button sounds are unsupported.**

- **Where:** `binary.ts:21-22` maps both 17 and 23 to `'DefineButtonCxformTag'`. Per the
  SWF spec, 17 is **DefineButtonSound**. Nothing parses DefineButtonSound (`grep -n
  "DefineButtonSound\|case 17" transcom src/engine/as2` finds nothing). Separately,
  `classify` treats `DefineButtonCxform` (a colour transform) as an `action` event
  (`parser.ts:230`).
- **Impact:** button over, down and up sounds never play in AS1/AS2 games. The tag list in
  the Workbench shows the wrong name.
- **Fix:**
  - Correct the name.
  - Parse the four sound records per button.
  - Play them on button state transitions in `AS2Player`.
  - Classify `DefineButtonCxform` as `define`.

### P-12
**LZMA-compressed SWFs (`ZWS`) are rejected.**

- **Where:** `binary.ts:1166-1167`: `throw new Error('LZMA-compressed SWF (ZWS) is not
  supported')`.
- **Impact:** SWFs published with LZMA compression (Flash CS6+ / Flex SDK option, SWF 13+)
  can't be opened at all.
- **Fix:** add a small LZMA decoder; the format is the 5-byte LZMA properties header with
  the SWF's own sizes.

### P-13
**The AS2 vs AS3 runtime is chosen by heuristic.**

- **Where:** `As2Execute.tsx:60-61`: `isAs2Bundle` = has `.as` files && (version ≤ 8 ||
  no SymbolClass). `FileAttributes` (tag 69) is never decoded for its ActionScript3 bit
  (`grep -rni actionscript3 src transcom` finds nothing).
- **Impact:**
  - An AVM1 movie with no scripts goes to the AS3 path.
  - An AS3 movie with no SymbolClass, or with stray `.as` files in the upload, can land on
    the AS2 path.
- **Fix:** record `header.as3 = (FileAttributes flags & 0x08) !== 0`, and dispatch on that
  first.

### P-14
**Runtimes depend on module-level singletons.**

- **Evidence:**
  - `RT.installHost` / `uninstallHost` (`src/runtime/as2/index.ts:102`)
  - `setAvm1Env` (`src/runtime/as2/avm1.ts:50`)
  - the static `_constructStack` on the AS2 `MovieClip`, `Button` and `TextField`
    (`index.ts:511,525`)
  - `runtime.player` in `src/engine/flash/*`
  - `globalDebugger` imported into the engine from the UI layer
    (`src/engine/as2/player.ts:38`; `src/debug/store.tsx`)
- **Impact:** only one player per page can run correctly; tests and pop-outs share state.
  The engine can't be used headless without the debugger UI module.
- **Fix:** pass a context object (host, AVM1 env, debugger port) into the player and the
  generated code; move the debugger interface into the engine as a plain port.

### P-15
**Everything runs on the main thread.**

- **Evidence:** `grep -rn "new Worker" src transcom` finds 0 results. `parseSwfBinary`
  (including PNG encoding with zlib), AVM1/ABC lifting, sucrase compilation and linking
  all run on the UI thread during load or when Execute opens.
- **Impact:** large SWFs (pinball: 435 classes, 3,690 method bodies) freeze the page for
  seconds, and progress messages can't repaint (`swfLoading.ts:76` needs a 30 ms
  `setTimeout` just to paint the busy text).
- **Fix:** move parsing and transpiling into a Web Worker. The data model is structured-clone
  friendly apart from `File` objects.

### P-16
**The ZIP limits are ineffective.**

- **Where:** `src/lib/assets.ts:151-200`.
  - `MAX_ZIP_BYTES` only logs a warning. The comment claims sequential streaming, but
    `JSZip.loadAsync(file)` loads the whole archive.
  - `MAX_EXPANDED_BYTES` is checked **after** `entry.async('blob')` has fully inflated an
    entry, so one highly compressed entry is inflated into memory before any check.
  - Truncation is reported only through `console.warn`, after which the game shows
    "missing dependencies" with no explanation.
  - CWS inflation (`binary.ts:391-456`) has no cap against the header's declared length
    either.
- **Fix:**
  - Check each entry's declared uncompressed size before inflating.
  - Surface truncation in the Loader error area.
  - Cap CWS output at the header's declared file length.

### P-17
**A malformed `%` in URL-encoded data breaks loading.**

- **Where:** `src/engine/as2/builtins.ts:309-317`: `decodeURIComponent` throws `URIError`
  on input like `score=100%`. In `loadVariables` (`builtins.ts:263-269`) the throw happens
  inside an unguarded `.then`: an unhandled rejection, the `data` clip event never fires,
  and the queue doesn't run. `LoadVars` (`lvRequest`, `builtins.ts:815-829`) is guarded, so it logs an
  error and `onLoad` is never called.
- **Flash behaviour:** `unescape`-style decoding is tolerant.
- **Fix:** use a tolerant decoder (`try { decodeURIComponent } catch { unescape }`), and
  guard `loadVariables`.

### P-18
**Project persistence problems.**

- **Where:** `src/lib/project.ts:4-41`.
  - Key = `swfforge:project:<file name>`, so two different SWFs named `main.swf` share
    labels, clips and actors.
  - `setItem` failures (quota) are swallowed (`catch { /* quota */ }`), and the user gets
    no warning that work isn't being saved.
  - The 400 ms debounce is cancelled, not flushed, on SWF switch or tab close.
  - Storage keys mix three conventions under two brands (`swfforge:`, `swf-studio.`,
    `swf-studio:`, `swf-debugger`); see APP_SUMMARY §8.
- **Fix:**
  - Key projects by a content hash (for example SHA-1 of the SWF bytes) with the file name
    as a label.
  - Show a toast on save failure.
  - Flush on `visibilitychange` / `pagehide` and on SWF switch.
  - Unify the key prefix.

### P-19
**Ruffle tooling inside `src/` conflicts with the "no haXe / Ruffle" rule.**

- **Where:** `src/adapters/gaiaFishing/tools/ruffle-oracle/`, a nested npm package
  (`package.json` and `package-lock.json` depend on `@ruffle-rs/ruffle ^0.6.0`;
  `oracle.html:10` loads `/ruffle/ruffle.js`). There's also `.../gaia-capture/capture.mjs`,
  which drives Ruffle. Together that's about 30 `*.dev.mjs` scripts living under `src/`.
- **Rule:** "There should be no use of haXe or Ruffles in this app. Those sources should
  only be used for studying." The app bundle doesn't import these, but they're Ruffle
  *usage* in the repo, and they also contradict the restructure that moved developer
  tooling to `docs/debug/`.
- **Fix:** delete them, or move them out of the repo (or at least out of `src/`) and drop
  the Ruffle dependency.

### P-20
**The multiplayer relay is open by default.**

- **Where:** `server/engine-server.mjs`.
  - There's no `Origin` check on the WebSocket upgrade (`new WebSocketServer({ port,
    host })`, line 97), so any web page the user visits can connect.
  - Authentication is optional (`ROOM_TOKEN` defaults to `''`), and the server binds
    `0.0.0.0`.
  - The client default is `ws://${location.hostname}:8787` (`src/lib/networkConfig.ts:6-9`).
    Browsers block that as mixed content when the app is served over HTTPS (for example
    the preview host), and the port isn't proxied there.
  - Chat `id` and `at` are client-controlled, so message ids can be spoofed.
- **Fix:**
  - Add `verifyClient` with an origin allow-list.
  - Bind to `127.0.0.1` unless a token is configured.
  - Derive `wss://` from `location.protocol` and support a same-origin path proxy.
  - Assign chat ids server-side.

### P-21
**The test infrastructure depends on undeclared external state.**

- **Evidence:**
  - Without the corpus there are 53 failures, versus 39 with it: 14 corpus-dependent
    `docs/debug` dev tests fail with ENOENT instead of skipping.
  - 32 files hard-code `/tmp/swf-forge2`. `uploadedCorpus.dev.test.ts:22-24` probes three
    other locations (`/tmp/swf-forge`, `../../../../../swf-forge`, `~/swf-forge`).
  - The 52 developer dumpers in `docs/debug/tools/vitest` run with the default `npm test`
    (`vite.config.ts` `test.include`).
  - AVM2 end-to-end coverage exists only in those corpus tests.
- **Fix:**
  - Use one `SWF_CORPUS` resolver module with `describe.skipIf(!corpus)`.
  - Exclude `docs/debug` from the default `include`; `test:debug` already exists.
  - Add a small committed AS3 fixture so CI covers the AVM2 path.

### P-22
**Duplicated core logic.**

- **AVM1 decoding happens three times, independently:**
  - the interpreter `src/runtime/as2/avm1.ts` (about 100 opcode cases, no imports);
  - the lifter `transcom/transpiler/as2/avm1.ts` (about 43 cases, no imports);
  - `decodeActionBytes` in `transcom/decompiler/parser.ts:311`.
  
  Operand decoding and opcode semantics can drift.
- **Players:** `engine/as2/player.ts` and `engine/flash/player.ts` each implement their own
  guard → breakpoint → pause/resume → report-problem logic (compare `as2/player.ts:430-506`
  with `flash/player.ts:496-545`).
- **Actor models:** see P-08.
- **Fix:**
  - Extract one AVM1 action-record reader shared by all three consumers.
  - Extract a `GuardedExecution` helper used by both players.

### P-23
**The layers depend on each other in both directions.**

- **Evidence:**
  - `transcom` imports `src`: `src/types` (4), `src/engine/flash/packages` (2, from the
    AVM2 transpiler), `src/lib/swfFont`, `src/engine/as2/adpcm`. The *decompiler* depends
    on the *engine*.
  - `src` imports `transcom` from 14 places.
  - Compatibility facades `src/lib/parser.ts` and `src/lib/swf/{abc,binary,bitio,shapeSvg}.ts`
    are 1–2-line re-exports, still imported by 5 files.
  - `transcom/decompiler` has 0 tests of its own; its tests sit in `src/lib/swf/`.
  - `vite.config.ts` `test.include` covers `transcom/transpiler/**` but **not**
    `transcom/decompiler/**`, so a test added there would never run.
- **Fix:**
  - Move `types.ts`, `swfFont`, `adpcm` and the flash package table into a shared `core/`
    (or into `transcom`).
  - Import directly and delete the facades.
  - Move the decompiler tests next to the code and widen `include`.

### P-24
**Type safety is eroded.**

- **Evidence:**
  - 582 `: any` and 69 `as any` in non-test code, mostly in `src/engine/as2/builtins.ts`
    (311), `src/runtime/as2/avm1.ts` (180), `src/runtime/as2/index.ts` (64) and
    `src/engine/as2/player.ts` (33).
  - Casts like `(dbg as any).popFrame?.()` (`as2/player.ts:433`), `(dbg as any).clearSkip?.()`
    (`ExecuteTab.tsx:209`) and `(RT as any).uninstallHost?.()` (`as2/player.ts:649`) call
    methods that do exist (`debug/store.tsx:224,373,377`; `runtime/as2/index.ts:102`). The
    debugger's exported type is incomplete.
  - `tsconfig.json` sets `"types": ["node"]` for browser code, so `process`, `Buffer` and
    friends type-check in shipped code. That is how the earlier Pinball "process is not
    defined" bug got past `tsc` (now guarded only by `browserLift.test.ts`).
  - `server/`, `tools/` and `docs/debug/` are outside the `tsconfig` `include`.
- **Fix:**
  - Use separate `tsconfig`s for browser (`lib: DOM`, no node types) and Node (servers,
    tools, tests).
  - Type the AVM1 value model (`AVM1Value` union) and the builtin host.
  - Complete the debugger store type and drop the casts.

### P-25
**Errors are swallowed on game paths.**

- **Evidence:** 24 empty `catch {}` and 34 comment-only catches. Examples on execution paths:
  - `src/engine/as2/player.ts:482`: the resumed action after a breakpoint
  - `player.ts:506`: the break-on-exception setup
  - `player.ts:725`: the scope snapshot
  - `player.ts:649-658`: teardown
  - `src/components/As2Execute.tsx:145`: `try { p.render(); } catch {}`
  - `As2Execute.tsx:415`
  - `src/engine/flash/player.ts:496,515,523,543`
- **Impact:** game faults and engine bugs vanish without a console entry, which undermines
  the Problems tab and your "resolve at the root, never by silencing" rule.
- **Fix:** route every catch through `reportProblem` or `log('warn', …)`. Keep silent
  catches only for `localStorage` availability.

### P-26
**The AS2 boot script runs everywhere.**

- **Where:** `As2Execute.tsx:29,101,198,290-325`. A free-form JavaScript snippet is stored
  under the single key `swf-studio.as2.boot` and executed via `new Function('_root',
  'player', '_global', bootCode)` on every game start.
- **Impact:** a boot script written for one game (for example a fishing preset) silently
  runs against every other game, and it's an always-on code-injection point persisted in
  storage.
- **Fix:** key it by game or adapter, show a visible "custom boot script active" badge, and
  default to off for games without a preset.

---

## Low

### P-27
**The production bundle carries test sources.** `CodeWorkspace.tsx:23-27` globs
`../engine/as2/**/*.ts`, `../runtime/as2/**/*.ts` and
`../../transcom/transpiler/as2/**/*.ts` eagerly with `?raw`. The `__tests__` files are
filtered out only at runtime (`CodeWorkspace.tsx:30`), so about 81 KB of test code ships:
`dist/index.html` contains 11 `from 'vitest'` imports. The app is a single 1.95 MB HTML
file with no code splitting, and the Code Editor's raw sources load even when that
workspace is never opened.
**Fix:** add negative globs (`'!**/__tests__/**'`, `'!**/*.test.ts'`); make the raw sources
`eager: false`.

### P-28
**Branding is inconsistent.**
- `index.html:6` says "SWF Forge — JPEXS XML workbench".
- The Loader heading is "SWF Forge" (`Loader.tsx:114`) and its tagline describes only
  inspection and JSON export.
- The header says "SWF Forge · asset workbench" (`App.tsx:426-427`).
- The repo and package are `swf-studio`.
- The workspace button "Sandbox" (`App.tsx:441`) is labelled "Game Engine" in
  `WORKSPACE_LABEL` (`App.tsx:30`) and in error boundaries.

### P-29
**Docs and comments are stale.**
- `transcom/decompiler/swf/binary.ts:4` names `tests/swf-roundtrip.test.ts`; the file is
  actually `src/lib/swf/swf-roundtrip.test.ts`.
- `src/debug/breakpointMatch.ts:11` and its test cite `src/timelines/root.ts`, which
  doesn't exist.
- `src/engine/as2/player.ts:439` cites `debug/breakpointMatch.ts`; the path is
  `src/debug/…`.
- `docs/NEXT_STEPS.md`:
  - line 4: its "Gate" line reports `vitest 51/3 · 227/3`, `madge` and `game-files 0 diff`;
    current numbers are in P-02.
  - lines 19 and 94: they cite `tools/generate-bundled.mjs`, which lives under
    `src/adapters/gaiaFishing/tools/`.
  - line 99: it cites example paths `src/lib/foo.test.ts` and `foo.ui.test.tsx`.
- `docs/debug/README.md:64` cites `tools/swf-dump/dump.mjs`; the path is
  `docs/debug/tools/swf-dump/`.
- `docs/debug/tools/vitest/zz_names.dev.test.ts:45` cites `src/__globals.d.ts`.
- The `ExecuteTab.tsx:1-2` header says AS2 games are "FFDec .as export", and
  `src/engine/as2/program.ts:2` says the same. Both now run straight from SWF bytecode.
- Inspector headers cite the archived "DECOMPOSITION_SPEC phases".
- `src/engine/as2/player.ts:41` keeps a "re-exported for backward compat" block.
- `docs/GAME_CHECKLIST.md:111` describes `fixtures/ffdec/gaia-fishing/`, which was
  deleted.

### P-30
**Repo hygiene is missing.** There's no root `README.md` (setup, scripts, corpus clone), no
`LICENSE`, no CI workflow (`.github/` is absent), and no linter. The 7 `eslint-disable`
comments are inert because eslint isn't a dependency. `ws` is listed under runtime
`dependencies`, though only `server/` uses it.

### P-31
**Some tools are orphaned.** `tools/codemod/moveTimelineAction.mjs` and
`tools/lint/actors.mjs` (both headed "P8") aren't referenced by any npm script, test or
doc. `tools/ffdec-export/export.sh` wraps the external FFDec CLI, which contradicts the
SWF-only direction ("never depend on externally supplied `.as` / FFDec exports"). It's fine
as a study aid, but should be labelled as such.

### P-32
**Some files are very large.**

| File | Lines |
|---|---|
| `transcom/transpiler/avm2/lift.ts` | 2,709 |
| `src/engine/as2/player.ts` | 1,976 |
| `transcom/decompiler/swf/binary.ts` | 1,827 |
| `src/runtime/as2/avm1.ts` | 1,352 |
| `src/components/uiTroubleshooter/scan.ts` | 1,231 |
| `src/adapters/gaiaFishing/gameServer.ts` | 1,141 |

`GameEngine.tsx` (898), `As2Execute.tsx` (786) and `RunningTimelinesSidebar.tsx` (742)
mix state, effects and view. `App.tsx` holds about 40 `useState` hooks for the whole session.

### P-33
**The AS2 action queue has hot-path overhead.** `src/engine/as2/player.ts:700-725`:
`runQueue` builds a `scopeHint` for **every** action, copying up to 20 properties of the
clip, even when no debugger is attached. It also uses `this.queue.shift()`, which is
O(n) per action. Build the scope lazily (only when a breakpoint matches) and use an index
cursor.

### P-34
**The breakpoint-resume path is provisional.** `src/engine/as2/player.ts:465-486` (note at line 470) carries
a "For now, just pause…" design note. Each pause adds a store subscription. The resumed
action runs inside `try { … } catch {}`, so an exception thrown by the resumed action is
lost. Guards called outside the queue (direct event handlers) are deferred, so they run
out of their original order relative to code that ran in the meantime.

### P-35
**"New folder" keeps the adapter pick.** The button (`App.tsx:490-495`) resets packages and
documents but not `adapterId` (or `gameSetId`, `filters`). An explicit adapter pick wins
over detection (`src/adapters/index.ts:28-32`), so choosing "Gaia Fishing" once forces that
adapter on the next, unrelated game.

### P-36
**Servers expose minor information.** `/__preview_health` (`server/preview-server.mjs:58`)
publicly reports pid, RSS and heap. `vite.config.ts` sets `allowedHosts: true` with
`host: '0.0.0.0'`. That's required for the sandbox preview, but it disables Vite's
DNS-rebinding protection elsewhere, so it should be environment-gated.

---

## Suggested order of work

| Step | Items | Effort | Risk |
|---|---|---|---|
| 1 | P-01, P-03 (name sanitising, `constructor` guard), P-06 (stop linking on mount) | S–M | Low: emitter and runtime-helper changes, covered by transpiler tests |
| 2 | P-02 (restore or relocate the sample, fix references, skip-if-absent), P-21 | S | Low |
| 3 | P-05, P-35, P-17, P-09, P-10, P-11, P-13 | S each | Low |
| 4 | P-04 (filters and blend modes, starting with drop shadow, glow and blur) | M–L | Medium: renderer-wide |
| 5 | P-07 (adapters for AS3), then resume the Pinball mock server | M | Medium |
| 6 | P-14, P-22, P-23, P-24, P-25 (architecture clean-up) | L | Medium: broad refactors |
| 7 | P-15 (worker), P-12 (LZMA), P-16, P-18, P-20, P-26 | M each | Low–Medium |
| 8 | P-08 (Tier 2 emitter onto `game-framework`) | L | High: new subsystem |
| 9 | Low items (P-27 … P-36), P-19 | S | Low |
