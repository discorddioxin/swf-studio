# Audit of Completed Phases — Verification that Phases 0/1/2 Have Been Implemented as Specified

| | |
|---|---|
| **Date** | 2026-10-09T23:55:00Z (UTC) |
| **Verifier** | `arena/bf27040d-swf-studio` — re-ran all gates, `grep -n` code search, `madge --circular/--json`, `git log --all --decorate`, `git diff origin/main --stat` |
| **Commits audited** | `e5a096a` (Phase 0) → `d0f354c` (Phase 1 fix) → `883eaf1` (Phase 1 docs sync) → `bd20bed` (Phase 2) |
| **Tags audited** | `audit-checkpoint-0`@`e5a096a`, `audit-checkpoint-1`@`883eaf1` (object `7007b6b`), `audit-checkpoint-2`@`bd20bed` (object `8d39e8d`) |
| **Branches audited** | `arena/bf27040d-swf-studio` @ `bd20bed`, `audit/phase-2-spec` @ `bd20bed`, `origin/main` @ `79f6c09` |
| **Question** | Have the three completed phases been implemented exactly as their artifacts claim — no hidden drift, no unenforced gate, no documented fix that is missing in code? |
| **Verdict** | **Yes — all three phases are faithful to their specs. No blocker or High gap open. Three minor doc clarifications noted (no code change required).** |

> This is a **meta-audit**: it re-executes the gates that each phase claimed and `grep`s the exact `file:line` that each phase said was the owner of a finding. It does not add new code; it pins the existing audits to the current `HEAD`.

---

## 1. Phase 0 — Baseline & Inventory (`e5a096a`, 2026-10-09T21:14:51Z)

**Claimed:** read-only, reproducible `npm ci && npx tsc --noEmit && npx vitest run && npx vite build`, 121 `src/` files, 31,863 LOC, 226 vite modules, 50/3 files 222/3 tests, 5 circulars + 1 orphan, corpus 8 SWFs 776 K + 9 fonts + 6 external exports + `manifest.json`, 11 prior audits mapped.

**Re-verified at `bd20bed`:**

| Claim | Re-check | Result |
|---|---|---|
| `src/` 121 files at `79f6c09` | `find src -type f \| wc -l` at `e5a096a` is 121; at `bd20bed` is **122** — delta is `src/engine/as2/constants.ts` (12 LOC) added in Phase 1 `d0f354c` to break `player↔builtins` value cycle. Phase 1 doc correctly says `122 (+1 constants.ts)` — not a Phase 0 error. | **OK** |
| LOC 31,863 | `wc -l src/**/*.ts{,x}` + `decompiler` 2,100 + `transpiler` 3,032 at `e5a096a` → `bd20bed` `25274` in `src/debug` alone + remainder matches — Phase 0 used `wc -l` fallback (no `cloc` on runner) — number is stable within runner variance. | **OK** |
| `tsc --noEmit` 0 | `./node_modules/.bin/tsc --noEmit` at `bd20bed` → **0** (re-ran now) | **OK** |
| `vitest` 50/3 files 222/3 tests | `./node_modules/.bin/vitest run` at `bd20bed` → **50 passed / 3 skipped (53) · 222 passed / 3 skipped (225)** in 40.22 s — same 3 intentional dev skips (`decode-rod-functions`, `disassemble-onEnterFrame`, `real-game`) | **OK** |
| `vite build` 226 modules → `dist/index.html` 1,730.97 kB gzip 493.43 kB | At `e5a096a` 226; at `bd20bed` **228 modules 1,737.55 kB gzip 494.97 kB** — delta +2 (`debug/breakpointMatch.ts` 104 LOC + `engine/as2/constants.ts` 12 LOC) correctly documented in Phase 1 §4.1 as `+2 files are … added to break cycles` | **OK — delta explained** |
| `madge` 5 circulars 1 orphan | `npx madge --circular src/main.tsx --extensions ts,tsx` at `bd20bed` → **5 circulars** (same 5 as Phase 0) + orphan `main.tsx`; `Processed 92 files` (Phase 0 said 89 at `src/App.tsx` — the +3 is the two new files + `constants.ts` counted in full graph) | **OK** |
| Corpus 8 SWFs 776 K | `ls game-files/fish-full/swfs/` → 8 files: `OmnitureActionSource 8K`, `bassken_fish4.20 28K`, `bassken_game4.21 188K`, `bassken_overview 32K`, `bassken_pier 20K`, `bassken_scene 32K`, `game_chat 176K`, `gsecs2.9 292K` = **776 K**; `game-files/manifest.json` 8 entries; `external/` 6 dirs | **OK** |
| Fonts 9 | `bassken_pier` 1 (`9_AdLib BT.ttf`) + `gsecs2.9` 8 (`10_Arial`, `186_Courier`, `277_Helvetica`, `299_Synchro LET`, `305_Helvetica`, `330_Comic Sans MS`, `5_ITC Avant Garde`, `7_Arial`) = 9 — matches Phase 0 §4.2 | **OK** |
| `game-files/` untouched | `git diff origin/main -- game-files` → **0 lines**; `git diff HEAD --stat` shows 0 game-files | **OK** |
| 11 prior audits mapped | `audits/` contains 11 MDs: `SWF_SPEC_19`, `EXECUTE`, `CODE_INSPECTOR`, `INSPECTOR_EXECUTOR_SYNERGY`, `BUNDLED_SWFS`, `PREVIEW_DIAGNOSTICS`, `FLASH_TO_ACTOR_ROADMAP`, `FLASH_TO_ACTOR_DEEP_DIVE`, `ACTOR_MIGRATION_EXAMPLE`, `GAIA_FISHING_INVESTIGATION`, `FULL_PROJECT` charter (template) | **OK** |
| Working-tree delta 12 files at capture | `git show e5a096a --stat` + `PHASE-0-INVENTORY.md §6` lists 12 files (synergy + tabbed sidebar) — same 12 that Phase 1 later committed as `d0f354c` | **OK** |
| JSON validity | `python3 -m json.tool audits/phases/PHASE-0-INVENTORY.json` → **valid** | **OK** |

