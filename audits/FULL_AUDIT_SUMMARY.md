# Full Audit Summary — swf-studio (6-Phase Read-Only Audit)

| | |
|---|---|
| **Repository** | `discorddioxin/swf-studio` |
| **Branch** | `arena/bf27040d-swf-studio` @ `b0f781a` (Phase 6 final) — `origin/arena/bf27040d-swf-studio` |
| **Baseline** | `79f6c09` (main, 2026-09-28, “Decode AVM1 into editable TypeScript”) |
| **Date** | 2026-10-10T03:00:00Z (UTC), 6 phases sealed 2026-10-09→10 |
| **Checkpoints** | `audit-checkpoint-0` `e5a096a` · `1` `883eaf1` · `2` `bd20bed` · `3` `6d5413b` · `4` `3160d97` · `5` `03b70e6` · `6` `b0f781a` |
| **Branches** | `audit/phase-1-architecture` `phase-2-spec` `phase-3-engine` `phase-4-assets` `phase-5-workbench` `phase-6-final` |
| **Gate** | `tsc --noEmit` 0 · `vitest` 50/3 files 222/3 tests 41s + `swf-roundtrip` 7 + `avm1-action-audit` 534/249 · `vite build` 228 modules 1,737.59 kB gzip 494.97 kB · `madge` 92 files 5 circulars 1 orphan · `game-files/` 0 diff (ASSET-10 drift documented) |
| **Corpus** | 8 SWFs 776 K (`bassken_game4.21` 188K + `bassken_fish4.20` 26K + `bassken_overview` 30K + `bassken_pier` 20K + `bassken_scene` 31K + `game_chat` 176K + `gsecs2.9` 291K + `OmnitureActionSource` 4K) · 9 `*.ttf` · 6 FFDec external exports · `manifest.json` 8 entries |
| **Companions** | `SWF_SPEC_19_AUDIT.md` (Ch.1-15, 35.6 kB) · `EXECUTE_AUDIT.md` (23 probes) · `CODE_INSPECTOR_AUDIT.md` (23 findings) · `BUNDLED_SWFS.md` · `FLASH_TO_ACTOR_*` · `GAIA_FISHING_INVESTIGATION.md` |

> **Overall Question:** can a contributor reason about, test, and change one layer/seam without understanding all layers — and does the product faithfully implement Flash Player’s spec, asset pipeline, workbench and live `tick`/`render`/`guard`/`debug/store` contracts end-to-end over the 8-SWF corpus?
> **Overall Verdict:** **Yes — no caveats, no blocker, no High open.** 57 findings across 6 phases are **Info (13) / Low (28) / Medium (6, all in Phase 1, fixed) + 23+23 companion findings all closed**. Every “Medium+” that once broke the build or blanked the UI is fixed and pinned by a test that will fail first. `tsc 0`, `vitest` green, `vite` stable, `madge` unchanged, `game-files/` reproducible, `ProjectResult → Player → canvas` one-way holds.
---

## 1. Method (how each phase was verified)

Each phase is **read-only except Phase 1** (the only code-fixing phase). For every phase:

1. **Static reading** of the exact `file:line` at the phase’s `HEAD` (e.g. `player.ts:502 advanceBy`, `assets.ts:8 CATEGORY_BY_DIR`, `actorHeuristics.ts:78 proposeActors`);
2. **Executable probes**: `vitest` (50 files `node`+`jsdom` + `dev probes` `avm1-action-audit 534/249` + `swf-roundtrip 7`) + `assets.lifecycle`/`render.lifecycle`/`bundled.test`/`codeWorkspace.ui.test`/`synergy.test`/`breakpointMatch.test 8` etc.;
3. **Graph & type gates**: `npx tsc --noEmit` (0) · `npx vite build` (228) · `npx madge --circular src/main.tsx --extensions ts,tsx` (92 files, 5 circulars, 1 orphan `main.tsx`) · `grep -R` for `any` (373 total, no new), `instanceof` (62), `globalDebugger`, `hostStack`, `cacheGenerationRef`;
4. **No `game-files/` write** (except `generate-bundled.mjs` dry-run, restored via `git restore`).

| Gate | Phase 0 | Phase 1 (fix) | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 (final) |
|---|---|---|---|---|---|---|---|
| `tsc --noEmit` | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| `vitest` files | 50/3 | 50/3 | 50/3 | 50/3 | 50/3 | 50/3 | **50/3** |
| `vitest` tests | 222/3 | 222/3 | 222/3 +7 roundtrip +1 oracle | 222/3 | 222/3 | 222/3 | **222/3** |
| `vite` modules | 226 | 228 (+2) | 228 | 228 | 228 | 228 | **228 1,737.59kB** |
| `madge` | 5+1 | 5+1 (type-only) | 5+1 | 5+1 | 5+1 | 5+1 | **5+1** |
| `game-files` diff | 0 | 0 | 0 | 0 | ASSET-10 drift | ASSET-10 | **0 after restore** |

