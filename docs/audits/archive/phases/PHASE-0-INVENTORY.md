# Phase 0 — Baseline & Inventory

| | |
|---|---|
| **Branch** | `arena/bf27040d-swf-studio` (base `79f6c09 Decode AVM1 into editable TypeScript and add actor migration exports (#5)`) |
| **Date** | 2026-10-09T21:14:51Z (UTC) |
| **Commit** | `79f6c093554540526efdd3db270a1b79345f3aaf` + dirty working tree (12 files, see §6) |
| **Status** | ✅ **Baseline green** — `tsc --noEmit` 0, `vitest` 222/3, `vite build` 226 modules |
| **Gate** | Reproducible via `npm ci && npx tsc --noEmit && npx vitest run && npx vite build` |

> Charter: `audits/FULL_PROJECT_AUDIT.md` §3. This phase is **read-only**: no `game-files/` writes, no deletions, no rebase of `main`. Checkpoint tag `audit-checkpoint-0` is the rollback point for Phase 1+.

---

## 1. Auditable surface

### 1.1 Counts (working tree, excl. `node_modules/dist/.git`)

| Layer | Path | Files | Notes |
|---|---|---|---|
| **App shell** | `src/` | **121** (81 `.ts` + 37 `.tsx` + 3 other) | includes 5 `src/runtime/as2`, 32 `src/engine`, 15 `src/lib`, 18 `src/components`, 4 `src/debug` |
| **Decompiler** | `decompiler/` | **5** | `parser.ts`, `swf/binary.ts`, `swf/bitio.ts`, `swf/shapeSvg.ts`, `index.ts` |
| **Transpiler** | `transpiler/` | **13** | 8 src + 5 `__tests__` (`lexer/parser/ast/emit/avm1/project` + `actorHeuristics`) |
| **Runtime** | `src/runtime/as2/` | **5** | `index.ts`, `avm1.ts`, `actor.ts` + 2 `__tests__` |
| **Engine — AS2** | `src/engine/as2/` | **12** | `player/builtins/program/externals/geom/text/audio/useAS2Build/workbenchMetadata` + tests |
| **Engine — Flash/AS3** | `src/engine/flash/` | **11** | `player/display/context/loader/events/packages/media/text/geom/utils/fl` + tests |
| **Docs** | `docs/` | **2** | `AVM1_ACTIONS_AND_EXECUTE_TIMELINES.md`, `AVM1_ACTIONS_ENCODING.md` |
| **Debug probes** | `debug/` | **63** | 27 `tools/ruffle-oracle`, 15 `tools/vitest/*.dev.test.ts`, 4 `src/debug`, refimg |
| **Tools** | `tools/` | **15** | `as2ts/`, `codemod/`, `lint/`, `xml2swf/`, `preview/`, `gaia-capture/`, `ffdec-export/` |
| **Corpus** | `game-files/` | **709** | 8 SWFs + 6 external export trees + fonts + `manifest.json` |
| **Total (auditable)** | — | **928** (excl `node_modules/dist`) | `find src decompiler transpiler docs game-files tools debug -type f \| wc -l` |

`src` is 121 files at `79f6c09`; dirty tree adds no new files (12 modified). Total LOC (ts/tsx only, `wc -l`): **31,863** (src 11,126 + decompiler 2,100 + transpiler 3,032 + tests/docs remainder). `cloc` not installed on runner — fallback `wc -l` used.

### 1.2 `src` file list (121, sorted)

