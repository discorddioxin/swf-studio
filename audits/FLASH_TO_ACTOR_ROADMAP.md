# Implementation Roadmap — Flash MovieClip → Actor/Behavior/Animation

> **Source:** `audits/FLASH_TO_ACTOR_DEEP_DIVE.md` (2026‑10‑09, 7‑signal decision procedure + 4 corpus examples)
> **Goal:** Replace the fragmented `scripts/DefineSprite_*/frame_*/DoAction.as` forest with a handful of cohesive `actors/<name>/{Behavior,Animation}` files that a modern engine can own. No behavior change to shipped transpilation; all steps are additive and reversible until the final merge is user‑approved.
> **Branch baseline:** `arena/bf27040d-swf-studio` (`transpiler/as2/project.ts` already groups by timeline; `src/runtime/as2/actor.ts` + `src/types.ts:Actor/Clip` exist; `Project.characters/clips/actors` persisted).

---

## 0. Principles and constraints (from the deep‑dive)

* **Timeline is the atom; Actor is the molecule.** One `DefineSprite` = one timeline. One Actor = one or many timelines that are *visual variants of the same entity*.
* **Cohesion test:** “Would this tiny file be meaningless without its sprite?” → fold it. In‑degree ≤ 1 + visual‑only out‑degree → fold; shared or scripted child → keep separate.
* **Additive only until explicit merge.** The current `timelines/*.ts` and `actors/*.ts` remain importable. The proposal is emitted alongside (`_proposal.json`, `as2ts‑report.md`); nothing is deleted until the user clicks “Accept merge”.
* **≤ 30 lines per code change, build‑verified, pure extraction** — the same discipline that let `Inspector.tsx` shrink from 1517 to 78 lines without loops (see `DECOMPOSITION_SPEC.md`). Every phase below is sliced into ≤ 30‑line steps.

---

## 1. At‑a‑glance: 9 phases, ≈ 7 weeks, P0 → P3

| Ph | Name | Prio | Effort | Depends | Deliverable | Risk if skipped |
|---|---|---|---|---|---|---|
| **0** | Foundation audit (DONE) | — | — | — | This roadmap + deep‑dive (§10 proof) | — |
| **1** | **Heuristics engine** (`visualVarianceOnly`/`fanIn`/`linkage`) | **P0** | 5 d | 0 | Pure function `proposeActors(doc)` + unit tests | No automated grouping → manual work forever |
| **2** | **Proposal artifact** (`actors/_proposal.json` + `as2ts‑report` hook) | **P0** | 3 d | 1 | Side‑car JSON, no UI change | Proposals not surfaced |
| **3** | **Inspector “Propose Actors” UI** (pre‑fill `api.addActor`) | **P0** | 5 d | 2 | Button in `ActorPanel`; one‑click accept | Proposals stay invisible |
| **4** | **Directional‑variant merger** (fish school 9/18/19/24) | **P0** | 6 d | 1,3 | `actors/fish/` with 4 animation sub‑modules, `movementClips` wired | Fishing’s most visible fragmentation stays |
| **5** | **Fold `placements` into `frames`** (single `animation[]`) | **P1** | 5 d | 1 | Cohesive `export const animation = [{frame,label,actions,instances}]` | Two‑map confusion persists; future Behavior extraction harder |
| **6** | **Human naming** (SymbolClass/`defaultPackage`/Workbench labels) | **P1** | 4 d | 1 | `timelines/fisher.ts` not `sprite_10.ts`; `nameSegment` tested | Numeric names drive users away |
| **7** | **Asset inlining policy** (per‑actor `shapes/` vs `shared/`) | **P1** | 4 d | 1 | `uses`‑count router; inlined SVGs for variant‑only shapes | Either bloat or broken shared refs |
| **8** | **Behavior/Animation split & migration lint** | **P2** | 6 d | 4,5 | `FisherBehavior.ts` stub, `TimelineActor`→`Actor` lint, double‑dispatch guard | Actor file still mixes `frames` callbacks + `update()` |
| **9** | **Validation, docs, example PR** (pier + fisher + fish) | **P2** | 4 d | 8 | Updated `AVM1_ACTIONS_ENCODING.md`, demo diff, `npm run as2ts` round‑trip | No proof |

Total ≈ 42 d engineering + 4 d buffer → **7 weeks** at one engineer, **4 weeks** at two (phases 6‑7 parallel with 4‑5).

---

## 2. Phase details (tasks sliced to ≤ 30 lines each)

