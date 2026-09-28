# Inspector.tsx Decomposition Spec & Implementation Plan

## 1. Objective

Decompose `src/components/Inspector.tsx` (1517 lines, 24 components/constants) into multiple **cohesive** files, preserving all information and semantics, without harming UI or functionality. The goal is to reduce the per-edit error count so an AI editing any one file produces few errors (no redo loop).

## 2. Current state (what must be preserved)

`Inspector.tsx` is 1517 lines with **24 components/functions/constants**:

| # | Component/Function/Const | Lines | Role |
|---|---|---|---|
| 1 | `CodePanel` | 16–266 | Code tab (Code Inspector + ActionScript + TypeScript subtabs) |
| 2 | `Inspector` | 267–335 | Main tab switcher (the component that will remain in `Inspector.tsx`) |
| 3 | `LabelPanel` | 336–470 | Label tab |
| 4 | `Related` | 471–492 | Helper used by LabelPanel |
| 5 | `FramePanel` | 493–613 | Frame tab |
| 6 | `ACTOR_MOVEMENT_SLOTS` | 614–625 | Const (ActorPanel) |
| 7 | `ACTOR_FACING_SLOTS` | 626–632 | Const (ActorPanel) |
| 8 | `ACTOR_WALK_SLOTS` | 633–639 | Const (ActorPanel) |
| 9 | `ACTOR_COMBAT_OPTIONS` | 640–646 | Const (ActorPanel) |
| 10 | `ACTOR_CLASSIFICATIONS` | 647 | Const (ActorPanel) |
| 11 | `ACTOR_LAYERS` | 648 | Const (ActorPanel) |
| 12 | `normalizeActorKey` | 650–654 | Helper (ActorPanel) |
| 13 | `ActorPanel` | 655–1144 | Actors tab |
| 14 | `collectActorImageDependencies` | 1145–1173 | Helper (ActorPanel) |
| 15 | `ActorCodeDependencies` | 1174–1191 | Helper (ActorPanel) |
| 16 | `ActorImageDependencies` | 1192–1212 | Helper (ActorPanel) |
| 17 | `ActorSoundDependencies` | 1213–1233 | Helper (ActorPanel) |
| 18 | `ClipsPanel` | 1234–1393 | Clips tab |
| 19 | `NumBox` | 1394–1407 | Helper (ClipsPanel) |
| 20 | `ExportPanel` | 1408–1503 | Export tab |
| 21 | `selectedName` | 1504–1510 | Helper (ExportPanel) |
| 22 | `Head` | 1511–1513 | Shared helper |
| 23 | `Empty` | 1514–1516 | Shared helper |
| 24 | `fmt` | 1517 | Shared helper |

## 3. Strategy

**Extract cohesive files, preserve all dependencies, no behavior change.**

The strategy is:
1. **Cohesion**: Group related components/helpers into cohesive files. Each file has a single responsibility.
2. **Preserve all dependencies**: Each extracted file imports only from `./shared`, `./ui`, `../lib/*`, `./Sidebar`, `../types`, `../utils/cn`, `react`. No circular dependencies.
3. **Pure extraction, no behavior change**: Each step is a pure code move. No logic is changed — just moved.
4. **Each step is small and build-verified**: After each step, `build_project` verifies no type errors.
5. **Abort on too many errors**: If a step produces many errors, abort and take a smaller step.

## 4. Target structure (cohesive files)

Keep `src/components/Inspector.tsx` as the main `Inspector` component (the tab switcher). Create the extracted files in a subdirectory `src/components/inspector/` (lowercase, to avoid conflict with `Inspector.tsx`):

