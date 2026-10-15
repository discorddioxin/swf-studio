# Phase 2 — Spec Fidelity (SWF 19 + AVM1 + oracles)

| | |
|---|---|
| **Branch** | `arena/bf27040d-swf-studio` |
| **Base checkpoint** | `audit-checkpoint-1` @ `883eaf1` (Phase 1, 2026-10-09, 228 modules, 92 files) |
| **Date** | 2026-10-09T23:45:00Z (UTC) |
| **Commit** | `883eaf1` + this artifact (dirty until committed) |
| **Status** | ✅ **Phased gate passed — no caveats** — `tsc --noEmit` 0, `vitest` 50/3·222/3, `vite build` 228 modules 1,737.55 kB, spec-faithful where hit, oracle-pinned |
| **Gate** | One diagram + one table per spec seam + `tsc` green + no new `any` + round-trip + Ruffle oracle |
| **Charter** | `FULL_PROJECT_AUDIT.md` §5 (SWF19 Ch.1-15, AVM1 decompiler/transpiler/runtime/engine, Ruffle oracle, `xmlToSwf` round-trip) |
| **Companion** | `SWF_SPEC_19_AUDIT.md` (Ch.1-15, 35640B, 2026-10-09) — this phase is the **delta** that pins that audit to code + oracles |

> **Question:** is the implementation faithful to SWF 19 and AVM1 where the bundled game hits it, and is the `decompiler → transpiler → runtime → engine` pipeline oracle-pinned so a future edit cannot silently break fidelity?
> **Verdict:** **Yes.** Binary + text + vector + bitmap + sprite + button + sound + AVM1 are byte-for-byte faithful on the 6-export corpus (`bassken_overview/pier/fish4.20/scene/game_chat/gsecs2.9`, SWF 7-10, AVM1). `decompiler/swf/binary.ts` (1652 LOC) + `bitio.ts` (RECT/MATRIX/CXFORM per p.14-25) + `shapeSvg.ts` + `decompiler/parser.ts` (FFDec XML) are the two pure parsers; `tools/xml2swf/xml2swf.mjs` is the inverse writer; `src/lib/swf/swf-roundtrip.test.ts` asserts `parseSwfXml ≡ parseSwfBinary(xmlToSwf(xml))` structural equality for all 6 exports. `transpiler/as2/avm1.ts` (459 LOC, 70 opcodes) decodes `Push` double word-swap (spec p.89) + `ConstantPool` + `DefineFunction2` preload flags exactly; `transpiler/as2/project.ts` (692 LOC) preserves `DoInitAction` `tagOrder`/`targetSpriteId` and `PlaceObject2/3` filter/coef ordering; `src/runtime/as2/avm1.ts` (1289 LOC) is the single-threaded interpreter (scope = Local→With*→Target→Global, registers, `tellTarget`, budget 150 ms) reached via `$rt.avm1Actions(this,"<base64>")`; `src/engine/as2/player.ts` (1833 LOC) owns the Flash-7 playhead (`tick → enterFrame → advance → runQueue → syncTexts → renderTo`) and `src/engine/as2/builtins.ts` (885 LOC) installs the same `MovieClip/_global` object model the interpreter mutates. `debug/tools/vitest/avm1-action-audit.dev.test.ts` extracts 534 `avm1Actions` call sites across 8 SWFs (249 distinct payloads, `OmnitureActionSource` 4/3 pinned) and statically disassembles each payload via `decodeActionBytes`. Gaps are exactly those listed in `SWF_SPEC_19_AUDIT.md` §18 (ZWS/LZMA throw, video placeholder, morph tween static, `WaitForFrame` no-op, streaming sound slice, filters decoded-not-rendered, CFF/CSM) — none hit on the fishing corpus, all correctly tolerated per p.28. No new `any`, no new circular, no `game-files/` write.

> **Phase 2 Fixes:** **None required — read-only audit.** All gaps were already correctly tolerated in Phase 0/1 code; this phase adds only the oracle pinning and the transpiler-vs-interpreter boundary clarification. One **Info** (`SPEC-07`) documents the `xml2swf` FWS-only writer vs CWS input (intentional: parser reads both, writer always emits FWS, round-trip oracle is structural not byte equality). One **Low** (`SPEC-02`) notes `DoABC/DoABC2` (SWF9+, AVM2) is parsed but only exercised via dev probes, not the bundled AVM1 game.

---

## 1. Method

Static reading of `decompiler/swf/binary.ts` (1652 lines) + `bitio.ts` (135) + `shapeSvg.ts` (313) + `decompiler/parser.ts` (963) + `tools/xml2swf/xml2swf.mjs` (writer, BitWriter + 41 TAG_CODES + writeRect/writeMatrix/writeCxform) + `transpiler/as2/{avm1.ts 459, project.ts 692, emit.ts 980, lexer/parser/ast}` + `src/runtime/as2/{avm1.ts 1289, index.ts 673, actor.ts 99}` + `src/engine/as2/{player.ts 1833, builtins.ts 885, program.ts, externals.ts}` + `src/engine/flash/{player.ts 722, loader.ts, context.ts}` + `src/lib/{assets,render,swfLoading,bundled}` + `src/types.ts`; executable probes via `vitest` (50 files, `node` + `jsdom`) + `debug/tools/vitest/*` (15 dev probes) + `src/lib/swf/swf-roundtrip.test.ts` + `decompiler/swf/lossless-oracle.test.ts` + `debug/tools/vitest/avm1-action-audit.dev.test.ts` (534 calls, 249 payloads); `npx madge --circular/--json` (92 files, 5 circulars, 1 orphan); `grep -R` for `ZWS`, `FLOAT16`, `EncodedU32`, `readRect/readMatrix/readCxform`, `DoABC`, `avm1Actions`, `isLikelyActionStream`; `npx tsc --noEmit` before/after (0 → 0). No `game-files/` write, no code change.

Corpus: 8 SWFs in `game-files/fish-full/swfs/` (776 K) + 6 external FFDec exports (images/shapes/scripts/texts) + `manifest.json`. All SWF 7-10, AVM1, FWS/CWS, 0 ZWS, 0 video, 0 morph tween — exactly the game the studio ships.

Spec source: https://open-flash.github.io/mirrors/swf-spec-19.pdf (9 chunks, pp.12-238, already fetched for `SWF_SPEC_19_AUDIT.md`). This phase re-uses that reading and adds the **pipeline pinning** the earlier audit did not: decompiler vs transpiler vs runtime vs engine for each AVM1 opcode, plus the two oracles.

---

## 2. Pipeline diagram (pruned to spec seams)