### Phase 1 — Heuristics engine (P0, 5 d)

*Location:* new `transpiler/as2/actorHeuristics.ts` (or `src/lib/actorPropose.ts` re‑used by both transpiler and Inspector) — **pure, no FS**.

**Tasks:**

1. **1a. Types & skeleton (≤ 30 l):** `interface ActorProposal { name, reason, score, timelineIds[], variantOf?, kind: "actor"|"variant"|"scenery"|"library"|"service" }` + `interface Heuristics { fanIn: Map<id,count>, fanOut: Map<id, Set<id>>, linkage: Map<id,string>, isInitClass: Set<id>, labelSets: Map<id,Set<string>> }` [ref: `src/types.ts: SwfDocument.timelines`, `SwfCharacter.uses`, `symbolClasses`]
2. **1b. Fan‑in/out (≤ 30 l):** `fanIn` = count `Frame.display[].characterId` across *all* timelines (root + sprites) plus `PlaceObject2` scan; `fanOut` = `characters.get(id).uses`. Uses existing `doc.timelines: Map<string,Timeline>` already in `project.ts`.
3. **1c. Linkage + init‑class (≤ 30 l):** `linkage(id)= symbolClasses.get(id) || defaultPackageName(id)` via existing `defaultPackage` RE `/%3Cdefault package%3E\/([^/]+)\.as/`; `isInitClass` = `//`-scan of `DoInitAction` files for `Object.registerClass` / `class X extends`.
4. **1d. Label‑sets & code‑density (≤ 30 l):** `labelSets` = `new Set(frames.flatMap(f=>f.label).filter(Boolean))`; `codeHash` = sha1 of `transpiler` emitted `frames` bodies (after stripping `this._x` names) + `visualHash` = sha1 of sorted `display[].characterId` per frame.
5. **1e. Score function (≤ 30 l):** Port deep‑dive pseudo (p.6) into `scoreActor(T)` exactly:
   ```
   if (path.includes("__Packages/mx") || fanIn.get(id)>3) return -Infinity;
   s=0; if(linkage) s+=3; if(isInitClass) s+=2; if(frames.length>1||labelSets.size>0) s+=1;
   if(/this\.(stop|play|_x|attachMovie|createEmptyMovieClip)/.test(code)) s+=1;
   if(isPlacedOnceAtRoot && frameCount<=4 && visualVarianceOnly) s-=2;
   ```
   + unit‑test the thresholds against the 4 corpus cases (§7) — fisher=6 (actor), fish‑variants=‑1 then grouped, ScrollView=‑Infinity (library).
6. **1f. Variant grouping (≤ 30 l):** `visualVarianceOnly(group)` = Jaccard on `display` sets ==1 for codeHash but <0.2 for visualHash; same `frameCount` & same label set size. Groups `9/18/19/24` → one proposal `kind:"actor"` name `fish`, sub‑proposals `kind:"variant"` for each.
7. **1g. Classify rest (≤ 30 l):** `frameCount==1 && !code && !linkage → scenery`; `large avm1 + no display` (Omniture) → `service`.
8. **1h. Tests (≤ 30 l per file):** `transpiler/as2/__tests__/actorHeuristics.test.ts` with fixtures derived from `game-files/fish-full/external/bassken_scene` (the 4 fish) + `bassken_overview` (fisher vs map). Snapshot `proposeActors(bassken_scene.doc)`.

**Exit criteria:** `proposeActors(doc)` returns for bassken_scene exactly `{ actors: [{name:"fish", timelineIds:[9,18,19,24], kind:"actor", variants:[…]}] }` and for `bassken_overview` `{ actors:[{name:"fisher",timelineIds:[10]}]}`; for `game_chat` returns 0 actors (library).

---

### Phase 2 — Proposal artifact (P0, 3 d)

*Where transpilation already writes `as2ts‑report.md`.*

1. **2a. Import heuristics (≤ 30 l):** `transpiler/as2/project.ts` imports `proposeActors`; after `timelines Map` is built, call it.
2. **2b. Emit JSON (≤ 30 l):** `files.set("actors/_proposal.json", JSON.stringify({ version:1, proposals, diagnostics }, null, 2))` **and** append a `## Actor Proposals` section to `as2ts‑report.md` (human‑readable markdown table: `| Actor | Score | Timelines | Reason | Variant? |`).
3. **2c. Tests (≤ 30 l):** `src/lib/typescriptExport.test.ts` asserts `_proposal.json` present when any actor score ≥2; hex‑stable.
4. **2d. Docs (≤ 30 l):** `docs/AVM1_ACTIONS_ENCODING.md` §“Actor proposals” one paragraph; `transpiler/as2/README` snippet.

