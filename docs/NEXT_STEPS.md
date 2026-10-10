# Next Steps — swf-studio @ `513f2e3`+ (post-audit)

**Branch:** `arena/bf27040d-swf-studio` @ `513f2e3` (Phase 6 `b0f781a` + `e0c6c3e` 6 shovel-ready + `FINAL-08` pointer test + `ASSET-07` streaming guard)  
**Gate:** `tsc 0` · `vitest 51/3 · 227/3` · `vite 228 1,738.19kB` · `madge 92 files 5 circulars 1 orphan` · `game-files 0 diff after regen`  
**Verdict:** **Yes — no caveats, no blocker, no High open.** Remaining shovel-ready is `>50M streaming` (corpus 776K) — now guarded, not blocking.

This document prepares the project for its **next development phase** after the 6-phase read-only audit + 2 fixups. It is the contributor entry-point for “what to build next, where to change it, and how to verify it”.

---

## 1. What was completed (audit → fix)

| Phase | What | Where | Test that pins it |
|---|---|---|---|
| **0** | Inventory 121→122 files, 8 SWFs 776K, 5 circulars | `audits/phases/PHASE-0-*` | `vitest 51/3` |
| **1** | Isolated engine: `hostStack`/`_constructStack`, `constants.ts` `DEPTH_OFFSET/NODE`, `DebuggerStore Map+activeId`, `cacheGenerationRef`, `tintCache` prune, `emit try/catch` | `src/runtime/as2/index.ts`, `src/engine/as2/*`, `src/debug/store.tsx`, `src/App.tsx` | `assets.lifecycle`, `as2player.lifecycle`, `breakpointMatch 8` |
| **2** | SWF-19 fidelity Ch.1-15, `avm1 534/249` oracle, `swf-roundtrip 6/6` | `decompiler/swf/binary.ts`, `tools/xml2swf/xml2swf.mjs` | `swf-roundtrip`, `avm1-action-audit` |
| **3** | Engine tick/queue/guard: `advanceBy 4 ticks`, `queue 200k`, `bornTick`, `DEPTH_OFFSET`, `guard re-queue` | `src/engine/as2/player.ts`, `src/engine/flash/player.ts` | `as2player.test`, `flash/player.test`, `game421.dev.test` |
| **4** | Assets/bundled: `deepest owner`, `segments.includes(frameToken)`, `MAX_LEVEL 12→20`, `expandUploadFiles` streaming guard `50M/200M`, `generate-bundled.mjs` repro (3 SWFs +8/+134/+160 committed) | `src/lib/assets.ts`, `src/lib/render.ts`, `tools/xml2swf/*` | `assets.lifecycle`, `render.lifecycle`, `bundled.test` |
| **5** | Workbench: `TOKEN /* */` + `highlight`, `uid crypto.randomUUID`, `ExportOptions mergeVariants`, `usedBy useMemo` | `src/components/CodeWorkspace.tsx`, `src/lib/project.ts`, `src/lib/exporter.ts`, `src/components/inspector/LabelPanel.tsx` | `codeWorkspace.ui.test 7`, `project.variants`, `synergy` |
| **6** | Final stitching: `cacheGenerationRef` + `disposeFlattenedSprites`, `normalizeProjectActors 275,200`, `Flash runFrame 5 steps`, `debug/store Map/activeId/skipNext`, `timelineResize pointer capture` | `src/App.tsx`, `src/components/GameEngine.tsx`, `src/components/__tests__/timelineResize.pointer.test.tsx` | `loader.ui.test`, `timelineResize.pointer 5` |

All **6 Medium** (Phase 1) + **High/Critical** (23 CODE_INSPECTOR + 23 EXECUTE) are fixed. Low/Info at `b0f781a` 28/13 → **22/12** after `e0c6c3e`/`513f2e3+` (6 fixed, only `JSZip >50M` streaming remains shovel-ready).

---

## 2. Architecture you can rely on (one-way, testable seams)

```
File[] → loadUploadedPackages / fetchBundledManifest → mergeBundledExternals
       → installPackages → packages:SwfPackage[] {doc, cache:AssetCache, assets}
       → GameEngine / As2Execute / ExecuteTab
       → tick(dt) → enterFrame → advance → runQueue → guard → renderTo(ctx,scale*dpr) → canvas
       + debug/store (Map+activeId, never writes into SwfDocument)
       + game-files/ only via generate-bundled.mjs (explicit)
```