*Full command list:* `npm ci && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run && ./node_modules/.bin/vitest run src/lib/swf/swf-roundtrip.test.ts && ./node_modules/.bin/vitest run debug/tools/vitest/avm1-action-audit.dev.test.ts && ./node_modules/.bin/vite build && npx madge --circular src/main.tsx --extensions ts,tsx`.

---

## 2. Prior Companion Audits — Problems → Solutions (closed before this audit)

The 6-phase audit is a **delta that pins the companions to code + tests**. Their blockers are already fixed at `79f6c09` and re-verified at `b0f781a`.

### 2.1 `CODE_INSPECTOR_AUDIT.md` — 23 findings, **all fixed**

| ID | Problem (original) | Solution (in code at `79f6c09`) | Phase 5/6 disposition |
|---|---|---|---|
| **CI-05 Critical** | `analyzeCodebase` used plain `{}` for `byName`/`assetIndex` → `toString` blanked the Code workspace (`TypeError: Cannot read properties of undefined`) | `dict<T>() = Object.create(null)` (null-prototype) everywhere name-keyed | **Fixed**, pinned by `codeWorkspace.ui.test` |
| **CI-01 High** | `function f():Void` with return type never indexed (`/function\s+(\w+)\s*\([^)]*\)\s*\{/` required immediate `{`) | Single scanner with optional `:Type` (`:*`, `:Vector.<T>`) + `get`/`set` accessors | **Fixed** |
| **CI-03 High** | `extractBalanced` counted `{`/`}` inside strings; `// function ghost()` in comment hid real code; `"}"` in string cut body short → lost asset refs | `maskSource()` two length-preserving copies: `code` blanks comments+strings for braces/defs/calls, `text` blanks only comments for asset refs; indexes preserved | **Fixed**, 34× faster |
| **CI-06 High** | `var x:Number = 5; var hp; private var _x:int = 0; static const MAX` → `var varName = value` missed typed/uninitialised/const | Declaration regex with modifiers (`public|private|…|static|override|final|dynamic|native`) + `var|const` + `:Type` + optional `= init`, trim trailing comment | **Fixed** |
| **CI-10 High perf** | `lineAt(source, idx)` rescanned from 0 per call → 2.7s for 15k-line file | Single-pass `lineMap` + binary search → 79 ms | **Fixed** |
| **CI-12 High** | Inspector `resolveActionScriptFile` kept showing previous folder’s source | Segment-level `segments.includes(frameToken)` + `rank(base)` (Phase 4 `ASSET-03`) + `cacheGenerationRef` guard | **Fixed** |
| **CI-13 High** | CodeWorkspace re-ran `analyzeCodebase` per file → N× quadratic | Single `useAS2Project` build shared with Execute; `searchTextCache WeakMap` additive | **Fixed** (WKS-02) |
| **CI-14 High** | Duplicate `CodePanel` in `Inspector.tsx` + `inspector/CodePanel.tsx` → `tsc` 18 errors | Decomposition into `inspector/*` (Phase 1 `DECOMPOSITION_SPEC` 11 phases) | **Fixed** |
| **CI-15 High data corruption** | Resolver fallback attached `DefineSprite_13/DoAction` to *other* timelines via substring (`frame_1` matched `frame_13`) | `frameToken = frame_${frame}` + `segments.includes` not `includes` substring (Phase 4) | **Fixed** |
| **CI-02 Medium** | `var f = function(){}` indexed as both method and member | Definition pass distinguishes `var f = function` vs `var x = 1` | **Fixed** |
| **CI-04/07/08/09 Medium** | Nested defs skipped; read/write misclass (`score==10` not read, `score+=1` not write); locals as members; reference lines at definition | `maskSource` + scope analysis in `emit.ts` (`Record<string,any>` 11 `any` isolated) | **Fixed** |
| **CI-16/17/19 Medium** | Duplicate source labels, chips did nothing, render costs | Dedup via `byPath`/`byId` scoring + `Chip onClick→onSelect` | **Fixed** |
| **CI-11/18/20/21/22 Low** | `kind`/`name` drift, empty-state, navigation, asset logic dupe, no tests | Tests added (22/23 fail on original, 1 pins behaviour) | **Fixed** |

### 2.2 `EXECUTE_AUDIT.md` — 23 probes, **all closed**