**Exit criteria:** `npm run as2ts -- game-files/fish-full/external/bassken_scene -o /tmp/out` writes `/tmp/out/actors/_proposal.json` and report section; no existing `timelines/*.ts` path changes.

---

### Phase 3 — Inspector “Propose Actors” UI (P0, 5 d)

*Reuse `src/lib/project.ts: addActor/updateActor/assignClip` + `ActorPanel.tsx`.*

1. **3a. Load proposal (≤ 30 l):** `Inspector.tsx` (or new `src/components/inspector/ActorProposals.tsx`) fetches `actors/_proposal.json` alongside `project.files` map (already available as `projectState.project.files` keys). Parse or show “no proposals”.
2. **3b. Proposal card (≤ 30 l):** Render table: `Actor | Timelines | Score | Reason | Variant? | [Preview] [Accept]`. `Preview` opens `ClipsPanel` filtered to those `timelineIds`.
3. **3c. Accept (≤ 30 l):** `onAccept(p)` → `api.addActor({ name: p.name, clipIds: p.timelineIds.map(id→clipIdForTimeline) })` + wire `capabilities.movementClips` / `idleAnimations` when `p.variants` present (pre‑fill `ACTOR_MOVEMENT_SLOTS` four entries).
4. **3d. Multi‑accept / dismiss (≤ 30 l):** `Accept all` + `Dismiss` (stores dismissed proposal id in localStorage; re‑proposes on next build).
5. **3e. Tests (≤ 30 l):** `src/components/__tests__/actorProposal.ui.test.tsx` (jsdom): renders `ActorPanel` with mocked `_proposal.json`, clicks `Accept` → `project.actors.length==1`.
6. **3f. Slice guard (≤ 30 l):** Move `ActorPanel`’s `ACTOR_*` consts + `normalizeActorKey` reuse: no copy‑paste.

**Exit criteria:** User loads `bassken_scene`, sees “Proposed: `fish` ← sprites 9,18,19,24 (directional variants)” in Inspector, clicks Accept → `actors.length==1`, its `clipIds` are the 4 variant clips and `movementClips` is pre‑filled; refreshing keeps it (persisted via `Project`).

---

### Phase 4 — Directional‑variant merger (P0, 6 d)

*The only user‑visible “merge files” step. Everything before was additive; this is the first that rewrites `timelines/` output, but only when proposal is accepted.*

1. **4a. Variant emitter flag (≤ 30 l):** `transpiler/as2/project.ts` new `options.mergeVariants?` (default `false` for backward compat). When `true` and proposals contain a group of same labelSet, emit **one** actor file + N animation sub‑modules instead of N timelines.
2. **4b. Sub‑module emitter (≤ 30 l):** For group `fish:9/18/19/24`, emit `actors/fish/animation/FrontLeft.ts` (= old `timelines/sprite_9.ts` body stripped of actor wrapper), etc. Share `behavior` import; each is just `export const frames/placements`.
3. **4c. Actor aggregator (≤ 30 l):** `actors/fish/FishActor.ts` imports the 4 sub‑modules, re‑exports `export const animations = { frontLeft, frontRight … }` and `export class FishActor extends TimelineActor { constructor(sprite){ super("Fish", sprite, animations.frontLeft /* default */) } facing(f:string){…} }`. Wires `capabilities.movementClips` IDs to sub‑module keys (re‑use `nameSegment`).
4. **4d. Fallback shim (≤ 30 l):** Keep old `timelines/sprite_9.ts` *also* emitted when `mergeVariants=false`; when `true`, emit a one‑line re‑export shim (`export * from "../actors/fish/animation/FrontLeft"`) so existing imports don’t break.
5. **4e. Inspector toggle (≤ 30 l):** `ExportPanel` checkbox “Merge directional variants (actors/fish)”.
6. **4f. Tests (≤ 30 l):** `transpiler/as2/__tests__/project.variants.test.ts` snapshot: input 4 identical‑code sprites → output file list contains `actors/fish/FishActor.ts` + 4 animation files + shims.

**Exit criteria:** With flag on, `bassken_scene` build output file count drops from 6 timelines (root + 5 sprites) to 2 timelines (root + leftover) + 1 fish actor (1 top + 4 animation) — net −1 file but −16 tiny scripts upstream. `npm run as2ts -- bassken_scene --merge-variants` round‑trips (`as2ts‑report.md` tag order unchanged).