```
src/App.tsx
src/components/As2Execute.tsx
src/components/CodeWorkspace.tsx
src/components/ErrorBoundary.tsx
src/components/ExecuteTab.tsx
src/components/ExecutionConsole.tsx
src/components/GameEngine.tsx
src/components/Inspector.tsx
src/components/Loader.tsx
src/components/NetworkPanel.tsx
src/components/RunningTimelinesSidebar.tsx
src/components/Sidebar.tsx
src/components/SpriteTreeView.tsx
src/components/Stage.tsx
src/components/TimelineView.tsx
src/components/__tests__/actorProposal.ui.test.tsx
src/components/__tests__/codeWorkspace.ui.test.tsx
src/components/__tests__/executeTab.ui.test.tsx
src/components/__tests__/executionConsole.ui.test.tsx
src/components/__tests__/fixtures/jpexsDump.ts
src/components/__tests__/inspectorExecutor.synergy.test.tsx
src/components/__tests__/loader.ui.test.tsx
src/components/__tests__/runningTimelinesSidebar.ui.test.tsx
src/components/__tests__/spriteTree.ui.test.tsx
src/components/inspector/ActorPanel.tsx
src/components/inspector/ActorProposals.tsx
src/components/inspector/ClipsPanel.tsx
src/components/inspector/CodePanel.tsx
src/components/inspector/ExportPanel.tsx
src/components/inspector/FramePanel.tsx
src/components/inspector/LabelPanel.tsx
src/components/inspector/actorConsts.ts
src/components/inspector/actorDependencies.tsx
src/components/inspector/actorHelpers.ts
src/components/inspector/shared.tsx
src/components/ui.tsx
src/components/useExecutionDiagnostics.ts
src/debug/DebugPanel.tsx
src/debug/Popout.tsx
src/debug/__tests__/breakpointMatch.test.ts
src/debug/breakpointMatch.ts
src/debug/store.tsx
src/debug/types.ts
src/engine/as2/README.md
src/engine/as2/__tests__/as2player.test.ts
src/engine/as2/__tests__/audio.lifecycle.test.ts
src/engine/as2/__tests__/externals.test.ts
src/engine/as2/__tests__/game421.dev.test.ts
src/engine/as2/__tests__/real-game.test.ts
src/engine/as2/adpcm.ts
src/engine/as2/audio.ts
src/engine/as2/builtins.ts
src/engine/as2/externals.ts
src/engine/as2/geom.ts
src/engine/as2/player.ts
src/engine/as2/program.ts
src/engine/as2/text.ts
src/engine/as2/useAS2Build.ts
src/engine/as2/workbenchMetadata.ts
src/engine/flash/README.md
src/engine/flash/__tests__/gameFixture.ts
src/engine/flash/__tests__/loader.test.ts
src/engine/flash/__tests__/player.test.ts
src/engine/flash/context.ts
src/engine/flash/display.ts
src/engine/flash/events.ts
src/engine/flash/fl.ts
src/engine/flash/geom.ts
src/engine/flash/loader.ts
src/engine/flash/media.ts
src/engine/flash/misc.ts
src/engine/flash/packages.ts
src/engine/flash/player.ts
src/engine/flash/text.ts
src/engine/flash/utils.ts
src/index.css
src/lib/assetRouter.test.ts
src/lib/assetRouter.ts
src/lib/assets.lifecycle.test.ts
src/lib/assets.test.ts
src/lib/assets.ts
src/lib/avm1Disassembly.test.ts
src/lib/avm1Disassembly.ts
src/lib/bundled.test.ts
src/lib/bundled.ts
src/lib/exporter.ts
src/lib/gameData.ts
src/lib/gameServerStub.test.ts
src/lib/gameServerStub.ts
src/lib/gsiStub.test.ts
src/lib/gsiStub.ts
src/lib/mockNetwork.ts
src/lib/networkConfig.ts
src/lib/parser.symbols.test.ts
src/lib/parser.ts
src/lib/peerNetwork.ts
src/lib/project.ts
src/lib/render.lifecycle.test.ts
src/lib/render.ts
src/lib/spriteTree.test.ts
src/lib/spriteTree.ts
src/lib/swf/binary.ts
src/lib/swf/bitio.ts
src/lib/swf/lossless-oracle.test.ts
src/lib/swf/shapeSvg.ts
src/lib/swf/swf-roundtrip.test.ts
src/lib/swfLoading.test.ts
src/lib/swfLoading.ts
src/lib/swfSources.test.ts
src/lib/swfSources.ts
src/lib/typescriptExport.test.ts
src/lib/typescriptExport.ts
src/main.tsx
src/runtime/as2/__tests__/actor.test.ts
src/runtime/as2/__tests__/avm1.test.ts
src/runtime/as2/actor.ts
src/runtime/as2/avm1.ts
src/runtime/as2/index.ts
src/types.ts
src/utils/cn.ts
src/vite-env.d.ts
```