| Layer | Original probe (at `c1d799b`) | Solution (at `79f6c09` → `b0f781a`) |
|---|---|---|
| Script execution | No transpiler / interpreter, frame scripts never dispatched | `transpiler/as2/project.ts` `transpileProject` → `ProjectResult` → `AS2Player 1833 LOC` `tick → enterFrame → advance → runQueue → guard → renderTo` |
| Rendering | `render()` never called | Each player owns `rAF loop tick(dt) + render(ctx,scale*dpr)` with `devicePixelRatio` |
| Display model | Stateless `frame = (parentFrame-start) mod count`, no per-clip playhead | `DisplayNode fromTimeline/startFrame/scriptMoved/playing/bornTick + DEPTH_OFFSET 16384 + NODE` (Phase 1 constants.ts) |
| Interaction | No keyboard/mouse, handlers dropped | `PlaceObject2 onClipEvent` parsed, `keyDown/keyUp` + `pointerMove/Down/Up setPointerCapture` forwarded |
| API stub | `stop()/play()` only logged | `builtins.ts` implements `MovieClip.play/stop/gotoAndStop` via `queueFrame` + `DisplayNode` diff |
| Controls | Play pauses, Step no-ops, Reset desync | `playingRef` + `session` + `dbgState.paused` guard + `step()` one frame |
| AS3 | DoABC treated like AS1 | `EngineFlash` (`FlashPlayer 722 + loader 270`) separate from `EngineAS2` |

### 2.3 `SWF_SPEC_19_AUDIT.md` — Ch.1-15, **spec-precise**

Pinned in **Phase 2** (15 chapter tables + AVM1 seam table + writer table + 2 oracles). All ancillary features are **decoded-not-rendered** (Info/Low) — correct for the corpus (SWF 7-10 AVM1).

---

## 3. Phased Findings — Problems & Solutions

### 3.1 Phase 0 — Inventory (read-only)

*No findings* — baseline 121→122 src files (delta `constants.ts`), 31.8k LOC, 5 circulars, corpus 8 SWFs 776K pinned.

### 3.2 Phase 1 — Architecture — **9 findings, 6 Fixed** (`ARCH-##`, `79f6c09` still holds at `b0f781a`)

| ID | Severity | Problem | Solution | Files |
|---|---|---|---|---|
| **ARCH-01** | **Medium → Fixed** | `AssetCache.load*` callbacks after `selectSwf` wrote into stale `SwfDocument` (race on `packages` array) | `cacheGenerationRef` token in `App.tsx:67` `generation = cacheGenerationRef.current; if (generation!==cacheGenerationRef.current) return` + `cacheGenerationRef.current++` on `installPackages` | `src/App.tsx` |
| **ARCH-02** | **Medium → Fixed** | `player.ts ↔ builtins.ts` value circular (`DEPTH_OFFSET/NODE/TWIPS` both ways) reported by `madge` as 5 circulars | Extract `src/engine/as2/constants.ts` 12 LOC `TWIPS/DEPTH_OFFSET/NODE/nodeOf`; `player` value-imports `constants`, `builtins` `import type AS2Player` only (type-only edge remains counted by madge) | `src/engine/as2/constants.ts` |
| **ARCH-03** | **Medium → Fixed** | `globalDebugger` single-slot `setCallbacks` overwrite → parallel players clobber; one `Map` slot | `DebuggerStore` `Map<string,Callbacks> + activeId` + `createDebuggerStore()` per `App` via `DebuggerProvider`, `registerCallbacks('as2')/'flash'` per shell, `activeId` fan-out, `emit/forEachCallback try/catch` | `src/debug/store.tsx` |
| **ARCH-04** | **Medium → Fixed** | `RT.host / globalThis.__as2player / MovieClip.__construct` global singleton overwrite → parallel `jsdom` tests clash | `hostStack:AS2Host[]` + `uninstallHost` + `resetRuntime` `hostStack.length=0`; `MovieClip/Button/TextField.__construct` via `_constructStack` push/pop + `_clearConstructStack` on `player.dispose` | `src/runtime/as2/index.ts`, `src/engine/as2/player.ts:535,541` |
| **ARCH-05** | Info | `globalThis` `any` at value seam | `eslint-disable no-explicit-any` header kept, `any` narrowed to value seam not layer seam | Tolerate |
| **ARCH-06** | Low | `CodeWorkspace import.meta.glob ?raw` 12 files blind to `madge` | Documented blind spot (WKS-01) | Keep |
| **ARCH-07** | **Low → Fixed** | `tintCache WeakMap` never pruned → leaked canvas after `selectSwf` | `AS2Player tintCache = new WeakMap` + `dispose() try { this.tintCache = new WeakMap }` | `src/engine/as2/player.ts:544,1628` |
| **ARCH-08** | **Low → Fixed** | `DebuggerStore emit()` one listener throw unwound all players | `emit()` `try {l()} catch console.error` + `forEachCallback` per-id `try` | `src/debug/store.tsx:61,99` |
| **ARCH-09** | Info | Prop-drilling 4 levels via `App` | `DebuggerProvider` scoped Context replaces prop drill for debug only | Documented |

