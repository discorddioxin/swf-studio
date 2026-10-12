# Gaia Online / Fishing references — full-project audit

- **Status:** complete — all game code is isolated in the sample's adapter.
- **Audit date:** 2026-10-11 · branch `arena/9451c68c-swf-studio`
- **Question:** does the project contain references to **Gaia Online** or the
  **Fishing** game, and is every one of them *adapted* rather than hard-coded?
- **Answer:** the code is game-agnostic. Outside the game's own adapter the repo
  contains **no** game name, file name, protocol or boot preset; the only
  remaining occurrences are (1) the adapter itself, (2) the adapter registry line
  that makes it selectable, (3) dev-only tooling importing the adapter's fact
  module, (4) the sample's own data files, and (5) dated audit history.
- **Standing rule applied:** a Gaia/Fishing reference is only acceptable as
  *adapter code* or *data*. Everything else was refactored. Nothing was silenced:
  no check was weakened to make a reference "go away".

---

## 1. Result at a glance

Census over the whole tree (`node_modules`, `dist`, `.git`, generated dumps
excluded):

| Area | Matches | What they are | Status |
|---|---:|---|---|
| `src/**` **outside** `src/adapters/**` | **0** | — | clean |
| `tools/**` | **0** | — | clean |
| `docs/**` | **0** | — | clean |
| `src/adapters/**` | 267 | the adapter: sample facts, offline GSI/Sushi network, wire codec, adapter hooks, its scenario tests and its dev tooling | adapted |
| `debug/**` | 21 lines / 20 files | 2 pointers in `debug/README.md` + 19 `import … from '<adapter>/sample'` lines in dev dumpers | dev-only |
| `game-files/**` | 127 | the bundled sample **content** (8 SWFs, FFDec exports, 2 JSON files) | data |
| `audits/**` | 25 files | dated audit history + the archived sample analysis + this report | history |

Reproduce:

```bash
grep -rn -iE 'gaia|fishing|bassken|gsecs|game_chat|omniture' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
  --exclude-dir=e2e-output .
grep -rn -iE 'gaia|fishing|bassken|gsecs|game_chat|omniture' src --exclude-dir=adapters   # → nothing
```

---

## 2. What "isolated" means here

1. **Selection is data-driven.** The Loader reads `game-files/manifest.json`
   (index) → `game-files/games/<id>.json` (game set: `{id, label, adapter?, main?, swfs[]}`)
   → the SWF files the set lists. The set's optional `adapter` id is resolved
   through `src/adapters/index.ts` (`GAME_ADAPTERS` / `adapterById` / `resolveAdapter`).
2. **Everything game-specific is an opt-in callback** the adapter supplies; the
   engine has no knowledge of any game:

   | Seam (`src/engine/as2/player.ts`) | Who supplies it |
   |---|---|
   | `resolveExternal` / `missingExternal` | Loader / caller |
   | `fetchText` (`XML.sendAndLoad`, `LoadVars`) | adapter via `createNetwork()` |
   | `gameServer` (XMLSocket stand-in) | adapter via `createNetwork()` |
   | `onExternalUrl(url) → boolean` | adapter (offline help page, etc.) |
   | `isOptionalExternal(url) → boolean` | adapter (URLs it expects to be absent) |
   | `afterStart(root, player)` | adapter boot fix-ups |
3. **Unadapted games get the inert fallback** (`src/adapters/generic.ts`):
   score 0, no network, no boot preset, no URL policy. `src/adapters/__tests__/generic.test.ts`
   locks this in — an unknown set resolves to `generic` and installs nothing.
4. **Adding another game changes only files under `game-files/`** (plus an
   adapter folder if it needs offline stand-ins). Interface and recipe:
   [`src/adapters/README.md`](../src/adapters/README.md).

---

## 3. What the remediation moved or rewrote

### 3.1 Code

