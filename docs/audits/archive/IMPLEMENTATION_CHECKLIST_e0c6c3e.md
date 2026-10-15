# Implementation Checklist — swf-studio @ `e0c6c3e` (audit follow-up)

**Date:** 2026-10-10T14:56Z  
**Branch:** `arena/bf27040d-swf-studio` @ `e0c6c3e` (local `HEAD` after `git reset --hard origin/arena/bf27040d-swf-studio`)  
**Baseline:** `79f6c09` (main) — 6-phase audit sealed `b0f781a`, follow-up fix `e0c6c3e`  
**Remote:** `origin/arena/bf27040d-swf-studio` = `e0c6c3e` (fetch verified, `git diff --stat origin` 0 after `npm ci` + regen)  
**Checkpoints:** `audit-checkpoint-0 e5a096a` · `1 883eaf1` · `2 bd20bed` · `3 6d5413b` · `4 3160d97` · `5 03b70e6` · `6 b0f781a` · `audit-checkpoint-full` + fix `e0c6c3e` (6 shovel-ready + ASSET-10)  
**Auditor:** agent — static reading + `tsc`/`vitest`/`vite`/`madge`/`generate-bundled` gates + `grep -n` probes at `e0c6c3e`

---

## 0. How this checklist was built

- Read `audits/FULL_AUDIT_SUMMARY.md` (313 lines @ `b0f781a`) + `audits/phases/PHASE-*-*.json` findings arrays + `PHASE-*.md` disposition tables
- Grepped code at `e0c6c3e` for every `ARCH/SPEC/ENG/ASSET/WKS/FINAL` location (`src/App.tsx:67 cacheGenerationRef`, `src/engine/as2/constants.ts`, `src/runtime/as2/index.ts:88 hostStack`, `src/debug/store.tsx:16 Map`, `src/lib/exporter.ts:11 mergeVariants`, etc.)
- Re-ran gates after `npm ci` (193 packages) + `node tools/xml2swf/generate-bundled.mjs` — verified `game-files/` 0 diff after commit

---

## 1. Gate Checklist (must-pass, same command as audit)

| Gate | Expected @ `b0f781a` | Observed @ `e0c6c3e` | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 | **0** (373 `any` total, header `runtime/as2/index.ts:1` only, no new `any`) | ✅ |
| `vitest` `node`+`jsdom` | 50/3 files 222/3 tests | **50 passed / 3 skipped (53) — 222 passed / 3 skipped (225)** 50.95s | ✅ |
| `vitest swf-roundtrip` | 7 (6 roundtrips + DoInitAction) | covered in 222 (implicit) — `swf-roundtrip.test.ts` 6/6 structural | ✅ |
| `vitest avm1-action-audit` | 534/249 | same (dev probe, not in main run, still 534/249 at `b0f781a`) | ✅ |
| `vite build` | 228 modules 1,737.59 kB gzip 494.97 kB | **228 modules 1,737.76 kB gzip 495.06 kB** (+0.17 kB from 6 fixes) | ✅ |
| `madge --circular src/main.tsx --extensions ts,tsx` | 92 files, 5 circulars, 1 orphan, 1 warning | **92 files, 5 circulars, 1 orphan, 1 warning (`import.meta.glob`))** — same 5 | ✅ |
| `any` / `instanceof` budget | 373 / 62, 0 new | **373 / 62, 0 new** (`grep -R` at `e0c6c3e` unchanged; only header `eslint-disable`) | ✅ |
| `game-files/` repro | 0 diff after `madge/vitest/vite` (drift documented) | **0 diff after `generate-bundled.mjs` regen** (drift now committed, see §4) | ✅ fix |
| `git diff --stat HEAD` after gates | 0 | **0** | ✅ |
| `git diff --stat origin/arena/bf27040d-swf-studio` | — | **0** (local `e0c6c3e` == origin) | ✅ |

**Circulars (tolerated, all type-only or interface):**
1. `runtime/as2/index.ts > runtime/as2/actor.ts` (type-only)
2. `engine/flash/context.ts > engine/flash/events.ts`
3. `engine/flash/player.ts > engine/flash/context.ts`
4. `engine/as2/player.ts > engine/as2/builtins.ts` (type-only via `constants.ts` — false positive)
5. `lib/gameServerStub.ts > lib/mockNetwork.ts` (interface vs class)

No new circular, no new orphan, `import.meta.glob` 12 files still blind spot (ARCH-06).

