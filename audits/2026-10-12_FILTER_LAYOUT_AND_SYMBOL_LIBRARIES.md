# Upload failure “unknown filter 51”, record layout, and the library warns — 2026-10-12

Revision: `fb74bfa` + the working tree of this session (branch `arena/8293b842-swf-studio`).
Gates at this revision: `tsc` clean · vitest **295 passed / 3 skipped (68 files)** · `npm run build` 1,820.05 kB (gzip 522.48) · audit 6 vulns.

---

## 1. “unknown filter 51” on upload — root cause: every FILTERLIST size was wrong

Symptom (user screenshot): uploading a 5-file game set (main `game (.swf)`, deps
`avatarStationsBackground`, `gameShell`, `gPinballAvatarStation`, `sound`) is rejected
with a bare red **`unknown filter 51`**.

- Only producer: `decompiler/swf/binary.ts` `skipFilterList()`, called by
  `parseButton2()` (DefineButton2 records) and `parsePlace2()` (PlaceObject3 place records).
- The loader dropped the whole file for place records: `parsePlace2` runs inside the
  timeline pass (`buildTimeline`), which is **not** wrapped per tag, so the throw escapes
  `parseSwfBinary` and reaches the Loader unchanged (no `Tag: ` prefix — pass 1 pushes the
  prefixed form as a *warning*, and the button-timeline pass is skipped once pass 1 failed).
- `skipFilterList` consumed the wrong number of bytes **for all seven filter kinds**, so the
  byte after a filter list was read as the next filter id — arbitrary bytes, hence ids like
  51 (`0x33`) that are not filter kinds at all.

Correct sizes (SWF spec “Filters”; confirmed against JPEXS
`types/filters/DROPSHADOWFILTER.java` annotations — `UFIXED8` strength, one 8-bit field of
booleans + 5-bit passes — and against swf-parser 0.14.1 `lib/parsers/display.mjs`):

| id | filter | bytes | was |
|---|---|---|---|
| 0 | DropShadow | `RGBA(4) + 4×FIXED(16) + FIXED8(2) + flags(1)` = **23** | 33 |
| 1 | Blur | `2×FIXED(8) + flags(1)` = **9** | 13 |
| 2 | Glow | `RGBA(4) + 2×FIXED(8) + FIXED8(2) + flags(1)` = **15** | 21 |
| 3 | Bevel | `2×RGBA(8) + 4×FIXED(16) + FIXED8(2) + flags(1)` = **27** | 33 |
| 4/7 | GradientGlow/Bevel | `numColors(1) + n×RGBA + n×ratio + 4×FIXED(16) + FIXED8(2) + flags(1)` = **20+5n** | 23+4n / 35+4n |
| 5 | Convolution | `matrixX,Y(2) + divisor(4) + bias(4) + w·h FLOAT(4wh) + colour(4) + flags(1)` = **15+4wh** | 18+8n |
| 6 | ColorMatrix | `20 × FLOAT` = **80** | 20 |

Filter parameters stay unmodelled by design (the pipeline only records “this record has
filters”) — the fix restores alignment, it does not add rendering.

**Reproducer + guard:** `src/lib/swf/filterList.test.ts` (12 tests) builds version-8 SWFs
whose button record and PlaceObject3 record carry real, non-zero filter payloads and asserts
that the *next* record still decodes. On the old code the suite fails with exactly the
reported error — `unknown filter 80`, `unknown filter 8`, and an uncaught
`unknown filter 9 (…)` escaping `parseSwfBinary` from `parsePlace2`. All-zero payloads (the
previous check) hid the bug: reading zeros yields “filter 0” forever.

The bundled fishing SWFs contain **no** filter list at all (verified by a spec-exact scan of
DefineButton2/PlaceObject3 records in all 8 files), which is why this never fired before and
why `audits/SWF_SPEC_19_AUDIT.md` “filters parsed per spec” was never tested against bytes.

## 2. Same reader: PlaceObject3 trailing fields

