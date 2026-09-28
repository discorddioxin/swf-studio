# Code Audit: `CodeInspector` subsystem

| | |
|---|---|
| **Repository** | `discorddioxin/swf-studio` |
| **Base commit** | `8d9ace1` (main, "Initial commit") |
| **Branch** | `arena/01a0e624-swf-studio` |
| **Date** | 2026-09-28 |
| **Scope** | Everything behind the two "Code Inspector" surfaces, plus the code that feeds them |
| **Status** | All 23 findings are **fixed** and covered by tests. The §6 limitations and §7 observations were resolved in a follow-up pass (§8). What still remains is listed in §8.4 |

---

## 1. Executive summary

The Code Inspector is the static ActionScript indexer. The Inspector's **Code** tab uses it in a side panel, and the **Code** workspace uses it full screen. It lists methods and members, and links code to other code and to assets. The audit found problems at every layer:

* **It could crash the whole app.** If any ActionScript defined a function named `toString`, `constructor`, `valueOf` and so on, `analyzeCodebase` threw a `TypeError`. There is no React error boundary, so opening the Code workspace gave a blank screen (CI-05).
* **Its index was wrong for common inputs.** It found **zero** methods in AS2/AS3 code with return types (`function f():Void {}`), **zero** typed variables (`var x:Number = 1`) and no nested handlers. A single `// function old() {` comment made it skip the real code after it. A `"}"` inside a string cut a function body short (CI-01, 03, 04, 06).
* **Its relationships were misleading.** Reads and writes were misclassified (`score == 10` was not a read, `score += 1` was not a write). Every local `var i` became a global "member" that created false edges. All reference line numbers pointed at the definition, not the usage (CI-07, 08, 09).
* **It could show the wrong source.** The script loader in *both* UIs could keep showing the **previous folder's** source, or stay on "Loading…" forever (CI-12, 13). A resolver fallback attached one sprite's `DoAction.as` to *other timelines'* frames and overwrote their code (CI-15).
* **It was slow.** Analysis was quadratic: 2.7 s for a 15k-line script, and the full-screen view re-ran it once per loaded file (CI-10, 13).
* **The build was broken.** `tsc --noEmit` failed with 18 errors. The decomposition had copied `CodePanel` into `inspector/CodePanel.tsx` but never removed the original from `Inspector.tsx`, so the new file was dead code that didn't type-check (CI-14).

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | CI-05 |
| High | 8 | CI-01, CI-03, CI-06, CI-10, CI-12, CI-13, CI-14, CI-15 |
| Medium | 8 | CI-02, CI-04, CI-07, CI-08, CI-09, CI-16, CI-17, CI-19 |
| Low | 5 | CI-11, CI-18, CI-20, CI-21, CI-22 |

---

## 2. Scope and architecture

```
App.tsx ─ workspace "code" ─▶ components/CodeInspectorView.tsx ─▶ lib/codeInspector.ts :: analyzeCodebase()
Inspector.tsx ─ tab "Code" ─▶ components/inspector/CodePanel.tsx ─▶ components/CodeInspector.tsx
                                                                 └▶ lib/codeInspector.ts :: analyzeCode()
both ─▶ lib/assets.ts :: resolveActionScriptFile / resolveAssetFile   (JPEXS scripts/…/*.as lookup)
```

Files reviewed line by line: `src/lib/codeInspector.ts`, `src/components/CodeInspector.tsx`, `src/components/CodeInspectorView.tsx`, `src/components/inspector/CodePanel.tsx`, the `CodePanel` copy in `src/components/Inspector.tsx`, the ActionScript resolution in `src/lib/assets.ts`, and the demo data in `src/lib/demo.ts`.

### Method

1. **Baseline:** `npm ci`, `tsc --noEmit`, `vitest run`, `vite build`.
2. **Static review** of each file in scope.
3. **Empirical probes:** each suspected analyzer bug was reproduced with a small script against the *original* `codeInspector.ts` before any change (evidence in §3).
4. **UI reproduction:** the real React components were rendered in jsdom (Testing Library) with the app's own demo dump. Every UI finding was confirmed failing on the original code and passing after the fix (§5).
5. **Fix, then add regression tests** for each analyzer finding. The tests were run against the original implementation to confirm they fail there: 22 of 23 fail; the remaining one pins down existing behaviour.