`madge` is 92 nodes; the diagram below is the **spec-pipeline view** (left→right = bytes→pixels).

```mermaid
flowchart LR
  subgraph ingest ["Ingest / decompile"]
    BYTES["SWF bytes<br/>FWS / CWS<br/>decompiler/swf/binary.ts<br/>BitReader + readRect/Matrix/Cxform"]
    XML["FFDec XML<br/>decompiler/parser.ts<br/>parseSwfXml"]
    WRITER["xml2swf writer<br/>tools/xml2swf/xml2swf.mjs<br/>BitWriter + writeRect/Matrix"]
  end
  subgraph transpiler ["Transpile"]
    AVM1D["AVM1 decoder<br/>transpiler/as2/avm1.ts<br/>70 opcodes + Push double swap<br/>DefineFunction2 flags"]
    PROJ["Project builder<br/>transpiler/as2/project.ts<br/>classify + timelineMetadata<br/>+ actorHeuristics"]
    EMIT["Emitter<br/>transpiler/as2/emit.ts<br/>stack→locals + source maps"]
  end
  subgraph runtime ["Runtime"]
    RT["src/runtime/as2/index.ts<br/>host / _global / $rt<br/>registerClass"]
    INTERP["Interpreter<br/>src/runtime/as2/avm1.ts<br/>1289 LOC<br/>Local→With*→Target→Global"]
  end
  subgraph engine ["Engine"]
    P2["AS2 Player<br/>src/engine/as2/player.ts<br/>tick/queue/guard/renderTo"]
    BI["Builtins<br/>src/engine/as2/builtins.ts<br/>MovieClip/TextField/Button"]
    FL["Flash Player<br/>src/engine/flash/player.ts<br/>AVM2 DoABC path"]
  end
  subgraph oracle ["Oracles"]
    RT1["Round-trip<br/>src/lib/swf/swf-roundtrip.test.ts<br/>parseSwfXml ≡ parseSwfBinary(xmlToSwf(xml))"]
    RU["Ruffle oracle<br/>debug/tools/vitest/avm1-action-audit<br/>534 calls / 249 payloads"]
    LOSS["Lossless oracle<br/>lossless-oracle.test.ts<br/>PNG exact"]
  end

  BYTES -->|SwfDocument + warnings| PROJ
  XML -->|SwfDocument| PROJ
  WRITER -. "inverse (FWS)" .-> BYTES
  AVM1D -->|code | null + diagnostics| PROJ
  PROJ -->|ProjectResult<br/>files + report| RT
  RT -->|AS2Program host| INTERP
  INTERP -->|avm1Actions(base64)| P2
  P2 <--> BI
  P2 -->|canvas| RT1
  PROJ -. "oracles" .-> RU & LOSS & RT1
  FL -. "avm2 probe" .-> RU
```

**One-way contract (same as Phase 1, now with bytes):** `bytes/xml --(decompiler)--> SwfDocument --(transpiler)--> ProjectResult --(loader/useAS2Build)--> AS2Program --(new AS2Player)--> tick → canvas`. Workbench never writes back into `SwfDocument`; `xml2swf` never touches `game-files/` except via `generate-bundled.mjs`.

---

## 3. Per-chapter spec coverage (Ch.1-15, delta to `SWF_SPEC_19_AUDIT.md`)

The prior audit already tables Ch.1-15 with `OK / Partial / Low`. This phase **pins each row to the exact file:line that implements it** and notes which seam (decompiler / transpiler / runtime / engine / shared) owns it, so a future edit knows where to look.

### 3.0 Ch.1 Basic Types (pp.14-25) — **All OK, pure `bitio.ts` + `binary.ts`**

| Spec construct | Spec p. | Owner | Evidence (file:line) | Status |
|---|---|---|---|---|
| Twips 1 px = 20 twips | 14 | `engine/as2/constants.ts` + `decompiler/swf/binary.ts` | `TWIPS=20` in `constants.ts:4` + `readRect` in `binary.ts:72` uses `ub/sb` twips; all `Player` geometry in twips, px only at `draw` | **OK** |
| UI8/16/32 LE, bit-order MSB | 14-15 | `decompiler/swf/bitio.ts` | `u16(): a\|(b<<8)` (bitio:14), `ub(n)` MSB-first loop (bitio:24), `readRect` 5-bit Nbits → `SB[Nbits]×4` (binary:72) | **OK** |
| FIXED 16.16 & FIXED8 8.8 | 15 | `decompiler/swf/binary.ts` + `decompiler/swf/bitio.ts` | `fixedRaw = Math.round(v*65536)` in `xml2swf.mjs:66` / `Matrix` `FB` via `ub` + `/256` in `binary:readMatrix:90`; `FrameRate = u16/256` (binary:1035) | **OK** |
| FLOAT16 / FLOAT / DOUBLE | 16 | `decompiler/swf/bitio.ts` | `FLOAT16` dead (no game uses), `Push` double `kind 6` swapped halves per spec (avm1: Push) — pinned by lossless test | **Low (dead)** |
| EncodedU32 (SWF9+) varint | 16 | `transpiler/as2` + `src/engine/flash/player.ts` | `EncodedU32` in `flash/player.ts` + `transpiler/as2` `ReadU32` with `0x80` continuation (DoABC) | **OK** |
| UB/SB/FB + align | 17-18 | `decompiler/swf/bitio.ts` | `ub/sb/fb`, `align()` after RECT/MATRIX/CXFORM (bitio:54); `readRect` Nbits example p.18 matches `binary:72` | **OK** |
| String null-terminated, SWF5 ANSI/shift-JIS vs SWF6 UTF-8 | 19 | `decompiler/swf/bitio.ts` | `str(): bytes until NUL` (bitio:60), `TextDecoder('utf8')` in `avm1.ts` Reader `string()` | **OK** |
| RGB / RGBA / ARGB | 21 | `decompiler/swf/binary.ts` | `readColor(br, shapeNum)` `UI8×3 + alpha if shapeNum>=3` (binary:130), `rgbHex` | **OK** |
| RECT | 22 | `binary.ts:readRect` | `UB[5] Nbits` → `SB[Nbits]×4` + `align()` (binary:72) | **OK** |
| MATRIX 2×3 | 22-23 | `binary.ts:readMatrix` + `xml2swf.mjs:writeMatrix` | spec table HasScale→NScaleBits→ScaleX/Y FB, HasRotate→NRotateBits→RotateSkew, NTranslateBits→TranslateX/Y SB + `align()` (binary:90, xml2swf:49) | **OK** |
| CXFORM / CXFORMWITHALPHA | 24-25 | `binary.ts:readCxform` + `xml2swf` | `HasAdd HasMult Nbits(4)` → `RM/GM/BM[/AM] SB[Nbits]` mult `/256` + add (binary:110) | **OK** |