| Seam | Env | Test without React? | Key file |
|---|---|---|---|
| Decompiler | node | ✅ `swf-roundtrip 6/6` | `decompiler/swf/binary.ts` |
| Transpiler `transpileProject` → `ProjectResult` | node | ✅ diffable `ProjectResult.files` | `transpiler/as2/project.ts` |
| Runtime `AS2Host/hostStack` | node | ✅ `RT.installHost(mock)` | `src/runtime/as2/index.ts` |
| Engine AS2 `AS2Player` | node | ✅ stub `measureCtx` + `HtmlAudioBackend(null)` | `src/engine/as2/player.ts` |
| Engine Flash `FlashPlayer` | node | ✅ mock `Stage` | `src/engine/flash/player.ts` |
| Assets `ingestFiles`/`AssetCache`/`flatten` | node | ✅ `Image` mock | `src/lib/assets.ts`, `src/lib/render.ts` |
| Workbench `useAS2Project`/`proposeActors` | jsdom | needs DOM | `src/components/CodeWorkspace.tsx`, `transpiler/as2/actorHeuristics.ts` |
| Final `App` | jsdom | needs DOM+File mock | `src/App.tsx`, `src/components/__tests__/timelineResize.pointer.test.tsx` |

**Implication:** Change `resolveActionScriptFile` knowing only `ingestFiles` (input) and `hydrateActionScriptSources` (consumer) — `assets.lifecycle` catches drift <2s. Change `render` knowing only `flatten` and `Stage` — `render.lifecycle` catches drift. Change `guard` knowing only `findMatchingBreakpoint` and `store.pause`.

---

## 3. Next development tracks (prioritized)

### Track A — Actor migration (highest value, corpus-driven)

**Goal:** Replace Flash timeline scripts with typed `Actor` classes (`transpiler/as2/actorHeuristics.ts` → `src/types.ts:Actor`) for `bassken_*` (8 proposals, 0 for `gsecs` library veto).

- **Entry:** `actors/hero_ball.ts` generated via `generateAS2Project` + `buildWorkbenchTimelineMetadata` (frameLabels + `idleClipFor`)
- **Files:** `transpiler/as2/actorHeuristics.ts:78 proposeActors` (veto `gsecs|game_chat|omniture` + `timelines>20 && sprites>15` + `mxCount>8`), `transpiler/as2/project.ts:mergeVariants` (visualKey/actionKey cluster 9/18/19/24 fish)
- **Next:** Wire `ActorPanel` proposals into `Project.actors:Actor[]` → `GameEngine.normalizeProjectActors` → `RuntimeClip` at `275,200` — already deterministic, needs UI to promote `hero_ball` from timeline to actor state machine. Test: `actorProposal.ui.test` + `project.variants.test` + `inspectorExecutor.synergy` (shim `hero_ball.ts` → `_proposal.json`).

### Track B — Streaming for >50M uploads

**Goal:** Today `expandUploadFiles` warns at `MAX_ZIP 50M` and truncates at `MAX_EXPANDED 200M` sequential (`src/lib/assets.ts:149`). Corpus is 776K; >50M is ~65× corpus.

- **Next:** Replace `JSZip.loadAsync(file)` (buffers whole ZIP) with `FileReader` streaming + `zip.js` or `DecompressionStream` per-entry, and move `ingestFiles` to Web Worker so UI stays responsive. Add `vitest` `assets.streaming.test.ts` with a 60M synthetic ZIP fixture (generated, not committed) that asserts warning + truncated return.

### Track C — Spec ancillary (only if corpus demands)

- `SPEC-02` filters/clipDepth single/CSMTextSettings stub, `SPEC-05` `DefineMorphShape` `ratio` interpolation in `shapeToSvg(ratio)`, `SPEC-06` `DefineVideoStream` VP6 via `WebCodecs` — all decoded-not-rendered, 0 hits on fishing corpus. Implement only when a new SWF hits `unknownTags`.

### Track D — AS3 / DoABC