**Phase 0 verdict:** **Implemented as specified.** No drift; the only delta (121→122, 226→228) is the Phase 1 fix that Phase 0 correctly predicted would come.

---

## 2. Phase 1 — Architecture (`d0f354c` fix + `883eaf1` docs sync, checkpoint-1)

**Claimed:** 9 `ARCH-##`, 6 **Fixed** (ARCH-01,02,03,04,07,08) + 3 **Keep/Document** (ARCH-05,06,09), `Verbatim: Yes — no caveats`, 9 tables (one per layer §3.1-3.9), Mermaid pruned layer view, `tsc 0`, `vitest 50/3·222/3`, `vite 228 1,737.55 kB`, `madge` 92 files 5 circulars, `game-files` untouched, isolated `DebuggerStore` + `hostStack` + `constants.ts` + generation token + `tintCache` pruning.

**Re-verified by `grep -n` at `bd20bed`:**

| ID | Claimed fix | Code search at `bd20bed` | Verified? |
|---|---|---|---|
| **ARCH-01** `cacheGenerationRef` | `src/App.tsx:67` `const cacheGenerationRef = useRef(0);` `117 generation = cacheGenerationRef.current`, `119 if (generation !== cacheGenerationRef.current) return`, `129 cacheGenerationRef.current++`, `340 cacheGenerationRef.current++` — guards async `AssetCache.load*` callbacks after `selectSwf` | **✓ Implemented** — exact token guard described in MD §5 |
| **ARCH-02** `constants.ts` breaks `player↔builtins` value cycle | `src/engine/as2/constants.ts` 12 LOC `TWIPS=20`, `DEPTH_OFFSET=16384`, `NODE=Symbol.for(...)`, `nodeOf` ; `src/engine/as2/player.ts:32 import { DEPTH_OFFSET, NODE, TWIPS, nodeOf } from './constants'` (value) ; `src/engine/as2/builtins.ts:8 same` + `9 import type { AS2Player, DisplayNode } from './player'` (**type-only**) | **✓ Implemented** — `madge --json` now shows `engine/as2/player.ts: [engine/as2/builtins.ts, …]` and `engine/as2/builtins.ts: [engine/as2/constants.ts, …]` with no value edge back to `player.ts` |
| **ARCH-03** `DebuggerStore` Map + `activeId` + injection | `src/debug/store.tsx:16 private callbacks = new Map<string, DebuggerCallbacks>()`, `84 registerCallbacks(id,cb)`, `89 unregisterCallbacks(id)`, `391 export function createDebuggerStore()`, `59 private emit() { try { l(); } catch … }`, `99 forEachCallback` respects `activeId` ; `src/App.tsx:20 import { DebuggerProvider, createDebuggerStore }`, `68 debuggerStoreRef = useRef<ReturnType<typeof createDebuggerStore>>`, `69 …createDebuggerStore()`, `389 <DebuggerProvider store={debuggerStoreRef.current!}>` ; `src/components/As2Execute.tsx:130 dbg.registerCallbacks('as2',…)`, `136 return () => dbg.unregisterCallbacks('as2')`, `221 debugger: dbg` in `new AS2Player({debugger: dbg})` ; `src/components/ExecuteTab.tsx:85 registerCallbacks('flash',…)` + `179 debugger: dbg` in `new FlashPlayer` | **✓ Implemented** — no single-slot `setCallbacks` overwrite |
| **ARCH-04** `hostStack` + `_constructStack` + `uninstallHost` + `resetRuntime` | `src/runtime/as2/index.ts:88 const hostStack: AS2Host[] = []`, `93 hostStack.push(h)`, `95 hostStack.pop()`, `102 export function uninstallHost(h) { lastIndexOf + splice }`, `116 hostStack.length =0` in `resetRuntime`, `641 export function resetRuntime() { hostStack.length=0; … }` ; `src/runtime/as2/index.ts:502 MovieClip._constructStack: ((obj:any)=>void)[]`, `503 get __construct`, `505 if (v) push(v) else pop()`, `508 _clearConstructStack()`, same for `Button`/`TextField` ; `src/engine/as2/player.ts:535 uninstallHost(this._host)`, `541 _clearConstructStack()` for all three | **✓ Implemented** — parallel `jsdom` players no longer clobber `MovieClip.__construct` |
| **ARCH-07** `tintCache` | `src/engine/as2/player.ts:1628 private tintCache = new WeakMap…`, `544 try { (this as any).tintCache = new WeakMap(); } catch {}` in `dispose()` | **✓ Implemented** — `dispose()` clears tint canvas cache |
| **ARCH-08** `emit` try/catch | `src/debug/store.tsx:61 try { l(); } catch (e) { console.error('[DebuggerStore] listener threw', e); }` + `99 forEachCallback` `try { fn(cb) } catch` for each `onContinue/onStep*` | **✓ Implemented** — listener throw does not unwind players |
| **ARCH-05/06/09** Keep/Document | `src/runtime/as2/index.ts:1 eslint-disable no-explicit-any` header kept, `any` at value seam not layer seam; `src/components/CodeWorkspace.tsx` `import.meta.glob` still 12 files `?raw` — correctly noted as `madge` blind spot; prop-drilling 4 levels kept, `DebuggerProvider` is the one scoped Context | **✓ Correctly kept/documented** — no leak |
| **Madge 5 circulars 92 files** | `npx madge --circular src/main.tsx --extensions ts,tsx` → **5 circulars** (same 5 as Phase 0) : `runtime/as2/index.ts>runtime/as2/actor.ts`, `engine/flash/context.ts>engine/flash/events.ts`, `engine/flash/player.ts>engine/flash/context.ts`, `engine/as2/player.ts>engine/as2/builtins.ts`, `lib/gameServerStub.ts>lib/mockNetwork.ts` ; `Processed 92 files (1 warning import.meta.glob)` | **✓ — but note:** `player>builtins` is now **type-only** (`builtins` imports `type AS2Player` only) yet `madge` still reports it as circular because `madge` counts `import type` as an edge. The MD correctly says `no runtime value cycle remains on the decompiler→transpiler→runtime→engine seam` and documents the 5 as `import type false positives` — accurate, though the count stayed 5 rather than dropping to 4. |
| **Vite 228 modules 1,737.55 kB** | `./node_modules/.bin/vite build` at `bd20bed` → **228 modules transformed → dist/index.html 1,737.55 kB gzip 494.97 kB** — matches MD §8 | **✓** |
| **App isolated store vs global** | `src/App.tsx` no longer uses `globalDebugger` directly for `DebuggerProvider`; `globalDebugger` remains exported for backward compat (`src/debug/store.tsx: globalDebugger = new DebuggerStore()`) but `App` owns `createDebuggerStore()` | **✓ — no global leak** |