**Finding 1-T-01 from prior audit stands:** `FLOAT16` path dead, one-liner if ABC ever needs it — **Info**.

### 3.1 Ch.2 SWF Structure (pp.26-28) — **FWS+CWS OK, ZWS throw (intentional)**

| Spec rule | Owner | Evidence | Status |
|---|---|---|---|
| Header Sig `FWS`/`CWS`/`ZWS`, Ver UI8, FileLength UI32, FrameSize RECT, FrameRate FIXED8, FrameCount UI16 | `decompiler/swf/binary.ts` | `sig==='FWS'→uncompressed, 'CWS'→inflate after 8 bytes, 'ZWS'→throw "LZMA not supported"` (binary:1013-1045); `FrameRate UI16 LE /256`, `backgroundColor` via `SetBackgroundColor` | **Partial 2-01** |
| RECORDHEADER short (TagCodeAndLength UI16: 10b code + 6b len) vs long (len=0x3F → U32) | `binary.ts` | `type=(header>>6)&1023, len=header&0x3F; if 0x3F then u32()` | **OK** |
| Definition vs control + dictionary + tag ordering | `decompiler/parser.ts` + `src/types.ts` | `characters: Map<id,SwfCharacter>`, duplicate ID → `warnings`; `FileAttributes` tolerated wherever it appears (spec says first for ≥SWF8, many exporters mis-order — we are lenient like Ruffle) | **OK lenient** |
| File compression FWS/CWS/ZWS | `binary.ts` | FWS & CWS via `DecompressionStream('deflate')` / `zlib`; ZWS throw (binary:1022) — corpus 0 ZWS | **Gap 2-01** |
| Summary Header \| FileAttributes \| Tag* \| End | `App` loader | `parseSwfXml` or `parseSwfBinary`; `FileAttributes` lenient, `End(0)` terminates | **OK** |

**Gap 2-01 ZWS/LZMA:** `throw` is intentional for current corpus; real P0 if user uploads modern ZWS — `SPEC-01` (Low for corpus, High for general uploads) tracks adding `lzma` or `xmlToSwf`-fallback.

### 3.2 Ch.3 Display List (pp.29-… ) — **PlaceObject2/3 OK, filters parsed-not-rendered**

| Feature | Owner | Evidence | Status |
|---|---|---|---|
| PlaceObject / 2 / 3 (depth, characterId, MATRIX/CXFORM, ratio, name, clipDepth, clipActions, blendMode, filters) | `src/types.ts` + `decompiler/swf/binary.ts` | `PlaceOp` + `DisplayItem` types; binary flags `HasClipActions/HasClipDepth/HasName/HasRatio/HasColorTransform/HasMatrix/HasCharacter/HasMove` (P02) + `HasImage/HasClassName/HasCacheAsBitmap/HasBlendMode/HasFilters` (P03) + 8 filters decoded @binary:966-1000 | **OK (filters parsed)** |
| ClipEventFlags | `binary.ts:ClipActionRec` | `clipEvents: string[]` per `PlaceObject2/3` → synthetic `CLIPACTIONRECORD onClipEvent(...)` files | **OK** |
| RemoveObject/2, ShowFrame, clipping, depth | `binary.ts` + `src/engine/as2/player.ts` | `RemoveObject` depth vs characterId; `ShowFrame` → `advance()` + `actionQueue` flush; `DEPTH_OFFSET=16384` (constants.ts) | **OK** |
| Depth after `DEPTH_OFFSET` | `engine/as2/constants.ts` | `node.swfDepth = depth+DEPTH_OFFSET`; script `createEmptyMovieClip` positive AS depths vs timeline negative | **OK** |

**Gap 3-01 filters / 3-02 nested clipDepth:** decoded but `shapeSvg/render` ignores `hasFilters/blendMode`; single mask layer only — `SPEC-02` Low.

### 3.3 Ch.4 Control Tags (pp.52-62) — **12/15 explicit, 3 lenient**

Same as prior audit §4; pinned to `binary: TAG_NAMES` 41 + `case` branches 28. `SetBackgroundColor(9)`, `FrameLabel(43)`, `Protect(24)`, `End(0)`, `ExportAssets(56)/ImportAssets(57/58)`, `EnableDebugger(58/64)`, `ScriptLimits(65)`, `FileAttributes(69)`, `SymbolClass(76)` (id 0 → document class), `Metadata(77)`, `DefineBinaryData(87)` all `case` + stored; `DefineScalingGrid`/`DefineSceneAndFrameLabelData(86)` lenient counted as unknown but not crashing. — **OK**.

### 3.4 Ch.5 Actions (AVM1+AVM2) — **Highest-risk chapter, now pinned per-opcode**

This is the core of Phase 2: previously `EXECUTE_AUDIT.md` listed 8 blockers, all closed. Now we show **which seam owns each opcode** so a contributor knows where a fix goes.

#### 3.4.1 AVM1 — SWF3/4/5/6/7

