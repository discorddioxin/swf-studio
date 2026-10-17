# SWF Studio — Application Summary

> Code-base analysis of `main` @ `aaa927b` (2026-10-14). Companion document:
> [`PROBLEMS.md`](./PROBLEMS.md) lists every defect found during this analysis, ranked by severity.

---

## 1. What the app is

SWF Studio (branded **"SWF Forge"** in the UI) is a browser-only workbench for Flash
content. The user drops in one or more `.swf` files (or JPEXS/FFDec XML exports, or ZIPs
of either). The app parses them **without Flash, Ruffle or any external decompiler**.
It then offers four workspaces:

| Workspace (button label) | Purpose |
|---|---|
| **Workbench** | Browse the symbol library and the sprite tree. Scrub and play any timeline on a canvas stage. Label, tag and group characters into clips and actors. Flatten sprites to PNG frames. Export a clean JSON bundle. |
| **Sandbox** (`GameEngine`) | An "isolated game engine". It runs the user-authored *actors* (clips + keyboard/mouse/gamepad bindings + sequences) outside the Flash timeline model. Optional multiplayer presence goes through a WebSocket room relay. |
| **Code Editor** (`CodeWorkspace`) | Read-only IDE view of the generated TypeScript (AS2 → TS, AVM1 → TS, ABC → TS), the original ActionScript, and the engine/runtime sources the generated code runs on. |
| **Execute** | Actually **plays the game**. AS1/AS2 movies run on the AS2 player (`src/engine/as2`). AS3 movies are lifted from their `DoABC` bytecode to TypeScript, compiled in the browser and run on the `flash.*` engine (`src/engine/flash`). It has a console, a debugger, a running-timelines sidebar, a UI troubleshooter, a missing-dependency report (with **Add Dependency** to put a missing file into the session for testing) and per-game adapters. |

Two product goals are stated in the docs and in the standing instructions:

1. **Tier 1 — 1:1 transcription.** Run a shipped SWF exactly as the Flash/AVM
   specifications define, from the SWF alone, listing any files it still needs as
   "Missing Dependencies".
2. **Tier 2 — clean code.** Re-express the game as actors, behaviours and systems with no
   timelines or MovieClips. This is `src/game-framework/`, which is not yet wired to any
   pipeline (see PROBLEMS P-08).

---

## 2. Technology and build

| Item | Value |
|---|---|
| Language | TypeScript 5.9 (strict, `noUnused*`), React 19, Tailwind 4 |
| Bundler | Vite 7 + `vite-plugin-singlefile`: the whole app is **one HTML file** (`dist/index.html`, 1.95 MB, 562 kB gzip) |
| Runtime compile | `sucrase` (TS → CommonJS in the browser), `jszip` (ZIP uploads), browser `DecompressionStream` (zlib) |
| Tests | Vitest 4 (node environment; jsdom for UI tests). 119 test files, 399 tests collected. |
| Servers | `server/preview-server.mjs` (static production preview) and `server/engine-server.mjs` (multiplayer room relay on `ws`) |
| Scripts | `dev`, `build`, `preview`, `preview:stable`, `preview:check`, `test`, `test:debug`, `test:watch`, `as2ts` |
| Type-check scope | `tsconfig.json` includes `src`, `transcom`, `vite.config.ts` only |