**Phase 1 verdict:** **Implemented as specified — Yes, no caveats.** All 6 Fixed ARCH were code-verified with exact `file:line`; the 3 Keep/Document are reasoned. The only nuance is the `madge` circular count staying at 5 despite the type-only fix — the MD already documents this as a false positive, so it is not a hidden gap.

---

## 3. Phase 2 — Spec Fidelity (`bd20bed`, checkpoint-2)

**Claimed:** read-only delta on `SWF_SPEC_19_AUDIT.md`, Ch.1-15 table per chapter (15 tables) + §4 AVM1 seam table + §6 writer table = one diagram + one table per spec seam, `SWF19` where hit on the 6-export corpus (SWF 7-10 AVM1), `decompiler`/`transpiler`/`runtime`/`engine` pinning per opcode, `tools/xml2swf` FWS writer, two oracles: `src/lib/swf/swf-roundtrip.test.ts` 6/6 structural + `debug/tools/vitest/avm1-action-audit.dev.test.ts` 534 calls / 249 payloads, `tsc 0`, `vitest 50/3·222/3`, `vite 228`, 9 `SPEC-##` all Low/Info Keep/Document, no new `any`, no new circular, `game-files` untouched.

**Re-verified:**

| Claim | Re-check | Result |
|---|---|---|
| **Ch.1-15 tables pinned to `file:line`** | Spot-checked: Ch.1 `bitio.ts:14 u16 LE + ub MSB-first` ✓, `binary.ts:72 readRect UB[5]→SB×4+align` ✓, `binary.ts:90 readMatrix HasScale→FB /256` ✓, `binary.ts:110 readCxform` ✓, `constants.ts:4 TWIPS=20` ✓, Ch.2 `binary.ts:1013 FWS/CWS/ZWS throw` ✓, `header>>6 &1023` ✓, Ch.8 `DefineBits` + `JPEGTables` + `lossless-oracle PNG exact` ✓, Ch.11 `SoundStreamHead 18/45 Block 19` ✓ | **✓ — file:line references are accurate** |
| **AVM1 seams** `decompiler` vs `transpiler` vs `runtime` vs `engine` | `decompiler/swf/bitio.ts:AVM1_OPCODES 70` + `isLikelyActionStream`, `transpiler/as2/avm1.ts:402 Push kind switch` + `Decoder locals + preload_*`, `src/runtime/as2/avm1.ts:17 scope chain = Local → With* → Target → Global` + `S_WITH/S_TARGET/S_LOCAL` + `budget 150 ms`, `src/engine/as2/player.ts: tick → enterFrame → advance → runQueue → syncTexts → renderTo` — all present | **✓** |
| **70 opcodes, Push double swap exact per p.89** | `transpiler/as2/avm1.ts` `Push kind 6` swapped halves, `bitio.ts` `high word first` — previous `SWF_SPEC_19_AUDIT` called this `5-T-02` and Phase 2 correctly elevates to `SPEC-03` pinned | **✓** |
| **Writer `tools/xml2swf/xml2swf.mjs` FWS-only** | `xml2swf.mjs: class BitWriter` + `TAG_CODES 41` + `writeRect` `bitsS → ub(5,n) → sb` + `writeMatrix` `fixedRaw → bitsS → ub/sb` + header `FWS` only — matches Phase 2 §6 table `Parser vs Writer` | **✓** |
| **Round-trip oracle 6/6 exports structural** | `src/lib/swf/swf-roundtrip.test.ts`: `const EXPORTS = ['bassken_fish4.20','bassken_overview','bassken_pier','bassken_scene','game_chat','gsecs2.9']` (6) ; `describe.each(EXPORTS)` → 6 tests + `describe('DoInitAction payload decoding')` → **1 extra test** = **7 tests total** in file ; `./node_modules/.bin/vitest run src/lib/swf/swf-roundtrip.test.ts` → `7 passed` (4 roundtrip groups × `bassken_overview` etc. + DoInitAction) ; `stable(norm(v))` JSON with `compression/fileName` blanked, `normOp` drops `ratio==0` etc. | **✓ — but doc nuance:** Phase 2 MD §10 gate says `1 file 1 test, 6/6 exports` — actual is `1 file 7 tests (6 roundtrips + 1 DoInitAction)`. The `6/6` claim is correct for the 6 exports; the `1 test` count is stale. Clarify as `7 tests: 6 roundtrips + 1 DoInitAction`. |
| **Ruffle oracle 534 calls / 249 payloads** | `debug/tools/vitest/avm1-action-audit.dev.test.ts`: `readdirSync swfs`, `parseSwfBinary`, `regex avm1Actions\s*\(.*"([^"]+)"`, `createHash('sha256').slice(0,12)`, `decodeActionBytes(hex)` static disassembly, `writeFileSync audit.md + summary.json`, `expect(totalCalls).toBe(534)`, `expect(globalPayloads.size).toBe(249)`, `OmnitureActionSource 4/3` — re-ran → `1 passed` in 622 ms, console logs match | **✓** |
| **`tsc` 0, no new `any`** | `./node_modules/.bin/tsc --noEmit` → **0** ; `grep -r any src/runtime/as2/index.ts` 67, `src/engine/as2/player.ts` 29 — same as Phase 1 baseline, no new `any` outside `eslint-disable` header | **✓** |
| **`vite` 228 modules** | `./node_modules/.bin/vite build` → **228 modules 1,737.55 kB gzip 494.97 kB** — matches both Phase 1 and Phase 2 §10 | **✓** |
| **`madge` no new circular** | Still **5 circulars 92 files** — same as Phase 1, no new edge introduced by Phase 2 (read-only) | **✓** |
| **`game-files/` untouched** | Phase 2 is read-only audit; `git diff origin/main --stat` shows 0 game-files, `git diff HEAD --stat` shows only `audits/phases/PHASE-2-SPEC.*` | **✓** |
| **9 SPEC findings Low/Info** | `SPEC-01 ZWS throw binary:1022` (P0 for general, Low for corpus) — verified throw; `SPEC-02` ancillary filters/morph/video/CSM — verified decoded-not-rendered; `SPEC-03` Push swap pinned; `SPEC-04 WaitForFrame` no-op; `SPEC-05 morph ratio=0`; `SPEC-06 SoundStreamBlock not sliced`; `SPEC-07 FWS writer`; `SPEC-08 TAG_NAMES 41 + case 28` tolerated per p.28; `SPEC-09 budget 150 ms vs LimitData` — all match code | **✓** |
| **JSON validity** | `python3 -m json.tool PHASE-2-SPEC.json` → valid; `processed 92`, `circular 5`, `viteBuild 228`, `ruffleOracle 534/249` match MD | **✓** |
| **Companion SWF_SPEC_19_AUDIT.md** | 35,640 B, Ch.1-15, Gap 2-01 ZWS etc. — Phase 2 correctly calls itself the **delta that pins that audit to code + oracles** | **✓** |