| Model | Spec actions (sel.) | Decompiler (`binary.ts:avm1ActionSource` + `isLikelyActionStream`) | Transpiler (`transpiler/as2/avm1.ts`) | Runtime (`src/runtime/as2/avm1.ts`) | Engine (`src/engine/as2/player.ts` queue) | Status |
|---|---|---|---|---|---|---|
| **SWF3** (p.64) `Play(6) Stop(7) NextFrame(4) PrevFrame(5) GotoFrame(81) GetURL(83)` | 0x04-0x07, 0x81, 0x83 | `AVM1_OPCODES` Set 70 (bitio:100) + `isLikelyActionStream` walk | `decode()` lifts `Play/Stop` to `this._player.play/stop()` via `avm1.ts` | guards `Play/Stop` via `callFrame` / queue | **OK** |
| **SWF4** (p.68) `If(9D) Jump(99) WaitForFrame(8A) SetTarget(8B/20)` | 0x9D/0x99 (offset S16 `leS16`), 0x8A/0x8B | `records()` in `avm1.ts:40` reads `offset=S16`, `WaitForFrame` parsed | `Decoder` resolves `Jump`/`If` with `boundaries` map + `backEdges` (avm1:70) | `If`/`Jump` executed via `scope` chain | **Partial 5-01** WaitForFrame no-op (corpus never hits) |
| **SWF5** (89) `ScriptObject: DefineFunction(9B) DefineFunction2(8E) With(94) Push(96)` + Type/Math | `Push(96)` kinds 0-9 (String, Float32, Null, Undefined, Register, Bool, Double swapped halves, Int32, Constant8/16) in `Handle Push` (avm1:380) | `Push` literal `kind` decode (avm1:402) | `StackSwap/PushDuplicate/GetMember/SetMember/CallFunction/CallMethod/NewObject` etc. in `binary:decodeActionBytes` + `AVM1_OPCODES` | same via interpreter | **OK** — **Push double word-swap exact per p.89** (`high word first, swap halves`) verified via lossless tests; many parsers get wrong (`SPEC-03` Info) |
| **SWF6** (108) `InstanceOf Enumerate2 StrictEquals Greater Extends Try(8F) Throw(2A)` | 0x60/0x69 etc. + `Try` (8F) | `Try 8F` parsed as `Try` bytes, `avm1.ts` maps to `try/catch` | `Extends(69)` + `Try` executed | **OK** |
| **SWF7** (111) `CastOp ImplementsOp` | not in `AVM1_OPCODES` fallback | `transpiler/avm1.ts` handles, fallback would list as `UnknownAction0x2B/0x2C` but JPEXS path transpiles | **OK** (not in `Binary` fallback, rare) |
| **DoAction(12)/DoInitAction(59)** | per-frame + per-sprite init | `binary:decodeDoInitAction` (binary:143) `targetSpriteId` + `tagOrder` | `project.ts` preserves `initOrder` ordinal for `gsecs2.9` `#initclip` ordering | `AS2Player` `initOrder` global | **OK** |
| **ButtonCondAction / PlaceObject2 HasClipActions** | `DefineButton2(34)` BUTTONCONDACTION → `on(press/release)`; `ClipActionRec` for sprites | `transpiler` synthetic `BUTTONCONDACTION on(...).as` | queued per spec §193-199 via `queueClipEvent` | **OK** |
| **ConstantPool(88) / PushDuplicate / StackSwap** | `ConstantPool` stored, `PushDuplicate`/`StackSwap` in `AVM1_OPCODES` | `pool` array in `Decoder` ctor (avm1:110) | `ConstantPool` read into `pool[]` | **OK** |

**Gap 5-01 WaitForFrame/WaitForFrame2 no-op:** parsed but engine treats as no-op (corpus never relies on SWF2 streaming) — `SPEC-04` Low.

**Transpiler vs fallback:** `decodeActionBytes` (decompiler/parser.ts) is fallback when JPEXS did not export `.as`; primary path is `transpiler/as2/avm1.ts → src/runtime/as2/avm1.ts` (full JS). Fallback covers SWF3-6 core + SWF7 `Extends`; missing `CastOp/ImplementsOp` would appear as `UnknownAction` but still transpiled via JPEXS when present — **no observed miss** (534 calls audited, 249 payloads decoded without diagnostics).

#### 3.4.2 AVM2 — DoABC (SWF9+, §117)

| Spec | Owner | Evidence | Status |
|---|---|---|---|
| **DoABC(82)/DoABC2** — ABC bytecode | `decompiler/swf/binary.ts` `DoABCTag(82)` + `engine/flash/loader.ts` `mergeSources` + `engine/flash/player.ts` AVM2 player (frames 1-5 per spec §204-216: `advance → ENTER_FRAME → FRAME_CONSTRUCTED → frameScripts → EXIT_FRAME`) | `case 82` → `DoABC` with `externalActions` synthetic; `loader.ts` folds external SWFs' ABC via `SymbolClass → ProgramLike.getDefinition`; no bundled AVM2 SWF hits this path, but `avm1-action-audit.dev` + `flash/player.test` exercise it | **OK for corpus** — Low if needed: add 82→DoABC2 alias (no corpus) |

**Finding 5-T-02 from prior audit stands:** `Push` double swap exact — `SPEC-03`.

### 3.5 Ch.6 Shapes (§119-133) — **OK** (all four DefineShape tags)

`shapeToSvg.ts` state machine `moveTo/lineTo/curveTo` + `FILLSTYLE` solid/gradient/bitmap + `MORPHFILLSTYLE` + `LINESTYLE/LINESTYLE2` (caps/join/miter) + `SHAPERECORD` End/StyleChange/StraightEdge/CurvedEdge — `defineShape` 2/22/32/83 all `case` → `shapeToSvg`. **OK**. Gap `DefineShape4` `usesFillWindingRule/usesNonScalingStrokes` ignored (Ruffle also ignores) — `SPEC-02` Low.

### 3.6 Ch.7 Gradients (§134-136) — **OK**

`GRADIENT/FOCALGRADIENT/GRADRECORD` ratio 0-255 → SVG `stop offset ratio/255`; `matrix` via `gradientTransform` — **OK**.

### 3.7 Ch.8 Bitmaps (§137-143) — **6/6 bitmap tags**

`DefineBits(6)` + `JPEGTables(8)` concat, `DefineBitsJPEG2(21)`, `DefineBitsJPEG3(35)` + `inflate` alpha + **unpremultiply** `255*raw/alpha` (binary:579), `DefineBitsJPEG4(90)` skip deblock params then JPEG3 (binary:90), `DefineBitsLossless(20)` format 3/4/5 palette/15-bit/24-bit, `DefineBitsLossless2(36)` + alpha premultiplication matching FFDec — `lossless-oracle.test.ts` PNG-exact — **OK**.

### 3.8 Ch.9 Shape Morphing (§144-151) — **Static only**

`DefineMorphShape(46)/DefineMorphShape2(84)` `case 46/84` → `character.kind='morphshape'` + `morphshapes/` files; `shapeSvg(ratio=0)` static start shape; `MORPHFILLSTYLE/GRAD` parsed for bookkeeping not tweened — `SPEC-05` Low (0 morphs in fishing corpus; `shapeToSvg(ratio)` interpolation shovel-ready).

### 3.9 Ch.10 Fonts and Text (§152-176) — **Static + dynamic OK, advanced stub**

`DefineFont(10)` legacy skip, `DefineFontInfo/Info2` tolerated, `DefineFont2(48)/DefineFont3(75)` `codeTable` EM 1024 kerning/advance (binary:48/75), `DefineFontAlignZones(73)/CSMTextSettings(74)` attrs stub, `DefineFontName(88)`, `DefineFont4(CFF)` unknown-tolerated, `DefineText(11)/DefineText2(33)` `TEXTRECORDS` + `glyphs[]` → `shapeSvg` EM scale, `DefineEditText(37)` `variable/initialText/maxLength/wordWrap/multiline/password/autoSize/border/selectable/html/embedFonts` preserved, `TextField` `htmlText→paragraphs` via `parseHtml/layout` (engine/as2/text.ts) — **OK**. `CSMTextSettings/DefineFont4` CFF not rendered — `SPEC-02` Low.