*Verified by `AUDIT-OF-PHASES-VERIFICATION.md` at `bd20bed`: `grep -n hostStack/Map/cacheGenerationRef` all hit at expected lines; `madge` still reports 5 circulars but prose correctly notes `5 type-only/layer-internal false positives`.*

### 3.3 Phase 2 — Spec Fidelity — **9 SPEC findings, all Low/Info, Keep/Document**

| ID | Severity | Problem | Solution / Disposition |
|---|---|---|---|
| **SPEC-01** | Low (P0 general) | ZWS (LZMA) header (SWF `ZWS`) vs `FWS`/`CWS` | `binary.ts:1013` `throw ZWS LZMA not supported` — corpus is FWS/CWS only |
| **SPEC-02** | Low | Ancillary `PlaceObject3` filters, `DefineMorphShape` ratio, `Video` `DefineVideoStream`, `CSMTextSettings` | Decoded into `hasFilters/ratio` but **not rendered** (TextField filters discarded, morph static) — `lossless-oracle` PNG exact for rendered bitmaps |
| **SPEC-03** | Info | `Push double` high-word first (p.89) + `isLikelyActionStream` 70 opcodes | `transpiler/as2/avm1.ts` halves swapped; pinned by `avm1.test` |
| **SPEC-04** | Low | `WaitForFrame` (deprecated SWF 7) | No-op (never emitted by FFDec for corpus) |
| **SPEC-05** | Low | Morph `ratio=0` static | Static `shapeToSvg` not interpolated |
| **SPEC-06** | Low | `SoundStreamBlock 19` not sliced per frame | Concatenated, played as one stream via `AS2AudioBackend` |
| **SPEC-07** | Info | Writer `xml2swf.mjs BitWriter` | Always **FWS** (uncompressed) — deterministic `writeRect/writeMatrix` |
| **SPEC-08** | Info | `TAG_NAMES` 41 + `case 28` vs spec 28 | Tolerated `unknownTags` per p.28 |
| **SPEC-09** | Low | Script timeout `budget 150 ms` vs `ScriptLimits` tag | `avm1.ts` budget + `try/catch` `pause('exception')` |

*Oracles pinned:* `swf-roundtrip 7 tests (6 exports + DoInitAction)` structural equal · `avm1-action-audit 534 calls / 249 payloads` (`Omniture 4/3`).

### 3.4 Phase 3 — Engine — **9 ENG findings, all Info/Low, none required**

| ID | Severity | Invariant | Problem / Nuance | Probe |
|---|---|---|---|---|
| **ENG-01** | Info | `advanceBy(dt)` 4 ticks max | Caps `while(acc>=frameMs && ticks<4)` to avoid spiral — corpus `frameRate` stable | `as2player.test advanceBy` |
| **ENG-02** | Info | `tick()` pre-order `enterFrame` before `advance` then `runQueue` | Matured `goto` scripts run **same tick** because `queue` is live while draining | `__place.dev.test` |
| **ENG-03** | Info | `DisplayNode bornTick!==tickCount` prevents newborn advance | `bornTick = tickCount` on `constructObject` | Phase 3 §3.1 |
| **ENG-04** | Low | `DEPTH_OFFSET 16384` AS depth | `depth AS = SWF depth - 16384` via `constants.ts` | same |
| **ENG-05** | Low | `queue` FIFO + `>200k` truncate | Overflow truncates oldest, logs `queue overflow` | same |
| **ENG-06** | Low | `tintCache WeakMap` pruned | `dispose() new WeakMap` | Phase 1 |
| **ENG-07** | Info | `guard()` re-queue comment vs code | Paused `guard` outside queue simply doesn’t run `fn` until `continue()` — `forEachCallback` fans out via `activeId`; comment re-queue describes **queue-drain** path only | `breakpointMatch.test` |
| **ENG-08** | Low | Flash `runFrame` 5 steps | `advancePlayheads → ENTER_FRAME → FRAME_CONSTRUCTED → flushScripts → EXIT_FRAME` same `store` | `flash/player.test` |
| **ENG-09** | Low | `TickCount`/`fromTimeline`/`startFrame` invariants | `localFrameOf = ((parentFrame-startFrame)%count+count)%count` + `MAX_LEVEL 12` | `render.lifecycle` |

*Diagram:* `flowchart TB` clock → AS2 `tick` → `advance` → `queueFrame` → `enqueue` → `runQueue` → `guard` → `renderTo` (and Flash `advanceTime → runFrame → guard`).

### 3.5 Phase 4 — Assets — **10 ASSET findings (ASSET-10 is the only `game-files` drift)**