### Baseline

| Check | Before | After |
|---|---|---|
| `tsc --noEmit` | ❌ 18 errors (`inspector/CodePanel.tsx`) | ✅ 0 errors |
| `vitest run` | ✅ 13 tests (clock only) | ✅ 39 tests (clock + 23 analyzer + 3 resolver) |
| `vite build` | ✅ (Vite does not type-check) | ✅ |

---

## 3. Findings

Each finding lists its location in the *original* code, the evidence, the impact and the fix. Probe output is quoted verbatim from the run against the original implementation.

### CI-05 · Critical · Crash on symbol names that exist on `Object.prototype`
**Where:** `lib/codeInspector.ts` `analyzeCodebase` (`byName`, `assetIndex`) and `analyzeCode` (`assetIndex`). These were plain `{}` objects used as dictionaries: `(byName[s.name] ??= {…}).definitions.push(…)`.
**Evidence:** for `byName['toString']`, the lookup returns the inherited `Object.prototype.toString`, so `??=` never assigns and `.definitions` is `undefined`:
```
P5 toString THROWS Cannot read properties of undefined (reading 'push')
```
UI reproduction on the original code: rendering `CodeInspectorView` with a frame containing `function toString() {}` gave `TypeError: Cannot read properties of undefined (reading 'push')`. There is no error boundary, so the whole app unmounts. `CodeInspectorView.refCount()` had a second crash path (`byName[name]?.references.length` where `byName[name]` is a function).
**Impact:** one common method name (`toString` is idiomatic in AS2/AS3 classes) blanks the entire Code workspace.
**Fix:** all name-keyed indexes are now created with `Object.create(null)` (a `dict<T>()` helper).

### CI-01 · High · Functions with return types were never indexed
**Where:** `analyzeSource` first pass: `/function\s+(\w+)\s*\(([^)]*)\)\s*\{/`. Nothing may sit between `)` and `{`.
**Evidence:** `public function move(dx:Number):void {…}` and `function f():Void {}` → `P1 typed return []`.
**Impact:** JPEXS emits return types for AS3 and for AS2 classes, so the Methods list is empty for that code and every call/relationship through those methods is lost. Getters/setters (`function get hp()`) were also missed.
**Fix:** a single definition scanner that accepts an optional `:Type` (including `:*`, `:Vector.<T>`) and `get`/`set` accessors.

### CI-03 · High · Comments and string literals were parsed as code
**Where:** `extractBalanced` counted every `{`/`}`; the definition regexes ran over raw text.
**Evidence:**
```
P3  brace in string   function a(){ trace("}"); heroBall.play(); }  →  a ends at line 2, assetRefs []
P3b fn in comment     // function ghost() {  \n function real() {}    →  ["ghost"]   (real() is lost)
```
**Impact:** bodies get cut short, which loses their asset references. Commented-out code shows up as live methods, and because its unbalanced `{` swallows the rest of the file, *real* definitions vanish. Asset names mentioned only in comments counted as references.
**Fix:** `maskSource()` builds two length-preserving copies of the source. In `code`, comments and string contents are blanked; it is used for braces, definitions, calls and read/write edges. In `text`, only comments are blanked; it is used for asset references, which are often string literals (`attachMovie("hero")`). Because indexes are preserved, line numbers stay exact.

### CI-06 · High · Typed, uninitialised, modified and `const` members were missed
**Where:** member pass: `/^var\s+(\w+)\s*=\s*(.+?);?$/`.
**Evidence:** `var speed:Number = 5; var hp; private var _x:int = 0; static const MAX:int = 3;` → `P6 typed var []`. The `'const'` member kind in the public type could never be produced.
**Fix:** a declaration regex that handles modifiers (`public|private|protected|internal|static|override|final|dynamic|native`), `var|const`, type annotations and an optional initializer. Trailing comments are stripped from `value`.