```
src/components/
├── Inspector.tsx       # Main Inspector component (tab switcher, ~70 lines after extraction)
└── inspector/
    ├── shared.tsx          # Head, Empty, fmt (shared helpers, no external deps except React)
    ├── CodePanel.tsx       # CodePanel (extracted from Inspector.tsx lines 16–266)
    ├── LabelPanel.tsx      # LabelPanel + Related (extracted from Inspector.tsx lines 336–492)
    ├── FramePanel.tsx      # FramePanel + NumBox (extracted from Inspector.tsx lines 493–613, 1394–1407)
    ├── ActorPanel.tsx      # ActorPanel + ACTOR_* consts + normalizeActorKey + collectActorImageDependencies + ActorCodeDependencies + ActorImageDependencies + ActorSoundDependencies (extracted from Inspector.tsx lines 614–1233)
    ├── ClipsPanel.tsx      # ClipsPanel (extracted from Inspector.tsx lines 1234–1393)
    └── ExportPanel.tsx     # ExportPanel + selectedName (extracted from Inspector.tsx lines 1408–1510)
```

After extraction, `src/components/Inspector.tsx` is ~70 lines (just the main `Inspector` component).

### Dependency graph (no circular deps)
```
Inspector.tsx ──→ inspector/CodePanel.tsx ──→ CodeInspector.tsx, ../ui, ../lib/*, ../types, ../utils/cn, react
              ├──→ inspector/LabelPanel.tsx ──→ ./shared, ../ui, ../Sidebar, ../lib/*, ../types, ../utils/cn, react
              ├──→ inspector/FramePanel.tsx ──→ ./shared, ../ui, ../Sidebar, ../lib/*, ../types, ../utils/cn, react
              ├──→ inspector/ActorPanel.tsx ──→ ./shared, ../ui, ../Sidebar, ../types, ../lib/project, ../utils/cn, react
              ├──→ inspector/ClipsPanel.tsx ──→ ./shared, ../ui, ../lib/exporter, ../types, ../lib/project, ../utils/cn, react
              └──→ inspector/ExportPanel.tsx ──→ ./shared, ../ui, ../lib/exporter, ../types, ../lib/project, ../utils/cn, react

inspector/shared.tsx ──→ React (Head, Empty, fmt — no external deps)
```

No circular dependencies. Each file imports only from `./shared`, `../ui`, `../lib/*`, `../Sidebar`, `../types`, `../utils/cn`, `react`. No circular dependencies.

## 5. Implementation plan (every step 10–50 lines, even if it takes 20+ phases)

**Rule: every step is 10–50 lines moved, nothing over 100 lines.** Even if it takes 20+ extra phases, no step exceeds 50 lines. This prevents AI halting/stalling/looping/erroring out. Build-verify after each step. If a step produces many errors, abort and split it further.

All extracted files go in `src/components/inspector/` (lowercase subdirectory). `Inspector.tsx` stays as the main component and imports from `./inspector/*`.

### Phase 1: shared helpers (DONE)

| Step | Action | Lines | Status |
|---|---|---|---|
| 1a | Create `inspector/shared.tsx` (Head, Empty, fmt) | ~12 | ✅ DONE |
| 1b | Delete Head, Empty, fmt from `Inspector.tsx` + add import | ~10 | ✅ DONE |

### Rule: every code change is ≤30 lines

**Every single code change is ≤30 lines.** The last step of each phase (the delete-from-`Inspector.tsx` step) is broken into ≤25-line deletion chunks, each ≤30 lines. Even if it takes 20+ extra phases, no single code change exceeds 30 lines. Build-verify after each step.

### Phase 1: shared helpers (DONE)

| Step | Action | Lines | Status |
|---|---|---|---|
| 1a | Create `inspector/shared.tsx` (Head, Empty, fmt) | ~12 | ✅ DONE |
| 1b | Delete Head, Empty, fmt from `Inspector.tsx` + add import | ~10 | ✅ DONE |