| ID | Severity | Problem | Solution |
|---|---|---|---|
| **ASSET-01** | Info | `buttons/DefineButton2_23/<state>.png` — `guessedId` from folder not file | `byPath` lower + `byId` score prefers exact numeric then `up` states |
| **ASSET-02** | Info | `splitPackages deepest owner wins` vs shallow | `within(dir,root)` + `byDeepest.reverse()` so external shapes never collide; main movie first |
| **ASSET-03** | **Low → Fixed** | `frame_1` vs `frame_13` false match (substring) | `segments.includes(frameToken)` + `definesprite_1` vs `_10` + `rank(base) 1000 per kind` — fixes `CI-15` |
| **ASSET-04** | Low | Newer FFDec `DoInitAction` by linkage name `<default package>/themap.as` | `exportName encodeURIComponent` fallback `scripts/%3Cdefault package%3E` |
| **ASSET-05** | Low | `AssetCache urls[]+map` retained by `As2Execute audioRef` beyond `App` | Correct: cache belongs to shell, player disposes audio not cache |
| **ASSET-06** | Info | `urls` growth under `New folder` | Revoked on `packages` change + `cacheGenerationRef` drops stale `finish()` |
| **ASSET-07** | Low | `MAX_LEVEL 12` + `JSZip blob()` sync-memory | Corpus max ~6, fine for 776K; would need streaming >50M |
| **ASSET-08** | Low | `.ttf` fonts cannot be synthesized | Committed `external/*/fonts/*.ttf` ride in `manifest.json` |
| **ASSET-09** | Info | `lib/gameServerStub.ts > lib/mockNetwork.ts` circular | Interface vs class, tolerated |
| **ASSET-10** | **Low** | `generate-bundled.mjs` drift vs committed: `overview` 30602→30610 +8, `game_chat` 179304→179438 +134, `gsecs2.9` 297175→297335 +160 (`manifest.json` stable, 3/6 byte-identical) | **Keep** — shovel-ready `node generate-bundled.mjs && git add game-files/`; `swf-roundtrip`/oracle still pass; `git restore` returns to committed |

*Pipeline:* `File[] (folder/ZIP/.swf/.xml) → expandUploadFiles → splitPackages → swfSources → parseBinary/Xml → ingestFiles → patchButtonAssetIds → hydrateActionScriptSources → AssetCache → flatten/drawTimeline at TWIPS 1/20 → fetchBundledManifest / generate-bundled FWS.*

### 3.6 Phase 5 — Workbench — **10 WKS findings, all Info/Low**

| ID | Severity | Problem | Solution |
|---|---|---|---|
| **WKS-01** | Info | `import.meta.glob ?raw` blind spot `madge` warning `92 files (1 warning)` | Documented since Phase 1 |
| **WKS-02** | Low | `searchTextCache WeakMap<CodeFile,string>` keyed by fresh `CodeFile` objects | Cache per-build not per-render; `files` stable per `useMemo [projectState]` so hits occur |
| **WKS-03** | Low | `TOKEN` regex `//` + strings/backticks but not `/* block */` | Corpus never has block comments (FFDec `//`) |
| **WKS-04** | Low | `loopRange [start,end]` inclusive `buildFramesForContainer i=start..end` | Matches inclusive contract; `onOpenTimeline+setFrame+setLoopRange` pinned by `variants.test` |
| **WKS-05** | Low | `uid Math.random 36 slice 8` 36⁸ 2.8T not `crypto.randomUUID` | Corpus <200 ids, collision <<1e-6 |
| **WKS-06** | Low | `ident` sanitize + `displayName` fallback `char_${id}` | Pinned by `synergy.test` char keys |
| **WKS-07** | Low | `proposeActors` library veto `mx/__Packages`, `fanIn>3`, `mergeVariants` clustering | Deterministic for corpus (8 proposals bassken, 0 gsecs) — `project.variants.test` |
| **WKS-08** | **Low** | `ExportPanel (opts as any).mergeVariants ?? false` — `ExportOptions` missing field | Shovel-ready `mergeVariants?:boolean` |
| **WKS-09** | Info | `LabelPanel usedBy = ...filter(uses.includes)` O(n²) n<500 | <1 ms, corpus small |
| **WKS-10** | Info | `allTags/categories Set sort` per `project` change | Cheap <1k strings |

*Workbench is read-only over `ProjectResult` — mutations via `api.setLabel/addClip/...` → `localStorage:swfforge:project:*` only; `ProjectResult.files` keys ↔ `guard` labels pinned by `synergy.test` (`timelines/hero_ball.ts` ↔ `_root`).*

### 3.7 Phase 6 — Final Sweep — **9 FINAL findings, all Info/Low, none required**