| Item | From | To |
|---|---|---|
| Offline GSI gateway + PHP codec | `src/lib/gsiStub.ts` | `src/adapters/gaiaFishing/gsi.ts` |
| Offline Sushi/server stand-in | `src/lib/gameServerStub.ts` | `src/adapters/gaiaFishing/gameServer.ts` |
| Server-list diagnostic | `tools/` scripts | `src/adapters/gaiaFishing/server-list-diag.ts` |
| Ruffle-as-oracle harness (33 files) | `debug/tools/ruffle-oracle/**` | `src/adapters/gaiaFishing/tools/ruffle-oracle/**` (paths self-relative, movie names from `sample.ts`, default SWF injected server-side) |
| Bundled-data generator | `tools/xml2swf/generate-bundled.mjs` | `src/adapters/gaiaFishing/tools/generate-bundled.mjs` (calls the generic writer `tools/xml2swf/xml2swf.mjs`; re-run reproduces `game-files/**` byte-identically) |
| Live-capture + smoke tooling | `tools/gaia-capture/**` | `src/adapters/gaiaFishing/tools/gaia-capture/**` |
| GSI screenshot helper | `tools/diagnose/` | `debug/tools/screenshot.mjs` (generic `[url] [outFile]`); the sample-scoped readout was deleted |
| Sample-scenario tests (`game421`, `chooserUi`) | `src/engine/as2/__tests__/` | `src/adapters/gaiaFishing/__tests__/` (relative imports into the adapter) |
| `src/lib` fixture tests | imported `@/adapters/gaiaFishing/sample` | import the generic helper `src/lib/__tests__/bundledSet.ts` (reads `manifest.json` → default set, no game names) |
| Sample analysis doc | `docs/AVM1_ACTIONS_AND_EXECUTE_TIMELINES.md` | `audits/AVM1_ACTIONS_AND_EXECUTE_TIMELINES.md` (marked sample-scoped; internal link fixed) |

### 3.2 Logic that used to know the game

| Area | Before | After |
|---|---|---|
| `transpiler/as2/actorHeuristics.ts` | veto regex on file names (`gsecs`, `game_chat`, `omniture`) | document-based `isLibraryMovie()`: sprite-heavy timeline set with >8 linked `mx.`/`__Packages.mx` export names — actor proposals unchanged (31/2/0/0/5/0/0/0) |
| `src/engine/as2/{player,builtins,externals}.ts` | Gaia help URL, Gaia asset-URL patterns, "Gaia Sushi" comments | adapter callbacks + neutral docs |
| `src/components/**/As2Execute.tsx`, `ExecuteTab.tsx`, `src/App.tsx`, `Loader.tsx` | fishing boot preset, injected externals, mocked servers | adapter-driven session; bundled externals merged only for the matching set |
| `src/lib/bundled.ts`, `swfSources.ts`, `uiTroubleshooter/scan.ts`, `runtime/as2/*`, `engine/flash/loader.ts`, `decompiler/swf/binary.ts`, `engine/as2/README.md` | game examples in comments | generic examples |

### 3.3 Verification added for the isolation itself

- `src/adapters/gaiaFishing/__tests__/sample.test.ts` — every fact `sample.ts`
  publishes must match `game-files/games/gaia-fishing.json` + `manifest.json`,
  and every file it names must exist (the adapter cannot drift from its data).
- `src/adapters/__tests__/generic.test.ts` — a foreign set is claimed by nobody,
  resolves to `generic`, and the generic adapter installs nothing.
- `src/lib/__tests__/bundledSet.ts` — generic fixture accessor; the lib tests
  (`bundled`, `swfLoading`, `swf-roundtrip`, `lossless-oracle`) now use the real
  bundled files through the shipped manifest instead of the adapter's names.
  The old `SAMPLE_OVERVIEW` DoInitAction ordering pin became a generic invariant:
  for **every** exported movie, the binary's DoInitAction order equals the XML's.

---

## 4. Remaining references, and why they are the isolation boundary

| Where | Count | Why it stays |
|---|---:|---|
| `src/adapters/**` | 267 | this **is** the isolation: game code, its tests and its dev tooling |
| `src/adapters/index.ts` | 3 | the registry line that makes the adapter selectable (import, re-export, list entry) |
| `debug/**` | 21 | dev-only dumpers whose fixture is the bundled sample; they import the adapter's `sample.ts` (one line each) rather than spelling out names, and take `SWF=<name>` for any other set |
| `game-files/**` | 127 | the sample's **content**: 8 SWFs, FFDec XML/AS exports, fonts, `manifest.json`, `games/gaia-fishing.json` |
| `audits/**` | 25 files | dated history (see [`audits/README.md`](./README.md)); commands/paths inside them may predate later moves |

No runtime path — engine, runtime, transpiler, UI, Loader, bundled loader — names
the game, its files, its servers or its services. A different SWF set loads and
runs through the same pipeline with the generic adapter unless it brings its own.

---

## 5. Verification on this revision

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | clean |
| Full suite | `npx vitest run` | **273 passed, 3 skipped, 0 failed** (65 files: 62 passed / 3 skipped) |
| Sample flow + contract | `npx vitest run src/adapters/gaiaFishing/__tests__ src/adapters/__tests__` | 12 passed |
| Data regeneration | `node src/adapters/gaiaFishing/tools/generate-bundled.mjs` | `game-files/**` byte-identical (`cmp` 0 diff) |
| Build | `npm run build` | `dist/index.html` 1,805.81 kB (gzip 517.21 kB) |
| UI troubleshooter | Execute tab → bundled game → troubleshooter, and `npx vitest run src/adapters/gaiaFishing/__tests__/chooserUi.dev.test.ts` | login/chooser screen: **0 error, 0 warning, 0 info, 3 pass** — every hidden clip on screen is the movie's own state (see §7) |
| Preview | `npm run preview` | `0.0.0.0:5173`; `/`, `/manifest.json`, `/games/gaia-fishing.json`, `/fish-full/swfs/*.swf` all 200 |
| Oracle harness | `node src/adapters/gaiaFishing/tools/ruffle-oracle/serve.mjs` | `/`, `/swfs/*.swf`, `/stub/gateway`, `/external/**` all 200 (Ruffle itself still cannot boot in this sandbox — the documented locale issue, unrelated) |

