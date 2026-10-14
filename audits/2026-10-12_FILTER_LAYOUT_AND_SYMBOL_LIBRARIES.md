# Upload failure “unknown filter 51”, record layout, and the library warns — 2026-10-12

Revision: `fb74bfa` + the working tree of this session (branch `arena/8293b842-swf-studio`).
Gates at this revision: `tsc` clean · vitest **300 passed / 3 skipped (68 files)** · `npm run build` 1,820.54 kB (gzip 522.81) · audit 6 vulns.

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

The bundled fishing SWFs contain **no** filter list at all (spec-exact scan of DefineButton2
and PlaceObject3 records across all 8 files, walking tags from the real first tag — after the
RECT/frame header, not from byte 8), which is why this never fired before and why
`audits/SWF_SPEC_19_AUDIT.md` “filters parsed per spec” was never tested against bytes.

The Loader now also names the file: `game.swf: unknown filter 51 (DefineButton2 #23, filter
3/9, +35 bytes into the list)`. The message itself is unchanged in kind (a filter the format
does not define is still an error, never silently skipped) — it just says where.

## 2. Same reader: PlaceObject3 trailing fields

`parsePlace2` skipped FilterList → BlendMode → BitmapCache and then went straight to
ClipActions, so records with `HasVisibility` (`0x20`) or `HasBackgroundColor` (`0x40`) in the
second flag byte lost ClipActions to a 5-byte shift. Both payloads are now skipped
(`UI8`, `RGBA`). Covered by the same test file (`keeps a place record aligned through
filters, blend, cache, visibility and clip actions`, which asserts the produced
`CLIPACTIONRECORD onClipEvent(enterFrame).as` script).

## 3. Placed records store `Name` **before** `ClipDepth` — and six bundled SWFs are regenerated

The field order inside a placed record came up while checking the fix above, and it is
worth recording how it was settled, because the first attempt went wrong in an instructive
way.

**What the bytes say.** `bassken_game4.21.swf` is one of the two bundled files still in its
original compressed form (CWS; the writer here only ever emits FWS), and sprite 14 depth 2
carries a record with both a name and a clip depth:

```
66 02 00 0a 00 00 | "mask" | 06 00        (13-byte tag, consumed exactly)
```

Name first, then ClipDepth, per the spec — and per FFDec (`PlaceObject2Tag.readData`) and
swf-parser. Reading ClipDepth first consumes `6d 61` as a clip depth of 24941 (larger than
every layer in the movie) and a name of `sk`, and leaves two bytes behind. All 518 place
records of gsecs2.9 and all 7359 of bassken_game4.21 now decode with **zero** leftover bytes,
a check that did not exist before and is now permanent (`leftover` on `Place2Info`, reported
as a `warnings[]` entry by both parser passes).

**Why the first attempt concluded the opposite.** The committed
`game-files/fish-full/swfs/{bassken_fish4.20,bassken_overview,bassken_pier,bassken_scene,game_chat,gsecs2.9}.swf`
are byte-for-byte `xmlToSwf(<name>.xml)` — output of this repository's own `tools/xml2swf`.
They are generated fixtures, not the bytes FFDec read, so a field order that the *writer and
the reader get wrong together* is invisible in them: they round-trip perfectly by
construction. Treating one of those files as "the real bytes" therefore produced a confident,
wrong answer. Two things now guard against a repeat:

* `src/lib/swf/swf-roundtrip.test.ts` states the provenance, keeps the reader↔FFDec-XML
  comparison (`bundled bytes ≡ xml`), and adds a `bundled originals` block that asserts the
  CWS originals decode with no structural report and that the record above comes out as
  `name="mask"`, `clipDepth=6`.
* `src/lib/swf/filterList.test.ts` (`placed-record layout`) builds a record in the wrong order
  and asserts the parser reports it, so the invariant cannot rot.

**Effect on the bundled game:** before this correction the original main-app file
`bassken_game4.21.swf` was read with `name="sk"`, `clipDepth=24941` for that record — a mask
that clips to a depth range far beyond the movie, i.e. wrong layering. It now reads
`name="mask"`, `clipDepth=6`. The generated fixtures were regenerated with the corrected
writer (`gsecs2.9.swf` is the only file whose bytes change; same length, 297,335 B), and all
eight bundled SWFs decode with no structural report.

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