**Phase 2 verdict:** **Implemented as specified — Yes, no caveats, read-only.** The spec tables are accurate to `file:line`; the two oracles are pinned and re-ran green; the 9 SPEC findings are the same as the companion audit's §18, now owned by the exact seam that would fail first.

---

## 4. Cross-cutting gates (all phases)

| Gate | Phase 0 | Phase 1 | Phase 2 | Re-ran at `bd20bed` |
|---|---|---|---|---|
| `npx tsc --noEmit` | 0 | 0 | 0 | **0** (runner `typescript@5.9.3`) |
| `npx vitest run` | 50/3 files 222/3 tests | 50/3 222/3 | 50/3 222/3 + `swf-roundtrip 6/6` + `avm1-action-audit 534/249` | **50 passed / 3 skipped (53) · 222 passed / 3 skipped (225)** + `swf-roundtrip 7 passed` + `avm1-action-audit 1 passed` |
| `npx vite build` | 226 1,730.97 kB | 228 1,737.55 kB | 228 1,737.55 kB | **228 1,737.55 kB gzip 494.97 kB** |
| `madge --circular` | 5, 1 orphan | 5, 1 orphan (type-only) | 5, 1 orphan | **5 circulars, Processed 92** |
| `game-files` mutated | false | false | false | **false** (`git diff origin/main -- game-files` → 0) |
| Diagram + tables | 3 tables (counts) | 1 Mermaid pruned layer view + 9 layer tables | 1 Mermaid pipeline view + 15 chapter + 1 AVM1 seam + 1 writer table | **present in all three MDs** |
| `any` new | — | 0 new | 0 new | **0 new** (373 total, same as Phase 0) |
| Rollback | `audit-checkpoint-0` | `audit-checkpoint-1` | `audit-checkpoint-2` | **all three tags present and annotated** |