---

## 6. Loading a different game (acceptance check)

1. Drop the SWFs under `game-files/<set>/…`.
2. Add `game-files/games/<id>.json` (`{id, label, main, swfs:[…]}`, no `adapter`
   unless you wrote one).
3. Point `game-files/manifest.json` at it (`{default: "<id>", games: ["games/<id>.json"]}`).
4. Open the app: no game labels appear anywhere, the Execute console shows no GSI
   or Sushi stub traffic, startup logs contain no adapter boot preset, and missing
   externals are reported (not silently swallowed) — `generic` is in charge.

Expected label in the Execute tab: `Generic SWF (no game-specific help)`.

---

## 7. Open follow-ups (not part of this audit)

### 7.1 UI-troubleshooter findings on the sample's login screen — resolved

The findings the scan used to produce are all the *game's own state*, and the two
engine-side bugs it was pointing at were fixed earlier (the `initActions` fix and
the hit-testing fix, both pinned by `chooserUi.dev.test.ts`). What changed now is
that the troubleshooter can tell the two apart instead of guessing:

* the **engine** records who wrote a clip's visibility (`DisplayNode.visibleSource`:
  `'swf'` = the instance's initial value, `'script'` = the movie's own ActionScript
  assigned `_visible`) and propagates the nearest hidden node's reason down the walk
  (`NodeSnapshot.hiddenReason`, `scan.ts`);
* `setMask()` masks are structural: the renderer already refused to paint them
  (`node.mask`), the scan now does too (`NodeSnapshot.usedAsMask`);
* `snapshotStage` also fixed the mask direction in `checkMask` (only a *masked* clip
  can sit outside its mask; `node.mask` is the opposite direction).

| Finding (before) | Root cause on this screen | Resolution |
|---|---|---|
| `mc_LockButon is hidden` — `warn` | `initGSECS()` runs `bar.mc_LockButon._visible = false`; `creationCheck()` shows it again only after the player's own room is created — the sample is not in that state | attributed to the movie's script → state, not a warning; the Node tab says `visibility source: movie script` |
| `tran_mc` ×11 (list row hover skins) — `info` | `mx.controls.listclasses.SelectableRow.setState('normal')` hides the rollover/selection overlay | as above |
| `boundingBox_mc` ×2 — `info` | the halo theme disables its `BoundingBox` skin (`mx/core/View.as`, `mx/controls/scrollClasses/ScrollBar.as`: `boundingBox_mc._visible = false; _width = _height = 0`) | as above (the two separate `boundingBox_mc measures 0×0` warns also disappear: hidden subtrees are reported once at their root, not per node) |
| `mask_mc` — `info` | `mx/core/ScrollView.as` creates `mask_mc`, hides it, and the List does `listContent.setMask(mask_mc)` | structural mask → never a finding; counted as `masks` in the pass line |
| `mc_loading_bar` — `info` | `showLoadBar()` / `removeLoadingBar()` toggled it during preload; loading is done | attributed to script → state |
| `mc_password_display` — `info` | `initGSECS()` hides it until a password-protected room is created | attributed to script → state |
| `trackingMC` ×2 ("ActionSource") — `info` | `com.omniture.ActionSource`'s constructor sets `this._visible = false` (the Omniture tracker hides itself) | attributed to script → state |

Result on the live preview (bundled game, server-chooser and login screens):
`0 error / 0 warn / 0 info / 3 pass`; the one display line is
`18 hidden clip(s) are the movie's own state` (17 `_visible = false` writes + the
List mask), which "show passed" reveals. The regression now asserts the invariant
that makes that line trustworthy: **no clip is hidden unless the movie's own
ActionScript hid it** (`chooserUi.dev.test.ts`, plus unit cases in
`src/components/uiTroubleshooter/scan.test.ts` for the script-hidden, mask and
point-interrogation paths). A clip the engine hid on its own is still a `warn`
(the check did not get weaker, it got evidence).
- The Problems-tab AVM1 fallback families (231 blocks: `nonempty stack at
  control-flow join`, preloaded `super`, `Delete`/`Enumerate2`) remain the decoder
  work item; warnings must disappear by making the bytecode execute, never by
  filtering.
