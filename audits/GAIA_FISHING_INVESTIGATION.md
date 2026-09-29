# Investigation: Gaia Fishing "spams every game element" in Execute

| | |
|---|---|
| **Game** | Gaia Fishing, Bass'ken Lake (`gaiaonline.com/launch/fishing?&l=bassken`) |
| **Commit investigated** | `ab835e2` (the AS3 engine) |
| **Date** | 2026-09-28 |
| **Status** | Root cause identified. The engine direction needs confirmation (see §5) |

## 1. Symptom

Loading the game's JPEXS export into Execute shows every screen and element of
the game at once, cycling continuously, instead of the start-up state (a
loading screen, then the lobby).

## 2. What the live game is

The sandbox cannot reach gaiaonline.com: its outbound network is limited to the
npm and GitHub hosts, and the page requires a login in any case. So the facts
below come from a public record of the same URL: an automated Ruffle error
report filed from this exact page,
[ruffle-rs/ruffle#16129](https://github.com/ruffle-rs/ruffle/issues/16129)
(April 2024). It records the embed and Ruffle's metadata for the SWF:

| Property | Value |
|---|---|
| SWF | `http://graphics.gaiaonline.com/images/Gaia_Flash/FISHING/bassken_game4.20.swf?4.20` |
| flashvars | `l=bassken&g=fishing&gver=4.20&gsiUrl=www&websrv=www.gaiaonline.com&grsrv=graphics.gaiaonline.com` |
| **swfVersion** | **7** |
| **isActionScript3** | **false** |
| Stage | 640 × 580, 24 fps, 43 root frames, background `#3300FF` |
| Player on Gaia today | Gaia serves Ruffle itself (`graphics.gaiaonline.com/ruffle/20240425/…`) |

**SWF version 7 predates AVM2 (SWF 9).** The game is ActionScript 1/2.
Its logic is AVM1 bytecode in `DoAction` / `DoInitAction` tags and in button and
clip event handlers. It has no `DoABC` classes and no `SymbolClass` table
(SymbolClass is an AS3 tag). The flashvars (`websrv`, `grsrv`, `gsiUrl`) show
that it also talks to Gaia's servers at runtime (the GSI service), and that it
may load further content from the graphics host.

## 3. Root cause of the "spam"

AS2 games build their screens on the main timeline (preloader → lobby → game →
results) and keep each screen up with `stop()` frame actions. Nested clips
(fish, rod, UI widgets) likewise hold or loop their states with frame actions.

The engine at `ab835e2` executes **AS3 classes** (transpiled TypeScript) and
treats the SWF as data: timelines, symbols, SymbolClass. For this game:

* there is no SymbolClass table, so no document class and no linkage;
* `FlashPlayer.frameEntered` handles only sound events, so `DoAction` frame
  actions are never executed, and **no `stop()` ever runs**;
* the result is that the root timeline plays through all 43 frames (every
  screen) in a loop, and every nested clip loops through all of its states.
  That is the "spamming".

This is not a rendering bug. The runtime model doesn't match the game's
language.

## 4. What's needed to run it properly

1. **An AVM1 runtime.** The JPEXS XML already carries every action as raw
   bytecode (`DoActionTag actionBytes="…"`, button `BUTTONCONDACTION` records,
   clip `CLIPACTIONRECORD`s). Executing that bytecode directly (a stack machine
   with about 100 opcodes, plus the AS2 object model: `MovieClip` with
   `_x`/`_currentframe`/`onEnterFrame`, `_root`/`_parent`/`_global`, `Key`,
   `Mouse`, `Sound`, `Color`, `LoadVars`/`XML`, `setInterval`, prototypes) runs
   the real game logic with no transpilation step. The existing display list,
   timeline reconciliation, renderer and input layer in `src/engine/flash` are
   reusable underneath it.
2. **The server side.** Fishing asks Gaia's GSI service for the player's
   inventory (rods, bait), the room list and scores. Offline, those calls need
   recorded responses or a local stub. Which calls happen, and when, is exactly
   what the capture tool (§6) records.
3. **Any content loaded at runtime** (`loadMovie`, `attachMovie` of symbols in
   other SWFs) also comes out of the capture.

## 5. Open questions for the owner

* The app was built on the understanding that the game is AS3 and that its code
  had been transpiled to TypeScript. The public metadata says AS2 (SWF 7).
  Which files do you actually have: a JPEXS export only, FFDec-decompiled
  `.as` (AS2) scripts, or TypeScript produced from them?
* The launch GIF attached to the request did not reach the sandbox. Only its
  first frame, a blank white page, was visible in the conversation.

## 6. Capture tool

`tools/gaia-capture/` is a Puppeteer script to run locally while logged in to
Gaia. It opens a visible Chrome window; you log in yourself, and no credentials
pass through the script. It records the live game:

* every request and response, with timestamps, saving copies of the SWFs, XML
  and GSI/data responses;
* Ruffle's log at `info` level, which includes the game's `trace()` output and
  errors;
* every click and key press, in game-local coordinates;
* screenshots of the game element at a fixed interval;
* Ruffle's metadata for each SWF (swfVersion, isActionScript3, frame count and
  so on).

```
cd tools/gaia-capture && npm install
node capture.mjs --seconds 90 --interval 250
```

The resulting `out/<time>/` folder (`report.md`, `capture.json`, `files/`,
`frames/`) gives the exact start-up sequence (which assets load, in what order,
what the game prints, and what the screen shows at each moment). It is the
reference the engine will be tested against.