`parsePlace2` skipped FilterList → BlendMode → BitmapCache and then went straight to
ClipActions, so records with `HasVisibility` (`0x20`) or `HasBackgroundColor` (`0x40`) in the
second flag byte lost ClipActions to a 5-byte shift. Both payloads are now skipped
(`UI8`, `RGBA`). Covered by the same test file (`keeps a place record aligned through
filters, blend, cache, visibility and clip actions`, which asserts the produced
`CLIPACTIONRECORD onClipEvent(enterFrame).as` script).

## 3. Placed records store `ClipDepth` **before** `Name`

While fixing the above, the record field order itself was checked against real bytes:

* `game-files/fish-full/swfs/gsecs2.9.swf`, sprite 22, PlaceObject2 for `characterId=18`,
  `depth=2`: after the matrix the bytes are `ratio=0000`, `06 00`, `"mask\0"`, and the record
  ends exactly at the next tag header (`9b 06`, 27 bytes).
* The committed FFDec export agrees: `characterId="18" clipDepth="6" name="mask"`.
* The opposite reading yields `name="\u0006"` (not a legal identifier, not writable XML) and
  `clipDepth=24941` (a clip depth must exceed the depth) — so the bytes are unambiguous.

The published spec and JPEXS’ *source* list `Name` before `ClipDepth`; real Flash-authored
files store `ClipDepth` first. `decompiler/swf/binary.ts` follows the bytes (with a comment
so nobody “fixes” it from the tag definition alone), and `tools/xml2swf/xml2swf.mjs` mirrors
the reader.

**Oracle strengthening (important):** the round-trip test could not see this class of bug,
because the writer shared the reader’s field order — both were wrong together. Added
`original bytes ≡ xml` in `src/lib/swf/swf-roundtrip.test.ts`: `parseSwfBinary` on the
**original** bundled SWF must equal `parseSwfXml` on the committed FFDec export. That is now
the primary guard for record layout (and it fails if either side drifts again).

## 4. `attachMovie: no symbol exported as "FocusManager"` / `Sound.attachSound: "bgMusic"`

Evidence gathered this session:

| Fact | Source |
|---|---|
| Flash resolves `attachMovie`/`attachSound` in the library of the movie that owns the target clip; there is **no** cross-movie fallback | Ruffle `avm1/globals/movie_clip.rs` (`attach_movie`) and `sound.rs` (`base_clip().avm1_root().movie()`) |
| A movie loaded into a clip keeps `_root === _level0` unless `_lockroot` is set there | Ruffle fixture `tests/tests/swfs/avm1/movieclip_lockroot/output.txt` |
| The bundled service movies **depend** on that: gsecs2.9 does `_root.attachMovie("errorPanelOk"/"errorPanelQuit"/"retryOrQuitPanel"/"errorPanelSushi", …)` | `external/gsecs2.9/scripts/**` |
| The shell exports exactly those panels (`errorPanelOk`, `errorPanelQuit`, `retryOrQuitPanel`, `errorPanelSushi`, `alert`, `loadingBar`, …) and **not** `FocusManager` | `debug/…__exports` census of `bassken_game4.21.swf` (51 exports) |
| `FocusManager` is exported only by the loaded component libraries (`gsecs2.9` 125 exports, `game_chat` 104) | as above |

Conclusion: `_root.createClassObject(mx.managers.FocusManager, …)` in the MX init clip asks
`_level0` for a symbol `_level0` never exports — **Flash returns `undefined` there too** (and
never prints anything). Our engine already resolves the *panels* from the shell library
correctly, i.e. the resolver is faithful; the miss is game data. `bgMusic` is the same class
(one `Sound.attachSound` whose library cannot be checked — no bundled SWF exports `bgMusic`;
the user’s set may export it in a movie we do not have).

Fixed in this session (diagnostic, not behaviour): `loadedMovies` in
`src/engine/as2/builtins.ts` was initialised with the main movie and **never populated**, so
the `(exported by …)` half of the message could never appear. Loaded movies are now
registered in `replaceContent` (before their init actions run) and dropped again on unload,
so the warn reads e.g.

```
attachMovie: no symbol exported as "FocusManager" in bassken_game4.21.swf (exported by gsecs2.9.swf)
```