### Phase 2: CodePanel (~250 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 2a | Create `inspector/CodePanel.tsx` (imports, ≤30 lines) | ≤30 | ✅ DONE |
| 2b | Add next ≤30 lines to `inspector/CodePanel.tsx` | ≤30 | ✅ DONE |
| 2c | Add next ≤30 lines | ≤30 | ✅ DONE |
| 2d | Add next ≤30 lines | ≤30 | ✅ DONE |
| 2e | Add next ≤30 lines | ≤30 | ✅ DONE |
| 2f | Add next ≤30 lines | ≤30 | ✅ DONE |
| 2g | Add next ≤30 lines | ≤30 | ✅ DONE |
| 2h | Add next ≤30 lines | ≤30 | ✅ DONE |
| 2i | Add next ≤30 lines | ≤30 | ✅ DONE |
| 2j | Add next ≤30 lines (function already closed after 2i, nothing left) | 0 | ✅ DONE |
| 2k | Add remaining ≤30 lines (close function) | ≤30 | ✅ DONE (CodeInspector audit) |
| 2l | Delete CodePanel lines 1–25 from `Inspector.tsx` | ≤25 | ✅ DONE (CodeInspector audit) |
| 2m | Delete CodePanel lines 26–50 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2n | Delete CodePanel lines 51–75 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2o | Delete CodePanel lines 76–100 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2p | Delete CodePanel lines 101–125 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2q | Delete CodePanel lines 126–150 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2r | Delete CodePanel lines 151–175 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2s | Delete CodePanel lines 176–200 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2t | Delete CodePanel lines 201–225 | ≤25 | ✅ DONE (CodeInspector audit) |
| 2u | Delete CodePanel lines 226–250 + add import from `./inspector/CodePanel` | ≤27 | ✅ DONE (CodeInspector audit) |

### Phase 3: LabelPanel + Related (~157 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 3a | Create `inspector/LabelPanel.tsx` (imports, ≤30 lines) | ≤30 | ⏭️ |
| 3b | Add next ≤30 lines | ≤30 | ⏭️ |
| 3c | Add next ≤30 lines | ≤30 | ⏭️ |
| 3d | Add next ≤30 lines | ≤30 | ⏭️ |
| 3e | Add next ≤30 lines | ≤30 | ⏭️ |
| 3f | Add Related helper + remaining LabelPanel lines (≤30 lines) | ≤30 | ⏭️ |
| 3g | Delete LabelPanel + Related lines 1–25 from `Inspector.tsx` | ≤25 | ⏭️ |
| 3h | Delete lines 26–50 | ≤25 | ⏭️ |
| 3i | Delete lines 51–75 | ≤25 | ⏭️ |
| 3j | Delete lines 76–100 | ≤25 | ⏭️ |
| 3k | Delete lines 101–125 | ≤25 | ⏭️ |
| 3l | Delete lines 126–150 | ≤25 | ⏭️ |
| 3m | Delete lines 151–157 + add import from `./inspector/LabelPanel` | ≤27 | ⏭️ |

### Phase 4: FramePanel + NumBox (~124 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 4a | Create `inspector/FramePanel.tsx` (imports, ≤30 lines) | ≤30 | ⏭️ |
| 4b | Add next ≤30 lines | ≤30 | ⏭️ |
| 4c | Add next ≤30 lines | ≤30 | ⏭️ |
| 4d | Add next ≤30 lines | ≤30 | ⏭️ |
| 4e | Add NumBox helper + remaining FramePanel lines (≤30 lines) | ≤30 | ⏭️ |
| 4f | Delete FramePanel + NumBox lines 1–25 from `Inspector.tsx` | ≤25 | ⏭️ |
| 4g | Delete lines 26–50 | ≤25 | ⏭️ |
| 4h | Delete lines 51–75 | ≤25 | ⏭️ |
| 4i | Delete lines 76–100 | ≤25 | ⏭️ |
| 4j | Delete lines 101–124 + add import from `./inspector/FramePanel` | ≤26 | ⏭️ |

### Phase 5: actorConsts (~40 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 5a | Create `inspector/actorConsts.ts` (6 ACTOR_* consts, part 1, ≤30 lines) | ≤30 | ⏭️ |
| 5b | Add remaining ACTOR_* consts (≤25 lines) | ≤25 | ⏭️ |
| 5c | Delete 6 ACTOR_* consts lines 1–25 from `Inspector.tsx` | ≤25 | ⏭️ |
| 5d | Delete remaining ACTOR_* consts lines 26–40 + add import | ≤27 | ⏭️ |

