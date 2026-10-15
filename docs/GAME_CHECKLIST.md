# Game checklist — what works, what fails, and why

Measured 2026-10-14 (re-measured after the Missing Dependencies work), on the six game sets uploaded to
`discorddioxin/swf-forge` (`swf-uploads` branch, `games-swfs/`, 43 SWFs).

**How it was measured.** `docs/debug/tools/vitest/zz_census.dev.test.ts` handles every SWF
in every set the same way:

1. Parse it.
2. Turn its code into TypeScript: ABC → lifter for AVM2, DoAction bytecode → AS2
   transpiler for AVM1.
3. Compile and link that code.
4. Boot it **offline**, with no game server, for 120 frames at 24 fps (5 s of player
   time).

Each set's entry movie is booted the way the game starts:
- AVM1 sets: with the rest of the set reachable through `loadMovie`.
- pinball and tiles: as `gameShell.swf` with `game=pinball` / `game=tiles`.

The raw numbers are one JSON line per SWF, written to `/tmp/census.jsonl`:

    SWF_CORPUS=/tmp/swf-forge2/games-swfs npm run test:debug -- zz_census

✅ works · ⚠️ works with a caveat · ❌ fails · ⬜ not reachable yet, so not tested

## Summary

| Game | VM | Code → TypeScript | Boots | Gets as far as | Stopped by |
|---|---|---|---|---|---|
| Fishing (Bass'ken) | AVM1 | ✅ 0 errors | ✅ | **Whole tested flow**, with the Gaia Fishing adapter: server chooser → room → game → bait → cast → fishing | Nothing in the tested flow. It runs from the original SWFs alone: no override, no exported files. |
| Blackjack | AVM1 | ✅ 0 errors | ✅ | Game movie on screen with its login panel | ❌ No offline server: the login POST to `gateway.php` gets no answer (no adapter) |
| Word Bump | AVM1 | ✅ 0 errors | ✅ | Game movie on screen (root frame 15/54) with its login panel | ❌ Same: no offline server for the login POST |
| Pinball | AVM2 | ✅ 0 refusals, 0 errors (805 modules) | ✅ | Game shell, init step 1 of 11 | ❌ No server (the gateway host comes out as `null.gaiaonline.com`); ❌ Missing Dependency `games/pinball/gameConfig.xml`; ❌ `Loader` finds `game.swf` but cannot run loaded content yet |
| Tiles | AVM2 | ⚠️ 1 refusal (508 modules) | ✅ | Game shell, init step 1 of 11 | Same as pinball. `game.swf` alone waits forever on its asset `Loader`. |
| Towns 2 | AVM2 | ⚠️ 8 refusals, all E4X (975 modules) | ✅ 417 display objects, no runtime errors | Town UI built | ❌ No server for the 12 GSI calls; ❌ `Loader` cannot run loaded content yet (the map SWFs); ❌ no E4X `XML`/`XMLList`; ❌ Missing Dependency `navPages/phone.css` |

**What applies to every set:**
- All 43 SWFs parse.
- None throws while booting.
- Every AVM2 SWF compiles and links with no errors.
- Every AVM1 SWF builds with no errors.

Every game except fishing stops at the same place: **its first call to Gaia's
servers**. Only fishing has an offline server, which is the adapter in
`src/adapters/gaiaFishing`.

## Missing Dependencies

The app runs from the uploaded SWFs alone. Everything else a movie needs it asks for
while it plays: other SWFs (`loadMovie`, `MovieClipLoader`, `Loader`), audio
(`Sound.loadSound`, `Sound.load`), XML and text (`XML.load`, `LoadVars`,
`loadVariables`, `URLLoader`), CSS (`StyleSheet.load`), images and video
(`NetStream.play`). Both players record every request the load cannot answer
(`src/engine/flash/dependencies.ts`). The Execute tab lists them under **Missing
Dependencies**: a notice above the stage, the full list in the Program panel (file
type, path, the API that asked, the movie that asked), one Problem per file, and a
troubleshooter finding. Server scripts (`gateway.php`, …) are listed apart as
**Service endpoints**: no file can stand in for them, only a live server or a game
adapter.

Any non-SWF file uploaded with the SWFs (keeping its folder, or just the file name
when that is unique) is served to those calls. An `.xml` is taken for an FFDec SWF
export only when its root element is `<swf>`; any other XML is data for the movie.

What the census finds missing (all 43 SWFs, offline, no adapter):

| Set | Movie | Missing file | Type | Asked for by |
|---|---|---|---|---|
| pinball | `gameShell.swf` | `games/pinball/gameConfig.xml` | XML | `URLLoader.load` |
| pinball | `game.swf` | `xml/scores.xml` | XML | `URLLoader.load` |
| tiles | `gameShell.swf` | `games/tiles/gameConfig.xml` | XML | `URLLoader.load` |
| towns 2 | `towns2.swf` | `navPages/phone.css` | CSS | `URLLoader.load` |
| blackjack | `preloader1.1.swf` | `loadme01.swf`, `loadme02.swf` | SWF | `MovieClipLoader.loadClip` |
| word bump | `preloader.swf` | `loadme01.swf`, `loadme02.swf` | SWF | `MovieClipLoader.loadClip` |

The two preloaders are generic loaders booted on their own here; their game entry
movies load the real SWFs, which are in the sets. Service endpoints: every set's
`chat/gsi/gateway.php` (fishing's is answered by its adapter), plus `chat/gsi/` from
Word Bump's `avatarPngLoader.swf`. The fishing set asks for nothing missing; its
avatar images come from Gaia's CDN and are marked *optional live asset*.

---

## Fishing — `fishing-swfs/` (AVM1, 8 SWFs, entry `bassken_game4.21.swf`)

- ✅ **Parse** 8/8; **build** 0 errors.
- ⚠️ **Interpreter fallbacks.** Some functions are not turned into TypeScript and run
  in the AVM1 bytecode interpreter instead; they behave the same but are not clean
  code. There are 211 across the AVM1 corpus; the reasons are under
  [Cross-cutting](#cross-cutting).
- ✅ **Boot alone.** Splash screen and login panel (`splashScreen`, `mLoginHolder`),
  128 display objects, no errors. The first server call is
  `POST http://www.gaiaonline.com/chat/gsi/gateway.php`.
- ✅ **Whole flow with the adapter.** `src/adapters/gaiaFishing/__tests__/game421.dev.test.ts`
  passes in the normal suite:
  - server list loads (2 servers); picking a row and pressing Join reaches the room chooser
  - room chooser lists the 2 rooms; joining enters the game (root frame 38)
  - bait counts read 95/0/2; choosing bait A puts the rod at frame 9
  - cast → `moveBack` → release → `fishing`
  - no Missing Dependencies at any point
  - the test drives the player with `advanceTime()` (→ `step()`), so the movie's
    `setInterval`/`setTimeout` timers run as in the app
- ✅ **From the SWFs alone.** The set is the 8 original SWFs, nothing else. They are
  read from the uploaded corpus (`games-swfs/fishing-swfs`, SHA-identical to the
  SWFs that used to be committed); the repo bundles no game files.
  - The committed AS2 override of `gsecs2.9` frame 61 is gone. Six bundled SWFs had
    been rebuilt from FFDec exports; they are replaced by the uploaded originals.
    In the SWF's own chooser Join is an ordinary button, enabled before a row is
    picked; the "disabled until a server is picked" behaviour came from the
    override, not from the game. The test asserts the SWF's behaviour.
  - Fonts are built from the SWF's DefineFont glyphs (59 distinct, all pass the OTS
    sanitizer); sounds are decoded from its DefineSound tags (MP3/ADPCM/PCM).
  - FFDec exports are not kept in the repo. Comparison tests use them only when
    `SWF_FFDEC` points at a local export, and skip otherwise; nothing in the app
    reads them.
- ⬜ **Not tested:** hooking and reeling a fish, catch results, top-fishers list, chat
  with other players beyond the mock.
- ⚠️ **Warnings.**
  - `attachMovie("FocusManager")` is not found in the game's own library. Flash
    resolves `attachMovie` only in the clip's own movie, so this matches Flash.
  - `attachMovie(undefined)`: one call with no linkage name. Its cause has not been
    traced.

## Blackjack — `blackjack-swfs/` (AVM1, 7 SWFs, entry `blackjack4.14.swf`)

- ✅ **Parse** 7/7; **build** 0 errors. ⚠️ Interpreter fallbacks, as above.
- ✅ **Start-up chain.**
  - `blackjack4.14.swf` loads `preloader1.1.swf` into `_level0`.
  - The preloader fetches all six files: game, chat, `gsecs2.9`, avatar reporting,
    tracking.
  - It then hands `_level0` to `blackjack_game4.14.swf`.
  - Result: root frame 12/20, login holder on stage, 137 display objects.
- ❌ **Login.** The game posts to `gateway.php` and waits for the reply. Offline
  there is nothing to answer: no blackjack adapter, so no mock gateway or socket
  server.
- ⬜ **Not reachable yet:** server and room choice, the table, dealing, betting, chat.
- ⚠️ **Warnings:** the same `FocusManager` and `attachMovie(undefined)` pair as in
  fishing.

## Word Bump — `word-bump-swfs/` (AVM1, 8 SWFs, entry `wordbump1.4.swf`)

- ✅ **Parse** 8/8; **build** 0 errors. ⚠️ Interpreter fallbacks, as above.
- ✅ **Start-up chain.**
  - The loader loads `preloader.swf`.
  - The preloader loads the game, `gsecs2.9`, `word_list.swf` and `sound1.3.swf`
    into `_root.mainClip`.
  - `cleanUpAndComplete` → after 3 s, `closePreloader` → `startGame` loads the game
    into `_level0`.
  - Result: root frame 15/54; interface, launchers, sound and word list on stage;
    139 display objects.
- ❌ **Login.** Stops at the `gateway.php` POST, as blackjack does. `avatarPngLoader.swf`
  also posts to `/chat/gsi/`.
- ⬜ **Not reachable yet:** the word board, launching, scoring, levels.
- ⚠️ **`_root: frame label "login" not found`** (71×). It appears while the game is
  still parked in the preloader's `mainClip`. There `_root` is `_level0`, the
  preloader, which has no such label. Flash resolves `_root` the same way (no
  `_lockroot` is set), so this is very likely what Flash does too. Not verified.
- ⚠️ **`mLoginHolder` twice** among the root's children. Not yet checked whether the
  game attaches it twice or the engine duplicates it.

## Pinball — `pinball-swfs/` (AVM2, 5 SWFs, entry `gameShell.swf`, `game=pinball`)

- ✅ **Lift** 805 modules, 0 refusals, 0 syntax errors; compile and link 0 errors.
- ✅ **`gameShell.swf` boots.**
  - 45 display objects: shell UI and dialogue.
  - It runs `gameHandleInitCaps:Pinball` and "init sequence step 1 of 11".
- ❌ **Init step 1: the GSI gateway.**
  - It posts to `http://null.gaiaonline.com/chat/gsi/gateway.php`. The host is
    `null` because the page that embedded the shell passed its server name in
    FlashVars, and nothing supplies that offline.
  - It gets an `IOErrorEvent` → `onGSIIOError`, and the shell waits.
- ❌ **Missing Dependency `games/pinball/gameConfig.xml`.** Not among the uploaded
  files; listed under Missing Dependencies. Upload it and `URLLoader` is answered
  with it.
- ❌ **Loading the game into the shell.** `flash.display.Loader` now finds `game.swf`
  in the load (and reports a SWF that is not there as a Missing Dependency, with
  `IOErrorEvent` #2035), but running loaded content inside the player is not
  implemented yet.
- ❌ **FlashVars in the app.** The Execute tab passes no FlashVars to the AVM2 player.
  `game=pinball` can only be set from the test harness (`SWF_VARS`) today.
- ⚠️ **`game.swf` alone.** It constructs `Pinball` with no errors (6 display objects).
  It is built to be started by the shell, so it waits.
- ✅ **`sound.swf`.** Builds its `SoundController`. Fixed today: it named
  `SoundTransform` through a namespace set and was lifted as `this.SoundTransform`.
- ✅ **`gPinballAvatarStation.swf`** constructs with no errors (6 objects).
  `avatarStationsBackground.swf` has no code; it is a library.
- ⚠️ **Player classes it references that the engine doesn't implement yet:**
  `XMLSocket`, `LocalConnection`, `DataEvent`, `ObjectEncoding`, `URLRequestHeader`,
  `IME`, `XMLDocument`. They are imported as `unsupportedFlash(...)` placeholders.
- ⬜ **Not reachable yet:** the table, flippers, physics, scoring.

## Tiles — `tiles-swfs/` (AVM2, 11 SWFs, entry `gameShell.swf`, `game=tiles`)

- ⚠️ **Lift** 508 modules, 0 syntax errors, **1 refusal.**
  - `mx.utils.NameUtil::displayObjectToString`: "a protected region does not end on a
    jump", a `try` block shape the lifter doesn't handle yet.
  - That one method is emitted as a refusal, so calling it fails.
- ✅ **Compile and link** 0 errors.
- ✅ / ❌ **`gameShell.swf`** gives the same result as pinball: init step 1 of 11, then
  the null-host gateway, missing `games/tiles/gameConfig.xml`, the `Loader` stub, and
  no FlashVars in the app.
- ❌ **`game.swf` alone.** It constructs `tiles` (logs "version 0.0.2.8") and starts
  "AssetManager loading asset swf" through `Loader`. The stub never completes, so it
  stays at 1 display object.
- ✅ **Libraries lift cleanly:** the five deck SWFs (animal, aquarium, npc, standard,
  zomg), `assets.swf`, `sound.swf` and `tilesAvatarStation.swf` (17 objects).
  ❌ Nothing can load them until `Loader` is real.
- ⬜ **Not reachable yet:** dealing a deck, matching tiles, scoring.

## Towns 2 — `towns2-swfs/` (AVM2, 4 SWFs, entry `towns2.swf`)

- ⚠️ **Lift** 975 modules, 0 syntax errors, **8 refusals.** All 8 are
  `fl.video.SMILManager` methods using E4X's default XML namespace (`dxns`), which the
  lifter does not emit yet. Only the video component's SMIL parsing is affected.
- ✅ **Compile and link** 0 errors.
- ✅ **Boot.**
  - `TownsDoc` builds its UI: 16 root children, 417 display objects, no runtime
    errors.
  - Avatar bar, settings and phone panels are among them.
  - It enumerates the market locations (`gambinoMarket_alpha` … `_donot`).
  - Today's census caught a regression here before it was committed: every stock
    `fl.controls` component failed with "local3 is not defined", and the stage was
    empty. It is fixed and covered by a test.
- ❌ **Server.** 12 GSI calls to `www.gaiaonline.com/chat/gsi/gateway.php` fail with
  `#2032` (no towns adapter).
- ❌ **Missing Dependency `navPages/phone.css`** (CSS, `URLLoader.load`, `#2032`).
- ❌ **Maps.** `catCafe.swf` and `gambinoMarket.swf` are loaded by the town through
  `Loader`, which is a stub.
  - Booted on their own, their constructors fail because they expect the town's avatar
    (`avatarModel.avatar` is null). That is expected outside the host, not a lift bug.
  - Their code lifts with 0 refusals.
- ❌ **E4X.** `XML`/`XMLList` are not in the engine, so any XML the town parses fails
  when it runs.
- ✅ **`emotes.swf`** builds its library (36 objects).
- ⚠️ **Player classes not implemented yet** (placeholders): `NetConnection`/`NetStream`
  (video), `FileReference`, `Accessibility*`, `FullScreenEvent`, `HTTPStatusEvent`,
  `NetStatusEvent`, `Vector3D`, `Responder`, `Endian`, `IME`.
- ⬜ **Not reachable yet:** walking around, entering a map, shops, emotes in use.

---

## Cross-cutting

Ordered by how many games each item unblocks:

1. **Offline game servers** (blackjack, word bump, pinball, tiles, towns 2). Every
   one of these games stops at its first GSI `gateway.php` call. Fishing shows the
   pattern: an adapter answering the PHP-serialized gateway calls and the socket
   protocol. Each game needs its own adapter under `src/adapters/`, keeping
   game-specific code out of the engine.
2. **A real `flash.display.Loader`** (pinball, tiles, towns 2). It finds the sibling
   SWF in the load and reports missing ones; it must still lift and link the loaded
   ABC into the same program, and fire `contentLoaderInfo` `complete`.
3. **FlashVars for AVM2 movies in the Execute tab** (pinball, tiles). Also, the
   shell's gateway host would then stop coming out as `null`.
4. **E4X `XML`/`XMLList` in the engine** plus the `dxns` lift (towns 2; the 8
   refusals). `flash.xml.XMLDocument` is used by pinball's `game.swf`.
5. **Missing Dependencies:** `games/<game>/gameConfig.xml` for the shell,
   `xml/scores.xml` for pinball's `game.swf`, `navPages/phone.css` for towns 2. The
   Execute tab lists them; uploading them with the SWFs serves them.
6. **AVM1 interpreter fallbacks.** 211 of 1,059 AVM1 scripts in the 18 distinct AVM1
   SWFs keep a function in the bytecode interpreter:

   | Count | Reason |
   |---|---|
   | 136 | Nonempty stack at control-flow join |
   | 28 | Unstructured branch join |
   | 14 | Unstructured conditional branch |
   | 10 | Unreachable actions |
   | 6 | Conditional local declaration |
   | 6 | Opcode 0x55 `Enumerate2` |
   | 3 | Opcode 0x94 `With` |
   | 2 | Unstructured loop |
   | 2 | `super` scope |
   | 2 | Opcode 0x3b `Delete2` |
   | 1 | Action block over the decoder size limit |
   | 1 | Opcode 0x25 `RemoveSprite` |

   They run correctly; they are not yet clean TypeScript.
7. **The tiles `try` shape** (`NameUtil::displayObjectToString`), the last non-E4X
   refusal.

**Test-harness note.** The AS2 player's `tick()` advances frames but **does not run
`setInterval`/`setTimeout`**; only `step(now)` does, and that is what the app calls.
- With `tick()`, both preloaders appeared stuck forever. With `step()`, both games
  load.
- `game421.dev.test.ts` and the census drive it with `step()` (`advanceTime()`).