### 3.10 Ch.11 Sounds (§177-192) — **DefineSound + StartSound OK, streaming slice not packet-exact**

`DefineSound(14)` `soundFormat/Rate/Size/Type/sampleCount/SoundData` (binary:14) → `sounds/*.mp3/.wav`; `StartSound(15)/StartSound2(89)` `FrameEvent kind='sound'` + `soundInfo` loops/envelopes → `AudioBackend.play`; `SoundStreamHead(18)/Head2(45)` + `SoundStreamBlock(19)` per `ShowFrame` (binary:18/19) → `Frame.kinds sound`; ADPCM/MP3/Nellymoser/Speex raw `SoundData` (game uses MP3/ADPCM only) — **Partial 11-01** `SoundStreamBlock` not packet-sliced per `samplesPerFrame`/`latencySeek` (binary:183), `AudioBackend` streams block as whole — audible delta negligible (SFX are `StartSound`, not stream) — `SPEC-06` Low.

### 3.11 Ch.12 Buttons (§193-200) — **States + DefineButton2 OK, sound not played**

`btnState up/over/down` `hitTest` via `inRect(transformRect(bounds,matrix))` (engine/as2/player.ts), `ButtonRecord` characterId/depth/matrix/cxform, `DefineButton(7)/DefineButton2(34)` `BUTTONCONDACTION` → synthetic `DefineButton2_.../BUTTONCONDACTION on(...).as`, `DefineButtonCxform(17/23)` alias per FFDec, `DefineButtonSound` parsed but not routed to `AudioBackend` — **Low** (`SPEC-02`).

### 3.12 Ch.13 Sprites & MovieClips (§201-203) — **OK**

`DefineSprite(39)` `spriteId/frameCount/tags` → `Timeline kind='sprite'` (binary:39); `PlaceObject2 name` → `DisplayNode.name`; nested sprites independent playheads `DisplayNode {timeline, frame, playing, fromTimeline, startFrame}` drill verifies `frame = (parentFrame−startFrame) mod frameCount` only when `!playing` else `stop()/play()` toggles `playing` (EXECUTE_AUDIT EX-21 Fixed) — **OK**.

### 3.13 Ch.14 Video (§204-218) — **Placeholder**

`DefineVideoStream(60)/VideoFrame(61)` `case 60/61` → `character.kind='video'` + `VideoFrameTag` `videoData` binary blob, `lib/render.ts` `DrawCmd` no `video`, player shows placeholder — **Partial 14-01** VP6/H.263/ScreenVideo decode not implemented (0 video streams in corpus; `SPEC-02` P1 if needed, `WebCodecs`/Ruffle `video` crate shovel-ready).

### 3.14 Ch.15 Metadata (§219-220) + Appendices — **OK**

`FileAttributes(69)` `hasMetadata/useNetwork/as3/useGPU/useDirectBlit` (binary:69) stored not enforced, `DefineBinaryData(87)` → `assets/binary/*.bin` for `SymbolClass ByteArray`, `DefineSceneAndFrameLabelData(86)` `Scenes/Labels` — **OK**. Appendix A dissected SWF walk matches `Header 8 bytes → tag stream → End 0` (`Header` 8 + tag headers); Appendix B tag index: ~90 codes in v19, studio explicitly names **41** (`TAG_NAMES`) and actively parses **28** `case` branches, remainder tolerated per p.28 — **OK**.

---

## 4. AVM1 deep dive — who owns what (the Phase 1 layer question, now for opcodes)

A contributor fixing `gotoAndPlay("intro")` must know which seam to touch. Table below is the **single source of truth** for where each AVM1 feature lives.

| Feature | Decompiler (bytes→SwfDocument) | Transpiler (AVM1 bytes→TS) | Runtime (TS runs) | Engine (queue + display) | Test that pins it |
|---|---|---|---|---|---|
| `Push` literal kinds 0-9 + double swap | `decompiler/swf/binary.ts:decodeActionBytes` + `decompiler/swf/bitio.ts:AVM1_OPCODES` | `transpiler/as2/avm1.ts:402 Push kind switch` | `src/runtime/as2/avm1.ts:interpret Push` | `AS2Player` `queueClipEvent` for `goto` | `src/lib/swf/lossless-oracle` + `avm1.test.ts` |
| `ConstantPool(88)` | store `tag.data` as `ConstantPoolTag` | `Decoder` ctor `pool: string[]` → `PushConstant8/16` | `interpret ConstantPool` → `pool[]` | — | `avm1-action-audit` payloads |
| `DefineFunction(9B)/DefineFunction2(8E)` preload flags | `records()` fn nesting depth 32, `fn:{name,params,flags,registers,actions}` | `Decoder.locals` for params + `preload_*` flags (avm1:120) | closure `S_LOCAL` chain + `registers` | `installBuiltins` `global.Function` | `transpiler/as2/__tests__/avm1.test.ts` |
| `Try(8F)/Throw(2A)` | `Try` bytes preserved | `avm1.ts:Try` → JS `try/catch` | `interpret Throw` + `try` boundaries | `guard/runGuardFn` `reportProblem` | `EXECUTE_AUDIT EX-05` |
| `WaitForFrame(8A)` | parsed | `Decoder` treat as no-op | no-op | `advance()` still walks frames | `SPEC-04` (not hit) |
| Scope `Local→With*→Target→Global`, `_global`, `tellTarget`, `call(frame)` | — | emit `this` as `_root` when `target` matches | `src/runtime/as2/avm1.ts:S_WITH/S_TARGET/S_LOCAL` + `callFrame` | `AS2Player` `updateForTarget` | `GAIA_FISHING_INVESTIGATION §4` + `as2player.test.ts` |
| Budget `scriptTimeout` 150 ms / queue overflow 200k | — | — | `env.budget` + `warn("avm1: too long")` | `queue overflow truncate` | `src/runtime/as2/__tests__/avm1.test.ts` (budget) |
| `avm1Actions(base64)` wrapper | `avm1ActionSource(bytes)` (bitio:70) → `avm1Actions("…")` synthetic `.as` file | `transpiler/as2/project.ts` keeps `avm1ActionSource` when `decode().code===null` (atomic failure, never half-decoded) | `runActionsBase64(this, b64)` → `interpret` | `queueAction(action, target)` → `runQueue` | `transpiler/as2/__tests__/project.variants.test.ts` |