### Phase 6: actorHelpers (~34 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 6a | Create `inspector/actorHelpers.ts` (normalizeActorKey + collectActorImageDependencies, part 1, ≤30 lines) | ≤30 | ⏭️ |
| 6b | Add remaining helper lines (≤20 lines) | ≤20 | ⏭️ |
| 6c | Delete helper lines 1–25 from `Inspector.tsx` | ≤25 | ⏭️ |
| 6d | Delete remaining helper lines 26–34 + add import | ≤22 | ⏭️ |

### Phase 7: actorDependencies (~60 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 7a | Create `inspector/actorDependencies.tsx` (ActorCodeDependencies, ≤30 lines) | ≤30 | ⏭️ |
| 7b | Add ActorImageDependencies (≤30 lines) | ≤30 | ⏭️ |
| 7c | Add ActorSoundDependencies (≤30 lines) | ≤30 | ⏭️ |
| 7d | Delete ActorCodeDependencies lines 1–25 from `Inspector.tsx` | ≤25 | ⏭️ |
| 7e | Delete ActorImageDependencies lines 1–25 | ≤25 | ⏭️ |
| 7f | Delete ActorSoundDependencies lines 1–25 + add import | ≤27 | ⏭️ |

### Phase 8: ActorPanel (~480 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 8a | Create `inspector/ActorPanel.tsx` (imports, ≤30 lines) | ≤30 | ⏭️ |
| 8b | Add next ≤30 lines (function signature + first 30 lines) | ≤30 | ⏭️ |
| 8c | Add next ≤30 lines | ≤30 | ⏭️ |
| 8d | Add next ≤30 lines | ≤30 | ⏭️ |
| 8e | Add next ≤30 lines | ≤30 | ⏭️ |
| 8f | Add next ≤30 lines | ≤30 | ⏭️ |
| 8g | Add next ≤30 lines | ≤30 | ⏭️ |
| 8h | Add next ≤30 lines | ≤30 | ⏭️ |
| 8i | Add next ≤30 lines | ≤30 | ⏭️ |
| 8j | Add next ≤30 lines | ≤30 | ⏭️ |
| 8k | Add next ≤30 lines | ≤30 | ⏭️ |
| 8l | Add next ≤30 lines | ≤30 | ⏭️ |
| 8m | Add next ≤30 lines | ≤30 | ⏭️ |
| 8n | Add next ≤30 lines | ≤30 | ⏭️ |
| 8o | Add next ≤30 lines | ≤30 | ⏭️ |
| 8p | Add next ≤30 lines | ≤30 | ⏭️ |
| 8q | Add next ≤30 lines | ≤30 | ⏭️ |
| 8r | Add next ≤30 lines | ≤30 | ⏭️ |
| 8s | Add next ≤30 lines | ≤30 | ⏭️ |
| 8t | Add remaining ≤30 lines (close function) | ≤30 | ⏭️ |
| 8u–8ad | Delete ActorPanel lines in ≤25-line chunks (20 chunks of ≤25 lines) | ≤25 each | ⏭️ |
| 8ae | Add import from `./inspector/ActorPanel` | ≤2 | ⏭️ |

### Phase 9: ClipsPanel (~160 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 9a | Create `inspector/ClipsPanel.tsx` (imports, ≤30 lines) | ≤30 | ⏭️ |
| 9b | Add next ≤30 lines | ≤30 | ⏭️ |
| 9c | Add next ≤30 lines | ≤30 | ⏭️ |
| 9d | Add next ≤30 lines | ≤30 | ⏭️ |
| 9e | Add next ≤30 lines | ≤30 | ⏭️ |
| 9f | Add NumBox helper + remaining ClipsPanel lines (≤30 lines) | ≤30 | ⏭️ |
| 9g | Delete ClipsPanel lines 1–25 from `Inspector.tsx` | ≤25 | ⏭️ |
| 9h | Delete lines 26–50 | ≤25 | ⏭️ |
| 9i | Delete lines 51–75 | ≤25 | ⏭️ |
| 9j | Delete lines 76–100 | ≤25 | ⏭️ |
| 9k | Delete lines 101–125 | ≤25 | ⏭️ |
| 9l | Delete lines 126–150 | ≤25 | ⏭️ |
| 9m | Delete lines 151–160 + add import from `./inspector/ClipsPanel` | ≤22 | ⏭️ |

