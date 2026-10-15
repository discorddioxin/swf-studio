# Bundled SWFs, binary parsing and the offline GSI stub

How the three related pieces work: the **“Use bundled SWFs”** button, the
**binary SWF parser**, and the **offline GSI/inventory stub** that gives a
guest 25 of every bait and every rod while running the bundled Gaia Fishing
game in the Execute workspace.

## “Use bundled SWFs”

The Loader screen has a **Use bundled SWFs** button next to the upload
controls. It never touches the file picker: it fetches `game-files/manifest.json`
(public root — `vite.config.ts` sets `publicDir: 'game-files'`) and loads every
listed `.swf`, in order:

| # | package          | role                                       |
|---|------------------|--------------------------------------------|
| 1 | bassken_overview | hub map (default main SWF)                 |
| 2 | bassken_pier     | external scene                             |
| 3 | bassken_fish4.20 | external scene                             |
| 4 | bassken_scene    | external scene                             |
| 5 | game_chat        | external chat UI                           |
| 6 | gsecs2.9         | GSECS login/game framework                 |

Next to the button is a **Bundled main SWF** drop-down listing the manifest, so
the user chooses which of the six plays the game; that SWF is loaded first
(`packages[0]`, the document the Execute workspace plays) and the other five
are its dependencies.

The real main movie (`bassken_game4.20`) was never committed to this repo, so
nothing pretends to be it — the drop-down default (the first manifest entry,
`bassken_overview`) is the most sensible substitute. The app degrades
gracefully: any missing manifest or SWF surfaces as a Loader error, and the
upload flow works exactly as before.

## Uploading SWFs

The upload flow accepts the same two shapes of a movie, in any mix and in folder
or ZIP form:

| upload                                            | parser          |
|---------------------------------------------------|-----------------|
| `bassken_scene.swf` (raw binary)                  | `parseSwfBinary` |
| `bassken_scene/bassken_scene.xml` + its folders    | `parseSwfXml`    |

Queued files are scanned with `collectSwfSources` (ZIP name tables included, so
nothing is unpacked twice) and the Loader shows a **Main SWF · plays the game**
drop-down of everything found. On Load, `loadUploadedPackages` orders the
packages so the picked SWF is first and the rest follow as dependencies; a movie
uploaded both as `.swf` and as its FFDec export is parsed once, preferring the
XML export unless the `.swf` was picked. With no pick, the shallowest SWF wins —
the old FFDec heuristics still decide.

The main SWF is the one the Execute workspace plays; the others are handed to it
as externals (`packages.filter((_, i) => i !== activeSwfIndex)`). The Sidebar's
**Main SWF** drop-down re-picks it after loading. An AS2 game resolves a
dependency when it asks for it by URL; an AS3 game gets the dependency's classes
folded into its program when its own code cannot link without them
(`mergeSources` in `src/engine/flash/loader.ts`).

After **any** load (upload or bundled), `App` merges in *missing* bundled
externals: every manifest package whose name is not already among the loaded
packages is fetched and appended, so a user who drops only one FFDec export
still gets the rest of the game as externals. If the manifest cannot be
fetched the merge is skipped silently (console warning). The Execute workspace
already receives `packages.filter((_, i) => i !== activeSwfIndex)` as
externals.

### Regenerating the .swf files

The bundled `.swf` files are produced from the committed FFDec XML exports by
the hand-written writer, while preserving raw binary SWFs (`bassken_game4.21`
and `OmnitureActionSource`):

```sh
node tools/xml2swf/generate-bundled.mjs
```

which rewrites `game-files/fish-full/swfs/*.swf` and `game-files/manifest.json`
(including `OmnitureActionSource.swf` so `gsecs2.9.swf`'s analytics loader resolves
locally from bundled SWFs without contacting `gaiaonline.com` or reporting
missing external SWFs).

## Offline Network Mocking (`MockServer` & `SushiServer`)