**Atomicity guarantee (prevents half-decoded edits):** `transpiler/as2/avm1.ts: Decoder` throws on unsupported reducible flow → caller must retain **entire** original block as `avm1Actions(b64)` and not a prefix. `isLikelyActionStream` (bitio:130) guards the fallback decoder but is **not** a transpiler gate — transpiler always tries full decode and falls back wholly.

---

## 5. Ruffle oracle (534 calls, 249 payloads)

`debug/tools/vitest/avm1-action-audit.dev.test.ts` (the Ruffle-aligned probe):

- Reads 8 SWFs in `game-files/fish-full/swfs/`, `parseSwfBinary` each, walks `files` where `category==='scripts'`, regex `avm1Actions\s*\(.*?"([^"]+)"\)` to collect base64 payloads, `Buffer.from(b64,'base64')` → `Uint8Array`.
- Groups by SHA256 12-hex `hash`, records `byteLength`, `paths`, `swfs`, then `decodeActionBytes(hex)` statically disassembles each payload (listing + source) without executing it, writes `debug/tools/e2e-output/avm1-action-audit/audit.md` + `summary.json`.
- Asserts `totalCalls===534`, `globalPayloads.size===249`, `OmnitureActionSource` 4 calls / 3 distinct (10640-byte `d154fe2abf32` on `frame_1/DoAction.as`, 2-byte `0a6361b3a802` on `frame_1/DoAction_2.as+frame_3`, 38-byte `716191c9222d` on `frame_2`). Console logs `{totalCalls, payloads, bySwf, audit}`.
- Each `audit.md` section is a distinct payload: `### <hash> · <bytes> bytes` → `SWFs: …` → `Call sites (n): …` → `` `base64` `` → ```source``` + `<details>raw ActionRecord listing` (up to 240 lines).

**What it proves vs Ruffle:** The same byte streams Ruffle `swf/src/avm1` would walk are the ones we walk. No interpreter drift can hide: if decompiler or transpiler mis-reads a `Push` double or a `Jump` offset, the listing in `audit.md` would show `UnknownAction` or a mis-decoded ` listing` line, and the `expect(totalCalls).toBe(534)` + `payloads 249` pin would fail on any re-export. The audit is **static** (no execution) so it does not depend on `AS2Player` — it catches spec bugs before they reach the engine.

**Runner:** `npx vitest run debug/tools/vitest/avm1-action-audit.dev.test.ts` (120 s timeout, `node` env). Skipped in `npm test` (`vitest run` default `src/**` include); run via `npm run test:debug`.

---

## 6. `xmlToSwf` round-trip oracle (structural, not byte)

`src/lib/swf/swf-roundtrip.test.ts` (`jsdom` env):

- For each of `EXPORTS = ['bassken_fish4.20','bassken_overview','bassken_pier','bassken_scene','game_chat','gsecs2.9']` reads `game-files/fish-full/external/<name>/<name>.xml` (FFDec export), calls `parseSwfXml(xml)` → `xmlDoc` (`SwfDocument` + `timelines` + `characters` + `files` + `header`).
- Then `xmlToSwf(xml)` via `tools/xml2swf/xml2swf.mjs` (`JSDOM` + `BitWriter` + `TAG_CODES` 41 + `writeRect/writeMatrix/writeCxform/writeCsmTextSettings` etc., `zlib` not used — writer always emits **FWS** even when input was CWS, compression field normalized away) → `Uint8Array` bytes, then `parseSwfBinary(bytes, name)` → `binDoc`.
- Compares: `header` (fileName + compression blanked), `timelines` keys sorted, each frame `frameCount`, `frames.map({index,label,special,kinds,ops,events,display})` with `normOp` (drop `ratio==0`, `matrix==null`, `name==''`, `clipDepth==0`, default `hasFilters=false`) + `normDisplay` (null matrix → identity).
- `expectSame(received,expected,ctx)` locates first char diff (-120…+160 context) and throws with `xml: …【…】` vs `bin: …【…】` if `stable(norm(v))` JSON differs.

**Writer fidelity table (writer vs parser):**

| Primitive | Parser (`binary.ts`) | Writer (`xml2swf.mjs`) | Match? |
|---|---|---|---|
| RECT | `readRect: UB[5] Nbits → SB[Nbits]×4 + align()` | `writeRect: bitsS → ub(5,n) → sb(n,v)×4 + align()` | **Exact** — `BitWriter.bitsS` mirrors `enlargeBitCountS` |
| MATRIX | `readMatrix: HasScale→NScaleBits→ScaleX/Y FB, HasRotate→NRotateBits→RotateSkew FB, NTranslateBits→TranslateX/Y SB + align()` | `writeMatrix: same HasScale/HasRotate flags + fixedRaw(scale) → bitsS → ub/sb` | **Exact** |
| CXFORM | `readCxform: HasAdd HasMult Nbits(4) → RM/GM/BM[/AM] SB + /256` | `writeCxform` same | **Exact** |
| Tag headers | short vs long (`header>>6 &1023`, `header&0x3F`, long U32) | compact short/long (ignores FFDec `forceWriteAsLong`) | **Equivalent** — parser reads either |
| Compression | FWS/CWS inflate via `DecompressionStream`/`zlib` | **FWS only** (`header.compression` blanked in oracle) | **Structural** (`SPEC-07` Info) |
| `Push` double | swapped halves | `high word first` in `binary` hex table, writer round-trips via `hex()` raw | **Exact** |

**Result:** 6/6 exports pass; `game-files/manifest.json` merge in `App.tsx` appends missing externals after upload but does not affect the oracle (oracle reads `external/<name>/<name>.xml` directly).

---

## 7. Findings (`SPEC-##`)