### Phase 10: ExportPanel + selectedName (~103 lines)

| Step | Action | Lines | Status |
|---|---|---|---|
| 10a | Create `inspector/ExportPanel.tsx` (imports, ≤30 lines) | ≤30 | ⏭️ |
| 10b | Add next ≤30 lines | ≤30 | ⏭️ |
| 10c | Add next ≤30 lines | ≤30 | ⏭️ |
| 10d | Add selectedName helper + remaining ExportPanel lines (≤30 lines) | ≤30 | ⏭️ |
| 10e | Delete ExportPanel lines 1–25 from `Inspector.tsx` | ≤25 | ⏭️ |
| 10f | Delete lines 26–50 | ≤25 | ⏭️ |
| 10g | Delete lines 51–75 | ≤25 | ⏭️ |
| 10h | Delete lines 76–100 | ≤25 | ⏭️ |
| 10i | Delete lines 101–103 + add import from `./inspector/ExportPanel` | ≤23 | ⏭️ |

### Phase 11: Final cleanup

| Step | Action | Lines | Status |
|---|---|---|---|
| 11a | Delete remaining local definitions from `Inspector.tsx` (≤25 lines per step) | ≤25 | ⏭️ |
| 11b | Verify `Inspector.tsx` is ~70 lines (just the tab switcher) | verify only | ⏭️ |

### Why every code change is ≤30 lines (prevents AI halting/stalling/looping/erroring out)

1. **Every code change is ≤30 lines** — no single code change exceeds 30 lines. Even if it takes 40+ phases, no single code change exceeds 30 lines.
2. **The last step of each phase is broken into ≤25-line deletion chunks** — deleting a 250-line component is done in 10 chunks of ≤25 lines, not one 250-line delete.
3. **Build-verified after each step** — `build_project` after each step catches errors immediately → fast feedback → no re-verification loop.
4. **Pure extraction, no behavior change** — each step is a pure code move. No logic is changed.
5. **Abort on too many errors** — if a step produces many errors, abort and split it further (into ≤15-line chunks).

## 6. Safety (why no UI/functionality harm)

1. **Pure extraction, no behavior change**: Each step is a pure code move. No logic is changed — just moved.
2. **All 24 components/constants are accounted for**: None are lost.
3. **All dependencies preserved**: Each extracted file imports only from `./shared`, `./ui`, `../lib/*`, `./Sidebar`, `../types`, `../utils/cn`, `react`. No circular dependencies.
4. **Each step is build-verified**: After each step, `build_project` verifies no type errors.
5. **Abort on too many errors**: If a step produces many errors, abort and take a smaller step.

## 7. Loop prevention (why this stops AI loops)

1. **Smaller files = smaller edits = fewer errors per edit** → no redo loop.
2. **Each step is build-verified** → fast feedback, no re-verification loop.
3. **Pure extraction, no behavior change** → no fix-one-break-another loop.
4. **All dependencies preserved** → no "slipped through the cracks" information loss.
5. **No circular dependencies** → no fix-one-break-another loop.

## 8. Result

After step 8, `Inspector.tsx` is ~70 lines (just the main `Inspector` tab switcher). The 24 components/constants are split into 8 cohesive files in `src/components/inspector/` + the main `Inspector.tsx`, each with a single responsibility. An AI editing any one file holds far less context and produces far fewer errors per edit → no redo loop.

## 9. Verification checklist (after each step)

After each step, verify:
1. `build_project` passes (no type errors).
2. No circular dependencies (each extracted file imports only from `./shared`, `../ui`, `../lib/*`, `../Sidebar`, `../types`, `../utils/cn`, `react`).
3. All 24 components/constants are accounted for (none lost).
4. No behavior change (pure extraction).