Health on `main` at the time of writing:

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vite build` | OK |
| `vitest run`, external corpus absent | **53 failed** / 314 passed / 32 skipped tests (44 failing files) |
| `vitest run`, corpus cloned to `/tmp/swf-forge2` | **39 failed** / 351 passed / 9 skipped (30 failing files) |

Every remaining failure is `ENOENT` on the deleted `game-files/` and `fixtures/` folders
(PROBLEMS P-02).

---

## 3. Repository layout

Approximate source lines, excluding tests (tests in brackets):

```
index.html                 entry HTML (title "SWF Forge — JPEXS XML workbench")
vite.config.ts             single-file build, publicDir 'game-files' (now missing), vitest include
src/                       the browser app
  main.tsx, App.tsx        shell: Loader ↔ four workspaces, all session state (702 lines)
  types.ts                 core data model (SwfDocument, Timeline, Frame, Actor, Project …)
  components/   8.9k [1.8k] UI: Loader, Stage, TimelineView, Sidebar, SpriteTreeView,
                           Inspector (+inspector/*), GameEngine (Sandbox), CodeWorkspace,
                           ExecuteTab (AS3), As2Execute (AS2), ExecutionConsole,
                           RunningTimelinesSidebar, MissingDependencies, uiTroubleshooter/*
  lib/          2.8k [1.9k] loading (swfLoading, swfSources, bundled, assets), render,
                           exporter, project persistence, fonts, peer network,
                           + compatibility facades (lib/parser.ts, lib/swf/*.ts → transcom)
  engine/as2/   3.8k [0.6k] AS2 (AVM1) player: display list, timeline, input, text, sound,
                           builtins (MovieClip/XML/LoadVars/XMLSocket/SharedObject …)
  engine/flash/ 4.1k [0.8k] AS3 flash.* engine: display, events, text, geom, media, net,
                           loader/linker for transpiled modules, FlashPlayer
  runtime/as2/  2.2k [0.4k] runtime the generated AS2 TypeScript calls ($rt, AS2Clip …)
                           + avm1.ts, the AVM1 bytecode interpreter (fallback path)
  adapters/     5.9k [0.9k] per-game adapters (registry, generic, gaiaFishing incl. a mock
                           game server and the GSI gateway); also ~30 Ruffle/dev scripts
  debug/        1.0k        debugger store, DebugPanel, popout, breakpoint matching
  game-framework/ 1.4k      Tier-2 actor/behaviour/system framework (standalone)
transcom/                  "transpiler + compiler" — SWF reading and code translation
  decompiler/   4.0k [0]    parser.ts (FFDec XML → SwfDocument), swf/binary.ts (raw SWF →
                           SwfDocument + synthesized asset files), abc.ts (ABC reader +
                           disassembler), bitio.ts, shapeSvg.ts (shape records → SVG)
  transpiler/as2  3.2k [0.7k] AS2 source → TypeScript (lexer, parser, emit, project),
                           AVM1 bytecode → TypeScript lifter, actor heuristics
  transpiler/avm2 3.7k [1.0k] ABC → TypeScript (lift.ts 2,709 lines; emit.ts)
server/       0.4k [0.2k]  engine-server.mjs, preview-server.mjs (+ tests)
tools/        1.2k         as2ts CLI, xml2swf (FFDec XML → SWF), preview/check, codemod,
                           lint, ffdec-export/export.sh
docs/                      ABC_TO_TYPESCRIPT, AVM1_ACTIONS_ENCODING, GAME_CHECKLIST,
                           GAME_FRAMEWORK, NEXT_STEPS, audits/archive/ (38 historical audits),
                           debug/ (68 files: developer dumpers + 52 vitest dev tests)
```

The repo has 375 tracked files and about 52k lines of TS/TSX/MJS outside `docs/`.

---

## 4. Core data model (`src/types.ts`)

All geometry is kept in **twips** (1/20 px), as in the SWF format, and converted only at
render or export time.

- **`SwfDocument`** — header (version, frame rate, stage rect, compression), `characters:
  Map<id, SwfCharacter>`, `timelines: Map<id, Timeline>` (`'root'`, `'sprite:N'`,
  `'button:N'`), `root`, `symbolClasses`, `abc` (raw DoABC payloads), `warnings`.
- **`SwfCharacter`** — kind (`shape | morphshape | sprite | button | bitmap | font | text |
  edittext | sound | video | binary | other`), bounds, linkage/class names, `uses` (child
  ids), text records, font outlines (`SwfFontOutline`, used to build a real TrueType font).
- **`Timeline` → `Frame`** — every frame carries its `ops` (place/move/remove), `events`
  (action/sound/label/define…), a `special` flag (code, sound or label present) and a
  fully materialised `display` list snapshot (`DisplayItem` with matrix, colour transform,
  ratio, clip depth, name, `startFrame`).
- **`AssetBundle` / `AssetFile`** — the files belonging to one SWF (shape SVGs, PNG/JPEG
  bitmaps, WAV/MP3 sounds, fonts, `.as` scripts). For raw SWFs these are *synthesized* by
  the binary parser, so a raw upload and an FFDec folder go through the same ingest path.
- **`Project`** — the user's authoring layer, persisted per SWF file name in
  `localStorage`: character labels and tags, clips, frame markers, animation containers,
  actors (with capabilities, sequences, bindings) and vocabulary.

---

## 5. Loading pipeline

```
Loader (drop / pick folder / pick files / ZIP)        App.load(files, mainKey)
  collectSwfSources ── lists every SWF, ZIPs included, so the user can pick the main movie
          │
loadUploadedPackages (src/lib/swfLoading.ts)
  expandUploadFiles      ZIP → File[] with relative paths (50 MB warn / 200 MB truncate)
  isSwfXmlExport         .xml with <swf> root = FFDec export; any other XML = runtime data
  DependencyFiles        every non-SWF file (XML, MP3, CSS…) → served to the game at run time
  orderSources           chosen main first, duplicates (swf + xml forms) merged
  per source:
    raw .swf  → parseSwfBinary (transcom/decompiler/swf/binary.ts)
                FWS / CWS (zlib) → tags → characters, timelines, display snapshots,
                shape SVGs, PNG-encoded bitmaps, WAV/MP3, TrueType fonts, AVM1 sources
    FFDec xml → parseSwfXml   (transcom/decompiler/parser.ts) + its exported folder
    buildPackage            ingestFiles → AssetBundle, hydrate .as sources, AssetCache
          │
mergeBundledExternals   if a bundled game set (manifest.json) shares a SWF name with
                        the upload, its other SWFs are added. Fails soft when there is
                        no manifest.
installPackages         packages[0] = main movie; the rest are dependencies / externals
```

The **bundled path** (`Loader → "Use bundled SWFs" → App.loadBundled`) reads
`manifest.json` → `games/<id>.json` → `.swf` files from Vite's `publicDir` (`game-files/`).
That folder was deleted from `main`, so this path currently fails with `manifest.json:
HTTP 404` (PROBLEMS P-02).

`AssetCache` (`src/lib/assets.ts`) lazily turns asset files into object URLs, decoded
images and audio. It tracks every URL and revokes them on `dispose()`, which is
idempotent.

---

## 6. The workspaces in detail

### 6.1 Workbench

- **Stage** (`Stage.tsx`, `lib/render.ts`): `flatten()` resolves nested sprites into world
  matrices with deterministic local playheads (`localFrameOf`). `render()` draws shape SVG
  and bitmap assets on a 2D canvas with zoom and pan. `pick()` performs hit-testing.
- **Filters and blend modes** (`lib/compositor.ts`): PlaceObject3 / button-record filter lists
  and blend modes, and script-set `filters` / `blendMode`, are drawn by one compositor shared
  by the Workbench and both players. A subtree with effects is painted into an offscreen layer,
  filtered in JS (Flash's box-blur passes, shadow / glow / bevel / gradient / colour-matrix /
  convolution) and drawn back with the blend's composite operation. Layers are cached per
  display object, keyed by what the subtree draws, the device transform and the filters.
- **TimelineView**: frame strip with special-frame markers, loop range, fps and start frame.
  Keyboard: Space plays or pauses, arrows step, Home/End jump. This handler is installed on
  `window` for the whole app (PROBLEMS P-05).
- **Library / Sprite Tree** (`Sidebar.tsx`, `SpriteTreeView.tsx`): filters, tags, actors,
  and a SWF switcher when several SWFs are loaded.
- **Inspector** (`Inspector.tsx` + `inspector/*`): Label, Clips, Frame, Actor, Export
  panels, actor proposals (heuristics from `transcom/transpiler/as2/actorHeuristics.ts`)
  and actor dependencies.
- **Export** (`lib/exporter.ts`): a JSON bundle of characters, clips, actors and frames.
  Flattened sprites are included as PNG frames.

### 6.2 Sandbox (`GameEngine.tsx`, 898 lines)

Runs `Project.actors` as runtime instances with keyboard, mouse and gamepad bindings,
sequences, a verification report and a "game data" import. It draws through
`drawTimeline`. Optional room presence uses `usePeerNetwork` and `engine-server`. The
network UI is compiled in only when `VITE_ENABLE_NETWORK=true`.

### 6.3 Code Editor (`CodeWorkspace.tsx`)

Shows a file tree containing:

- the game's generated TypeScript;
- its original ActionScript;
- the engine, runtime and transpiler sources, pulled in at build time with `import.meta.glob(..., '?raw')`.

"Run" switches to Execute. `lib/typescriptExport.ts` zips a standalone TypeScript
project together with the AS2 runtime.

### 6.4 Execute

`ExecuteTab` chooses the runtime with `chooseRuntime` (`components/runtimeChoice.ts`):
`FileAttributes.ActionScript3` (tag 69, kept as `header.as3` with `useNetwork` and
`hasMetadata`) decides when the tag is present; a binary SWF without the tag is AVM1.
Only an FFDec XML export without a `FileAttributesTag` is guessed from the export (`.as`
files **and** (SWF version ≤ 8 **or** no SymbolClass)). The rule that decided is logged
in the Execute console (`runtime: AVM1 … — <rule>`).

**AS1/AS2 path** (`As2Execute.tsx` → `engine/as2`):

```
SWF DoAction / DoInitAction / clip & button actions
  └─ binary parser synthesizes .as wrappers (avm1ActionSource: exact bytes preserved)
useAS2Build → program.ts
  transpileProject (transcom/transpiler/as2/project.ts)
    AS2 source  ──lexer/parser/emit──▶ TypeScript      (free names scoped to `$t.`)
    AVM1 bytes  ──avm1.ts lifter────▶ TypeScript      (reducible control flow only)
                └─ otherwise: "AVM1 interpreter fallback" → runtime/as2/avm1.ts at run time
  sucrase → CommonJS → new Function(...) → AS2Program
AS2Player (engine/as2/player.ts)
  per tick: enterFrame → timeline advance → action queue; goto diffs display snapshots;
  canvas renderer (filters / blend modes via lib/compositor), text layout, sound, input,
  focus, buttons, loadMovie/MovieClipLoader,
  XML / LoadVars / XMLSocket via the adapter's offline network, SharedObject in localStorage
```

**AS3 path** (`ExecuteTab.tsx` → `engine/flash`):

```
doc.abc (DoABC payloads) ──abcSources──▶ transpileAbc (transcom/transpiler/avm2)
   parseAbc → per-method lift (stack → expressions, CFG → if/loops/switch/try,
   closures/activations, with, namespaces) → emit TypeScript modules
+ any .ts/.as code files present in the upload
compileSources (sucrase) → linkProgram (new Function per module, CommonJS-style require,
   flash.* packages resolved from engine/flash/packages.ts, cyclic-retry passes)
FlashPlayer (engine/flash/player.ts)
   document class + SymbolClass linkage, display list (filters / blend modes via
   lib/compositor), events, enterFrame, text, sound,
   URLLoader served from uploaded files
```

When the main movie alone does not link, the dependency SWFs' code is folded in and the
program is linked again.

**Shared Execute features:**

- `ExecutionConsole`: logs and problems, de-duplicated.
- `useExecutionDiagnostics`.
- `MissingDependencies`: every URL a movie requested that no uploaded file answered, grouped by type.
- `RunningTimelinesSidebar`: live playheads.
- `uiTroubleshooter/*`: display-list scan, point probe and findings.
- Debugger (`src/debug/*`): breakpoints on frame scripts and labels, conditions, step, watch, break-on-exception, and a pop-out window.

### 6.5 Adapters (`src/adapters`)

`resolveAdapter(ctx, preferredId)` works as follows:

- An explicit pick wins.
- Otherwise the highest-scoring `detect()` wins.
- If nothing scores, `generic` is used.

An adapter may supply:

- an offline network: `fetchText` mock gateway and a `GameServerBackend` for XMLSocket;
- boot presets;
- help panels;
- optional-external rules;
- an `onStart` hook.

`gaiaFishing` is the only real adapter. It includes a mock Gaia GSI gateway (`gsi.ts`,
`wire.ts`) and a 1,141-line fishing `gameServer.ts`. Adapters are wired **only into the
AS2 path** (PROBLEMS P-07).

---

## 7. The translators (`transcom/`)

| Module | Input → output | Notes |
|---|---|---|
| `decompiler/swf/binary.ts` (1,827 lines) | SWF bytes → `SwfDocument` + asset files | Structurally equivalent to the FFDec XML path. A round-trip test (`src/lib/swf/swf-roundtrip.test.ts`) asserts this via `tools/xml2swf`. FWS and CWS only; ZWS is rejected. |
| `decompiler/parser.ts` | FFDec XML → `SwfDocument` | Also shared classification helpers (`classify`, `kindOfTag`, `isSpecialTag`). |
| `decompiler/swf/abc.ts` | ABC → constant pool, methods, classes, scripts, bodies; disassembler | Validated against the FFDec `.as` oracle set (reference only). |
| `decompiler/swf/shapeSvg.ts` | shape records → SVG | Solid, gradient and bitmap fills; line styles. |
| `transpiler/as2/*` | AS2 source → TypeScript; AVM1 → TypeScript | Emits optional chaining and `$rt.sink` so reads through `undefined` never throw (Flash semantics). |
| `transpiler/avm2/*` | ABC → TypeScript | Per `docs/GAME_CHECKLIST.md`: pinball (435 classes) and tiles (35) boot, with 11 of 3,690 pinball method bodies refused. |

`tools/as2ts` is a Node CLI over the AS2 transpiler, bundled on the fly with esbuild.

---

## 8. Persistence (browser `localStorage`)

| Key | Owner |
|---|---|
| `swfforge:project:<swf file name>` | Workbench project (labels, clips, actors …) |
| `swf-studio.so.<swf>.<name>` | AS2 `SharedObject` |
| `swf-studio:so:<swf>:<path>:<name>` | AS3 `SharedObject` |
| `swf-studio.as2.boot` | AS2 Execute boot script (global, not per game) |
| `swf-studio:dismissed:<swf>` | dismissed actor proposals |
| `swf-debugger` | debugger breakpoints / settings |
| `swfforge:server-url`, `swfforge:room` | multiplayer relay settings |

---

## 9. Servers

- **`preview-server.mjs`** serves `dist/` with no Vite at runtime. It allows GET/HEAD only
  and confines every path with `realpath`, including symlinks. It sets `nosniff`, applies
  timeouts and streams responses with backpressure. A health endpoint lives at
  `/__preview_health`. JSONL diagnostics rotate at 1 MiB in `.preview/`.
- **`engine-server.mjs`** is a strict room relay:
  - message types: hello, chat, presence, control;
  - caps on connections, rooms and clients per room;
  - a hello deadline;
  - token-bucket rate limiting;
  - heartbeats;
  - unique ids per room, with reconnect by session key;
  - an optional `ROOM_TOKEN`, compared in constant time.

---

## 10. Tools, docs and debug harnesses

- `tools/xml2swf` writes FFDec XML back to a binary SWF. It backs the round-trip oracle.
- `tools/preview/check.mjs` smoke-tests the preview server.
- `tools/codemod/moveTimelineAction.mjs` and `tools/lint/actors.mjs` are "P8" prototypes
  that no npm script references.
- `tools/ffdec-export/export.sh` is a wrapper around the external FFDec CLI.
- `docs/debug/` holds developer dumpers: `swf-dump`, tag and text dumpers, and 52
  `*.dev.test.ts` files that run as part of `npm test`. Many need the external corpus
  (`git clone --branch swf-uploads https://github.com/discorddioxin/swf-forge /tmp/swf-forge2`).
- `docs/audits/archive/` holds 38 historical audit and spec documents. They are kept for
  history; several are referenced from code comments.

---

## 11. Testing

The suite contains:

- unit tests next to the code (`*.test.ts`);
- UI tests (`*.ui.test.tsx`, jsdom);
- real-SWF tests that boot the bundled sample, which is currently missing;
- corpus-backed developer tests.

AVM2 end-to-end coverage (pinball, tiles) exists only in the corpus-dependent
`docs/debug` tests, so a default `npm test` with no corpus never boots a real AS3 game.
`transcom/decompiler` has no tests of its own. Its tests live in `src/lib/swf/` and import
the code through the compatibility facades.

---

## 12. Security model, as implemented

- Uploaded SWFs are parsed in the main page. Their code is compiled to JavaScript and run
  with `new Function` **in the app's own origin**. There is no iframe, worker or CSP
  isolation.
- The AS2 emitter scopes free identifiers to the clip (`$t.name`). The AVM2 emitter does
  not, and it prints ABC multiname strings verbatim as identifiers. PROBLEMS P-01
  demonstrates arbitrary JavaScript execution from a crafted ABC. P-03 shows an AS2 escape
  through `constructor.constructor`.
- Network access from games is **offline by design**. Requests are answered by uploaded
  files or by an adapter's mock; everything else is blocked and recorded as a missing
  dependency.

---

## 13. Glossary

| Term | Meaning |
|---|---|
| AVM1 / AS1-AS2 | Flash's original bytecode VM and languages (DoAction, DoInitAction) |
| AVM2 / AS3 / ABC | Flash 9+ VM, its language, and the ActionScript Byte Code container (DoABC) |
| FFDec / JPEXS | external Flash decompiler; its XML export is an accepted *input*, and its `.as` export is a test oracle only |
| Twips | 1/20 of a pixel; SWF coordinate unit |
| Adapter | per-game plug-in (offline network, presets, help) chosen by detection or by the user |
| Tier 1 / Tier 2 | 1:1 Flash-semantics transcription vs. clean actor/system restructuring |
| Corpus | the six uploaded game sets (43 SWFs) on the `swf-uploads` branch of `discorddioxin/swf-forge` |
