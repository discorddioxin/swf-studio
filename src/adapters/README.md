# Game adapters

An **adapter** is the only place a game's specifics are allowed to live: its
offline network stand-ins, boot fix-ups, help page, "expected to be missing"
asset URLs, and the human-readable names of the files it ships. Everything else
in the studio — engine, runtime, transpiler, UI, Loader — is game-agnostic and
runs whatever ActionScript the SWF carries.

## How one is selected

A game set reaches the studio in one of two ways:

- **Uploaded** — the user drops the SWFs (or a folder/zip) on the Loader. This is
  the normal path; the repo ships no game files.
- **Bundled** (optional, per deployment) — if the deployment has a `game-files/`
  folder, the Loader reads `game-files/manifest.json` (index) →
  `game-files/games/<id>.json` (game set) → the set's `.swf` files. Without that
  folder the bundled section is simply absent; a broken index is reported in the
  Loader rather than hidden.

If the set names an `adapter`, that id is
resolved through the registry in `index.ts` (`adapterById`); otherwise each
adapter is asked to `detect()` the loaded set and the highest score wins. If
nothing claims the set — a different game, a user upload — the **generic**
adapter (`generic.ts`) is used: no network, no boot preset, no URL policy, so
the SWF runs exactly as authored.

The Execute tab shows the resolved adapter and lets the user override it
(`onAdapterChange`); `'auto'` means "detect".

## The contract

See `types.ts` (`GameAdapter`, `GameContext`, `AdapterNetwork`). All hooks are
optional:

| Hook | Purpose |
|---|---|
| `detect(ctx)` | how strongly this adapter claims the loaded set (0 = no claim) |
| `createNetwork(ctx, hooks)` | offline `fetchText` / `gameServer` stand-ins + their `reset()` |
| `onStart(root, player, ctx, network)` | boot fix-ups after frame 1 (seed a chooser, attach a stand-in clip) |
| `bootPresets` | scripts offered in the Execute toolbar |
| `isHelpUrl(url)` + `helpPanel` | offline replacement for an in-game help link |
| `isOptionalExternal(url)` | asset URLs expected to be absent offline (kept quiet) |

## Layout of a game adapter

```
src/adapters/<game>/
  index.ts        the GameAdapter object (id, label, detect, hooks)
  sample.ts       facts about the sample game: file names, ids, where its SWFs are
  ...             game-specific code (protocol codecs, mock services, …)
  __tests__/      scenario tests that drive the sample through this adapter
  tools/          dev-only tooling that only makes sense for this sample
```

`sample.ts` is the single place where the sample's names are spelled out.
Shipped code never imports it; tests and dev tooling that must open the real
SWFs do. The SWFs themselves come from the **test corpus** — the uploaded game
sets, located by `src/testing/corpusPaths.ts` (`SWF_CORPUS=…`, or a clone beside
the repo; see `CORPUS_CLONE` there). Tests that need it are declared with
`describeCorpus`/`itCorpus` (`src/testing/corpus.ts`) and skip with the clone
command when it is absent, so the suite passes on a bare checkout.
`__tests__/sample.test.ts` checks that the corpus still holds the files
`sample.ts` names; the generic side builds the same set through
`src/lib/__tests__/bundledSet.ts` (`describeSample`).

FFDec exports are never needed. A few comparison tests and dev tools use them if
you have them (`SWF_FFDEC=<dir with one folder per movie>`, see
`tools/ffdec-export/`); otherwise they skip. Tests that need a small real movie
build one from `src/testing/movies.ts` or `src/testing/swfWriter.ts`.

To try the sample as a bundled game of your own checkout, run
`node src/adapters/<game>/tools/generate-bundled.mjs`: it copies the SWFs from
the corpus into `game-files/` and writes the index.

## Adding a different game

Uploading the SWFs needs nothing else. To bundle a game with a deployment:

1. Put the files under `game-files/<your-set>/…`.
2. Write `game-files/games/<id>.json`:
   `{ id, label, main, swfs: [{ name, path }] }` — SWFs only; their fonts, sounds,
   bitmaps and scripts come out of the SWFs themselves.
3. Point `game-files/manifest.json` at it (`{ default: "<id>", games: ["games/<id>.json"] }`).
4. If the game needs offline stand-ins, add `src/adapters/<game>/` and register
   it in `GAME_ADAPTERS`; otherwise omit `adapter` from the set and it runs on
   the generic adapter. No other file has to change.