---

### Phase 5 — Fold `placements` into `frames` (P1, 5 d)

*Today `timelines/sprite_9.ts` has two maps (`frames` + `placements`). The deep‑dive recommends one array.*

1. **5a. New shape (≤ 30 l):** Define `export interface FrameSpec { frame: number; label?: string; actions?: (this:AS2Clip)=>void; placements?: Record<depth,AS2Handler[]>; instances: DisplayItem[]; ops: PlaceOp[] }` re‑using `FrameActionDetail` already in `src/types.ts:218`.
2. **5b. Builder (≤ 30 l):** `buildFramesForContainer()` in `src/lib/exporter.ts` already snapshots `frames[].instances/ops/events` at Clip creation time (see `ClipsPanel`). Re‑use it at transpile time to produce `animation: FrameSpec[]` instead of two maps. Keep old `frames`/`placements` as deprecated re‑exports for 1 release.
3. **5c. Emitter change (≤ 30 l):** In `project.ts:277‑391`, after `timelineModules` loop, emit `export const animation: FrameSpec[] = [ … ]` alongside `frames`/`placements` (feature‑flag `unifiedAnimation`).
4. **5d. Actor update (≤ 30 l):** `TimelineActor` gains `animation: FrameSpec[]` getter; docs state: *do not call `runFrameAction` while host is playing* (already in `actor.ts:44‑48`).
5. **5e. Tests + codemod (≤ 30 l):** Snapshot test asserts `animation[0].instances.length == 2`; add `tools/codemod/unify‑frames.mjs` to rewrite old `frames[5]` usages to `animation.find(f=>f.frame===5)`.

**Exit criteria:** New builds have both maps (old) and array (new); Actor files can be written either way; old tests still pass.

---

### Phase 6 — Human naming (P1, 4 d)

*Already half‑done: `nameSegment()` + `timelineMetadataAt()` + `frameLabelAt()`.*

1. **6a. SymbolClass passthrough (≤ 30 l):** Ensure `doc.symbolClasses: Map<number,string>` flows into `transpiler/as2/project.ts` `timelineBindings` → `displayName` (= linkage class short name `Fisher` vs `map_engine`). Existing `Project.characters[id].name` Workbench override wins.
2. **6b. Rename fallback chain (≤ 30 l):** `fallback = symbolClass(linkage) ?? workbenchLabel ?? defaultPackageBase ?? sprite_${id}`. Unit‑test `nameSegment("Fisher")=="fisher"`, `"themap"=="themap"`, `"DefineSprite_28"`→`"themap"` when linkage present.
3. **6c. File rename (≤ 30 l):** Wire `module = timelines/<nameSegment(displayName)>` instead of `timelines/sprite_${id}` (keep shim re‑export `timelines/sprite_${id}.ts` → `timelines/fisher.ts` for compat).
4. **6d. Inspector display (≤ 30 l):** `Sidebars` + `TimelineView` already use `charName()` which prefers `Project.characters`; feed same displayName into header tag `// Workbench timeline name: "fisher" (sprite 10)` — already emitted, just promote to filename.

**Exit criteria:** `bassken_overview` build emits `timelines/fisher.ts`, `timelines/themap.ts` instead of numeric; old numeric imports still work via shim.

---

### Phase 7 — Asset inlining policy (P1, 4 d)

*Follow `uses` count exactly as deep‑dive §5‑7.*

1. **7a. Counter (≤ 30 l):** Re‑use `doc.characters.get(id).uses: number[]` + new `assetFanIn: Map<assetId, Set<timelineId>>` built from `Frame.display[].characterId` transitive closure (already in `src/lib/assets.ts: cache.useExternals`).
2. **7b. Router (≤ 30 l):** New `src/lib/assetRouter.ts` `routeAsset(assetId): "shared" | { actor: name }`. Rule: `if fanIn==1 and owner is actor‑candidate → actors/<name>/assets/<file>` else `shared/shapes|images/...`.
3. **7c. Emitter (≤ 30 l):** `src/lib/typescriptExport.ts` `createTypeScriptArchive` already zips `assets`; add per‑actor sub‑zip or folder prefix when routed. No new asset bytes, only new paths; `AssetCache.useExternals` resolves both.
4. **7d. Tests (≤ 30 l):** `src/lib/assets.test.ts` — `shape 12.svg uses={9}` → routed `actors/fish/assets/shape_12.svg`; `shape 6.svg uses={root,28,18}` → `shared/shapes/shape_6.svg`.