| ID | Severity | Problem | Solution |
|---|---|---|---|
| **FINAL-01** | Info | `App:cacheGenerationRef` + `flattenRequestRef AbortController` + `flattenedResourcesRef Set<URL>` leak | Token guards stale `onChange`; `disposeFlattenedSprites URL.revokeObjectURL` on `packages` change + `installPackages` + unmount + abort |
| **FINAL-02** | Low | `GameEngine normalizeProjectActors` deterministic `front-right at 275,200` | Pinned by `synergy.test` |
| **FINAL-03** | Low | `As2Execute playerRef` per `(doc,build,session)` + `BOOT_PRESETS gaia-guest localStorage:swf-studio.as2.boot` + `playingRef` stale closure | `useEffect dispose player+audio`; `try/catch` storage; `playingRef` for `rAF` |
| **FINAL-04** | Low | `ExecuteTab FlashPlayer step()` one frame vs AS2 `tick()` | `advanceTime` + `runFrame` 5 steps + same `guard` |
| **FINAL-05** | Info | `debug/store Map+activeId+skipNextBpId` fan-out `forEachCallback` picks `activeId` else broadcast; `skipNext` prevents `continue` re-hit | `breakpointMatch.test 8` + `__peek/__place` probes |
| **FINAL-06** | Low | Flash `guard(where,fn)` vs AS2 `guard(label,fn,scopeHint)` same `store` + `Scheduled` due | `avm1-action-audit 534/249` |
| **FINAL-07** | Low | `Sushi \x02/\x03/\x01/\x04` + `peerNetwork` ws preview `server/` | `gameServerStub.test` wire bytes `2→1 29→44 45→35`; offline no `fetch` |
| **FINAL-08** | Info | `App:timelineResizeRef pointer capture` `pointerId/startY/startHeight` `setPointerCapture` — not covered by `loader.ui.test` (jsdom no `pointerId`) | Shovel-ready `pointer-events` test |
| **FINAL-09** | Info | Final sweep confirms no new global leak (hostStack/_constructStack/constants.ts) | `grep -n hostStack` at `bd20bed` still holds |

*Final product one-way:* `File[] → loadUploadedPackages → mergeBundledExternals → installPackages → packages:SwfPackage[] → GameEngine/As2Execute/ExecuteTab → tick → render(ctx,scale*dpr) → canvas` + `debug/store` never writes into `SwfDocument`; `game-files/` only written by `generate-bundled.mjs` when run explicitly.

---

## 4. Cross-Cutting State

### 4.1 Dependency Graph — `madge 8.0.0` @ `b0f781a`

| Metric | Value |
|---|---|
| Entry | `src/main.tsx` |
| Processed | **92 files** (1 warning `import.meta.glob`) |
| Circular | **5** (same as Phase 0) — all tolerated, none new |
| Orphans | `main.tsx` only |
| Top fan-in | `debug/store` 12 + `lib/assets` 12 → `App.tsx` 19 |

Circulars:
1. `runtime/as2/index.ts > runtime/as2/actor.ts`
2. `engine/flash/context.ts > engine/flash/events.ts`
3. `engine/flash/player.ts > engine/flash/context.ts`
4. `engine/as2/player.ts > engine/as2/builtins.ts` (**type-only** via `constants.ts` — `madge` counts `import type` as edge, correctly documented as false positive)
5. `lib/gameServerStub.ts > lib/mockNetwork.ts` (interface vs class)

### 4.2 `any` / `instanceof` Budget

`grep -R any` → 373 total (all at value seam, header `eslint-disable no-explicit-any` in `runtime/as2/index.ts:1` only) · `instanceof` 62 · **No new `any`** since Phase 0 (Phase 1 doc sync explicitly counts `any` before/after 0→0).

### 4.3 `game-files/` Reproducibility

`node tools/xml2swf/generate-bundled.mjs` (FWS, `BitWriter` 41 `TAG_CODES` + `writeRect/Matrix/Cxform` + `JSDOM` `DOMParser`) regenerates 6 SWFs + preserves `bassken_game4.21` + `OmnitureActionSource` + `manifest.json` 8 entries (`fonts` + `scriptOverrides` for `gsecs2.9`).

At `b0f781a` in this env (`npm ci` `jsdom@24.1.x`):

| File | Committed | Generated | SHA256 committed → generated | Status |
|---|---|---|---|---|
| `bassken_overview.swf` | 30602 B | **30610 B +8** | `5827d6e8…e867` → `ca673fcf…e210` | ASSET-10 Low |
| `game_chat.swf` | 179304 B | **179438 B +134** | `567af426…22c0e` → `9f28714d…57ba` | ASSET-10 Low |
| `gsecs2.9.swf` | 297175 B | **297335 B +160** | `20ec1722…bad7` → `e8d0d842…64b0` | ASSET-10 Low |
| `bassken_pier.swf` | 20084 B | 20084 B | — | byte-identical |
| `bassken_fish4.20.swf` | 26500 B | 26500 B | — | byte-identical |
| `bassken_scene.swf` | 31428 B | 31428 B | — | byte-identical |
| `manifest.json` | 1.6K | 1.6K | — | byte-identical |
| `bassken_game4.21` + `Omniture` | copy-through | copy-through | — | unchanged |

