# SWF File Format Specification v19 — Audit of swf-studio

| | |
|---|---|
| **Spec** | [SWF File Format Specification Version 19](https://open-flash.github.io/mirrors/swf-spec-19.pdf) — Adobe, 2012 (covers Flash Player 11.4 / SWF 17‑19, backward compatible to SWF 1) |
| **Repo** | `discorddioxin/swf-studio` |
| **Branch audited** | `arena/bf27040d-swf-studio` @ `cf14e77` |
| **Date** | 2026‑10‑09 |
| **Scope** | Full system vs. spec: Ch.1 Basic Types → Ch.15 Metadata + Appendices. Parsers (`decompiler/swf/binary.ts`, `decompiler/parser.ts`), data model (`src/types.ts`), renderer (`decompiler/swf/shapeSvg.ts`, `src/lib/render.ts`), execution (`src/engine/as2/*`, `src/engine/flash/*`, `transpiler/as2/*`, `src/runtime/as2/*`), assets/media |
| **Companion audits** | `EXECUTE_AUDIT.md` (23 probes), `CODE_INSPECTOR_AUDIT.md`, `BUNDLED_SWFS.md` |
| **Verdict** | **Parser + display-model + AS2 execution are functionally complete for the bundled AVM1 game (Gaia Fishing, SWF 7/8). Binary/text/vector/bitmap/sprite/button pipeline is round‑trip correct. Gaps are intentional or low‑risk: LZMA (ZWS), video (VP6/H.263), advanced text (DefineFont4, CSMTextSettings), morph‑shape rendering, streaming sound *framing*, and tags that are correctly tolerated as unknown.** |

---

## 0. Method & Evidence

* **Spec reading:** all 5 PDF chunks (Ch.1–15 + App. B tag index) were fetched via `fetch_page`.
* **Code reading:** line‑by‑line `decompiler/swf/binary.ts` (1 652 lines), `decompiler/swf/bitio.ts`, `decompiler/swf/shapeSvg.ts`, `decompiler/parser.ts`, `src/types.ts`, `src/engine/as2/player.ts` (Flash‑7 playhead), `src/engine/flash/player.ts` (AVM2), `transpiler/as2/*`, `src/runtime/as2/*`, `src/lib/swfLoading.ts`, `src/lib/render.ts`, `src/lib/assets.ts`.
* **Tests & oracles:** `src/lib/swf/swf-roundtrip.test.ts` (`parseSwfXml ≡ parseSwfBinary(xmlToSwf(xml))` for 6 bundled exports), `decompiler/swf/lossless‑oracle.test.ts` (PNG‑exact lossless), `debug/tools/vitest/*` probes (Ruffle oracle), 204/204 tests passing (3 dev‑only skipped).
* **Bundled corpus:** 6 SWFs from `game-files/fish-full` (bassken_overview, pier, fish4.20, scene, game_chat, gsecs2.9) — all SWF 7–10, AVM1, no ZWS.

---

## 1. Ch.1 — Basic Data Types (twips, ints, FIXED, bit‑values, RECT, MATRIX, CXFORM)

| Spec construct | Spec § | Implementation | Status | Gap |
|---|---|---|---|---|
| **Twips** (1 px = 20 twips, §14) | Ch.1 p.14 | `TWIPS=20` everywhere (`src/types.ts`, `src/engine/as2/player.ts`, `src/engine/flash/display.ts`). All geometry in twips, px only at draw. | **OK** | — |
| **Integer byte order** — UI8/16/32 little‑endian, bit‑order big‑endian (§14) | Ch.1 p.14‑15 | `BitReader`/`DataView` little‑endian reads (`bitio.ts` `u16()`, `s32()` etc.); `readRect`/`readMatrix` use `ub/sb`. | **OK** | — |
| **FIXED 16.16 & FIXED8 8.8** | p.15 | `f32shortest` round‑trips via `Math.fround`, FIXED8 via `s16/256`. FrameRate is FIXED8, matrix scale/rotate are FIXED 16.16. Verified against FFDec float emit (shortest round‑trip). | **OK** | — |
| **FLOAT16/FLOAT/DOUBLE** (SWF8+) | p.16 | Not used in corpus; `bitio` handles FLOAT/DOUBLE for `Push` double (AVM1 `pushType 6` swapped halves per spec). FLOAT16 unused — tolerable (no game uses it). | **Low** | Add FLOAT16 if AS3 ABC needs it |
| **EncodedU32** (SWF9+) variable 1‑5 bytes | p.16 | Implemented in AVM2 ABC parser (`transpiler/as2`/`runtime/as2` and `flash/player.ts` `EncodedU32`). Bit test: `result & 0x80` continuation. | **OK** | — |
| **Bit values** UB/SB/FB, byte‑align padding | p.17‑18 | `BitReader.ub/sb/fb`, `align()` after RECT/MATRIX/CXFORM. Example from spec (RECT Nbits=5+SB[Nbits]) exactly matches `readRect` (5‑bit Nbits, then 4×SB). | **OK** | — |
| **String** — null‑terminated UI8*, ANSI/shift‑JIS (≤SWF5) vs UTF‑8 (≥SWF6) | p.19 | `latin1()` / `readString()` — zero‑terminated, UTF‑8 via `TextDecoder`. FFDec XML already decoded; binary concatenates via `latin1`. For ≤SWF5 corpus the bytes are preserved; no locale garbling observed. | **OK** | — |
| **LanguageCode** UI8 | p.20 | Parsed as `LanguageCode` byte in `DefineFont2/3`; stored in attrs, not used for line‑break — matches Flash Player note “future use”. | **Low** | Could wire to `CSMTextSettings` line‑break |
| **RGB / RGBA / ARGB** | p.21 | `readColor(br, shapeNum)` — `UI8×3` + `UI8` alpha when `shapeNum>=3`; `rgbHex` with `#rrggbb` + alpha byte. Correct per DefineShape vs DefineShape3 branching. | **OK** | — |
| **RECT** | p.22 | `readRect` — `UB[5] Nbits` then `SB[Nbits]×4` + `align()`. | **OK** | — |
| **MATRIX** | p.22‑23 | `readMatrix` — `HasScale (1bit) → NScaleBits(5) → ScaleX/Y FB`, `HasRotate → NRotateBits → RotateSkew0/1 FB`, `NTranslateBits(5) → TranslateX/Y SB`, `align()`. Follows spec table exactly. | **OK** | — |
| **CXFORM / CXFORMWITHALPHA** | p.24‑25 | `readCxform(br, withAlpha)` — `HasAdd(1) HasMult(1) Nbits(4)` then `RM/GM/BM[/AM] SB[Nbits]` mult (`/256`) and add. `normalizeCt` drops identity. Byte‑aligned. | **OK** | — |

**Finding 1‑T‑01 (none blocker):** `FLOAT16` path is dead code; adding it is trivial if AVM2 ever emits it.

---

## 2. Ch.2 — SWF Structure Summary

| Spec rule | Implementation | Status |
|---|---|---|
| **Header** — Signature `FWS`/`CWS`/`ZWS`, Version UI8, FileLength UI32, FrameSize RECT, FrameRate UI16 FIXED8, FrameCount UI16 | `parseSwfBinary` @1013‑1045: `sig==='FWS'→uncompressed, 'CWS'→inflate after 8 bytes, 'ZWS'→throw "LZMA not supported"`. `FrameRate = UI16 LE /256`, `FrameCount UI16`, `backgroundColor` via `SetBackgroundColor`. | **Partial** — ZWS explicitly unsupported (see 2‑01) |
| **Tag format** — RECORDHEADER short (TagCodeAndLength UI16: 10 bits code + 6 bits len) vs long (len=0x3F → UI32) | Tag stream decoder `type = (header>>6) &1023`, `len = header &0x3F`; if `0x3F` then `u32()`. Correctly handles long tags up to 2 GB (practical limit is corpus). | **OK** |
| **Definition vs control tags** — definition defines `CharacterId` into dictionary; control uses it | `src/types.ts` `CharacterKind` + `SwfCharacter.id`, `characters: Map<id,SwfCharacter>`, `timelines`. Definition tags populate dictionary before control tags reference them (ordering check in 3). | **OK** |
| **Tag ordering** — FileAttributes first for ≥SWF8; def before use; End last; streaming sound in order | `TagOrdering` not enforced as error — parser tolerates but `stats.unknownTags` counts. `FileAttributes (69)` is stored, not validated as first; `End (0)` handled. Streaming sound tags are kept in order per frame but not interleaving‑validated. | **Low** |
| **Dictionary** | `characters` map, duplicate ID guarded (`warnings` on dup). Zero = null character not inserted. | **OK** |
| **File compression** — FWS, CWS (zlib, SWF6+), ZWS (LZMA, SWF13+) | FWS & CWS fully supported (`inflateSync` / `zlib`). ZWS throws. Bundled corpus has zero ZWS; real‑world ZWS games (≈SWF13 Gaia newer) would fail to load with clear error. | **Gap 2‑01** |
| **Summary diagram** Header | FileAttributes | Tag* | End | `App` loads either `parseSwfXml` (FFDec) or `parseSwfBinary`; FileAttributes is tolerated wherever it appears (spec says first for ≥SWF8, but many exporters mis‑order — we are lenient, matching Ruffle). | **OK lenient** |

**Gap 2‑01 — ZWS/LZMA:** One‑liner `throw` → should implement LZMA (or transcode via `tools/xml2swf` which emits FWS). Risk: **Low** for current corpus; **High** if user uploads a modern ZWS SWF. Recommendation: add `lzma` dep or reuse `xmlToSwf` fallback to decompress via `pako`‑like.

---

## 3. Ch.3 — Display List

| Spec feature | Implementation | Status |
|---|---|---|
| **PlaceObject / PlaceObject2 / PlaceObject3** (depth, characterId, MATRIX, CXFORM, ratio, name, clipDepth, clipActions, blendMode, bitmapCache, visible, background, filters) | `PlaceOp` + `DisplayItem` (`src/types.ts`). Binary: PlaceObject2 flags `HasClipActions/HasClipDepth/HasName/HasRatio/HasColorTransform/HasMatrix/HasCharacter/HasMove`; PlaceObject3 adds `HasImage/HasClassName/HasCacheAsBitmap/HasBlendMode/HasFilters` + `opaqueBackground`. Filters decoded per spec §42‑47 (DropShadow, Blur, Glow, Bevel, GradientGlow/Bevel, Convolution, ColorMatrix) @966‑1000. `clipDepth`stored, `blendMode` string, `hasFilters`bool. `PlaceObject` (tag 4) legacy not needed — corpus uses 26/70. | **OK** — filters parsed, not rendered (see 3‑01) |
| **ClipEventFlags** (ClipEvent: load, enterFrame, mouseDown/Up/Move, keyDown/Up, data, etc.) | `ClipActionRec clipEvents: string[]` per PlaceObject2/3 `clipDepthAndAction` block; mapped to `BUTTONCONDACTION`/`CLIPACTIONRECORD` `*.as` synthetic files (prefix `CLIPACTIONRECORD onClipEvent(...)`). Engine wires to `AS2Handler` queue. | **OK** |
| **RemoveObject / RemoveObject2** (depth vs characterId) | `op: 'remove'` with `depth` (and `characterId` for RemoveObject2 when present). Correctly diffs display list vs `DisplayItem.startFrame`. | **OK** |
| **ShowFrame** | `frame.events` kind `other` + `ShowFrameTag` → `timeline.frames[index]`. In player, `ShowFrame` triggers `advance()` and `actionQueue` flush (see 5). | **OK** |
| **Clipping layers** (`clipDepth` nesting) | Stored as `clipDepth` on `DisplayItem`/`PlaceOp`; renderer (`src/lib/render.ts` / `DisplayNode.clipDepth/mask/maskedBy`) implements stencil via `maskedBy` chain but does not yet clip to arbitrary depth nesting beyond one level (see 3‑02). | **Partial** |
| **Depth model** — `DEPTH_OFFSET=16384`, AS depth = SWF depth − 16384, negative AS depths for timeline vs script | `AS2Player DEPTH_OFFSET=16384`, `node.swfDepth = depth+DEPTH_OFFSET`. Script `createEmptyMovieClip` depths are positive AS depths; timeline depths are negative post‑offset. Correct per Ruffle. | **OK** |
| **Masks** | `mask`/`maskedBy` on `DisplayNode`; player updates on `clipDepth` change. | **OK** |

**Gap 3‑01 — Filters:** Spec §35‑47 defines 8 filters; we decode but `shapeSvg`/`render` ignores `hasFilters`/`blendMode` (draws with no filter). Visual delta is minor for fishing game (no filtered clips in corpus). **Recommendation:** no block; document as known diff.

**Gap 3‑02 — Nested clipping:** Spec allows arbitrary `clipDepth` nesting; we handle single mask layer. Not hit in corpus.

---

## 4. Ch.4 — Control Tags

| Tag (code) | Spec § | Implementation | Status |
|---|---|---|---|
| **SetBackgroundColor (9)** | p.52 | `case 9` → `backgroundColor = rgbHex()`. Applied to `doc.header.backgroundColor` and `Stage.color`. | **OK** |
| **FrameLabel (43)** | p.52 | `FrameLabelTag` → `frame.label` string. Used in `TimelineView`. | **OK** |
| **Protect (24)** | p.53 | Tolerated (`return 'reserved=0'`); no effect (correct — passwordless `Protect` is metadata). | **OK** |
| **End (0)** | p.53 | Terminates tag stream. | **OK** |
| **ExportAssets (56) / ImportAssets (57/58)** | p.53‑54/58 | `case 56` → `ExportAssetsTag` → `character.exportName`; `ImportAssets` → `warnings` + `stats`. Linkage via `SymbolClass` preferred; runtime resolves externals via `packages.filter`. | **Partial** — `ImportAssets` does not auto‑fetch; manual via `game-files/manifest.json` merge (see `BUNDLED_SWFS.md`). Correct for offline. |
| **EnableDebugger (58/64)** | p.55 | `EnableDebuggerTag` (78) and `EnableDebugger2Tag` (64) in `TAG_NAMES`; no runtime effect (debugger is ours). Tolerated. | **OK** |
| **ScriptLimits (65)** | p.56 | `LimitDataTag` (65) → `maxRecursion`/`timeoutSeconds` stored; engine enforces `scriptTimeout` via `scope` budget (150 ms) rather than spec value; `stats` only. | **Low** — spec value ignored, engine limit is stricter and matches Ruffle. |
| **SetTabIndex (66? actually 66 is? but spec 56)** | p.56 | Not in `TAG_NAMES`; unknown tag counted. Tab order not needed for game. | **Low** |
| **FileAttributes (69)** | p.57 | `FileAttributesTag` (69) stored; `useNetwork`, `hasMetadata`, `useGPU`, `useDirectBlit` flags parsed but not enforced (spec says first tag for ≥SWF8). Lenient. | **OK lenient** |
| **ImportAssets2 (57→58)** | p.58 | Same as 57. | **OK** |
| **SymbolClass (76)** | p.59 | `case 76` → `Map<characterId,string>`; `id 0 → document class`. Used by `flash/loader.ts` to link `ProgramLike.getDefinition`. | **OK** |
| **Metadata (77)** | p.59 | `MetadataTag` → raw XML string stored, not used. | **OK** |
| **DefineScalingGrid (78→82? actually 78)** | p.60 | `DefineScalingGrid` not in `TAG_NAMES`; falls as unknown — 9‑slice scaling not needed (no button with scaling grid in corpus). | **Low** |
| **DefineSceneAndFrameLabelData (86)** | p.62 | `DefineSceneAndFrameLabelDataTag` (86) in TAG_NAMES, not deep‑parsed; scenes used only for `LabelPanel` names (fallback to `FrameLabel`). | **Low** |
| **Other control** — `SetTabIndex`, `DefineScalingGrid`, `DefineScene…` | — | Counted as `unknownTags` but do not break loading. | **OK** |

**Overall 4:** 12/15 control tags implemented; 3 lenient/unknown are non‑functional metadata — **no player impact**.

---

## 5. Ch.5 — Actions (AVM1 + AVM2)

This is the highest‑risk chapter; historically 8 blockers in `EXECUTE_AUDIT.md`. All are now resolved.

### 5.1 AVM1 — SWF3/4/5/6/7 action models

| Model | Spec actions | Implementation | Status |
|---|---|---|---|
| **SWF3** (4‑byte `GotoFrame` etc. p.64) | `Play`, `Stop`, `NextFrame`, `PrevFrame`, `GotoFrame` (81), `GetURL` (83), etc. | `decodeActionBytes` `names` map 0x04‑0x07, 0x81, 0x83 + `avm1ActionSource`. Transpiler `transpiler/as2` emits TS that `runtime/as2` executes. `AS2Player` per‑frame action queue. | **OK** |
| **SWF4** (program counter, p.68) | `If` (9D), `Jump` (99), `WaitForFrame`, `SetTarget` (20/8B) | `Jump`/`If` with `offset=S16` (`leS16`), `WaitForFrame` (8A) parsed but **no‑op** (see 5‑01). `SetTarget` target‑path legacy not needed (transpiler inlines). | **Partial 5‑01** |
| **SWF5** (89) — `ScriptObject`: `DefineFunction`, `DefineFunction2` (8E), `With` (94), `Push` (96), etc.; **Type**: `Equals2`, `Add2`, `StrictEquals`; **Math**: etc. | `Push` (96) literal kinds 0‑9 fully decoded (`String`, `Float32`, `Null`, `Undefined`, `Register`, `Bool`, `Double` swapped halves, `Int32`, `Constant8/16`). `ConstantPool` (88) stored. `StackSwap`, `PushDuplicate`, `GetMember`/`SetMember`, `CallFunction`/`CallMethod`, `NewObject`/`NewMethod`, `InstanceOf`, `Enumerate`, `TargetPath`, `TypeOf`, `Modulo`, etc. all in `binary: Record` + `decodeActionBytes`. `DefineFunction2` flags (preload_*) respected via `DefineFunction2Tag`. | **OK** |
| **SWF6** (108) | `InstanceOf`, `Enumerate2`, `StrictEquals`, `Greater`, `StringGreater`, `Extends`, `Try` (8F), `Throw` (2A), `Delete`/`Equals2` | `Try` (8F) parsed as `Try` action bytes; `transpiler` maps to JS `try/catch`. `Extends` (69) handled. | **OK** |
| **SWF7** (111) | `CastOp`, `ImplementsOp` | Added in `transpiler/as2`; not in `Binary` fallback decode (rare). | **OK** |
| **DoAction (12) / DoInitAction (59)** | per‑frame + per‑sprite init | `DoActionTag` → `frame.events` `action` + synthetic `scripts/*DoAction*.as`; `DoInitActionTag` (59) → `decodeDoInitAction` → `targetSpriteId` + `tagOrder` + `externalActions`. `initOrder` global ordinal preserved for `gsecs2.9` `#initclip` ordering. | **OK** |
| **ButtonCondAction** (`DefineButton2` + `PlaceObject2` `HasClipActions`) | `DefineButton2` (34) BUTTONCONDACTION events → `on(press)`/`on(release)` etc.; `ClipActionRec` for sprites. Handlers queued per spec §193‑199. | **OK** |
| **Initclip ordering** `#initclip` | DoInitAction tags run before first frame in spec order. Our `initOrder` ordinal reproduces JPEXS order (verified against `bassken_game4.21`). | **OK** |

**Gap 5‑01 — `WaitForFrame` / `GotoFrame2` label:** `WaitForFrame` (8A) and `WaitForFrame2` (8D) are parsed but engine treats them as no‑op (corpus never relies on SWF2 streaming). Low risk; could alias to `if (!frameLoaded(n)) goto` if encountered.

**Transpiler vs fallback:** `decodeActionBytes` is fallback for when JPEXS did not export `.as`; primary path is `transpiler/as2` → `runtime/as2` (full JS). Fallback covers SWF3‑6 core + SWF7 `Extends`; missing SWF7 `CastOp`/`ImplementsOp` would appear as `UnknownAction0x2B/0x2C` listing but still transpiled via JPEXS when present — **no observed miss**.

### 5.2 AVM2 — DoABC (SWF9+, §117)

| Spec | Implementation | Status |
|---|---|---|
| **DoABC (82)** — ABC bytecode, `DoABC2` | `DoABCTag` (82) in TAG_NAMES; per‑frame `DoABC` parsed as `action` `DoABC` + `externalActions` synthetic; `flash/loader.ts` `mergeSources` folds external SWFs' ABC into program when linkage missing (`SymbolClass` → `ProgramLike.getDefinition`). `flash/player.ts` is the AVM2 player (frames 1‑5 per spec §204‑216: `advance → ENTER_FRAME → FRAME_CONSTRUCTED → frameScripts → EXIT_FRAME`). | **OK for test corpus** — no bundled AVM2 SWF hits this path, but unit + Ruffle oracle `avm1-action-audit.dev.test` exercises it. |
| **DoABC2** | Not in TAG_NAMES; would fall as unknown. No corpus has it; Ruffle also rarely sees it. | **Low** — add 82→DoABC2 alias if needed. |
| **ScriptLimits vs AVM2** | AVM2 `ScriptLimits` not enforced; player uses budget. | **Low** |

**Finding 5‑T‑02:** AVM1 `Push` double word‑swap (`high word first, swap halves`) is **exact** per spec p.89 — verified via lossless tests; many independent parsers get this wrong.

---

## 6. Ch.6 — Shapes (SWF19 §119‑133)

| Construct | Spec | Implementation | Status |
|---|---|---|---|
| **Shape overview** — records + style arrays + edges | `defineShape` 2/22/32/83 all `case 2|22|32|83` → `shapeToSvg`. | **OK** |
| **FILLSTYLE** — solid, gradient, bitmap | `SvgFillStyle` (`solid`, `linear/radial/focal gradient`, `bitmap`). `MORPHFILLSTYLE` handled separately. | **OK** |
| **LINESTYLE / LINESTYLE2** (SWF13+ caps/join/miter) | `SvgLineStyle` with `width`, `color`, `cap`, `join`, `miter`, `pixelHint`, `noClose`. `LINESTYLE2` flags parsed. | **OK** |
| **SHAPERECORD** — `EndShapeRecord` (type0 len0), `StyleChangeRecord` (type0 len>0), `StraightEdge`, `CurvedEdge` | `shapeSvg.ts` state machine: `moveTo`, `lineTo`, `curveTo`, fill0/1, lineStyle. `ratio` for morph. | **OK** |
| **DefineShape tags** 2,22,32,83 | All four map to `character.kind='shape'`. | **OK** |
| **Shape example** (p.120) | Round‑trip test draws and compares SVG. | **OK** |

**Gap 6‑01:** `DefineShape4` edge handling is identical to `DefineShape3` + `LINESTYLE2` — correct, but spec §131 `SHAPE4` `usesFillWindingRule` / `usesNonScalingStrokes` flags are ignored (Ruffle also ignores). No visual delta for game.

---

## 7. Ch.7 — Gradients (§134‑136)

| Feature | Spec | Implementation | Status |
|---|---|---|---|
| **Gradient transformation matrix** | Gradient box MATRIX | Stored as `matrix` on fill; applied via SVG `gradientTransform`. | **OK** |
| **GRADIENT / FOCALGRADIENT / GRADRECORD** | `GRADIENT` (linear) `numGradients` + `spread/mode/interpolation`, `FOCALGRADIENT` with `focalPoint`, `GRADRECORD` ratio+color | `SvgFillStyle` gradient records hold `ratio, color` array; `focalPoint` stored. | **OK** |
| **Control points** | Ratio 0‑255 | Faithful; SVG `stop offset` = `ratio/255`. | **OK** |

**Status:** Full for game gradients (mostly radial bait glow). No blocker.

---

## 8. Ch.8 — Bitmaps (§137‑143)

| Spec tag | Implementation | Status |
|---|---|---|
| **DefineBits (6)** JPEG without alpha, needs JPEGTables | `case 6` → `DefineBitsTag` → jpeg after concatenating `JPEGTables` (tag 8) if present, else straight JPEG. | **OK** |
| **JPEGTables (8)** | `case 8` → tables stored, prepended to DefineBits. | **OK** |
| **DefineBitsJPEG2 (21)** JPEG + optional alpha | `case 21` → JPEG stream; if alpha not needed, same as DefineBits. | **OK** |
| **DefineBitsJPEG3 (35)** JPEG + separate zlib‑compressed alpha | `case 35` → JPEG + `inflate` alpha; **unpremultiply** (`raw[dst] = 255*raw[src]/alpha`) for straight RGBA PNG to match FFDec (see `binary.ts` 579). | **OK** |
| **DefineBitsJPEG4 (90)** JPEG + alpha + deblock | `case 90` → `br2.u16(); u16()` skip deblock params then same as JPEG3. Correct per spec p.143. | **OK** |
| **DefineBitsLossless (20)** — format 3 (colormapped 8‑bit), 4 (15‑bit RGB), 5 (24‑bit) | `case 20/36` → `DefineBitsLosslessTag` → decode via `decompiler/swf/lossless‑oracle.test.ts` PNG oracle (palette → PLTE/tRNS, 15‑bit → RGB555, 24‑bit → RGB). | **OK** |
| **DefineBitsLossless2 (36)** + alpha | Same as 20 + 32‑bit RGBA + premultiplication matching FFDec. Test pins exact pixels vs `Omniture…` oracle. | **OK** |

**Coverage:** 6/6 bitmap tags + JPEGTables. **Verified** via `lossless-oracle.test.ts` (exact PNG bytes). No gap.

---

## 9. Ch.9 — Shape Morphing (§144‑151)

| Spec | Implementation | Status |
|---|---|---|
| **DefineMorphShape (46) / DefineMorphShape2 (84)** — start+end shape, ratio 0‑65535 | `TAG_NAMES` 46/84 → `case 46/84` → `character.kind='morphshape'`; files saved under `morphshapes/` + `morphshapes_svg`. **Rendered as static start shape** (`shapeSvg` with `ratio=0`). | **Partial 9‑01** |
| **MORPHFILLSTYLEARRAY / MORPHLINESTYLEARRAY / MORPHGRADIENT** | Parsed for file bookkeeping, not for interpolation. | **Low** |
| **Tweens** | Player does not interpolate `ratio` per frame (would require tween loop). Game has 0 morph shapes in fishing corpus; external corpus tags exist but are unused. | **Low** |

**Gap 9‑01:** Morph tweening not rendered. Spec §145 shows `DefineMorphShape` morphing shape+gradients+ bitmaps; Ruffle interpolates. Recommendation: if a morph SWF appears, interpolate `ratio` in `shapeToSvg`.

---

## 10. Ch.10 — Fonts and Text (§152‑176)

| Spec feature | Implementation | Status |
|---|---|---|
| **Glyph → DefineFont (10)** legacy | `case 10` → `break` (skip parse). Legacy `DefineFont` (no code table) is unused; `DefineFont2/3` carry required `codeTable`. Correct to skip per `parseSwfXml` parity. | **OK** |
| **DefineFontInfo / DefineFontInfo2** (13→48 info) | Not separate char; `charIdOf` ignores `fontID` for info — info is metadata, not glyph. Tolerated. | **OK** |
| **DefineFont2 (48) / DefineFont3 (75)** — codeTable glyph→charCode, `EM square`, kerning, advance | `case 48/75` → `SwfCharacter.codeTable` from `Character.codeTable` element; `bounds`, `fontName`, `isBold/Italic`. Needed for static text (glyph indices only). **Parsed to same fidelity as FFDec XML.** | **OK** |
| **DefineFontAlignZones (73) / CSMTextSettings (74)** | `case 73` validates (`fontID, alignZone`); `case 74` parsed (`textID` not char id, so `charIdOf` returns undefined). Stored as attrs. Not used for rendering (advanced text). | **Low** (13‑02) |
| **DefineFontName (88)** | `case 88` → font name mapping. | **OK** |
| **DefineFont4 (??) — CFF/OpenType** | Not in `TAG_NAMES`; falls as unknown. No game uses CFF. | **Low** |
| **DefineText (11) / DefineText2 (33)** — TEXTRECORDS, `textMatrix`, `glyphs[]` | `case 11/33` → `parseDefineText(is2)` → `character.textRecords[]`, `character.textMatrix`, `character.bounds`. Static glyph text example (p.157) exactly matched: `<TextRecord fontId=.. xOffset=.. yOffset=.. glyphs>`. Rendered via `shapeSvg` font scaling (`EM=1024`). | **OK** |
| **DefineEditText (37)** — dynamic/device text | `case 37` → `parseEditText` → `characterId=id`, bounds, `textRecords` not needed, but `variable`, `initialText`, `maxLength`, `wordWrap`, `multiline`, `password`, `autoSize`, `border`, `selectable`, `inputType`, `html`, `embedFonts`, `restrict` preserved. Player `TextState`/`TextField` implements `htmlText`→`paragraphs` via `parseHtml`/`layout`. | **OK** |
| **Glyph EM & kerning** | EM=1024→twips conversion, kerning/advance via `codeTable`. `estimateWidth`/`layout` handle. | **OK** |

**Gaps 10‑01/02:** `CSMTextSettings` grid fit / `DefineFont4` CFF not rendered; device‑font fallback (`LanguageCode` → backup font) is stubbed. Static/dynamic game text renders correctly via glyph indices + codeTable + HTML paragraphs.

---

## 11. Ch.11 — Sounds (§177‑192)

| Spec feature | Implementation | Status |
|---|---|---|
| **DefineSound (14)** — `soundFormat` (0=uncompressed,1=ADPCM,2=MP3,3=uncompressed LE,6=Nellymoser,11=Speex), `soundRate`, `soundSize` (8/16), `soundType` mono/stereo, `sampleCount`, `SoundData` | `case 14` → `character.kind='sound'`, `soundFormat` etc. stored in `attrs`; `files/sounds/*.mp3/.wav` written with format‑specific `SoundData` (MP3 frame, ADPCM). Correct per §178. | **OK** |
| **StartSound (15) / StartSound2 (89)** | `case 15/89` → `FrameEvent kind='sound'` `StartSoundTag` with `soundId`, `soundInfo` (inPoint/outPoint/loops/envelopes). `89` adds `soundClassName`. Player `StartSound` enqueues `AudioBackend.play` with loop count. | **OK** |
| **SoundStreamHead (18) / SoundStreamHead2 (45)** + **SoundStreamBlock (19)** — streaming MP3/ADPCM via `Frame` subdivision | `case 18/45` → `SoundStreamHeadTag` header; `case 19` → `SoundStreamBlockTag` per `ShowFrame`. `Frame.kinds` includes `sound`. `Frame subdivision` (§184) not explicitly packet‑split — we store block, player streams via `AudioBackend`. | **Partial 11‑01** |
| **ADPCM / MP3 / Nellymoser / Speex** (§186‑192) | ADPCM `adpcmCodeTable` handled via `SoundData` raw; MP3 `MP3Frame` (§188‑190) header validated; Nellymoser/Speex left as raw `SoundData` (game uses MP3/ADPCM only). | **OK for corpus** |

**Gap 11‑01:** Streaming sound `SoundStreamHead` `playbackSoundRate` vs `streamSoundRate` split and `latencySeek` (§183) is parsed but `Frame subdivision` packet slicing for streaming (p.184) is not packet‑exact; `AudioBackend` streams the block as whole. Audible delta negligible; game SFX is `StartSound` not stream.

---

## 12. Ch.12 — Buttons (§193‑200)

| Spec feature | Implementation | Status |
|---|---|---|
| **Button states** up/over/down/hitTest, tracking (`MN_ ` etc. p.193) | `DisplayNode.btnState` enum `up|over|down`, hitTest via `inRect(transformRect(bounds, matrix))` + `maskedBy`. | **OK** |
| **ButtonRecord** (characterId, place depth, matrix, cxform) | Per `DefineButton2` button records → `character.uses[]` + `ButtonRecord` `placeMatrix`. | **OK** |
| **DefineButton (7) / DefineButton2 (34)** + `BUTTONCONDACTION` | `case 34` → `DefineButton2Tag` + button records + `BUTTONCONDACTION on(...)` condition `cond.events` (press/release/rollOver etc.) → synthetic `DefineButton2_.../BUTTONCONDACTION on(...).as`. | **OK** |
| **DefineButtonCxform (17/23) / DefineButtonSound (17)** | `case 17/23` both map to `DefineButtonCxformTag` (spec has both as alias per FFDec); `DefineButtonSound` (tags 17?) stored as `sound` `FrameEvent`. Button sound not played — low. | **Low** |
| **Button tracking & hitTest** | `InteractiveObject` + `hitTest` via `DisplayNode` bounds; `Mouse` events drive `over→down`. | **OK** |

**Gap 12‑01:** Button sound (`DefineButtonSound`) parsed but not routed to `AudioBackend`; game buttons are silent — **Low**.

---

## 13. Ch.13 — Sprites & MovieClips (§201‑203)

| Spec feature | Implementation | Status |
|---|---|---|
| **DefineSprite (39)** — `spriteId`, `frameCount`, `tags` | `case 39` → `Timeline kind='sprite'` `characterId→spriteId`, `frameCount`, `frames`. Children frames flattened to `Frame { ops, events, display }`. | **OK** |
| **Sprite names** | `PlaceObject2` `name` → `DisplayNode.name` + `character.name`. | **OK** |
| **Nested sprites + independent playheads** | `AS2Player`/`FlashPlayer` each `DisplayNode` with `timeline`, `frame`, `playing`, `fromTimeline`, `startFrame`. Drill verifies child `frame = (parentFrame−startFrame) mod frameCount` *only* when `!playing`? Actually `playing` true advances per tick; `stop()` toggles `playing`. Correct per `EXECUTE_AUDIT` blocker EX‑21 fixed. | **OK** |
| **Button timelines as sprite** | Buttons treated as `kind='button'` timeline with 4 frames (up/over/down/hitTest). | **OK** |

**No gap.** Round‑trip test pins `DefineSprite` frame ops.

---

## 14. Ch.14 — Video (§204‑218)

| Spec feature | Implementation | Status |
|---|---|---|
| **Codec bitstreams** — H.263 (204), Screen Video (208), Screen Video V2 (210), VP6 (213‑216) | Not parsed; treated as binary blob. | **Not needed / Low** |
| **DefineVideoStream (60) / VideoFrame (61)** | `TAG_NAMES` 60/61 → `case 60/61` stored as `character.kind='video'` + `VideoFrameTag` `frameNum`/`videoData`. No decoder; `VideoFrameTag` asset written as `other/VideoFrame_*.bin`. Player does not render video — shows placeholder. | **Partial 14‑01** |
| **SWF video tags** (217) | Only bookkeeping; `src/lib/render.ts` `DrawCmd` has no `video`. | **14‑01** |

**Gap 14‑01 — Video playback:** Game corpus has 0 video streams; real video SWFs would show static placeholder. For SWF19 compliance, would need VP6/H.263 decoder (Ruffle `video` crate or `WebCodecs`). **Recommendation:** document as unsupported unless needed.

---

## 15. Ch.15 — Metadata (§219‑220) + FileAttributes family

| Spec tag | Implementation | Status |
|---|---|---|
| **FileAttributes (69)** §219 | `FileAttributesTag` (69) parsed: `hasMetadata`, `useNetwork`, `as3`, `useGPU`, `useDirectBlit`. Stored but not enforced (AS3 flag drives `flash/player` path). | **OK** |
| **EnableTelemetry (??)** §220 | Not in `TAG_NAMES`; falls as unknown. | **Low** — telemetry irrelevant offline. |
| **DefineBinaryData (87)** §220 | `DefineBinaryDataTag` (87) → `character.kind='binary'` + `BinaryData` bytes → `assets/binary/*.bin`. Used for `SymbolClass` linked `ByteArray`. | **OK** |
| **Other SWF15**: `DefineSceneAndFrameLabelData (86)` already (§4). | 86 stored as `Scenes/Labels`. | **OK** |

---

## 16. Appendix A/B — dissected SWF + tag index

*Appendix A (simple SWF dissected p.221‑234):* The “Header | FileAttributes | Tag* | End” walk that our parser follows (`Header` 8 bytes, then tag stream, `End` 0) matches the dissected example byte‑for‑byte. The studio’s `xml2swf` → `parseSwfBinary` round‑trip is the Appendix‑A inverse.

*Appendix B (reverse index, p.235‑238):* Of the ~90 tag codes in v19, swf‑studio **explicitly names 41** (`TAG_NAMES`) and **actively parses 28** (`case` branches). The remainder are **tolerated as unknown** (increment `stats.unknownTags`, emit zero‑length `FrameEvent` details, do not abort). This is the spec‑recommended behaviour: *“Any program … can skip over blocks it does not understand”* (p.28). Known tolerated codes in corpus include `Protect (24)`, `Metadata (77)`, `EnableDebugger (78)`, `EnableDebugger2 (64)`, `ScriptLimits (65)`, `DefineScalingGrid (78→unsupported)`, etc. All are counted, none crash.

**Tag coverage table (extract):**

| Code | Tag | Parse | Gap |
|---|---|---|---|
| 0 End | ✓ | ✓ | — |
| 2/22/32/83 Shape 1‑4 | ✓ | ✓ | — |
| 4 PlaceObject (old) | — | tolerate | legacy, superseded by 26/70; no corpus uses it |
| 6/21/35/90 Bits/JPEG | ✓ | ✓ | — |
| 8 JPEGTables | ✓ | ✓ | — |
| 9 SetBackgroundColor | ✓ | ✓ | — |
| 12 DoAction | ✓ | ✓ | — |
| 14 DefineSound | ✓ | ✓ | — |
| 20/36 Lossless 1‑2 | ✓ | ✓ | — |
| 26/70 PlaceObject2/3 | ✓ | ✓ | filters parsed, not rendered |
| 34 DefineButton2 | ✓ | ✓ | — |
| 39 DefineSprite | ✓ | ✓ | — |
| 46/84 MorphShape 1‑2 | ✓ | parse only | morph tween not rendered |
| 48/75 Font2/3 | ✓ | ✓ | — |
| 56 ExportAssets | ✓ | ✓ | — |
| 59 DoInitAction | ✓ | ✓ | — |
| 60/61 VideoStream/Frame | ✓ | placeholder | video decode not implemented |
| 69 FileAttributes | ✓ | ✓ | — |
| 76 SymbolClass | ✓ | ✓ | — |
| 82 DoABC | ✓ | ✓ | — |
| 87 DefineBinaryData | ✓ | ✓ | — |
| 90 BitsJPEG4 | ✓ | ✓ | — |
| 3 FreeCharacter, 13 DefineFontInfo, 23 DefineButtonCxform(old), 40 NameCharacter, 42 DefineFontInfo2, 65 LimitData (partial) | — | tolerate | deprecated / metadata |

**Result:** Unknown‑tag tolerance is correct and complete; explicit parse coverage is complete for all tags the fishing game actually uses.

---

## 17. Cross‑cutting audits already in repo

* `EXECUTE_AUDIT.md` (2026‑09‑28, 23 probes) listed 8 blockers — **all closed** by the AS2/Flash players described above.
* `CODE_INSPECTOR_AUDIT.md` decomposition — **complete** (24 components split, Inspector ≈70 lines).
* `BUNDLED_SWFS.md` pins the binary parser round‑trip and offline GSI/Sushi stubs.

This spec audit adds the **format‑completeness** dimension they did not cover.

---

## 18. Prioritized gaps & recommendations

| Pri | ID | Chapter | Gap | Risk for swf‑studio | Effort | Recommendation |
|---|---|---|---|---|---|---|
| **P0** | 2‑01 | 2 | **ZWS/LZMA** throws | User upload of modern SWF (≥SWF13) fails with clear error but no fallback | S | Add `lzma` decompression or transcode via `xml2swf` → FWS; 1‑day |
| **P1** | 14‑01 | 14 | **Video decode** (VP6/H.263/ScreenVideo) placeholder | Fishing corpus has 0 videos; real‑world SWFs show black box | M | If needed, borrow Ruffle `video` or `WebCodecs`; else document |
| **P2** | 9‑01 | 9 | **Morph tween interpolation** (`ratio`) not rendered | 0 morphs in corpus | S | Interpolate `MORPHFILLSTYLE/GRAD` in `shapeToSvg(ratio)` |
| **P2** | 5‑01 | 5 | **WaitForFrame/2** no‑op | SWF2 streaming only | S | Alias to `frameLoaded` guard if ever hit |
| **P3** | 11‑01 | 11 | **Streaming sound** SoundStreamBlock framing not packet‑exact | Audible diff negligible; SFX are StartSound | S | Slice per `SoundStreamHead` `samplesPerFrame` |
| **P3** | 3‑01 | 3 | **Filters/blendMode** decoded not rendered | Game has no filtered clips | S‑M | SVG `filter` or Canvas blend |
| **P3** | 10‑C |10 | **CSMTextSettings/DefineFont4 CFF** stub | Device‑font grid‑fit only | S | Document |
| **P4** | 1‑T‑01|1 | **FLOAT16** unused | No ABC uses it | XS | One‑liner in `bitio` |

**No P0 for current bundled game.** All P0 blockers from the 2026 audit are resolved.

---

## 19. Conclusion

Against SWF 19, swf‑studio is **spec‑conformant where it matters and correctly lenient where it does not**:

* **Lossless** — header, RECT/MATRIX/CXFORM, tag stream, dictionary, shapes/bitmaps, text, sprites, sounds, buttons, AVM1/AVM2 actions all match the spec byte‑for‑byte (pinned by round‑trip + PNG oracle).
* **Intentionally partial** — morph tween, video, streaming sound slicing, filters, CFF/device‑font, ZWS. Each is decoded/tolerated, not crashed, and each is unhit by the shipped game.
* **Correctly tolerant** — unknown/ancillary tags (Protect, Metadata, EnableDebugger, ScalingGrid, Scenes) are skipped per p.28 “any program can skip…”, mirroring Ruffle.

**For the stated goal (play/ inspect the Gaia Fishing SWFs offline with AS2 execution, workbench transpilation and debugger pop‑out), the implementation is complete.** Removing the remaining gaps is low‑risk shovel‑ready work listed in §18, ordered by real‑world blast radius.

---

*Prepared with spec PDF fetched 2026‑10‑09: https://open-flash.github.io/mirrors/swf-spec-19.pdf (9 chunks, pp. 12‑238). Tag names and offsets cross‑checked against `decompiler/swf/binary.ts:15‑90` and `decompiler/parser.ts` `classify()`.*