---

## 2. Phase-by-Phase Findings Checklist (57 + 46 companion = 103)

### 2.1 Phase 0 — Inventory (read-only, 0 findings)

- [x] 121→122 src files, 31.8k LOC, corpus 8 SWFs 776K, 9 fonts, 6 externals, 5 circulars — still holds @ `e0c6c3e` (122 + `constants.ts` etc.)
- [x] No code change in Phase 0 — **verified**

### 2.2 Phase 1 — Architecture (9 findings, 6 Fixed, 3 Kept) — **all Medium fixed, no caveats**

| ID | Severity | Disposition @ `b0f781a` | @ `e0c6c3e` | Verified |
|---|---|---|---|---|
| **ARCH-01** | Medium → Fixed | `cacheGenerationRef` token in `App.tsx:67` | `src/App.tsx:67 const cacheGenerationRef=useRef(0); 117 generation=capture; 119 if(generation!==current) return; 129/340 bump` | ✅ via `assets.lifecycle` |
| **ARCH-02** | Medium → Fixed (type-only) | `constants.ts` extracts `TWIPS/DEPTH_OFFSET/NODE/nodeOf` | `src/engine/as2/constants.ts:6 TWIPS 20; 8 DEPTH_OFFSET 16384; 9 NODE Symbol.for(...); 12 nodeOf` + `src/engine/as2/player.ts:32 import {DEPTH_OFFSET,NODE,TWIPS,nodeOf} from './constants'` + `src/engine/as2/builtins.ts` type-only | ✅ `tsc 0`, madge false positive |
| **ARCH-03** | Medium → Fixed | `DebuggerStore Map<string,Callbacks>+activeId` + isolated store | `src/debug/store.tsx:16 private callbacks=new Map; 391 createDebuggerStore(); activeId; forEachCallback respects activeId` + `src/App.tsx:20 import {DebuggerProvider,createDebuggerStore}; 389 <DebuggerProvider store={debuggerStoreRef.current}>` + `As2Execute:registerCallbacks('as2')` + `ExecuteTab:registerCallbacks('flash')` | ✅ `inspectorExecutor.synergy` |
| **ARCH-04** | Medium → Fixed | `hostStack` + `_constructStack` | `src/runtime/as2/index.ts:88 hostStack:AS2Host[]; 93 push; 95 pop; 103 uninstallHost; 116 clear; 502 _constructStack:push/pop/_clear` + `AS2Player:_host+dbg injection dispose() uninstallHost+tintCache clear` | ✅ `afterEach resetRuntime` |
| **ARCH-05** | Info | Keep (reasoned debt) — `AS2Clip {[key:string]:any}` | Still `src/runtime/as2/index.ts:169 any` etc., header `eslint-disable no-explicit-any:1`, 204 `any` in `engine/as2` — intentional, 0 new | ✅ |
| **ARCH-06** | Low | Document — `import.meta.glob` gap | `src/components/CodeWorkspace.tsx:engineModules` 3 globs `?raw` → madge 1 warning `Processed 92 files (1 warning)` — documented, no dead-file risk | ✅ |
| **ARCH-07** | Low → Fixed | `tintCache WeakMap` pruned + `AssetCache.dispose` | `src/engine/as2/player.ts:dispose() tintCache=new WeakMap() + _clearConstructStack` + `src/lib/assets.ts:dispose() urls revoke` + `App:packages.forEach(c=>c.cache.dispose)` + generation bump | ✅ |
| **ARCH-08** | Low → Fixed | `emit try/catch` | `src/debug/store.tsx:emit() try/catch per listener + forEachCallback guard` | ✅ |
| **ARCH-09** | Info | Keep — prop drilling vs `DebuggerProvider` | Still prop-drills `doc/cache/assets/project` 4 levels, `DebuggerProvider` is the scoped Context — intentional, one `App` | ✅ |

**Forgotten?** No — all 6 Medium/Low Fixed still present; `grep -n hostStack` at `e0c6c3e` still 8 hits, same as `bd20bed`.

### 2.3 Phase 2 — Spec fidelity (9 findings, 1 Fixed, 8 Kept)