- `EngineFlash` (`FlashPlayer 722 + loader 270`) is isolated from `EngineAS2`. `DoABC2` is currently alias-missing per SPEC — add `avm2` crate only if `bassken_game4.21` ever emits `DoABC` (it doesn’t; it’s AVM1).

---

## 4. How to work on the next track

```bash
git fetch origin && git checkout arena/bf27040d-swf-studio   # @ 513f2e3+
npm ci
./node_modules/.bin/tsc --noEmit                            # 0
./node_modules/.bin/vitest run                               # 51/3 files 227/3 tests ~60s
./node_modules/.bin/vitest run src/components/__tests__/timelineResize.pointer.test.tsx  # FINAL-08 5 tests
./node_modules/.bin/vite build                               # 228 1,738.19kB
npx madge --circular src/main.tsx --extensions ts,tsx        # 92 files 5 circulars 1 orphan
node tools/xml2swf/generate-bundled.mjs && git diff --stat HEAD -- game-files  # 0 (manifest stable)
```

- **New test goes next to code:** `src/lib/foo.test.ts` (node) or `src/components/__tests__/foo.ui.test.tsx` (jsdom). The audit pinned every seam to a file that will fail first — add the test that would have caught FINAL-08 (`timelineResize.pointer.test.tsx` is the template for DOM gaps).
- **No new `any`:** `grep -R "any" src/` is 373 + header `runtime/as2/index.ts:1` — narrow to `unknown`/`AS2Value` at value seam only.
- **No new circular:** `engine/as2/constants.ts` is the one-way value export for `DEPTH_OFFSET/NODE/TWIPS`; `builtins.ts` imports only `type DisplayNode`.
- **Game files:** `game-files/` is `publicDir` — only written by `generate-bundled.mjs` explicitly; `vite build` never touches it.

---

## 5. Checklist before opening a PR (next phase)

- [ ] `tsc --noEmit` 0, `vitest` 51/3·227/3, `vite` 228 modules, `madge` 5 circulars, `game-files` 0 diff after `generate-bundled.mjs` (or `git add game-files/` if writer drift, like ASSET-10)
- [ ] Updated `audits/phases/PHASE-*-*.json` disposition if you fix a `Keep — shovel-ready` (and matching `*.md` table row)
- [ ] No `madge --orphans` new file without citation; `import.meta.glob ?raw` is a known blind spot (ARCH-06) — add to `knip.json` ignore if needed
- [ ] One table per seam + one Mermaid diagram if you add a new seam (Phase docs §3+§4)
- [ ] `git tag -a audit-checkpoint-next -m "..."` on the fix commit (like `audit-checkpoint-0..6` + `fix e0c6c3e`)

---

## 6. Known Info that is intentionally left open

| Finding | Why left open | When to fix |
|---|---|---|
| `MAX_ZIP 50M / MAX_EXPANDED 200M` streaming guard (ASSET-07 second half) | Corpus 776K, sequential warn is enough; true streaming needs `zip.js` + Worker | When a real >50M ZIP upload hits OOM or UI jank in `expandUploadFiles` |
| `ARCH-05` `any` at value seam | `AS2Clip {[key:string]:any}` is spec-dynamic (`this._x`, `_global.sushi`); strict typing adds no safety | Never — narrow at call site to `unknown` only |
| `ARCH-06` `import.meta.glob ?raw` blind spot | `madge` under-reports 12 engine files; `knip` would flag orphans | Add `knip.json` `ignore` for `engine/as2/**`, `runtime/as2/**`, `transpiler/as2/**` |
| `SPEC-02/05` filters/morph/video | 0 hits on fishing corpus; `unknownTags` counts them | When a new SWF exercises the tag (add fixture + `swf-roundtrip` + `lossless-oracle` PNG) |

All other shovel-ready Low are now Fixed at `e0c6c3e`/`513f2e3+` (see `FULL_AUDIT_SUMMARY.md` Low 28→22, `IMPLEMENTATION_CHECKLIST_e0c6c3e.md` §2).

---

*Prepared for next development after the 6-phase audit (`b0f781a`) + follow-up (`e0c6c3e` → `513f2e3+`). Reproduce with `git checkout 513f2e3`.*