`src/lib/mockNetwork.ts`, `src/lib/gameServerStub.ts`, and `src/lib/gsiStub.ts`
define the network mocking interfaces (`MockServerInterface`,
`SushiServerInterface`, `SushiPluginInterface`, `MockSession`, `MockRoom`,
`MockMember`, `FishPluginState`, `MockServerEntry`, `GsiUserData`) and their
in-process implementations (`MockServer`, `SushiServer`, `FishPlugin`):

- **`MockServer`**: unifies HTTP (`GSI` gateway `50`/`109`/`107`/`3009`/`1001`
  and `LoadVars` inventory endpoints) and `XMLSocket` (`SushiServer`) with zero
  real network connections.
- **`SushiServer`**: implements the Rawfish `com.rawfishsoftware.sushi.*` wire
  protocol (`S55` handshake, client hello `2` → `1` + `2`, `loadSessionList` `29` →
  `44`, `joinSession` `45` → `35` rooms + `33` members + `32` status + `6` member
  updates, `changeRoom` `20` → `32` + `8`, `createRoom` `22` → `30` + `32`,
  `lockRoom` `39`, `chatMessage` `10`, `callPlugin` `19`, etc.).
- **`FishPlugin`**: implements `"G_FISH_PLUGIN"` (`501` `loadGetData`, `500`
  `loadFishData` with valid MD5 hashes, `510` `savingGame`).

## Binary SWF parser

`decompiler/swf/binary.ts` (`parseSwfBinary`) parses raw FWS/CWS bytes into the
same `SwfDocument` + asset-file shape that `parseSwfXml` produces from an FFDec
XML export: timelines, frames, place/remove ops, action events (decoded to
source), characters, symbol classes, bitmap/lossless images (decoded to PNG),
shape SVGs, text files and — new for the binary path — synthesized
`scripts/**/*.as` sources at FFDec’s export layout so the Execute workspace
can transpile them.

Correctness is pinned by `src/lib/swf/swf-roundtrip.test.ts`: for all six
bundled exports,

```
parseSwfXml(xml)  ≡  parseSwfBinary(xmlToSwf(xml))
```

compares headers, timelines, frames, ops, events, display lists, characters,
symbol classes and asset-file ids (FFDec XML → writer → binary parser).

Known intentional deviations:

- compression/`fileName` header fields are normalized (the writer emits FWS).
- `externalActionCandidates` are compared as sets: FFDec tags root-level
  `DoInitAction`s with a `spriteId` that exists only as exporter metadata and
  cannot be recovered from the payload.
- fontID-tagged `DefineFont2/3`/align-zone tags never become characters
  (parseSwfXml’s `charIdOf` ignores `fontID`), matching the XML path exactly.

## Offline GSI stub (guest kit)

`src/components/As2Execute.tsx` routes the AS2 player’s `fetchText` through
`src/lib/gsiStub.ts`:

- every request is logged to the game console (`GSI stub POST <url>` with the
  body), so the actual wire traffic is visible;
- requests to `*.gaiaonline.com` (the `gsiUrl` flashvar target) shaped like
  inventory calls (bait/rod/item/… in URL or body) are answered with a
  LoadVars reply granting **25 of Grade F, Grade D and Grade A Fish Bait** and
  **all eight rods** (Basic/Strength/Performance/Distance + PLUS);
- other GSI calls get a benign `error=0&success=1` envelope;
- non-Gaia hosts stay offline (`null` + warning), same as before.

The **Gaia: play as guest** boot preset
(`_root.playAsGuest = true; _root.startGameSingle();`) remains available in
the Execute workspace and combines with the stub for offline guest play.

## Tests

```sh
npx vitest run                      # full suite
npx vitest run src/lib/swf/swf-roundtrip.test.ts
npx vitest run src/lib/gsiStub.test.ts

# the main-SWF flow
npx vitest run src/lib/swfSources.test.ts            # which SWFs a selection holds, ordering, merging
npx vitest run src/lib/swfLoading.test.ts            # raw .swf / XML / ZIP uploads → packages
npx vitest run src/components/__tests__/loader.ui.test.tsx        # the Main SWF drop-downs
npx vitest run src/components/__tests__/executeTab.ui.test.tsx    # playing a game split over two SWFs
```
