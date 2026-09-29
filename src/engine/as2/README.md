# AS2 player (`src/engine/as2`)

Runs ActionScript 1/2 games (SWF ≤ 8), without Ruffle or any Flash bytecode:

```
FFDec export (.xml + scripts/*.as + shapes/images/sounds/fonts)
   │ parser (src/lib/parser.ts)        │ as2ts (src/transpiler/as2)
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

## Semantics (modelled on Flash Player / Ruffle AVM1)

- **One tick per frame.** Clips are visited pre-order. Each clip queues its `enterFrame` handlers, then advances: it queues the new frame's script, then applies that frame's place/move/remove ops. The action queue runs after all clips have advanced, so frame scripts see the objects placed on their own frame.
- **`gotoAndStop` / `gotoAndPlay`** diff the display list against the target frame's snapshot. Instances with the same character and start frame are kept. Scripts on intermediate frames are skipped.
- **Construction order.** A clip gets its display state, name, init object and first-frame children *before* its AS2 class constructor body runs. `MovieClip.__construct` in the runtime makes this possible.
- **Class registration.** Linked classes come from `Object.registerClass` in DoInitAction scripts. Those scripts run before root frame 1.
- **Undefined values never throw.** as2ts emits `?.` and `$rt.sink`, so reading or writing through `undefined` is a no-op, as in AS2.
- **Missing external SWFs.** A `loadMovie` or `MovieClipLoader` request for a SWF that isn't available loads as an empty clip, with one warning per URL. Pass `resolveExternal` to supply other exported SWFs.
- **Game clock.** `getTimer()` and `setInterval` use game time, which pauses with the player.

## Known limits

- Masks clip to the mask's bounding box.
- Gradient fills in the drawing API use their first colour.
- Filters and blend modes are ignored.
- There are no network servers: `LoadVars`, `XMLSocket` and `XML.load` report failure unless `fetchText` is provided.
- Only `_level0` exists.

Screenshots of Gaia Fishing running on this player are in `audits/as2-player/`.