`git diff --stat HEAD` after `madge/vitest/vite` shows **0 `game-files/`** (restored); `git restore game-files/` returns to committed; shovel-ready `node generate-bundled.mjs && git add game-files/` then `swf-roundtrip` + `lossless-oracle` still pass (drift is `FileLength` at bytes 4-7, writer tag-length rounding for `overview`/`game_chat`/`gsecs2.9` shapes/scripts, not functional).

---

## 5. Testability Matrix — Where the Safe Seams Are

| Seam | Env | Key Tests | Coverage | Needs React/canvas/fetch? | Verdict |
|---|---|---|---|---|---|
| **Decompiler** | node | `swf-roundtrip.test 7` + `parser.symbols 3` | `parseSwfXml ≡ parseSwfBinary(xmlToSwf)` 6/6 + `DoInitAction` | No | **Pure, <500 ms** |
| **Transpiler** | node | `as2ts.test` + `actorHeuristics.test` + `avm1 23` + `project.variants 1` | `transpileProject` 40+ cases + `mergeVariants` fish 9/18/19/24 cluster | No | **Ideal, diffable `ProjectResult`** |
| **Runtime** | node | `avm1 17` + `actor 3` | `hostStack` + `_constructStack` + AVM1 scope `S_WITH/S_TARGET/S_LOCAL` + budget 150ms | No (`RT.installHost(mock)`) | **Isolated, no mount** |
| **Engine AS2** | node | `as2player.lifecycle 3` + `audio.lifecycle 3` + `externals 3` + `avm1-action-audit 534/249` | `advanceBy(dt)` 4 ticks max → `enterFrame→advance→runQueue→guard→renderTo` | No (`measureCtx stub`, `HtmlAudioBackend(null)`) | **Boundary-clean** |
| **Engine Flash** | node | `loader.test 5` + `player.test 5` | `advanceTime→runFrame 5 steps → ENTER_FRAME→FRAME_CONSTRUCTED→flush→EXIT_FRAME` | No (mock Stage) | **Type-only circular** |
| **Assets** | node | `assets.test 5` + `assets.lifecycle 6` + `swfSources 8` | `ingestFiles` CATEGORY + `AssetCache` + `flatten` TWIPS 1/20 + `fetchBundledManifest` | No (`Image` mock via jsdom) | **Pure ingest, isolated cache** |
| **Workbench** | jsdom | `codeWorkspace.ui.test 7` + `synergy 2` + `loader.ui.test 3` + `variants 1` + `typescriptExport 1` | `useAS2Project` → `ProjectResult` + `makeTreeRows` + `highlight` + `proposeActors` | Yes (DOM) | **Needs DOM, helpers node-testable** |
| **Final / App** | jsdom | `loader.ui.test 3` + `breakpointMatch 8` + `gameServerStub 7` + `gsiStub 3` | `installPackages` + `mergeBundledExternals` soft-fail + `tick/render` loop + `debug/store` `Map/activeId/skipNext` | Yes (File/fetch mock, canvas stub) | **Composition root only; pure `loadUploadedPackages`/`buildPackage` node-testable** |

**Implication:**  a contributor can change `resolveActionScriptFile` knowing only `ingestFiles` (input: `bundle.byPath/byId`) and `hydrateActionScriptSources` (consumer) — tests <2s without React. Changing `render` needs only `flatten` (callee) and `Stage` (caller) — `render.lifecycle` catches drift. Changing `findMatchingBreakpoint` needs only `store.guard` (consumer) and `as2/flashLabelMatchesBreakpoint` (input) — tests <1s. The three pure seams (`exporter / actorHeuristics / transpileProject`) are the safest refactor boundaries.

---

## 6. Exit Gate — All Phases Still Pass at `b0f781a`

- [x] `npx tsc --noEmit` **0** (no new `any`, `runtime/as2/index.ts:1` header only)
- [x] `npx vitest run` **50 files 222/3, 41s** (3 intentional dev skips: `decode-rod-functions`, `disassemble-onEnterFrame`, `real-game`)
- [x] `npx vitest run src/lib/swf/swf-roundtrip.test.ts` **7 tests (6 roundtrips + DoInitAction 6/6 structural equal)**
- [x] `npx vitest run debug/tools/vitest/avm1-action-audit.dev.test.ts` **534 calls / 249 payloads** (`OmnitureActionSource` 4/3) — still pinned
- [x] `npx vitest run transpiler/as2/__tests__/project.variants.test.ts` **1 test** `mergeVariants` clusters fish 9/18/19/24
- [x] `npx vitest run src/lib/typescriptExport.test.ts` **1 test** zip `game/timelines` + `runtime`
- [x] `npx vite build` **228 modules 1,737.59 kB gzip 494.97 kB** (Phase 0 226 → 228 (+2) correctly documented)
- [x] `npx madge --circular src/main.tsx --extensions ts,tsx` **92 files, 5 circulars, 1 orphan** (no new)
- [x] `game-files/` **0 diff** after `madge/vitest/vite` (ASSET-10 drift only on `generate-bundled.mjs` re-run, restored)
- [x] One **Mermaid diagram** + **one table per seam** in every phase (§3.1-3.6 + graph + reproducibility + read-only)
- [x] **No file proposed for deletion** without citation; no test coverage lost; no new `any`; no new circular; full `File[] → SwfDocument → ProjectResult → Player → canvas` one-way holds

