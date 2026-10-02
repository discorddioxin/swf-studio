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
| 1 | bassken_overview | default active document (hub map)          |
| 2 | bassken_pier     | external scene                             |
| 3 | bassken_fish4.20 | external scene                             |
| 4 | bassken_scene    | external scene                             |
| 5 | game_chat        | external chat UI                           |
| 6 | gsecs2.9         | GSECS login/game framework                 |

The real main movie (`bassken_game4.20`) was never committed to this repo, so
nothing pretends to be it — the first bundled package simply becomes the
active document and everything else is available as an external. The app
degrades gracefully: any missing manifest or SWF surfaces as a Loader error,
and the upload flow works exactly as before.

After **any** load (upload or bundled), `App` merges in *missing* bundled
externals: every manifest package whose name is not already among the loaded
packages is fetched and appended, so a user who drops only one FFDec export
still gets the rest of the game as externals. If the manifest cannot be
fetched the merge is skipped silently (console warning). The Execute workspace
already receives `packages.filter((_, i) => i !== activeSwfIndex)` as
externals.

### Regenerating the .swf files

The bundled `.swf` files are produced from the committed FFDec XML exports by
the hand-written writer:

```sh
node tools/xml2swf/generate-bundled.mjs
```

which rewrites `game-files/fish-full/swfs/*.swf` and `game-files/manifest.json`.

## Binary SWF parser

`src/lib/swf/binary.ts` (`parseSwfBinary`) parses raw FWS/CWS bytes into the
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
```