**Exit criteria:** Re‑exported ZIP has `actors/fish/assets/` for variant‑only SVGs; shared hub image `11.jpg` stays `shared/images/`; player still loads (fallback to `byPath` tail lookup).

---

### Phase 8 — Behavior / Animation split & migration lint (P2, 6 d)

*Turn the Actor file from “re‑export of timeline” into “real Behavior”.*

1. **8a. Stub Behavior class (≤ 30 l):** `actors/fisher/FisherBehavior.ts` (new file) with `export class FisherBehavior { onSpawn(c:AS2Clip){} onUpdate(dt:number){} onAction(key:string){} }` — imports nothing; `FisherActor` constructor takes it.
2. **8b. Move‑script codemod (≤ 30 l):** `tools/codemod/moveTimelineAction.mjs` — parses `timelines/fisher.ts`, lifts `frames[1]` body (`this._x += 2;`) into `FisherBehavior.onSpawn` as `this.sprite.x += 2;` (via `flashActorPorts` mapping table `._x→sprite.x`, `._xscale→sprite.scaleX*100`, etc. already in `actor.ts:28‑40`). One function at a time.
3. **8c. Double‑dispatch guard (≤ 30 l):** `TimelineActor.runFrameAction` already warns “do not call while host is playing”. Add runtime guard: if `actor.legacy._parent` timeline host would also call `frames[frame]` this tick, skip (lint). Add `// eslint actor/no‑double‑dispatch` rule.
4. **8d. Actor lint (≤ 30 l):** Simple `tsc` plugin or `tools/lint/actors.mjs`: error if `actors/**/*.ts` does `clip.gotoAndPlay` directly without going through `animation.play` port; error if any `actors/**/*.ts` imports `../../../runtime/as2` internals instead of `sprite/animation/graphics` ports.
5. **8e. Inspector helpers (≤ 30 l):** `ActorPanel` adds “Move frame 1 action → Behavior” one‑click button that runs the codemod in‑browser (uses same `transpiler/as2/ast.ts` parser already available) and shows diff.

**Exit criteria:** `actors/fisher/Fisher.ts` has empty `frames` re‑export and real `FisherBehavior.onUpdate`; `npm run check` in extracted ZIP still passes; Execute still runs (fallback interpreter not needed for moved frames).

---

### Phase 9 — Validation, docs, example PR (P2, 4 d)

1. **9a. Example PR diff (≤ 30 l per doc):** Show `bassken_overview` Before (16 tiny files) vs After (fisher + themap 2 actors). Include `fish` variant merge diff (4→1). Store as `audits/ACTOR_MIGRATION_EXAMPLE.md`.
2. **9b. Doc updates (≤ 30 l per file):** `docs/AVM1_ACTIONS_ENCODING.md` §“Actors, animations, sprites” add `AnimationSpec` unified format; `DECOMPOSITION_SPEC.md` add Actor phases 12‑13.
3. **9c. Round‑trip proof (≤ 30 l):** `npm run as2ts -- game-files/fish-full -o /tmp/actors‑out --merge-variants --unified-animation --human-names` → `npm run check` in output ZIP → `npx vitest run src/lib/swf/swf‑roundtrip.test.ts` → `as2ts‑report.md` tag‑order identical.
4. **9d. Release notes (≤ 30 l):** `audits/BUNDLED_SWFS.md` “Actor‑aware export” subsection; `debug/tools/vitest/__mapSourceAudit` add `actors/_proposal` snapshot.

**Exit criteria:** A reviewer can follow the Phase 9 doc, run one command, and see the proposed cohesive actor files for every bundled SWF.

---

## 3. Dependency graph (what can run in parallel)

```
P1 heuristics ──┐
                 ├──► P2 artifact ──► P3 UI ──► P4 variant merge ──┐
                 │                                              ├──► P9 validation
P6 human names ──┘                      P5 placements ──────────┘
P7 asset router ──────────────────────┘
                                      P8 behavior split ──┘
```

Parallel tracks: `P6` + `P7` + `P1` can start day 1; `P5` can start after `P2`; `P8` needs `P4+P5`.

---

## 4. Risks, mitigations, rollback