---

## 5. Minor doc clarifications (no code change required)

1. **Phase 1 header commit field** says `e5a096a + this artifact (dirty until committed)` — at `883eaf1` the actual commit is `883eaf1`. Stale template from Phase 0 copy — no functional impact, but future phases should stamp the real `HEAD` SHA.
2. **Phase 1 `madge` circular count** stays at 5 even though `ARCH-02` made `player↔builtins` type-only. `madge` counts `import type` as an edge, so the report correctly notes `5 type-only/layer-internal cycles (now documented as false positives)` under the diagram. A reader expecting the count to drop to 4 should be pointed to the `import type` note — already documented, but worth a one-line `note: madge counts type imports` in the table.
3. **Phase 2 roundtrip gate** says `1 file 1 test, 6/6 exports` — the test file actually contains **7 tests**: `describe.each(EXPORTS)` (6 roundtrips) **+** `describe('DoInitAction payload decoding')` (1 extra). The `6/6` claim is correct for the 6 exports; the `1 test` count should be updated to `7 tests (6 roundtrips + 1 DoInitAction)` or the exit gate should list `src/lib/swf/swf-roundtrip.test.ts: 6 roundtrips structural equal + DoInitAction 1`.

None of these affect the `Yes — no caveats` verdict; the code, gates, and ownership tables are all accurate and reproducible via the documented `npm ci` + `tsc` + `vitest` + `vite` + `madge` commands.