`src/adapters/gaiaFishing/__tests__/symbolLibraries.dev.test.ts` now pins the faithful
semantics: a shell-library symbol (`errorPanelOk`, the very name the service movies attach)
**does** attach on `_root`, while `FocusManager` returns `undefined`, is reported with the
owning libraries, and is never resolved from another movie. The scratch probe
`debug/tools/vitest/symwarn.dev.test.ts` was removed.

**Open decision for the maintainer:** if the components must actually get a focus manager,
the only faithful lever is `_lockroot` on the container before loading (Flash-supported, but it
would break gsecs2.9’s *own* `_root.*` use for host state: `_root.gsiUserData`,
`_root.serverListing`, `_root.attachMovie("errorPanel…")`). A cross-movie fallback is not an
option (it would silently attach a same-named symbol from the wrong library).

## 5. AVM1 fallback blocks — where the “58 blocks via interpreter” warn stands

Lifted so far (blocks that no longer fall back, from the previous session): `0x32
SetTarget2`-era stack handling, `0x33`/`0x3a` (`DefineLocal`/`Delete`), `0x69` (preloaded
`super`). The user’s console list predates those, so those reasons (`0x3a` ×10, `0x33` ×2,
preloaded super ×4 ≈ 16 of 58) should disappear on the next run.

Remaining reasons, bundled census (`/tmp/census3.log`, 231 blocks — per-reason shapes are
comparable with the user’s 58-block list):

| reason | ours | plausibly user’s |
|---|---|---|
| Nonempty stack at control-flow join | 156 | 26 |
| Unstructured branch join | 25 | 6 |
| Unreachable actions require interpreter | 20 | ? |
| `0x55` Enumerate2 unsupported | 12 | 2 |
| Unstructured conditional branch | 11 | 5 |
| `super` scope | 4 | 4 |
| Conditional local declaration | 3 | 3 |
| Unstructured loop | — | 2 |

**Fix plan, in order of blast radius** (all inside `transpiler/as2/avm1.ts`, with the
interpreter-parity suite `transpiler/as2/__tests__/avm1.test.ts` as the safety net):

1. **Stack materialisation at control-flow edges** — the dominant class (~190/231 here, ~34/42
   of the user’s remainder). The decoder models the operand stack as deferred expressions and
   bails when a branch target / loop head is reached with values still pending. Fix: at such an
   edge, flush pending expressions into hoisted slots (`let $j0…` declared before the enclosing
   statement, assigned at the edge), keep the slots on the modelled stack, and require both
   edges to agree on the slot set. Effort **L** (2–4 sessions), risk **M**; unlocks `&&`/`||`
   conditions, `for`-loop heads and ternaries left live across branches — the shape that
   dominates real game code.
2. **Unreachable-region skip** — when a `Jump` targets a later action and no branch destination
   lies strictly between, emit nothing for the dead range instead of refusing the block.
   Effort **S**, risk **L**; ~20 blocks here.
3. **`0x55` Enumerate2, shape-aware** — emit the structured `for…in`/keys loop only when the
   popped value's shape is known; pairs with (1) because Flash's `for…in` leaves the key on the
   stack across the back edge. Effort **M**, risk **L/M**.
4. **Structured fallback for irreducible regions** (branch joins, conditional branches, loops,
   ≈ 38 here / 13 in the user’s set): if (1)–(3) still leave a block, emit a labelled state
   machine over a `$stack` array instead of deferring to the interpreter. Effort **L**, risk
   **M**; the last resort and the only shape that covers arbitrary bytecode.

## 6. Follow-ups noted, not fixed

* `PlaceOp`/`DisplayItem` still hard-code `hasFilters: false` for button records and do not
  carry `blendMode` for place records, while the FFDec XML path sets both
  (`decompiler/parser.ts`). Place records now carry `hasFilters` from the record; button
  records and `blendMode` parity are still open (the round-trip oracle is blind to both while
  the corpus has no filtered/ blended clips).
* Filters and `blendMode` are decoded/skipped but not rendered (unchanged): visible as missing
  glows/drop shadows on any SWF that uses them.
* `docs/AVM1_ACTIONS_ENCODING.md` still lists `0x55` as unsupported and does not mention the
  join/loop-head policy.
