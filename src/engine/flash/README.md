# SWF Studio AS3 engine

Runs an ActionScript 3 game whose code was transpiled to TypeScript, using the
SWF's JPEXS dump for symbols, timelines and linkage. No Flash emulator is
involved: the game's own classes run as JavaScript on top of a `flash.*`
implementation with the same names and semantics as the AS3 API.

```
 loaded folder ─┬─ game.xml (JPEXS dump) ── parser ──▶ SwfDocument (symbols, timelines, SymbolClass)
                ├─ shapes/ images/ sounds/ … ──────▶ AssetCache (what each character looks like)
                └─ **/*.ts (transpiled AS3) ─ loader ─▶ LinkedProgram (classes by AS3 name)
                                                          │
                                   FlashPlayer ◀──────────┘  links SymbolClass → classes,
                                   (player.ts)               constructs the document class, runs frames
```

## What the transpiled code must look like

Plain TypeScript/JavaScript modules, one class per file as AS3 has it, that
import the Flash API by package. Any of these spellings resolve to the engine:

```ts
import { MovieClip } from 'flash/display/MovieClip';
import { Event } from 'flash.events.Event';
import { Keyboard } from 'flash/ui';                          // whole package
import { Point } from '../../lib/flash/geom/Point';           // a stub/typings folder of your transpiler
```

Game classes import each other with relative paths (`./Hero`), package paths
(`com/game/Hero`, `com.game.Hero`) or aliases (`@/com/game/Hero`), which are
matched by path suffix. `.d.ts` files are ignored, so typing stubs can stay in
the folder. `trace`, `int`, `uint`, `Vector` and the AS3 error classes are
available without an import.

**Linkage.** A SWF `SymbolClass` entry (`12 → com.game.Enemy`) links symbol 12
to the exported class whose file path ends in `com/game/Enemy`. Entry `0` is the
document class. When the SWF doesn't name one, pick it in the Execute tab's
**Program** panel.

## Semantics implemented

* **Construction order, as in Flash.** A timeline child is attached, named and
  positioned *before* its constructor body runs, so `this.parent`, `this.stage`,
  `this.name`, `this.x` and declared stage instances (`public hero: Hero;` →
  `this.hero`) work inside constructors. The document class is on the stage in
  its constructor. `ADDED` / `ADDED_TO_STAGE` follow the constructor.
* **Timelines.** Every MovieClip has its own playhead: `play`, `stop`,
  `gotoAndPlay` / `gotoAndStop` (frame number or label), `nextFrame`,
  `prevFrame`, `currentFrame`, `currentLabel`, `currentFrameLabel`,
  `currentLabels`, `totalFrames`, `isPlaying`, `addFrameScript`. Children are
  reconciled per frame from the dump's display-list snapshots, so instances
  keep their identity (and their script state) while their placement lasts,
  and are removed or created when the timeline says so, in either direction.
  After a script moves a timeline instance, the timeline stops overriding its
  transform, as in Flash.
* **Frame order.** Timers, then advance playheads, then `enterFrame`, then
  `frameConstructed`, then frame scripts, then `exitFrame`, then repaint. A
  goto runs the destination frame's script immediately.
* **Events.** Capture, target and bubble phases, priorities, `stopPropagation`,
  `stopImmediatePropagation`, `preventDefault`. Keyboard events go to
  `stage.focus` or the stage. Mouse events are `over` / `out` / `rollOver` /
  `rollOut` / `down` / `up` / `click` / `releaseOutside`, with `mouseEnabled`,
  `mouseChildren`, `hitArea` and `buttonMode`. `SimpleButton` shows its up,
  over and down states and hit-tests with its hit state.
* **Display API.** `addChild(At)`, `removeChild(At)`, `removeChildren`,
  `getChildByName`, `setChildIndex`, `swapChildren`, `contains`, `x/y`,
  `scaleX/Y`, `rotation`, `width/height`, `alpha`, `visible`, `transform`,
  `localToGlobal`, `globalToLocal`, `getBounds`, `hitTestObject`,
  `hitTestPoint`, `mouseX/Y`, `mask`, `scrollRect`, `startDrag` / `stopDrag`,
  `Graphics` drawing, `TextField` (dynamic and input), `Bitmap` / `BitmapData`
  (linked bitmaps too).
* **Everything else.** `Timer`, `getTimer`, `setTimeout` / `setInterval` (all
  on player time: they pause, step and restart with the game), `Sound` /
  `SoundChannel` (linked sounds and timeline sounds from the exported files),
  `SharedObject` (in localStorage), `getDefinitionByName`,
  `getQualifiedClassName`, `Keyboard`, `fl.transitions.Tween` and easing.
* **Isolation.** An exception in game code is logged to the Execute console
  with the handler it came from, and the game keeps running. **Restart**
  re-evaluates every module, so static fields start fresh.

## Known limits

* Hit tests use bounding boxes (`hitTestPoint(x, y, true)` is not shape-exact).
* Rendering applies alpha but not colour tints, filters or blend modes. These
  are stored and readable by scripts but not drawn. Masks clip to the mask's
  bounding box.
* Text renders with device fonts (no embedded glyph outlines, no HTML styling).
* Gradient and bitmap fills in `Graphics` are approximated with a flat colour.
* Network loading (`Loader`, `URLLoader`) fails with `IOErrorEvent` offline.
  There is no E4X (`XML`), and `Dictionary` object keys need the Map-style
  `get/set` API. Bracket access only works with string or number keys.
* Game code runs on the UI thread, so an infinite loop in a script freezes the
  tab, as it would hang Flash Player.