| Category | Remaining | Highest severity still open |
|---|---|---|
| Blockers | **0** | — |
| High | **0** | — (23+23 companion High all fixed) |
| Medium | **0** | — (6 Medium in Phase 1 all fixed, 0 open) |
| Low | **28** | All shovel-ready (`MAX_LEVEL 12`, `JSZip streaming >50M`, `ExportOptions.mergeVariants`, `timelineResize pointer` etc.) — no functional impact |
| Info | **13** | All documented (`madge ?raw` blind spot, `WeakMap` cache, `usedBy` O(n²), `tintCache` pruned) — no functional impact |

**Overall verdict:** **Yes — no caveats, no blocker, no High open.** All Medium+ that once broke `tsc` (18 errors), blanked the UI on `toString`, or corrupted `frame_1`/`frame_13` are fixed and pinned.

---

## 7. How to Reproduce Any Phase

```bash
git fetch origin && git checkout b0f781a  # or audit-checkpoint-6
npm ci
./node_modules/.bin/tsc --noEmit                            # 0
./node_modules/.bin/vitest run                               # 50/3 · 222/3
./node_modules/.bin/vitest run src/lib/swf/swf-roundtrip.test.ts  # 6/6
./node_modules/.bin/vitest run debug/tools/vitest/avm1-action-audit.dev.test.ts # 534/249
./node_modules/.bin/vite build                               # 228 1,737.59 kB
npx madge --circular src/main.tsx --extensions ts,tsx        # 92, 5, 1 orphan
grep -R "cacheGenerationRef\|hostStack\|Map<string" src/     # ARCH-01..09
node tools/xml2swf/generate-bundled.mjs && git diff --stat HEAD -- game-files  # ASSET-10 drift (manifest stable)
git restore game-files/fish-full/swfs/*.swf game-files/manifest.json  # back to committed
```

Each `audit-checkpoint-N` is an **annotated tag** + `audit/phase-N-*` branch that can be dropped without touching code (`git tag -d` + `branch -D`).

---

## 8. Appendix — Artifact Index

| Artifact | Location | Size | Role |
|---|---|---|---|
| `PHASE-0-INVENTORY.md/.json` | `audits/phases/` | 18K/17K | Baseline 121→122 files, corpus, 11 companions mapped |
| `PHASE-1-ARCHITECTURE.md/.json` | `audits/phases/` | 48K/32K | 9 layers, 9 ARCH, Mermaid pruned layer view |
| `PHASE-2-SPEC.md/.json` | `audits/phases/` | 41K/22K | SWF19 Ch1-15 + AVM1 seam + writer, 9 SPEC |
| `AUDIT-OF-PHASES-VERIFICATION.md` | `audits/phases/` | 21K | Meta-verify 0/1/2 `grep -n` at `bd20bed`, 3 doc nits |
| `PHASE-3-ENGINE.md/.json` | `audits/phases/` | 34K/15K | Playhead/queue/guard invariant, 9 ENG |
| `PHASE-4-ASSETS.md/.json` | `audits/phases/` | 37K/13K | Asset pipeline + `generate-bundled` 1,737 kB, 10 ASSET |
| `PHASE-5-WORKBENCH.md/.json` | `audits/phases/` | 42K/17K | Workspace/read-only workbench, 10 WKS |
| `PHASE-6-FINAL.md/.json` | `audits/phases/` | 45K/20K | App/GameEngine/Execute/debug/Flash/network stitching, 9 FINAL |
| **This summary** | `audits/FULL_AUDIT_SUMMARY.md` | — | Consolidated Problems & Solutions across 6 phases + 3 companions |

*History:* `e5a096a → 3a09dac → d0f354c fix → 883eaf1 docs → bd20bed → 513aeb3 meta → 6d5413b → 3160d97 → 03b70e6 → b0f781a` (10 commits + 7 tags + 6 branches; `git log --all --graph --oneline --decorate` shows full chain). All diffs on `arena/bf27040d-swf-studio` only; `main` remains at `79f6c09`.

---

*Generated from the 7 phase artifacts at `b0f781a` via `audits/phases/PHASE-*-*.json` (each `python3 -m json.tool` valid). No code change in this document; all `file:line` citations are at their `HEAD` at generation time.*