## 7. Verified against the uploaded corpus (6 game sets, 43 SWFs)

The failing set and five more were uploaded to
[`discorddioxin/swf-forge`](https://github.com/discorddioxin/swf-forge) — branch
`swf-uploads`, `games-swfs/`: blackjack, fishing, pinball, tiles, towns2, word-bump.
43 files, 12 MB, SWF 6–24, **376 filter lists in 9 of them**.

Reproduction with the pre-fix parser (`fb74bfa`):

| file | pre-fix result |
|---|---|
| `pinball-swfs/game.swf` | **throws `unknown filter 51`** — the reported failure; a 1.8 MB movie rejected at load |
| `towns2-swfs/towns2.swf` | throws `unknown filter 88` |
| `word-bump-swfs/wordbump_game1.4.swf` | warning `DefineButton2Tag: unknown filter 9`; the tag (a button with four drop shadows) was dropped |
| the other 40 | parsed |

The exact record behind the rejection is `pinball-swfs/game.swf`, sprite 528, depth 9: a
PlaceObject3 with a **Glow + Bevel** list. The pre-fix sizes over-consumed the Glow by 6 bytes
and read the next "filter id" from inside the Bevel payload — `0x33`, i.e. **51**. It is now
the first real-bytes test in `src/lib/swf/filterList.test.ts`, together with the towns2 record
(`DropShadow + Glow`, which the old sizes read as `[0, 0]`: no throw, silently wrong picture)
and the word-bump button record (`[0, 0, 0, 0]`, old sizes ended on 9).

After the fix, all 43 parse with **zero warnings** — including the structural checks added in
§2/§3, which stay silent across every place record in a v6–v24 corpus. Driving the real upload
path (`loadUploadedPackages`, i.e. what the Loader does) loads all six sets as 4–11 packages.

**What each set needs next.** The corpus splits cleanly:

| sets | SWF | actions | runnable by |
|---|---|---|---|
| fishing (v7), blackjack (v8), word-bump (v8) | AVM1 — `DoAction`/`DoInitAction` present, no `DoABC` | the AS2 engine (`src/engine/as2`) executes them directly |
| pinball (v9), tiles (v9), towns2 (v17/18/24) | one `DoABC` tag, **no AVM1 actions at all** | parse/inspect only |

The AS3 sets' stage content is created by code, so they will load and show little motion: the
SWF dump supplies symbols and timelines, but `src/engine/flash` runs *transpiled* TypeScript
classes and nothing in this repository turns ABC into source. Running those three sets is an
ABC→source milestone, not a display-list one.

Re-runnable at any time:

* `src/lib/swf/filterList.test.ts` — three real records, verbatim, with the ids the pre-fix
  sizes landed on.
* `debug/tools/vitest/uploadedCorpus.dev.test.ts` — parses the whole corpus and requires no
  structural report; skips cleanly when the corpus is not present
  (`SWF_CORPUS=/path/to/games-swfs`, or clone to `/tmp/swf-forge`).
* Button records now carry `hasFilters` too (real case: word-bump `DefineButton2 #541`), so the
  inspector marks filtered button states.

## 6. Follow-ups noted, not fixed

* `PlaceOp`/`DisplayItem` still hard-code `hasFilters: false` for button records and do not
  carry `blendMode` for place records, while the FFDec XML path sets both
  (`decompiler/parser.ts`). Place records now carry `hasFilters` from the record; button
  records and `blendMode` parity are still open — and note the corpus has no filtered or
  blended clips at all, so no current test can see the difference.
* The six regenerated fixtures in `game-files/fish-full/swfs/` are writer output. Byte-level
  claims about SWF layout should be checked against the two CWS originals (or another real
  file), never against those six; the test file says so where it matters.
* Filters and `blendMode` are decoded/skipped but not rendered (unchanged): visible as missing
  glows/drop shadows on any SWF that uses them.
* `docs/AVM1_ACTIONS_ENCODING.md` still lists `0x55` as unsupported and does not mention the
  join/loop-head policy.