| Risk | Likelihood | Blast radius | Mitigation |
|---|---|---|---|
| Heuristic mis‑groups (e.g., fusions `ScrollView` + `VScrollBar`) | Med | One wrong `actors/_proposal` (advisory only) | Proposals are *never* auto‑merged; fan‑in>1 and `__Packages/mx` are hard vetoes; user can dismiss; fallback keeps old `timelines/*.ts` |
| Filename collision (`fisher` vs `Fisher`) | Low | ZIP overwrite | `uniqueSegment()` dedup already in `project.ts:91‑99`; test it |
| Placement folding breaks a `gotoAndPlay` that relied on `ShowFrame` timing | Low | One clip stalls | Keep deprecated `frames`/`placements` for 1 release; `FrameSpec` adds `instances` snapshot so timing is preserved |
| Variant merge confuses runtime that `attachMovie("Sprite9")` by numeric id | Low | Old AS `attachMovie("Sprite9")` would not find `actors/fish/animation/FrontLeft` | Keep shim re‑exports `timelines/sprite_9.ts` → new path; runtime `characterId` still authoritative |
| Asset inlining breaks `shared` refs | Low | Missing SVG | Router keeps `shared` for fan‑in>1; fallback tail‑lookup in `AssetCache.byPath` |

Rollback for every phase: delete `actors/_proposal.json` → old behavior. No migration step deletes original `timelines/*.ts` (they become shims).

---

## 5. Estimates & staffing

| Scenario | Duration | Staff | Daily slice |
|---|---|---|---|
| Solo engineer | 7 weeks | 1 | 1 phase at a time, ≤ 2 steps/day, build‑verify each |
| Two engineers | 4 weeks | 2 | A: P1‑P5 track, B: P6‑P8 track, sync at P9 |
| Mob | 2 weeks | 4 | Requires pre‑agreed ≤ 30‑line step discipline (see `DECOMPOSITION_SPEC.md` loop‑prevention) |

Each phase lists effort assuming the 30‑line slicing; the dominating cost is tests/reviews, not lines.

---

## 6. Acceptance criteria per phase (Definition of Done)

* **P1:** Unit tests pass for corpus classification matrix (the 6 bundled externals). No heuristic decision disagrees with Table in deep‑dive §7 by more than one tie‑break case.
* **P2:** Fresh `as2ts` build writes `_proposal.json` + report section; `npm test` does not change.
* **P3:** Inspector shows proposal card; `Accept` writes `Project.actors` and persists; no build step required.
* **P4:** With `--merge-variants`, output file count for `bassken_scene` drops, `fish` actor has 4 animations, `movementClips` wired, player still renders both.
* **P5:** New `animation: FrameSpec[]` exists alongside legacy maps; Actor can be authored either way.
* **P6:** Numeric filenames gone from `/tmp/actors‑out`; shims keep imports green.
* **P7:** ZIP layout matches routing table; `npx vitest run src/lib/assets.test.ts` green; no missing `uses` warning.
* **P8:** One migrated `FisherBehavior.onUpdate` exists with real movement; lint prevents double‑dispatch; `npm run check` in ZIP green.
* **P9:** Example PR diff is reviewable and round‑trips with zero `tagOrder`/`initOrder` diagnostics.

---

## 7. What is explicitly *not* in this roadmap (deferred)

* **No runtime clock rewrite:** `Actor.update(deltaSeconds)` is manual; no new scheduler.
* **No physics/scene hierarchy inference:** The proposal never invents a scene graph from bytecode — only groups what the SWF already places.
* **No transpiler decompiler rewrite:** `avm1.ts` decoder limits stay (see `AVM1_ACTIONS_ENCODING.md` §Coverage). Blocks that fall back to interpreter stay as‑is.
* **No `mx` library extraction:** `__Packages/mx` stays library; its actor‑like components are out of scope.
* **No video/morph/LZMA:** Covered by `SWF_SPEC_19_AUDIT.md` gaps; separate roadmap.

---

## 8. First 3 steps you can merge tomorrow (≤ 30 lines each)

1. **`actorHeuristics.ts` skeleton + fanIn unit test** — proves the 4‑fish grouping on real `doc` without touching transpiler.
2. **Hook `actors/_proposal.json` into `project.ts`** — one `files.set` line, no UI, verifiable by `cat /tmp/out/actors/_proposal.json`.
3. **Inspector button that renders the JSON table** — no write yet, just the card, proving the signal reaches the user.

Each builds, each ships alone.

---

*Roadmap authored from the corpus доказательство in `FLASH_TO_ACTOR_DEEP_DIVE.md`. Re‑verify by running `npm run as2ts -- game-files/fish-full -o /tmp/actors‑out --merge-variants` after P4 and inspecting the diff against `/tmp/out.baseline`.*