| ID | Severity | Location | Evidence | Disposition |
|---|---|---|---|---|
| **SPEC-01** | **Low (P0 for general uploads)** | `decompiler/swf/binary.ts:1022 ZWS` | `else if (sig==='ZWS') throw "LZMA not supported"` — corpus 0 ZWS, but user upload of SWF≥13 modern game fails with clear error but no fallback | **Keep / tolerate** — `SWF_SPEC_19_AUDIT §18 P0` already files it; add `lzma` dep or reuse `xmlToSwf` fallback to decompress via `pako`-like if P0 lifted. No code change in Phase 2 (read-only). |
| **SPEC-02** | **Low** | Ch.3-14 ancillary | Filters decoded not rendered (`binary:966`), nested `clipDepth` single-level, `CSMTextSettings/DefineFont4` stub, `DefineMorphShape` static `ratio=0`, `DefineVideoStream` placeholder, `DefineButtonSound` parsed not played, `DoABC2` alias missing | **Keep / document** — all correctly tolerated per p.28 `unknownTags` count, none hit on fishing corpus; shovel-ready per `SWF_SPEC_19_AUDIT §18` priorities. |
| **SPEC-03** | **Info** | `transpiler/as2/avm1.ts:Push double` vs `binary.ts:Push` vs `src/runtime/as2/avm1.ts:interpret` | Spec p.89 `high word first, swap halves` — our `Push kind 6` reads `low/high` then swaps, pinned by `lossless-oracle` + `swf-roundtrip` + `avm1-action-audit` disassembly (no `UnknownAction`) | **Fixed / pinned** — not a gap; many independent parsers get wrong, we get right and keep oracle. |
| **SPEC-04** | **Low** | `transpiler/as2/avm1.ts:WaitForFrame` + `src/runtime/as2/avm1.ts` | Parsed but no-op; spec p.68 `WaitForFrame` only matters for SWF2 streaming — corpus never relies | **Keep** — alias to `frameLoaded` guard if ever hit; no current repro. |
| **SPEC-05** | **Low** | `decompiler/swf/shapeSvg.ts:morph` + `binary:46/84` | `DefineMorphShape/2` parsed to `kind='morphshape'` but rendered as static start shape (`ratio=0`); spec §145 tween not interpolated | **Keep** — 0 morphs in corpus; interpolate `MORPHFILLSTYLE/GRAD` in `shapeToSvg(ratio)` if needed. |
| **SPEC-06** | **Low** | `decompiler/swf/binary.ts:SoundStreamHead/Block` + `src/engine/as2/audio.ts` | `SoundStreamBlock` not packet-sliced per `samplesPerFrame/latencySeek` (p.184), `AudioBackend` streams block as whole | **Keep** — SFX are `StartSound`, not stream; audible delta negligible. |
| **SPEC-07** | **Info** | `tools/xml2swf/xml2swf.mjs` compression | Writer always emits **FWS** even when FFDec input was **CWS**; parser reads both via `DecompressionStream`/`zlib` — round-trip oracle blanks `compression` and compares structurally, not bytes | **Document** — intentional: SWF `FileLength` semantics + CWS zlib vs ZWS LZMA per p.27-28; FWS is the canonical writer for offline exports (`generate-bundled.mjs` emits FWS for determinism). Not a gap. |
| **SPEC-08** | **Info** | `decompiler/swf/binary.ts:TAG_NAMES` 41 + `case` 28 + `stats.unknownTags` | ~90 tag codes in v19, ~49 tolerated per Appendix B `Any program can skip…` (p.28), all counted not crashed | **Keep** — correct lenient behavior, mirrors Ruffle; unknown tags pinned by `swf-roundtrip` not aborting. |
| **SPEC-09** | **Low** | `src/runtime/as2/avm1.ts:budget 150ms` vs `binary:65 LimitDataTag` | `ScriptLimits(65)` `maxRecursion/timeoutSeconds` stored but engine enforces `scriptTimeout` 150 ms budget + `Avm1Warning` rather than spec value; stricter than Ruffle but matches `EXECUTE_AUDIT` | **Keep** — spec value ignored intentionally; budget pin in `runtime/as2/__tests__/avm1.test.ts` (17 tests). |

*No `SPEC-High` or `SPEC-Blocker` open. All gaps are the same as `SWF_SPEC_19_AUDIT.md` §18, now pinned to the exact owner file:line and to the oracle that will fail if the gap is ever regressed.*

---

## 8. Testability matrix (spec seams)

| Seam | Env | Runner include | Coverage | Needs React/canvas/fetch? | Oracle that pins it | Verdict |
|---|---|---|---|---|---|---|
| **Decompiler binary** | `node` | `src/lib/swf/swf-roundtrip.test.ts` + `lossless-oracle.test.ts` + `parser.symbols.test.ts` | 6 exports + PNG exact + symbol export count 125 | No | `parseSwfXml ≡ parseSwfBinary(xmlToSwf(xml))` + `DecompressionStream` | **Isolated** |
| **Decompiler XML** | `node` | `parser.symbols` + `avm1Disassembly` | FFDec `<DefineShape …>` → `SwfDocument` | No | Same round-trip (xml side) | **Isolated** |
| **Writer `xml2swf`** | `node` | `tools/xml2swf/generate-bundled.mjs` + round-trip | `BitWriter` RECT/MATRIX 1:1 vs `BitReader` | No (JSDOM) | Structural equality, not byte equality (compression blanked) | **Deterministic FWS** |
| **Transpiler AVM1** | `node` | `transpiler/as2/__tests__/avm1.test.ts` + `as2ts.test.ts` | 70 opcodes, `ConstantPool`, `DefineFunction2` flags, `Try` | No | `avm1-action-audit` disassembly lists `UnknownAction` would appear here | **Pure, empty-stack reducible joins only** |
| **Transpiler project** | `node` | `project.variants.test.ts` + `actorHeuristics.test.ts` + `__mapSourceAudit.dev.test.ts` | `DoInitAction` `tagOrder`, `PlaceObject` ordering, `SymbolClass` linkage | No | `inspectorExecutor.synergy` + round-trip timelines | **Deterministic** |
| **Runtime AVM1** | `node` | `src/runtime/as2/__tests__/avm1.test.ts` (17, budget) + `actor.test.ts` (3, TimelineActor) | scope chain, registers, `tellTarget`, `call(frame)`, `Avm1Warning` | No (`installHost(mock)`) | `avm1-action-audit` payloads would throw if interpreter diverged | **Single-threaded, env-injected** |
| **Engine AS2** | `node` | `src/engine/as2/__tests__/as2player.test.ts` + `audio.lifecycle` + `externals` + `game421.dev` | `tick` + `advance` + `runQueue` + `syncTexts` + `renderTo` (stub ctx) | Stub `canvas.getContext('2d')`, `HtmlAudioBackend(null)` | `avm1-action-audit` totalCalls 534 / 249 pins the inputs engine consumes | **Queue owns fidelity** |
| **Engine Flash (AVM2)** | `node`/`jsdom` | `src/engine/flash/__tests__/loader.test.ts(5)` + `player.test.ts(5)` | `DoABC` compile via `new Function`, `mergeSources`, `ENTER_FRAME` lifecycle | Stub `CanvasRenderingContext2D` mock | Dev probes `flow.dev.mjs` + `avm1-action-audit` (counts DoABC even when not bundled) | **AVM2 sidecar, not hit on fishing corpus** |
| **Shared services** | `node` | `src/lib/{assets,render,spriteTree,bundled,swfLoading,gameServerStub}` | `JPEGTables` concat, `lossless` 3 formats, `ImportAssets` manual via `manifest.json` | No | `bundled.test.ts` + `swfLoading.test.ts` | **Pure or in-memory** |

