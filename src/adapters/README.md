# Game adapters

An **adapter** is the only place a game's specifics are allowed to live: its
offline network stand-ins, boot fix-ups, help page, "expected to be missing"
asset URLs, and the human-readable names of the files it ships. Everything else
in the studio — engine, runtime, transpiler, UI, Loader — is game-agnostic and
runs whatever ActionScript the SWF carries.

## How one is selected

The Loader reads `game-files/manifest.json` (index) → `game-files/games/<id>.json`
(game set) → the set's `.swf` files. If the set names an `adapter`, that id is
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
  sample.ts       facts about the bundled sample: file names, ids, paths
  ...             game-specific code (protocol codecs, mock services, …)
  __tests__/      scenario tests that drive the bundled sample through this adapter
  tools/          dev-only tooling that only makes sense for this sample
```

`sample.ts` is the single place where the sample's names are spelled out.
Shipped code never imports it; tests and dev tooling that must open the real
bundled files do. Its data contract with `game-files/games/<id>.json` is asserted
by `__tests__/sample.test.ts`, and the generic side reads the same data through
`src/lib/__tests__/bundledSet.ts`.

## Adding a different game

1. Put the files under `game-files/<your-set>/…`.
2. Write `game-files/games/<id>.json`:
   `{ id, label, main, swfs: [{ name, path, fonts?, fileBase?, scriptOverrides? }] }`.
3. Point `game-files/manifest.json` at it (`{ default: "<id>", games: ["games/<id>.json"] }`).
4. If the game needs offline stand-ins, add `src/adapters/<game>/` and register
   it in `GAME_ADAPTERS`; otherwise omit `adapter` from the set and it runs on
   the generic adapter. No other file has to change.