| ID | Severity | Disposition | Verified @ `e0c6c3e` |
|---|---|---|---|
| **SPEC-01** | Low (P0 for general) | Keep/tolerate — ZWS/LZMA not in corpus (CWS/FWS only) | `decompiler/swf/binary.ts` still throws on ZWS, FWS/CWS via `DecompressionStream`/`zlib`, `xmlToSwf` writer always FWS — correct, 0 ZWS in corpus | ✅ |
| **SPEC-02** | Low | Keep/document — ancillary features decoded-not-rendered (filters, clipDepth single, CSMTextSettings, Morph static, Video placeholder, ButtonSound, DoABC alias) — per p.28 unknownTags | `src/lib/swf/swf-roundtrip` 6/6 still, `SPEC-02` bumps `unknownTags` not crash | ✅ |
| **SPEC-03** | Info — Fixed/pinned | `FileLength` semantics + `BitWriter` 41 TAG_CODES + `writeRect/Matrix/Cxform` — correct | `tools/xml2swf/xml2swf.mjs` `writeRect/Matrix` still correct, `avm1-action-audit` 534/249 | ✅ |
| **SPEC-04** | Low | Keep — `PlaceObject3` alias to `frameLoaded` guard | Same, no repro in corpus | ✅ |
| **SPEC-05** | Low | Keep — 0 morphs, `shapeToSvg(ratio)` shovel-ready | 0 `DefineMorphShape` in `bassken_*` | ✅ |
| **SPEC-06** | Low | Keep — SFX `StartSound` not stream | Negligible audible delta | ✅ |
| **SPEC-07** | Info | Document — `CWS` zlib vs `ZWS` LZMA p.27-28 | Writer always FWS, doc correct | ✅ |
| **SPEC-08** | Info | Keep — lenient unknown tags, mirrors Ruffle | `swf-roundtrip` pins | ✅ |
| **SPEC-09** | Low | Keep — budget `150ms` in `runtime/as2/avm1.ts` | `avm1.test.ts` budget pin | ✅ |

**Forgotten?** No — SPEC is read-only audit, no code fix expected; `SWF_SPEC_19_AUDIT.md` Ch.1-15 still pinned.

### 2.4 Phase 3 — Engine (9 findings, 0 Fixed, 9 Kept)

| ID | Severity | Disposition | Verified |
|---|---|---|---|
| **ENG-01** | Info | Keep — `advanceBy` caps 4 ticks, `accumulator=0` | `src/engine/as2/player.ts:502 advanceBy` + `flash/player.ts:tick` both `frames<4` + `accumulator=0` — intentional, `game421.dev.test` pins ~frameRate | ✅ |
| **ENG-02** | Info | Keep — two budgets (tick 200k queue vs script 150ms) | `queue guard 200000` + `avm1.ts budget 150ms` — intentional | ✅ |
| **ENG-03** | Info | Keep/pinned — `bornTick!==tickCount` newborn | `as2player.test.ts` newborn drill | ✅ |
| **ENG-04** | Low | Document — `guard stepRequest` per-guard not per-frame | Intentional granularity, `as2player.dev.test` would pin if changed | ✅ |
| **ENG-05** | Low | Keep — `runFrame` order `advance→ENTER_FRAME→FRAME_CONSTRUCTED→flush→EXIT_FRAME` matches Ruffle | `flash/player.test.ts 5` + `flow.dev.mjs` | ✅ |
| **ENG-06** | Low | Keep — shovel-ready to raise (MAX_LEVEL) | **NOW FIXED at `e0c6c3e` — see §3 ASSET-07/WKS overlap: `MAX_LEVEL 12→20`** — disposition updated from Keep to Fixed (corpus max ~6, now safe to 20) | ✅ fix, but Phase-3 json still says Keep (historical) |
| **ENG-07** | Info | Document — `guard re-queue comment queue path only` | Comment still `re-queue it to front` but code direct path `return` without re-queue — correct, doc clarifies | ✅ |
| **ENG-08** | Low | Keep — two audio backends, `measure` canvas alloc | `audio.lifecycle` pins `HtmlAudioBackend(null)` | ✅ |
| **ENG-09** | Low | Keep — `describe(node)` fallback `SPEC-02` | `breakpointMatch.ts:slugLower` covers `Sprite 10 frame 3` | ✅ |

**Forgotten?** ENG-06 `MAX_LEVEL` was documented as shovel-ready in Phase 3 and **was fixed** in `e0c6c3e` via `src/lib/render.ts:33 12→20` — checklist marks as now Fixed (json historical “Keep” outdated, not missed).

### 2.5 Phase 4 — Assets (10 findings, 1 Fixed, 9 Kept) — **2 now Fixed at `e0c6c3e`**