### CI-10 · High (performance) · Quadratic analysis
**Where:** `lineAt(source, index)` rescanned the source from 0 on every call, and was called several times per method and member.
**Evidence:** a 3,000-function file (15k lines): `analyzeCode` **2,694 ms**, `analyzeCodebase` **2,557 ms**. After the fix: **79 ms / 82 ms**, about 34× faster. The regression test sets a 1 s ceiling.
**Fix:** a `LineIndex` class (precomputed line starts, binary search), built once per source.

### CI-12 · High · Inspector › Code: stale or never-loading external scripts
**Where:** `CodePanel` had two effects on `[assets]`. The reset effect called `setExternalTexts({})`, and then the loader effect, running in the same commit, checked `externalTexts[key]` from its **stale closure** (the old project's texts). If the new folder had a script at the same relative path, which is always the case for JPEXS dumps of related SWFs, the loader skipped it. The reset then cleared the state, and nothing ever loaded it again. In addition:
* reads still in flight from the old folder could resolve after the reset and write the **old** source into the new project;
* `file.text()` rejections were unhandled, so the path stayed in `loadingRef` and the panel showed "Loading ActionScript source" forever;
* the loader depended on `timeline.id`, not `timeline`, so a re-parsed timeline with the same id was not reloaded.

**Evidence (UI, original code):** after switching from folder A (`OLD_PROJECT`) to folder B (`NEW_PROJECT`, same path), the text never contained `NEW_PROJECT`. A rejecting file never showed an error.
**Fix:** new `components/useScriptTexts.ts` hook, shared by both UIs:
* state is tagged with a `scope` (the asset bundle); a mismatched scope reads as empty *synchronously*, so stale text cannot render even for one frame;
* late results from an old scope are discarded;
* files are read with `Promise.allSettled` and committed in **one** state update;
* failures are reported, and the ActionScript view shows `// Could not read ActionScript source …` followed by the tag's own text.

### CI-13 · High · Code workspace: same loader problems, plus N× re-analysis
**Where:** `CodeInspectorView` `useEffect` + `loadedRef`.
* `loadedRef` was **never reset** when a new folder was opened, so same-path scripts showed the old folder's source.
* Keys used the raw `file.path` (not `normalizeAssetPath`, unlike `CodePanel`).
* Each file's `.then` called `setExternalTexts` separately. Each call changed `sources`, and each change re-ran `analyzeCodebase` on the **whole** codebase: N files meant N full analyses (quadratic in practice, see CI-10).
* Rejections were unhandled.

**Fix:** switched to `useScriptTexts` (scoped, normalized, batched, error-aware).

### CI-14 · High · Unfinished decomposition: duplicate `CodePanel`, broken type-check
**Where:** `Inspector.tsx` still defined and rendered its own `CodePanel`. `inspector/CodePanel.tsx`, a byte-identical copy apart from `export`, was imported by nothing and had 18 unused imports. `DECOMPOSITION_SPEC.md` steps 2k–2u were still pending.
**Impact:** `tsc --noEmit` failed, so real type errors could not be seen. Any fix to "CodePanel" had a 50% chance of landing in the dead copy.
**Fix:** removed the copy from `Inspector.tsx` (−254 lines), imported `./inspector/CodePanel`, cleaned the imports in both files, and marked spec steps 2k–2u done.

### CI-15 · High · Wrong script attached to other timelines (data corruption)
**Where:** `lib/assets.ts` `resolveAssetFile` has a last-resort basename fallback: *if exactly one file is named `DoAction.as`, use it*. JPEXS names **every** frame script `DoAction.as` / `DoInitAction.as`, so the fallback fires exactly when it is wrong. `hydrateActionScriptSources` then **overwrites `event.detail`** with the wrong script.
**Evidence (the app's own demo dump):** root frame 25's candidate `scripts/frame_25/DoAction.as` resolved to `scripts/DefineSprite_10/frame_13/DoAction.as`. The Code workspace listed every demo symbol twice (`expected length 1 but got 2`), with false relationships from the main timeline.
**Fix:** the basename fallback now skips `doaction.as`/`doinitaction.as`. Those are resolved by owner + frame in `resolveActionScriptFile`, which already handles them correctly. Uniquely named scripts (`HeroBall.as`) still fall back as before. Tests: `src/lib/assets.test.ts`.

### CI-02 · Medium · `var f = function(){}` indexed as both method and member
**Evidence:** `P2 var fn {"methods":["go"],"members":["go"]}`. The `this.x =` branch excluded functions but the `var` branch did not.
**Fix:** declarations whose initializer is a function are not members.

### CI-04 · Medium · Nested definitions skipped inconsistently; parents credited with child references
**Where:** both passes set `lastIndex = closeIdx + 1`, skipping entire bodies. But the passes were independent, so a function *expression* nested in a *named* function was found while a named function nested in a named function was not.
**Evidence:** `this.init = function(){ this.onEnterFrame = function(){…} }` → `["init"]`. `function outer(){ function inner(){} }` → `["outer"]`.
**Impact:** the classic AS2 pattern of handlers defined inside `init`/`onLoad` is invisible. The parent was credited with all of its children's calls and asset references.
**Fix:** every `function` keyword is visited, so nested definitions are indexed. When scanning a parent, the bodies of directly nested definitions are blanked, so each call or reference is credited to the function it is actually in. `body` still holds the full text for display.

### CI-07 · Medium · Member read/write misclassification
**Where:** `scanCodeEdges` regexes.
* `bareReadRe = /(?<![\w$.])(\w+)(?!\s*[\(=])/`: for `score == 10`, the lookahead fails on `score`, the regex **backtracks** to `scor`, and so the real read is lost. For the same reason `==` comparisons were never reads.
* `score += 1` / `++score` → recorded as a *read* only.
* `this.score = 3` → recorded as a write **and** a read (`thisReadRe` did not exclude assignments).
* Member pass: `this.x == 5;` was parsed as the property `x` with value `= 5`.

**Evidence:** `["bump-read->score@5","setIt-write->score@8","setIt-read->score@8"]` (the `check` read is missing).
**Fix:** a single identifier scan with explicit context. `=` (not `==`) → write. Compound assignment or `++`/`--` → read + write. Otherwise → read. Declarations (`var x`, `function x`), object-literal keys and properties of other objects are skipped. `THIS_PROP_RE` uses `=(?!=)`.

### CI-08 · Medium · Function-local variables indexed as members
**Evidence:** `function a(){ var i = 0 } function b(){ var i = 1; trace(i) }` → `["function:a","function:b","var:i","var:i"]`. Each such name also went into `memberNames`, so every `i` anywhere became a "member read" edge.
**Fix:** a difference-array pass marks lines inside function bodies, and `var`/`const` there are treated as locals. `this.x = …` inside functions is still a member, since that is where AS2 usually sets them.

### CI-09 · Medium · Reference lines pointed at the definition, not the usage
**Evidence:** a call to `b()` on line 5 inside `a()` (line 1) → `fromLine: 1`. The References panel (`L{r.fromLine}`), the References list and `assetIndex.usedBy` all showed the wrong line.
**Fix:** edges record the offset of the identifier and map it through `LineIndex`. `CodeRef` gained an optional `line` (additive, backward compatible), which also fixes `CodeRelationship.line` in the panel. Demo check: "startBounce L23 → bounce" is the actual `this.bounce();` line.

### CI-16 · Medium · Duplicate source labels break the panel's Source tab
**Where:** `CodeInspector.tsx` used `key={s.label}` and selected by label. `CodePanel` builds labels as `Frame N · <file name or tag type>`, so two actions on one frame that have the same tag type, or that resolve to the same file, get the same label. That produces duplicate React keys, and the panel always shows the *first* source.
**Evidence (UI):** clicking the second of two same-label rows displayed `var first = 1;`.
**Fix:** selection is by index; `CodePanel` also makes duplicate labels unique (`… (2)`).

### CI-17 · Medium · Reference chips did nothing
**Where:** `RefChips` called `onSelect(undefined, name)`, but the Inspector's handler only acts when `assetId != null`.
**Evidence (UI):** clicking the `shape_3` chip under `spawnStar` → `onSelectAsset` never called with `(3, 'shape_3')`.
**Fix:** chips resolve the id through `analysis.assetIndex[name]`.

### CI-19 · Medium (performance) · Code workspace render costs
* `filteredRefs` and every `ReferencesList` row called `analysis.sources.find` (O(refs × sources)) → now a `sourceById` map.
* `CodeViewer` re-tokenised the whole file on every keystroke in the search box → now `React.memo` with stable `useCallback` handlers.
* `ReferencesPanel` filtered *all* references seven times per render → now pre-filtered once per selection (`useMemo`).

### CI-11 · Low · Inconsistent `kind` / `name` between the two passes
`btn.onRelease = function go(){}` → `["go","function"]`, but `btn.onPress = function(){}` → `["btn.onPress","handler"]`. The regex `.replace(/^var\s+/, '')` could never match. **Fix:** one naming rule for all forms:

| Form | Result |
|---|---|
| `this.x = function` | `x`, method |
| `A.prototype.x = function` | `x`, method |
| `{ x: function }` | `x`, method |
| `var x = function` | `x`, function |
| `x = function` | `x`, handler (unchanged) |
| `a.b = function` | `a.b`, handler |
| `function x` | `x`, function |
| `function get x` | `x`, method |

Named function expressions take the assignee's name, since that is what code calls.

### CI-18 · Low · Wrong empty-state message
`No code→asset relationships{filtered.length ? ' match' : ''}` was only reached when `filtered` was empty, so it never said "match". **Fix:** based on whether a filter is active.

### CI-20 · Low · Code workspace navigation
* `selectSymbol` always jumped to the *first* definition of a name, even when you clicked a reference from another source. It now prefers the reference's source, then the source on screen, then the first definition.
* The Sources tab ignored the timeline filter, and group headers showed raw ids (`sprite:10`). It is now filtered and shows timeline names.

### CI-21 · Low · Duplicated asset-descriptor logic
The same 14-line block building asset names lived in `CodePanel` and `CodeInspectorView`, so the two views could resolve references differently. **Fix:** `buildAssetDescriptors(doc, project)` in `lib/codeInspector.ts`.

### CI-22 · Low · No tests could cover the analyzer
`vite.config.ts` restricted Vitest to `src/engine/**`. **Fix:** `include: ["src/**/*.test.ts"]`; added `src/lib/codeInspector.test.ts` (23 tests) and `src/lib/assets.test.ts` (3 tests).

---

### CI-23 · High · Frame-script resolver matched folders by substring (found in the follow-up pass)
`resolveActionScriptFile` tested `path.includes('frame_1')`, which also matches `frame_10`–`frame_19`. `definesprite_1` likewise matched `definesprite_10`. The main timeline also accepted scripts from sprite folders. In the demo, main-timeline frame 1 was silently replaced by sprite 10's `frame_13/DoAction.as` once external scripts loaded. The documented `DoInitAction.as`-first preference for init actions was ignored too: the first file in folder order won. This was masked in the original UI check because the check ran before the file finished loading. **Fix:** match whole path segments, exclude `define*` folders for the main timeline, and rank candidates by preference. Covered by two `assets.test.ts` cases and the committed UI test.

---

## 4. Changes by file

| File | Change |
|---|---|
| `src/lib/codeInspector.ts` | Rewrote the parsing core (masking, `LineIndex`, unified definition scanner, member/local detection, context-aware edge scanner, prototype-free indexes, reference lines). Added `buildAssetDescriptors`. The public types are unchanged apart from the optional `CodeRef.line` |
| `src/components/useScriptTexts.ts` | **New.** Scoped, batched, error-aware loader for external `.as` files |
| `src/components/inspector/CodePanel.tsx` | Uses the hook and shared descriptors; clean imports; unique labels; reports read failures |
| `src/components/Inspector.tsx` | Removed the duplicate `CodePanel` (−254 lines) and imports the extracted one |
| `src/components/CodeInspector.tsx` | Index-based source selection, working reference chips, source label in details, empty-state fix |
| `src/components/CodeInspectorView.tsx` | Hook, shared descriptors, `sourceById`, memoised viewer, source-aware navigation, filtered/named Sources tab, memoised references panel |
| `src/lib/assets.ts` | Basename fallback no longer matches the generic `DoAction.as`/`DoInitAction.as` |
| `src/lib/codeInspector.test.ts`, `src/lib/assets.test.ts` | **New** regression tests |
| `vite.config.ts` | Vitest include widened to `src/**/*.test.ts` |
| `DECOMPOSITION_SPEC.md` | Phase 2 steps 2k–2u marked done |
| `.gitignore` | **New** (`node_modules/`, `dist/`). The repo had none, so a stray `git add .` would have committed both |

---

## 5. Verification

**Automated (kept in the repo):** `npm test` runs 39 tests, all passing; `npx tsc --noEmit` is clean; `npm run build` succeeds.

**Analyzer tests against the original implementation:** 22 of 23 fail (the remaining one is a characterization test for empty-source summaries), which confirms each test targets a real defect.

**UI reproduction (jsdom + Testing Library, run with the app's demo dump; not committed, see §7):**

| Scenario | Original code | After fix |
|---|---|---|
| Demo script indexed once; *bounce → Called by startBounce L23* | ❌ every symbol listed twice (CI-15) | ✅ |
| Symbol named `toString` in the Code workspace | ❌ `TypeError … reading 'push'` (CI-05) | ✅ renders, "1 refs" |
| New folder with a script at the same path | ❌ new source never appears (CI-12) | ✅ old text never rendered; new text loads |
| Unreadable `.as` file | ❌ "Loading…" forever | ✅ "Could not read ActionScript source …" |
| Clicking an asset reference chip | ❌ handler not called (CI-17) | ✅ `onSelectAsset(3, 'shape_3')` |
| Two sources with the same label | ❌ second row shows first source (CI-16) | ✅ |

---

## 6. Remaining limitations (as originally reported)

> **All resolved. See §8.1.** Kept as written for traceability.

The analyzer is still, as its header says, *"a heuristic index, not a compiler"*:

* Regex literals are not recognised by the masker (rare in AS1/2). A regex containing a quote could mis-mask the rest of its line.
* `var a = 1, b = 2;` indexes only `a`.
* Name resolution is by name, not by scope (beyond treating function-level `var`s as locals). `obj.x` for objects other than `this` is not tracked.
* One edge per *(from, kind, to)*: the first usage site's line is reported, not every site.
* `CodePanel` still feeds character attributes whose key contains `bytes` (hex bytecode) to the analyzer. This is harmless noise, but it is not source code.
* The panel's selected Source index is not reset when switching timelines; it simply shows that index in the new list.

---

## 7. Observations outside scope (as originally reported)

> **All resolved. See §8.2–§8.3.** Kept as written for traceability.


* **No React error boundary** around the workspaces: any render error (as in CI-05) unmounts the whole app. Recommend a boundary per workspace.
* **Component tests:** the UI checks in §5 used `jsdom` + `@testing-library/react`, installed temporarily with `--no-save`. Adding them as devDependencies would let those scenarios run in CI; I left that decision to the maintainers.
* `vitest` is listed under `dependencies` rather than `devDependencies`, and the package is still named `react-vite-tailwind`.
* `DECOMPOSITION_SPEC.md` repeats its "Phase 1" and rules sections; phases 3–8 (Label/Frame/Actor/Clips/Export panels) are still pending.
* `server/engine-server.mjs`: `userId` is taken from the client unchecked, so users can impersonate each other within a room. The number of rooms and clients per room is unbounded; there is no auth or rate limit (payloads are capped at 64 KB).

---

## 8. Follow-up: resolution of §6 and §7

### 8.1 Analyzer limitations (§6)

| Limitation | Resolution | Test |
|---|---|---|
| Regex literals not masked | The masker recognises regex literals from the previous significant token (`startsRegex`: after an operator, `(`, `,`, `=`, `return`, `typeof`, …, but not after an identifier, `)` or `]`, so division is safe). Bodies, including character classes, are blanked in the code view and kept in the text view | `former limitations (audit §6)` in `codeInspector.test.ts` |
| `var a = 1, b = 2;` indexed only `a` | Declarations are split at top-level commas (`splitTopLevel`, bracket- and string-aware) across the statement's full extent. This also covers `this.a = 1, this.b = 2` and multi-line initialisers. Each member's refs come from its own initialiser | same |
| Name resolution by name, not scope | Each method now carries `locals`: parameters, `var`/`let`/`const` (including `for (var …)` and `catch (e)`), plus the locals of enclosing functions. Bare names that shadow a member or method are not recorded as references. `this.x`, `_root.x`, `_global.x`, `_parent.x` and `_levelN.x` always resolve to the member | same |
| Only the first usage line per edge | Edges keep every line (`lines`, sorted and de-duplicated; `fromLine = lines[0]`). The UI shows `L3, 9, 12 +4` in relationship rows and `line (×n)` in the Code workspace | same, plus the UI test *shows every usage line* |
| `bytes` attributes analysed | `isBytecodeAttr` (key contains `bytes`, or the value is ≥4 hex byte pairs) keeps bytecode out of the analyzer. The attributes are still shown in the panel | UI test *keeps raw bytecode attributes out* |
| Source index not reset on timeline change | The selection is stored with a key derived from the source ids. A different source list clears it, while re-analysis of the same list (a script finishing loading) keeps it | UI test *clears the selected source …* |

### 8.2 Engineering observations (§7)

* **Error boundaries.** `src/components/ErrorBoundary.tsx` wraps each workspace in `App.tsx` and each Inspector tab. It shows the error with a *Try again* button and resets automatically when the document, workspace, tab or selection changes. A failure in one panel no longer unmounts the app.
* **Component tests committed.** `jsdom`, `@testing-library/react` and `@testing-library/dom` are devDependencies. `src/components/__tests__/codeInspector.ui.test.tsx` holds 11 tests: the six §5 scenarios, the §6 UI behaviours, CI-23 and the error boundary. The Vitest include now covers `src/**/*.test.{ts,tsx}` and `server/**/*.test.{ts,mjs}`.
* **Packaging.** `vitest` moved to devDependencies and the package is renamed `swf-studio`. `ws` stays a runtime dependency because the server needs it.
* **Decomposition.** `DECOMPOSITION_SPEC.md` is de-duplicated and marked complete. `Inspector.tsx` is now a 78-line tab switcher over `src/components/inspector/*` (Label, Frame, Clips, Actor, Code, Export panels plus shared helpers).

### 8.3 Room server (§7)

`server/engine-server.mjs` now exports `createEngineServer(options)` and still runs directly with `node`:

* **Impersonation.** The user id must match `[A-Za-z0-9_.:-]{1,64}` and be unique within a room. A second claim is refused (`4009`) unless it carries the same private session key, which only the owning tab has. That case is a reconnect and replaces the stale socket (`4010`). Relayed packets always use the server-side id.
* **Auth.** The `ROOM_TOKEN` shared secret is compared in constant time on SHA-256 digests (`4001`). The client has a token field that is stored in `sessionStorage` only.
* **Resource limits.** `MAX_CONNECTIONS`, `MAX_ROOMS` (`1013`), `MAX_CLIENTS_PER_ROOM` (`4003`), a hello deadline (`4004`), a per-connection token-bucket rate limit with disconnect after sustained abuse (`4008`), bounded `bindings`, and a ping/pong heartbeat.
* **Client feedback.** Refusals arrive as an `error` packet and a close code. `peerNetwork.ts` shows them, and reports "connected" only after the server accepts the hello.
* Covered by `server/engine-server.test.mjs` (8 tests against a live server on an ephemeral port). Documented in `server/README.md`.

### 8.4 Still open

* **`obj.x` for arbitrary objects.** Resolving a member on an object other than `this`/`_root`/`_global`/`_parent` needs type inference, which is beyond a heuristic index. Such accesses are still not tracked.
* **`TokenLine` highlighting** in the viewers tokenises each line independently. Keywords inside multi-line comments or strings may be highlighted. This is cosmetic; the analysis itself uses the masked code.
* The token-based room auth is a shared secret, not per-user accounts, and needs TLS (`wss://`) to be meaningful over the internet.

### 8.5 Verification

`npx tsc --noEmit`: clean. `npm test`: **68 tests in 5 files**, all passing:

| File | Tests |
|---|---|
| `codeInspector.test.ts` | 31 |
| `codeInspector.ui.test.tsx` | 11 |
| `engine-server.test.mjs` | 8 |
| `clock.test.ts` | 13 |
| `assets.test.ts` | 5 |

`npm run build`: succeeds.