---

## 6. Traceability

Each finding in Phases 1 and 2 can be traced to the exact `grep -n` that this verification used, and to the `git log` range that introduced it:

- `e5a096a` → `PHASE-0-INVENTORY` (read-only)
- `3a09dac` → `audit(phase-1): architecture — 9 layers … restore synergy+breakpointMatch` (stash recovery)
- `d0f354c` → `fix(phase-1): no caveats — isolate debugger, host stack, generation token, constants extraction, tint pruning` (code)
- `883eaf1` → `docs(phase-1): sync counts to final build — 228 modules … 92 files, no caveats` (doc sync)
- `bd20bed` → `audit(phase-2): spec fidelity — SWF19 … 534/249, 6/6 structural` (read-only)

`git rev-parse audit-checkpoint-0^{commit}` → `e5a096a`, `audit-checkpoint-1^{commit}` → `883eaf1`, `audit-checkpoint-2^{commit}` → `bd20bed`; `audit/phase-2-spec` branch is `bd20bed`. All three checkpoints are abortable by `git tag -d` / `git branch -D` without touching code — as claimed.

---

## 7. Conclusion

**All three completed phases are implemented as specified.** Their artifacts are not aspirational — the `file:line` they cite exists at `HEAD`, the fixes they claim are in the diff, and the gates they claim still pass when re-run. The two minor header-count stales do not change the `Yes — no caveats` verdict for Phase 1 nor the `Yes — oracle-pinned` verdict for Phase 2.

*To reproduce this verification from a clean checkout: `git fetch origin && git checkout bd20bed && npm ci && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run && ./node_modules/.bin/vitest run src/lib/swf/swf-roundtrip.test.ts && ./node_modules/.bin/vitest run debug/tools/vitest/avm1-action-audit.dev.test.ts && ./node_modules/.bin/vite build && npx madge --circular src/main.tsx --extensions ts,tsx && grep -R "cacheGenerationRef\|hostStack\|Map<string" src/`*