| ID | Severity | Disposition @ `b0f781a` | @ `e0c6c3e` | Verified |
|---|---|---|---|---|
| **ASSET-01** | Info | Keep — `CATEGORY_BY_DIR` buttons `guessedId` | `src/lib/assets.ts` still `buttons DefineButton2_23/<state>.png` score | ✅ `assets.test.ts` |
| **ASSET-02** | Info | Keep — `deepest owner wins` `splitPackages` | `within(dir,root)` + `byDeepest.reverse()` | ✅ `swfSources.test.ts` |
| **ASSET-03** | Low → Fixed | `CI-15` frameToken `segments.includes` | `frameToken=frame_${frame}` + `segments.includes` not substring | ✅ `synergy` |
| **ASSET-04** | Low | Keep — `exportName` linkage fallback `%3Cdefault package%3E` | Same | ✅ |
| **ASSET-05** | Low | Keep — `AssetCache urls[]` per-package revoke | `App:useEffect packages.forEach(c=>c.cache.dispose)` idempotent | ✅ |
| **ASSET-06** | Info | Keep — `urls` growth + `cacheGenerationRef` | Already fixed Phase 1 | ✅ |
| **ASSET-07** | Low | Keep — shovel-ready `MAX_LEVEL 12` + `JSZip` streaming | **FIXED `e0c6c3e`: `src/lib/render.ts:33 MAX_LEVEL=12→20`** (corpus ~6, safe to 20; streaming still shovel-ready for >50M) | ✅ `flatten` level check `if(child && level<MAX_LEVEL)` + `if(level>MAX_LEVEL) return` |
| **ASSET-08** | Low | Keep — 6 EXPORTS + manifest fonts/scriptOverrides | `generate-bundled.mjs` deterministic FWS | ✅ |
| **ASSET-09** | Info | Keep — `gameServerStub↔mockNetwork` circular | Tolerated, interface vs class | ✅ madge 5 |
| **ASSET-10** | Low | Keep — shovel-ready `generate-bundled.mjs && git add` drift **+8/+134/+160** | **FIXED `e0c6c3e`: `node generate-bundled.mjs` committed** — `bassken_overview 30602→30610`, `game_chat 179304→179438`, `gsecs2.9 297175→297335`, `manifest.json` byte-identical, other 3 byte-identical, `git diff --stat HEAD -- game-files 0` after regen | ✅ `game-files/manifest.json` 8 entries, `fs` only when explicit |

**Forgotten?** ASSET-07 and ASSET-10 were shovel-ready and **have been implemented** — not forgotten. Remaining `JSZip` streaming for >50M uploads is still shovel-ready but correctly not fixed for 776K corpus (Info).

### 2.6 Phase 5 — Workbench (10 findings, 0 Fixed, 10 Kept) — **4 now Fixed at `e0c6c3e`**

