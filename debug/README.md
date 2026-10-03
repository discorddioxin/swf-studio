# Debug tooling

Everything in here is **developer-only**: it never ships with the app (Vite only
builds `src/` + `game-files/`, and the Vitest include reaches into `debug/` on
purpose). It exists to answer "why does the Execute tab not look like the real
game?" — comparing our AS2 player against the SWF bytecode, against the FFDec
export, and against a real reference player.

Run every command from the **repository root**.

## `tools/ruffle-oracle/` — puppeteer harness (the main tool)

Drives the real app in headless Chromium so the live AS2 player can be inspected
and screenshotted. Needs Chromium + its shared libraries (see "Booting the
browser" below), plus `npm i` inside this folder for `puppeteer-core`,
`swf-parser`, `@ruffle-rs/ruffle`, `@sparticuz/chromium`.

| script | what it does |
| --- | --- |
| `browser.dev.mjs` | shared `launch()` (puppeteer-core, `pipe: true`). Every other script imports it; `$CHROME` / `$CHROME_LIBS` override the binary and libs. |
| `probe-app.dev.mjs` | boots the app, picks the start mode, dumps player state + a screenshot. |
| `probe-chooser.dev.mjs` | inspects the server-chooser `List` subtree (sizes, `getViewMetrics`, rows, prototype chains) — the "servers do not show up" investigation. |
| `probe-shapes.dev.mjs` / `shapes-dev.mjs` | shape/fill dumps as rendered by our player. |
| `flow.dev.mjs [outDir]` | walks server select → room select → in-game, screenshotting each step (`/tmp/flow`). |
| `appshot.dev.mjs [outDir]` | screenshots the whole app shell (not just the canvas). |
| `dbg.dev.mjs`, `errs.dev.mjs` | console/pageerror tails and runtime warnings from a boot. |
| `verify-swfs.dev.mjs` | parses every bundled `.swf` and reports container-level problems. |
| `parsecheck.dev.mjs`, `strict-decode.dev.mjs`, `tagdiff.dev.mjs` | SWF tag-level sanity checks against `swf-parser` and FFDec output. |
| `capture.mjs`, `serve.mjs`, `oracle.html`, `fonts-dev.mjs` | Ruffle reference player: `node serve.mjs` serves `oracle.html` + the bundled SWFs + offline GSI stubs on :8123 so the same movie can be played by Ruffle for a side-by-side comparison. |

Booting the browser (the sandbox has no Chrome):

```sh
# after a sandbox reset
#   chromium.br / al2023.tar.br -> /tmp/chromium/chrome, /tmp/al2023
export CHROME=/tmp/chromium/chrome
export CHROME_LIBS=/tmp/al2023/lib
export LD_LIBRARY_PATH=$CHROME_LIBS
node debug/tools/ruffle-oracle/probe-chooser.dev.mjs
```

Notes:
- Do **not** start Chromium with `--no-zygote --single-process`; puppeteer hangs.
- The probes talk to the dev server on `http://127.0.0.1:5173` (`npm run dev`).
- The runtime exposes `globalThis.__rt` (see `src/runtime/as2/index.ts`) and the
  app exposes `globalThis.__as2player`, so probes can read live AS2 classes,
  prototypes and clips.

## `tools/swf-dump/dump.mjs` — raw SWF tag dump

Prints tags/action streams straight from the binary, without FFDec:

```sh
node debug/tools/swf-dump/dump.mjs game-files/fish-full/swfs/gsecs2.9.swf all
node debug/tools/swf-dump/dump.mjs game-files/fish-full/swfs/gsecs2.9.swf all --grep addProperty
```

## `*.dev.mjs` — one-off binary/XML inspectors

| script | what it does |
| --- | --- |
| `x2s.dev.mjs` | FFDec XML export → binary SWF (the reference implementation `tools/xml2swf` is grown from). |
| `btnxml.dev.mjs` | dumps `DefineButton2` records from the FFDec XML. |
| `tagcmp.dev.mjs` | diffs the tags of two SWFs (XML vs. our own writer). |
| `txtdump.dev.mjs`, `etdump.dev.mjs` | dump `DefineText`/`DefineEditText` records by character id. |

Usage for the id-based ones: `node debug/tools/txtdump.dev.mjs gsecs2.9 42`.

## `tools/vitest/*.dev.test.ts` — in-process dumpers

Vitest equivalents of the above, for cases where parsing in Node is easier than
in the browser. Run them on their own with `npm run test:debug` (they also run
as part of `npm test`).

| test | what it dumps |
| --- | --- |
| `__exports.dev.test.ts` | exports/linkage ids of a SWF (`SWF=gsecs2.9 npm run test:debug`). |
| `__modules.dev.test.ts` | the generated AS2 modules for a SWF. |
| `__listcode.dev.test.ts` | the AS2 source behind a specific clip/frame. |
| `__place.dev.test.ts` | placement ops of a frame (depth/charId/matrix). |
| `__findStr.dev.test.ts` | searches all bundled SWFs for a string (e.g. a URL or a linkage id). |
| `__peek.dev.test.ts` | prints the transpiled TypeScript of one FFDec `.as` file. |
| `__dumpShapes.dev.test.ts`, `__shapeAudit.dev.test.ts` | shape/fill inventory across the bundled SWFs. |
| `__placeframe.dev.mjs` | standalone helper for the frame-placement dump. |
