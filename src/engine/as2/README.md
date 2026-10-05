# AS2 player (`src/engine/as2`)

Runs ActionScript 1/2 games (SWF ≤ 8), without Ruffle or any Flash bytecode:

```
FFDec export (.xml + scripts/*.as + shapes/images/sounds/fonts)
   │ decompiler (decompiler/)        │ transpiler (transpiler/as2)
   ▼                                   ▼
SwfDocument (symbols, timelines)   TypeScript modules ──sucrase──▶ AS2Program
                   └──────────── AS2Player ────────────┘
```

| File | Role |
|---|---|
| `player.ts` | Display list, AVM1-style frame loop and action queue, gotos, instance construction, hit testing, input, canvas rendering |
| `builtins.ts` | Flash 7 API installed onto the runtime classes: MovieClip, Button, TextField, Key, Mouse, Stage, Selection, Sound, Color, LoadVars, MovieClipLoader, SharedObject, XML, XMLSocket, LocalConnection, ContextMenu, System |
| `program.ts` | In-browser build: `.as` → as2ts → sucrase → linked `AS2Program` |
| `text.ts` | HTML subset parser and word-wrap layout for TextFields |
| `audio.ts`, `adpcm.ts` | Sounds (MP3 as-is; ADPCM `.flv` exports decoded to WAV); embedded TTF fonts |
| `geom.ts` | Matrix, rect and colour-transform math (TWIPS) |
| `externals.ts` | Resolves `loadMovie` URLs to other loaded SWF exports and builds them on first use |

## Semantics (modelled on Flash Player / Ruffle AVM1)

- **One tick per frame.** Clips are visited pre-order. Each clip queues its `enterFrame` handlers, then advances: it queues the new frame's script, then applies that frame's place/move/remove ops. The action queue runs after all clips have advanced, so frame scripts see the objects placed on their own frame.
- **`gotoAndStop` / `gotoAndPlay`** diff the display list against the target frame's snapshot. Instances with the same character and start frame are kept. Scripts on intermediate frames are skipped.
- **Construction order.** A clip gets its display state, name, init object and first-frame children *before* its AS2 class constructor body runs. `MovieClip.__construct` in the runtime makes this possible.
- **Class registration.** Linked classes come from `Object.registerClass` in DoInitAction scripts. Those scripts run before root frame 1.
- **Undefined values never throw.** as2ts emits `?.` and `$rt.sink`, so reading or writing through `undefined` is a no-op, as in AS2.
- **Missing external SWFs.** A `loadMovie` or `MovieClipLoader` request for a SWF that isn't available loads as an empty clip, with one warning per URL.
- **Class instance initialisers** (`var x = value` in a class body) live on the prototype, as AS2 compiles them. They are visible while superclass constructors run, and object values are shared by all instances.
- **Calling a non-function is a no-op.** Calls through a class's `var` members go through `$rt.invoke`.
- **`ASSetPropFlags`** emulates the "don't enumerate" bit, which V2 components use to hide e.g. `Object.prototype.LargestID`. `_global` holds the built-ins, as in Flash.

## External SWFs

A game made of several SWFs is loaded as one folder with an FFDec export per SWF. The shallowest `.xml` is the main movie. Each other export sits in its own sub-folder, conventionally `external/<swf name>/`. `tools/ffdec-export/export.sh` produces that layout from `.swf` files.

```
fish-full/bassken_game4.21.xml, scripts/, shapes/, …        main movie
fish-full/external/bassken_scene/bassken_scene.xml, …       loadClip("bassken_scene.swf", _root.view)
fish-full/external/game_chat/game_chat.xml, …               loadMovie("../sharedsource/game_chat/game_chat.swf")
```

- `createExternalResolver()` matches the file name of the requested URL (path and query ignored) to an export.
- The export's scripts are transpiled with as2ts and linked the first time the game asks for them, after the player's runtime reset. Class bodies run then, like a SWF's class DoInitActions when it loads.
- The resulting `Movie` is shared by every clip the SWF is loaded into. Gaia Fishing loads its fish SWF into 19 clips.
- **Loading into a clip:**
  - The loaded SWF replaces the clip's children and keeps the clip's name and transform. The loaded root timeline then plays in it (`this` = the clip, `_root` = `_level0`).
  - The SWF's classes join `_global` unless a class of that name exists already (first definition wins).
  - Its init actions run with its own `Object.registerClass` library, so two SWFs can both export e.g. `fisher` with different classes.
- **Per-movie assets:** fonts, text, sounds and `attachMovie` look up the library of the SWF a clip belongs to. `attachMovie` falls back to the main movie.
- **Linker:** a class module whose static initialiser needs a class still loading through an import cycle is re-run once the rest is linked. Flash's compiler orders such classes by dependency instead (e.g. `mx.core.ExternalContent` after `mx.core.View`).
- **Game clock.** `getTimer()` and `setInterval` use game time, which pauses with the player.

## Known limits

- Masks clip to the mask's bounding box.
- Gradient fills in the drawing API use their first colour.
- Filters and blend modes are ignored.
- There are no network servers: `LoadVars`, `XMLSocket` and `XML.load` report failure unless `fetchText` is provided.
- Only `_level0` exists. `_lockroot` is not supported.

Screenshots of Gaia Fishing running on this player are in `audits/as2-player/`.