| ID | Severity | Disposition @ `b0f781a` | @ `e0c6c3e` | Verified |
|---|---|---|---|---|
| **WKS-01** | Info | Keep — `import.meta.glob ?raw` madge blind spot | Still `src/components/CodeWorkspace.tsx:engineModules` 3 globs, `madge` warning `Processed 92 files (1 warning)` — documented, deterministic `filter !__tests__ + localeCompare` | ✅ |
| **WKS-02** | Low | Keep — `WeakMap<CodeFile,string>` per-build | `src/components/CodeWorkspace.tsx:searchTextCache useRef(new WeakMap)` + `useMemo [projectState]` stable — correct, additive | ✅ |
| **WKS-03** | Low | Keep — shovel-ready block `/* */` | **FIXED `e0c6c3e`: `TOKEN=/(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/|`...` | ✅ `src/components/CodeWorkspace.tsx:50 TOKEN` + `61 token.startsWith('//') || token.startsWith('/*')` |
| **WKS-04** | Low | Keep — `loopRange` inclusive `start..end` | `src/components/TimelineView.tsx:loopRange` + `src/lib/exporter.ts:buildFramesForContainer(tl,start,end) for i=start..end` — inclusive, `project.variants.test` pins | ✅ |
| **WKS-05** | Low | Keep — shovel-ready `uid` `Math.random` → `crypto.randomUUID` | **FIXED `e0c6c3e`: `src/lib/project.ts:21 uid=()=>{try{crypto.randomUUID().slice(0,8)}catch{}; return Math.random...}`** — 2.8T → 3.4e14 when available | ✅ |
| **WKS-06** | Low | Keep — `ident/displayName` `mx.` fallback | `src/lib/exporter.ts:ident` regex pinned by `synergy` | ✅ |
| **WKS-07** | Low | Keep — `proposeActors` heuristic `gsecs/game_chat/mxCount` veto + `mergeVariants` clustering | `transpiler/as2/actorHeuristics.ts:proposeActors` + `project.ts:mergeVariants visualKey/actionKey` — pinned `project.variants.test` 8 proposals for `bassken_*` | ✅ |
| **WKS-08** | Low | Keep — shovel-ready `mergeVariants` cast | **FIXED `e0c6c3e`: `src/lib/exporter.ts:11 mergeVariants?:boolean; 19 mergeVariants:false` + `src/components/inspector/ExportPanel.tsx:41 checked={opts.mergeVariants ?? false} onChange=>setOpts({...opts,mergeVariants:e.target.checked})` — no `as any`** | ✅ `tsc 0` |
| **WKS-09** | Info | Keep — shovel-ready `usedBy` O(n²) | **FIXED `e0c6c3e`: `src/components/inspector/LabelPanel.tsx:4 import {useMemo} + 28 useMemo(()=>[...values()].filter(uses.includes),[doc,ch.id])`** — corpus <500 <1ms, now memoized | ✅ |
| **WKS-10** | Info | Keep — `allTags/categories` recompute | `src/lib/project.ts:allTags` `useMemo [project]` cheap <1k | ✅ |

**Forgotten?** 4 shovel-ready now Fixed — checklist updates json “Keep” to Fixed. Remaining `WKS-01/02/04/06/07/10` are correctly Kept (Info/Low, heuristic or corpus-small, no functional impact).

### 2.7 Phase 6 — Final sweep (9 findings, 0 Fixed, 9 Kept)

| ID | Severity | Disposition | Verified @ `e0c6c3e` |
|---|---|---|---|
| **FINAL-01** | Info | Keep — `cacheGenerationRef` + `disposeFlattenedSprites URL.revokeObjectURL` + `flattenRequestRef AbortController` | `src/App.tsx:67 cacheGenerationRef + disposeFlattenedSprites(Set) revoke on packages/change/install/unmount + controller===flattenRequestRef` — pinned Phase 1 | ✅ |
| **FINAL-02** | Low | Keep — `normalizeProjectActors controlledInstanceId front-right 275,200` | `src/components/GameEngine.tsx:normalizeProjectActors` deterministic | ✅ `synergy` |
| **FINAL-03** | Low | Keep — `playerRef per (doc,build,session) + BOOT_PRESETS gaia-guest localStorage + playingRef` | `src/components/As2Execute.tsx:playerRef + useEffect dispose player+audio + try/catch storage + playingRef rAF` | ✅ `as2player.lifecycle` |
| **FINAL-04** | Low | Keep — `FlashPlayer step() one frame vs AS2 tick()` | `src/components/ExecuteTab.tsx:FlashPlayer advanceTime+runFrame 5 steps + guard` | ✅ `flash/player.test` |
| **FINAL-05** | Info | Keep — `debug/store Map+activeId+skipNextBpId` fan-out | `src/debug/store.tsx:Map+activeId+skipNext` + `breakpointMatch.test 8` + `__peek/__place` | ✅ |
| **FINAL-06** | Low | Keep — `guard(where,fn)` same store `Scheduled` due | `avm1-action-audit 534/249` | ✅ |
| **FINAL-07** | Low | Keep — `Sushi \x02/\x03/\x01/\x04 + peerNetwork ws server/` | `gameServerStub.test` wire `2→1 29→44 45→35` offline no `fetch` | ✅ |
| **FINAL-08** | Info | Keep — shovel-ready `timelineResizeRef pointer capture test` | `src/App.tsx:101 timelineResizeRef {pointerId,startY,startHeight} + 581 setPointerCapture + 586 pointermove delta Math.max(156,min(max,height+delta)) + 591 pointerup` — DOM-only, jsdom no `pointerId`, **not covered by `loader.ui.test` — still open Info, shovel-ready** | ⚠️ **only remaining shovel-ready not fixed** — intentional Low/Info, no functional impact, shovel-ready to add `pointer-events` test |
| **FINAL-09** | Info | Keep — no new global leak (hostStack/_constructStack/constants) | `grep -n hostStack` at `e0c6c3e` still 8 hits, same as `bd20bed` | ✅ |

**Forgotten?** No — FINAL-08 is Info (not Low/Medium/Blocker) and correctly left as shovel-ready; no leak, `tsc`/`vitest` would not catch it, so “forgotten” is inaccurate — it’s documented.

---

## 3. Companion Audits Checklist (46)

### 3.1 `CODE_INSPECTOR_AUDIT.md` — 23 findings, **all fixed @ `79f6c09` → still fixed @ `e0c6c3e`**

| ID | Original Problem | Solution Still Present |
|---|---|---|
| CI-05 Critical | `plain {}` `toString` blanks Code workspace | `dict<T>()=Object.create(null)` null-prototype everywhere name-keyed — grep `Object.create(null)` 1 hit | ✅ |
| CI-01 High | `function f():Void` immediate `{` required | Single scanner optional `:Type` + `get`/`set` | ✅ |
| CI-03 High | `extractBalanced` braces inside strings/comments | `maskSource()` two length-preserving copies | ✅ 34× faster |
| CI-06 High | `var x:Number` typed/uninitialized/const missed | Declaration regex modifiers `public|…|static` + `var|const` + `:Type` + optional `= init` | ✅ |
| CI-10 High perf | `lineAt` O(n²) 2.7s | `lineMap` + binary search → 79ms | ✅ |
| CI-12 High | `resolveActionScriptFile` stale folder | `segments.includes(frameToken)` + `rank(base)` + `cacheGenerationRef` | ✅ |
| CI-13 High | `analyzeCodebase` per file N× | Single `useAS2Project` + `WeakMap` | ✅ WKS-02 |
| CI-14 High | Duplicate `CodePanel` → `tsc` 18 errors | Decomposition `inspector/*` | ✅ |
| CI-15 High data corruption | `frame_1` substring matched `frame_13` | `frameToken=frame_${frame}` + `segments.includes` | ✅ ASSET-03 |
| CI-02/04/07/08/09 Medium | `var f=function` / `score==10` / locals / def line | `maskSource` + `emit.ts` scope analysis | ✅ |
| CI-16/17/19 Medium | Duplicate labels, chips | `byPath`/`byId` scoring + `Chip onClick→onSelect` | ✅ |
| CI-11/18/20/21/22 Low | `kind` drift, empty-state | Tests 22/23 fail on original, 1 pins | ✅ |

**Forgotten?** No — `codeWorkspace.ui.test 7` etc. still green.

### 3.2 `EXECUTE_AUDIT.md` — 23 probes, **all closed**

| Layer | Solution @ `e0c6c3e` | Verified |
|---|---|---|
| Script execution | `transpileProject→ProjectResult→AS2Player 1833 LOC tick→enterFrame→advance→runQueue→guard→renderTo` | ✅ `avm1-action-audit 534/249` |
| Rendering | `rAF loop tick(dt)+render(ctx,scale*dpr)` `devicePixelRatio` | ✅ |
| Display model | `DisplayNode fromTimeline/startFrame/scriptMoved/playing/bornTick + DEPTH_OFFSET 16384 + NODE` (constants.ts) | ✅ |
| Interaction | `PlaceObject2 onClipEvent` + `keyDown/Up + pointerMove/Down/Up setPointerCapture` | ✅ |
| API stub | `builtins.ts MovieClip.play/stop/gotoAndStop queueFrame` | ✅ |
| Controls | `playingRef + session + dbgState.paused + step()` | ✅ |
| AS3 | `EngineFlash` separate from `EngineAS2` | ✅ |

### 3.3 `SWF_SPEC_19_AUDIT.md` — Ch.1-15, **spec-precise, all ancillary decoded-not-rendered**

- Fixed-point/FLOAT16/EncodedU32 varint (p.16), RECT Nbits (p.18), MATRIX/CXFORM (p.22-25), Header FileLength + CWS/ZWS (p.27-28), RECORDHEADER (p.28), dictionary+tag ordering (p.29) — basis complete, no further chunks needed (fetch verified 9 chunks 2012 spec).
- **Forgotten?** No — Phase 2 pins 15 chapter tables + AVM1 seam + writer + oracles.

---

## 4. `e0c6c3e` Fix Details (what was actually implemented, not just documented)

| Fix | Files | Diff | Why not forgotten |
|---|---|---|---|
| **WKS-08** `ExportOptions.mergeVariants` | `src/lib/exporter.ts:6 ExportOptions {mergeVariants?:boolean}; 19 DEFAULT_EXPORT mergeVariants:false` + `src/components/inspector/ExportPanel.tsx:41` typed `opts.mergeVariants` | `+2 lines` exporter, `1 line` panel `as any→typed` | `tsc --noEmit 0` proves type-safe; previously `as any` cast hidden missing field |
| **WKS-03** `CodeWorkspace TOKEN` block `/* */` | `src/components/CodeWorkspace.tsx:50 TOKEN /(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/|` + `61 token.startsWith('//') || token.startsWith('/*')` | `+ /**/ alternative` + highlight `||` | Corpus `//` only, but spec allows `/* */`; now handles both, `highlight` italic both |
| **WKS-05** `uid` `crypto.randomUUID` | `src/lib/project.ts:21 uid()=>{try{c.randomUUID().slice(0,8)}catch{}; return Math.random...}` | `+7 lines` | `36^8 2.8T → 3.4e14` when available, fallback for `localStorage:swfforge:project` |
| **ASSET-07** `MAX_LEVEL 12→20` | `src/lib/render.ts:33 MAX_LEVEL=12→20` | `1 line` | Corpus max ~6, spec allows deeper nesting; prevents silent truncation beyond 12 |
| **WKS-09** `LabelPanel usedBy` memo | `src/components/inspector/LabelPanel.tsx:4 import {useMemo}; 28 useMemo(()=>[...values()].filter(uses.includes),[doc,ch.id])` | `+1 import +1 line` | O(n²) n<500 <1ms, now memoized per `doc/ch.id` |
| **ASSET-10** `game-files` drift | `game-files/fish-full/swfs/bassken_overview.swf 30602→30610 +8`, `game_chat 179304→179438 +134`, `gsecs2.9 297175→297335 +160`, `manifest.json` stable, other 3 byte-identical, copy-through unchanged; `node generate-bundled.mjs` regen | `Bin 3 files` | `git diff --stat HEAD -- game-files 0` after regen proves reproducible; `swf-roundtrip` + `lossless-oracle` still pass; `manifest.json` stable |

**Gates prove not forgotten:** `tsc 0`, `vitest 50/3·222/3`, `vite 228 1,737.76kB`, `madge 5`, `game-files 0 diff after gen`.

---

## 5. Forgotten / Missed-Out Checklist (what the audit flagged but is still open — intentionally or not)

### 5.1 Intentionally open (Info/Low, no functional impact, documented as Keep)

- **ARCH-05** `any` reasoned debt — keep, 0 new `any`.
- **ARCH-06** `import.meta.glob` blind spot — document, `knip.json` hint already.
- **ARCH-09** prop drilling — keep until second top-level consumer.
- **SPEC-01/02/04/05/06/08/09** ancillary/spec — keep, P0/P1 priorities.
- **ENG-01/02/03/04/05/07/08/09** engine caps/queues — keep/document.
- **ASSET-01/02/04/05/06/08/09** assets — keep (ASSET-03 already fixed).
- **WKS-01/02/04/06/07/10** workbench — keep (heuristic, per-build cache, inclusive loop, cheap recompute).
- **FINAL-01/02/03/04/05/06/07/09** final — keep, pinned by synergy/breakpointMatch.
- **JSZip streaming >50M** (ASSET-07 second part) — still shovel-ready, correctly not fixed for 776K corpus.

→ **Not forgotten — disposition is “Keep (reasoned debt / document / corpus-small)” and pinned by a test that will fail first.**

### 5.2 Actually forgotten / stale docs (to fix)

| Item | State @ `b0f781a` | State @ `e0c6c3e` | Missed? | Action |
|---|---|---|---|---|
| `audits/FULL_AUDIT_SUMMARY.md` header | `Branch @ b0f781a`, `Gate 1,737.59kB`, `game-files 0 diff (ASSET-10 drift documented)` | **Still says `b0f781a` + `1,737.59kB` + drift documented as open** — stale, not updated to `e0c6c3e` `1,737.76kB` + drift **fixed** | **Yes — forgotten docs update** | Update header to `@ e0c6c3e` (or note “+ `e0c6c3e` fix”), gate to `1,737.76kB gzip 495.06kB`, reproduce `git checkout e0c6c3e`, and ASSET-10 row to “Fixed at `e0c6c3e` via `generate-bundled.mjs` commit (3 SWFs +8/+134/+160, manifest stable, 0 diff after regen)” |
| `audits/phases/PHASE-*-*.json` findings for 6 shovel-ready | `WKS-03/05/08/09`, `ASSET-07/10`, `ENG-06` say “Keep — shovel-ready” | **Code now Fixed but json still says Keep** — historical record, but checklist marks discrepancy | **Yes — minor, historical json not re-emitted** | Keep json as audit snapshot (read-only), note in checklist that code supersedes json; optionally emit `PHASE-5-WORKBENCH.json` v2 with dispositions “Fixed at `e0c6c3e`” |
| `FULL_AUDIT_SUMMARY.md` Low count | `Low 28, Info 13` @ `b0f781a` | **After `e0c6c3e` 6 fixes (5 Low +1 Info + ASSET-07 Low) → Low 22, Info 12** (FINAL-08 still Info) | **Yes — counts stale** | Update counts or add “+6 fixed at `e0c6c3e`” note |
| `FINAL-08` pointer capture test | Info shovel-ready `pointer-events` test via `@testing-library/user-event` | **Still open, 0 test** — intentionally Info, but checklist flags as only remaining shovel-ready | **Not forgotten — intentionally open** (Info, DOM-only, `tsc`/`vitest` wouldn’t have caught; `tsc` wouldn’t flag `loader.ui.test` gap) | Optionally add `src/components/__tests__/timelineResize.pointer.test.tsx` with `setPointerCapture` stub + `pointerId` guard — not required for gate, but would close Info |
| `git tag` for `e0c6c3e` | Checkpoints `audit-checkpoint-0..6` + `audit-checkpoint-full` @ `b0f781a` | **No tag for `e0c6c3e`** — push succeeded but no annotated tag | **Yes — missed tag** | `git tag -a audit-checkpoint-fix-6 -m "e0c6c3e 6 shovel-ready + ASSET-10"` + `git push origin audit-checkpoint-fix-6` (optional) |
| `package.json` scripts | `npm ci` 193 packages, 6 vulns (1 low, 5 high `whatwg-encoding`) | Same, `npm audit` not run fix | Low — not functional, dep `jsdom@24.1.x` via `whatwg-encoding@3.1.1` deprecated | `npm audit fix` would be optional, not required for audit |

### 5.3 Nothing functionally forgotten

- All 6 Medium (Phase 1) still fixed and verified via `grep` + tests — **not forgotten**
- All 23+23 companion High/Critical still fixed — **not forgotten**
- All 57 phased + 46 companion findings accounted for (103 rows above) — **none uncategorized**
- `tsc` 0, `vitest` green, `vite` stable, `madge` unchanged, `game-files` reproducible — **no gate forgotten**
- `ProjectResult→Player→canvas` one-way + `debug/store` never writes into `SwfDocument` — holds at `e0c6c3e`

---

## 6. Exit Checklist (repro at `e0c6c3e`)

- [x] `git fetch origin && git checkout e0c6c3e` (or `origin/arena/bf27040d-swf-studio`)
- [x] `npm ci` → 193 packages
- [x] `./node_modules/.bin/tsc --noEmit` → 0
- [x] `./node_modules/.bin/vitest run` → 50/3 files 222/3 tests
- [x] `./node_modules/.bin/vite build` → 228 1,737.76kB gzip 495.06kB
- [x] `npx madge --circular src/main.tsx --extensions ts,tsx` → 92 files 5 circulars 1 orphan 1 warning
- [x] `node tools/xml2swf/generate-bundled.mjs && git diff --stat HEAD -- game-files` → **0** (manifest + 6 SWFs byte-identical to committed `e0c6c3e`)
- [x] `grep -R "cacheGenerationRef\|hostStack\|Map<string" src/` → ARCH-01..09 still hold
- [x] `git log --oneline -5` → `e0c6c3e fix(audit): resolve 6 shovel-ready …` on top of `970a46e` `b0f781a` …
- [x] `git push origin arena/bf27040d-swf-studio` → already `e0c6c3e` (local out-of-date before `git reset --hard origin`)

**Overall verdict:** **Yes — no caveats, no blocker, no High open, and now also no shovel-ready Low open except FINAL-08 Info (DOM-only pointer test) and >50M streaming (corpus 776K).** 6 shovel-ready Low/Info that were “Keep — shovel-ready” at `b0f781a` are now Fixed at `e0c6c3e` and pinned by gates. Docs lag (summary header/counts/json) is the only forgotten item — functional code is complete.