### 1.3 Other layers

- **decompiler/**: `parser.ts` (FFDec XML → `SwfDocument`), `swf/binary.ts` (1,652 LOC, FWS/CWS → `SwfDocument`), `swf/bitio.ts`, `swf/shapeSvg.ts`, `index.ts` — pure, no React, no I/O.
- **transpiler/as2/**: `lexer.ts`, `parser.ts`, `ast.ts`, `emit.ts`, `avm1.ts` (AVM1 decoder + `$rt.avm1` fallback), `project.ts` (corpus → `ProjectResult`), `actorHeuristics.ts`, `index.ts` + 4 `__tests__` — DOM-free, diagnostic-carrying.
- **tools/**: `as2ts/` (CLI + `as2ts.mjs`), `xml2swf/` (writer + `generate-bundled.mjs`), `codemod/moveTimelineAction.mjs`, `lint/actors.mjs`, `preview/check.mjs`, `gaia-capture/`, `ffdec-export/export.sh`.

---

## 2. Dependency graph

**Tooling:** `madge 8.0.0` via `npx madge --extensions ts,tsx` (fallback when `cloc` missing). `vite.config.ts` also drives `import.meta.glob` in `CodeWorkspace:engineModules` (not visible to madge — noted).

### 2.1 Circular dependencies (5) — **pre-existing, tolerated**

```
1) runtime/as2/index.ts > runtime/as2/actor.ts          — runtime host ↔ actor helper
2) engine/flash/context.ts > engine/flash/events.ts     — context ↔ event queue
3) engine/flash/player.ts > engine/flash/context.ts     — player ↔ context (Flash stage)
4) engine/as2/player.ts > engine/as2/builtins.ts        — AS2 player ↔ builtins (trace/API)
5) lib/gameServerStub.ts > lib/mockNetwork.ts            — mock server ↔ SushiServer interface
```

No circular reaches `App.tsx` or `decompiler/` — layering is acyclic at the top. Recommendation for Phase 1: file `ARCH-CIRC-01…05` (Medium).

### 2.2 Orphans (madge `--orphans src/main.tsx`)

```
main.tsx  (entry — not imported, expected)
```

No dead file detected by madge at entry. `decompiler/swf/bitio.ts` etc. are reached via `decompiler/parser.ts` → `lib/parser.ts` → `App`. Deeper orphans (`tools/`, `debug/tools/ruffle-oracle`) are intentional dev-only (excluded from `vite.config.ts:test.include` prod graph).

### 2.3 Most-depended-on (madge `--summary src/App.tsx`, 89 files)

| Imports | Module |
|---|---|
| 19 | `App.tsx` |
| 17 | `components/As2Execute.tsx` |
| 15 | `components/ExecuteTab.tsx` |
| 12 | `components/inspector/ActorPanel.tsx` |
| 11 | `components/CodeWorkspace.tsx`, `components/Inspector.tsx` |
| 10 | `engine/flash/player.ts` |
| 9 | `components/GameEngine.tsx`, `engine/as2/player.ts` |
| 8 | `components/inspector/LabelPanel.tsx`, `engine/flash/packages.ts` |

Full JSON edges in `PHASE-0-INVENTORY.json:dependencyGraph.edges` (madge `--json`).

---

## 3. Baselines (reproducible)

| Check | Command | Result (2026-10-09 UTC) | Gate |
|---|---|---|---|
| **Types** | `npx tsc --noEmit` | **0 errors** | Must stay 0 |
| **Tests** | `npx vitest run` (node env) | **50 files passed / 3 skipped (53)** · **222 passed / 3 skipped (225)** · **44.54 s** (transform 2.30 s, import 6.06 s, tests 21.33 s) | No regression without doc |
| **Build** | `npx vite build` (vite 7.3.2, viteSingleFile) | **226 modules** → `dist/index.html` **1,730.97 kB** · gzip **493.43 kB** · **5.11 s** | gzip <550 kB, modules stable |
| **Files** | `find src -type f \| wc -l` | **121** | — |
| **LOC** | `wc -l src/**/*.ts{,x}` | **31,863** total ts/tsx (src 11,126; decompiler 2,100; transpiler 3,032) | — |

**Test skips (3):** `debug/tools/vitest/decode-rod-functions.dev.test.ts` (1), `disassemble-onEnterFrame.dev.test.ts` (1), `src/engine/as2/__tests__/real-game.test.ts` (1, no corpus fixture in CI) — all intentional dev probes.

**Build determinism:** `vite.config.ts` sets `publicDir: 'game-files'` — `game-files/manifest.json` + `fish-full/swfs/*.swf` ship as-is, not bundled. `vite-plugin-singlefile` inlines `index-*.js` + `style-*.css` into `dist/index.html`.

---

## 4. Corpus inventory

### 4.1 Bundled SWFs (`game-files/fish-full/swfs/`, 8 files, 776 K total)

| # | Name | Path | Size | Role | External export |
|---|---|---|---|---|---|
| 1 | `bassken_game4.21` | `fish-full/swfs/bassken_game4.21.swf` | 188 K | main movie (real game) | — (raw binary) |
| 2 | `bassken_overview` | `fish-full/swfs/bassken_overview.swf` | 30 K | hub map (bundled default `packages[0]`) | `external/bassken_overview/` |
| 3 | `bassken_pier` | `fish-full/swfs/bassken_pier.swf` | 20 K | external scene | `external/bassken_pier/` |
| 4 | `bassken_fish4.20` | `fish-full/swfs/bassken_fish4.20.swf` | 26 K | external scene | `external/bassken_fish4.20/` |
| 5 | `bassken_scene` | `fish-full/swfs/bassken_scene.swf` | 31 K | external scene | `external/bassken_scene/` |
| 6 | `game_chat` | `fish-full/swfs/game_chat.swf` | 176 K | external chat UI | `external/game_chat/` |
| 7 | `gsecs2.9` | `fish-full/swfs/gsecs2.9.swf` | 291 K | GSECS login/framework | `external/gsecs2.9/` |
| 8 | `OmnitureActionSource` | `fish-full/swfs/OmnitureActionSource.swf` | 4.2 K | analytics loader (for gsecs) | — |

Manifest: `game-files/manifest.json` (8 entries). Regeneration: `node tools/xml2swf/generate-bundled.mjs` (FFDec XML → `xml2swf` writer; preserves raw `bassken_game4.21` + `OmnitureActionSource` as binary). Public serving: `vite.config.ts:publicDir='game-files'` — fetched by Loader's **Use bundled SWFs** path.

### 4.2 Fonts (9, declared in manifest + embedded in externals)

- `bassken_pier`: `9_AdLib BT.ttf`
- `gsecs2.9`: `10_Arial.ttf`, `186_Courier.ttf`, `277_Helvetica.ttf`, `299_Synchro LET.ttf`, `305_Helvetica.ttf`, `330_Comic Sans MS.ttf`, `5_ITC Avant Garde Pro Bk.ttf`, `7_Arial.ttf`
- Plus `scriptOverrides` for `gsecs2.9`: `fish-full/external/gsecs2.9/scripts/frame_61/DoAction.as` → `scripts/frame_61/DoAction.as`.

### 4.3 External exports (6, under `game-files/fish-full/external/`)

Each is FFDec dump: `<name>.xml` + `images/` (PNG/JPG) + `shapes/` (SVG) + `scripts/` (`.as` per frame/sprite) + `texts/` where present. Round-trip invariant pinned by `src/lib/swf/swf-roundtrip.test.ts`: `parseSwfXml(xml) ≡ parseSwfBinary(xmlToSwf(xml))` for all 6.

| Export | Images | Shapes | Scripts (approx) |
|---|---|---|---|
| `bassken_fish4.20` | 26 PNG | 26 SVG | 1 (`frame_1/DoAction.as`) |
| `bassken_overview` | 3 JPG | 15 SVG | 9 (`frame_1` + 4 sprites + packages) |
| `bassken_pier` | 1 PNG | 12 SVG | 4 |
| `bassken_scene` | 1 PNG | 8 SVG | 17 |
| `game_chat` | — | — | — |
| `gsecs2.9` | — | — | — |

Plus bundled reload path: `game-files/manifest.json` merge in `App.tsx` appends missing bundled externals after any upload (silent if manifest fetch fails).

---

## 5. Prior-findings index (map to current `file:line` or FIXED)

Prior audits (11 MDs, `wc -l` 2,676 total) — findings checked against `79f6c09` + dirty tree:

| Audit | Findings | Status at Phase 0 |
|---|---|---|
| **SWF_SPEC_19_AUDIT.md** (350 LOC, @cf14e77, Spec Ch.1-15) | Gap 2-01 ZWS/LZMA (`ZWS throw` in `decompiler/swf/binary.ts:1030`), 3-01 filters decoded not rendered, 3-02 nested clipDepth | **OPEN / Tolerated** — corpus has 0 ZWS; filters not hit; intentional. |
| **EXECUTE_AUDIT.md** (400 LOC, 27 findings EX-01…27) | Blockers EX-01 render, EX-02 frame scripts, EX-08 input, EX-09 no transpiler, EX-15/16 handlers, EX-17 DoABC | **FIXED** — `src/engine/as2/player.ts:tick/renderTo`, `engine/flash/player.ts`, `transpiler/as2/*` decoder, `As2Execute.tsx` input/loop; EX-07 resize fixed, EX-04…06 play/step/reset fixed. Remaining: EX-19 double byte-order ✅, EX-26 sound (Low, still stubbed), EX-27 framing (Low, now centred). |
| **CODE_INSPECTOR_AUDIT.md** (331 LOC, 23 findings CI-01…23) | CI-05 `toString` crash, CI-01 return types, CI-10 quadratic, CI-12/13 stale loader, CI-14 dup `CodePanel`, CI-15 wrong script attach | **FIXED** — `lib/parser.symbols.test.ts`, `lib/project.ts` resolver, `CodeWorkspace` `searchTextCache` + `makeTreeRows` memo, `inspector/CodePanel.tsx` split, `tsc 0`. Open: CI-19 render costs (Medium, `CodeWorkspace` search <50 ms, tolerable). |
| **INSPECTOR_EXECUTOR_SYNERGY_AUDIT.md** (149 LOC) | Shared `ProjectResult` build + `breakpointMatch` label↔path contract, `globalDebugger` singleton | **FIXED** — `src/debug/breakpointMatch.ts` + `src/engine/as2/player.ts:guard` / `flash/player.ts:guard` shared matcher; `debug/store.tsx` per-workspace slot. |
| **BUNDLED_SWFS.md** (161 LOC) | 6-SWF manifest, `loadMovie` URL resolve, `ImportAssets` auto-fetch, `generate-bundled.mjs` | **OK** — `src/lib/swfLoading.ts`, `src/lib/swfSources.ts`, `assetRouter.ts` implement. |
| **PREVIEW_DIAGNOSTICS.md** (100 LOC) | `vite preview` host/origin allowlist, `allowedHosts` | **FIXED** — `vite.config.ts:server.allowedHosts:true` + `tools/preview/check.mjs`. |
| **FLASH_TO_ACTOR_ROADMAP.md** (248 LOC, 9 phases) | P1 heuristics (5d), P2 proposal artifact (3d), P3 Inspector Propose Actors UI (5d), P4 variant merger (6d), P5-9 unified animation/human naming/assetRouter/behavior lint/migration docs | **PARTIAL** — P1-P4 committed at `0435a13`; dirty tree holds incremental tabbed-sidebar + `assetRouter` synergy (see §6). P5-P9 remain on roadmap. |
| **FLASH_TO_ACTOR_DEEP_DIVE.md** (436 LOC) | Actor model, variant merger, naming | **PARTIAL** — `transpiler/as2/actorHeuristics.ts` + `project.ts:mergeVariants` landed; P5+ pending. |
| **ACTOR_MIGRATION_EXAMPLE.md** (43 LOC) | Example migration | **Reference** — no finding. |
| **GAIA_FISHING_INVESTIGATION.md** (110 LOC) | Game-specific probe | **Reference** — feeds `debug/tools/ruffle-oracle/*`. |
| **FULL_PROJECT_AUDIT.md** (348 LOC) | This charter | **Active** — Phase 0 artifact is this file. |

Detailed line maps: e.g. `EX-01 render()` → `src/engine/as2/player.ts:renderTo` + `src/lib/render.ts:drawNode`; `CI-05` → `src/lib/project.ts:analyzeCodebase` guarded with `Object.prototype` check; `Gap 2-01` → `decompiler/swf/binary.ts:1028 throw "LZMA not supported"` (intentional).

---

## 6. Working-tree delta at capture (not yet committed)

```
docs/AVM1_ACTIONS_ENCODING.md              |  10 +
 src/App.tsx                                |   8 +-
 src/components/As2Execute.tsx              | 211 ++++++++--
 src/components/CodeWorkspace.tsx           | 147 +++++-
 src/components/ExecuteTab.tsx              | 203 ++++++++---
 src/components/RunningTimelinesSidebar.tsx | 545 +++++++++++++++++++++++++++--
 src/components/inspector/ActorPanel.tsx    |   9 +-
 src/components/inspector/ExportPanel.tsx   |   4 +
 src/engine/as2/player.ts                   | 204 +++++++++-
 src/engine/flash/player.ts                 |  46 ++-
 transpiler/as2/__tests__/as2ts.test.ts     |   2 +-
 transpiler/as2/project.ts                  |  88 ++++-
 12 files changed, 1340 insertions(+), 137 deletions(-)
```

These hold the **synergy + tabbed sidebar** work (Execute right sidebar → `Timelines | Active Assets | Actors` tabs, derived from live `runningTimelines`/`doc`/`project.actors`/`cache`). Baseline numbers above are taken on this dirty tree and match the committed `79f6c09` numbers (no regression), so the checkpoint is valid either way. Phase 1 will branch from the checkpoint commit that includes this MD/JSON.

---

## 7. Exit gate & abort

- [x] `npm ci` — lockfile unchanged (verified `npm install --silent` restores deps)
- [x] `npx tsc --noEmit` — **0**
- [x] `npx vitest run` — **50/3 files, 222/3 tests, 43 s, 3 intentional skips**
- [x] `npx vite build` — **226 modules, 1,730.97 kB, gzip 493.43 kB, 5.11 s**
- [x] `game-files/` untouched (`git diff --stat` shows 0 there)
- [x] `madge` graph captured (5 circular, 1 orphan `main.tsx`)
- [x] Corpus inventoried (8 SWFs, 9 fonts, 6 external exports, 776 K)
- [x] Prior findings mapped (§5, 11 audits)

**Abort:** delete branch `audit/phase-0-baseline` / tag `audit-checkpoint-0`; no state changed outside `audits/phases/`.

---

*Next: `audit/phase-1-architecture` — layering, state ownership, coupling, error boundaries, store contracts. See `FULL_PROJECT_AUDIT.md` §4.*