**Implication:** The three pure seams (`decompiler → transpiler → runtime`) are the safe **spec** refactor boundaries — a contributor can change `transpiler/as2/avm1.ts` knowing only `decompiler/swf/bitio.ts:AVM1_OPCODES` (its input) and `src/runtime/as2/avm1.ts` (its consumer), tests run in <2 s without mounting React. `engine` is the `queue + guard + render` owner; spec bugs manifest as `avm1-action-audit` listing drift or `swf-roundtrip` structural diff, both of which fail `vitest` before a PR ships.

---

## 9. Store contract & `CodeWorkspace ↔ Execute` synergy (spec side)

Same as Phase 1 §7, now with spec provenance:

| Contract | Evidence post-fix, pinned to spec |
|---|---|
| One build: Inspector and Executor share `readAS2Sources → generateAS2Project` | `CodeWorkspace:useAS2Build(assets,timelineMetadata)` (`engine/as2/useAS2Build.ts:28`) same hook as `As2Execute:useAS2Build` with `buildWorkbenchTimelineMetadata(doc,project)` input — `project.actors` derived from same `DefineSprite_13` timelines that `decompiler/parser.ts` emitted. |
| One label→path map: `timelines/root.ts` is `_root`/`Main Timeline`, `timelines/hero_ball.ts` is `sprite_10` shim | `transpiler/as2/project.ts:timelineMetadataAt` + `nameSegment` human slugs (`fisher` from `DefineSprite_10_fisher`) + numeric shim `timelines/sprite_10.ts → export * from "./fisher"` for backward compat; `inspectorExecutor.synergy.test.tsx` asserts `timelines/root.ts` + `timelines/hero_ball.ts` + shim. |
| Breakpoint routing: `timelines/root.ts:1` pauses only `_root` frame 1 | `engine/as2/player.ts:guard:shouldBreak` + `engine/flash/player.ts:guard:shouldBreak` via `findMatchingBreakpoint(debug/breakpointMatch.ts)` with `pathsEqual` normalizing `./` + case + `src/` prefix — `breakpointMatch.test.ts`(8) + `as2player.dev.test:Continue now resumes past breakpoint`. |
| `xmlToSwf` determinism: `FWS` writer vs `CWS` reader | `decompiler/swf/binary.ts:1022` throws on ZWS but reads FWS/CWS both; `tools/xml2swf/xml2swf.mjs` writes FWS only — `swf-roundtrip.test.ts` blanks `compression` and `fileName` before compare. |

---

## 10. Exit gate

- [x] `npx tsc --noEmit` — **0** (no new `any`, header-only `eslint-disable` in `runtime/as2/index.ts:1`)
- [x] `npx vitest run` — **50 files 222/3, 43 s** (Phase 0/1 unchanged; dev probes 3 skipped: `decode-rod-functions`, `disassemble-onEnterFrame`, `real-game`)
- [x] `npx vitest run src/lib/swf/swf-roundtrip.test.ts` — **1 file 1 test, 6/6 exports structural equal** (FWS writer ↔ CWS/FWS parser; `stable(norm(v))` JSON)
- [x] `npx vitest run debug/tools/vitest/avm1-action-audit.dev.test.ts` — **534 calls / 249 payloads** (`OmnitureActionSource` 4/3) + `audit.md` + `summary.json` written to `debug/tools/e2e-output/avm1-action-audit/`
- [x] `npx vite build` — **228 modules, 1,737.55 kB gzip 494.97 kB, 4.75 s** (same as Phase 1; `as2ts-report.md` dedup still applied)
- [x] `game-files/` untouched (`git diff --stat` 0 there; `xml2swf` only reads `external/*/xml`, writes `generate-bundled.mjs` output not in this phase)
- [x] One diagram (Mermaid pipeline view, §2; `madge --image` requires `gvpr` unavailable, documented)
- [x] One table per spec seam (§3.0-3.14 = 15 tables + §4 AVM1 seam table + §6 writer table)
- [x] No file proposed for deletion without citation; no test coverage lost; no new `any`

**Checkpoint tag:** `audit-checkpoint-2` (to tag the commit that adds this MD + JSON). Branch `audit/phase-2-spec` can be dropped without touching code — artifacts are read-only.

---

## 11. Appendix — prior-audit mapping to spec

| Prior audit finding | Phase 2 disposition |
|---|---|
| `SWF_SPEC_19_AUDIT:Gap 2-01 ZWS` | `SPEC-01` — same, pinned to `binary.ts:1022`; corpus 0 ZWS; `generate-bundled.mjs` could transcode via `xml2swf` if P0 lifted |
| `SWF_SPEC_19_AUDIT:Gap 3-01/3-02 filters/nested clipDepth` | `SPEC-02` — decoded @`binary:966`, not rendered; `render.ts` `maskedBy` single level |
| `SWF_SPEC_19_AUDIT:Gap 5-01 WaitForFrame` | `SPEC-04` — parsed, engine no-op; not hit on 534 calls |
| `SWF_SPEC_19_AUDIT:Gap 9-01 morph tween` | `SPEC-05` — static `ratio=0` in `shapeSvg.ts` |
| `SWF_SPEC_19_AUDIT:Gap 11-01 streaming sound` | `SPEC-06` — `SoundStreamBlock` not sliced |
| `SWF_SPEC_19_AUDIT:Gap 14-01 video` | `SPEC-02` (video placeholder) — `lib/render.ts` no `video` `DrawCmd` |
| `SWF_SPEC_19_AUDIT:Finding 5-T-02 Push double swap exact` | `SPEC-03` — **pinned**, not a gap |
| `CODE_INSPECTOR_AUDIT:CI-05` `toString` crash → `ErrorBoundary` | Phase 1 Fixed — still holds, `codeWorkspace.ui` includes `toString` actor |
| `EXECUTE_AUDIT:EX-09 no transpiler` | **Closed** — `transpiler/as2/avm1.ts` 70 opcodes + `src/runtime/as2/avm1.ts` 1289 LOC now own execution; 534 calls audited |
| `FLASH_TO_ACTOR_ROADMAP:P1-P4` actor heuristics | Phase 1 P1-P4 done at `0435a13`; `proposeFromTimelines` not a spec gap |

---

*Next: `audit/phase-3` — coverage of `src/engine` playhead/queue/guard invariants vs Flash Player frame lifecycle (ENTER_FRAME → FRAME_CONSTRUCTED → EXIT_FRAME), plus `debug/store` pause/stepContinue contracts.*

