# Investigative Audit: Why the Execute tab cannot play the game

| | |
|---|---|
| **Repository** | `discorddioxin/swf-studio` |
| **Branch / commit audited** | `arena/01a0e624-swf-studio` @ `c1d799b` |
| **Date** | 2026-09-28 |
| **Scope** | The Execute workspace end to end: `ExecuteTab.tsx`, `src/engine/*`, and the parts of the parser, asset loader and renderer the runtime depends on |
| **Evidence** | 23 executable probes in `audits/probes/execute.probe.test.tsx`, run against the real modules and components |
| **Status** | Investigation only. No engine code was changed |

---

## 1. Verdict

**The Execute tab cannot play a game because the app has no ActionScript execution engine.** What exists is a scaffold: a frame clock, a logging stub that stands in for the Flash API, and a React shell. Nothing connects the clock to the scripts or to the screen.

The request's premise, that "the app already creates an engine … making use of transpiled ActionScript code", does not match the code. **No transpiler, interpreter, or evaluator for ActionScript exists anywhere in the repository** (probe EX-09). The phrase "transpiled ActionScript" appears only in a doc comment in `src/engine/types.ts`. That comment also refers to `orchestrator` and `runtimeProxy` modules, which are not in the repository or its history (§4).

Four independent layers are missing or broken. **Each one on its own is enough to make the game unplayable:**

| # | Layer | State | Consequence |
|---|---|---|---|
| 1 | **Script execution** | Missing: no transpiler or interpreter. Frame scripts are never dispatched. The Flash API stub only logs | No game logic runs: no `stop()`, no variables, no `if`, no functions |
| 2 | **Rendering** | `SwfRuntime.render()` is never called | The canvas stays blank while the clock ticks invisibly |
| 3 | **Display model** | The renderer is stateless: a movie clip's frame is computed from its parent's frame, and there is no runtime display list | Clips cannot `stop()` or play on their own, `attachMovie` cannot create anything, and positions set by scripts have nowhere to live |
| 4 | **Interaction** | No keyboard or mouse input. Button and clip-event handlers are dropped by the parser. Buttons are always drawn in their "up" state | Even with 1–3 fixed, the player has nothing to interact with |

On top of that, the controls that do exist are broken: the first **Play** click pauses, **Step** does nothing, **Reset** puts the UI and runtime out of sync, resizing discards the runtime, and the frame counter never moves (§5.1).

---

## 2. Method

1. **Line-by-line review:**
   - `ExecuteTab.tsx`
   - `engine/{runtime,clock,scope,decompiler,types}.ts`
   - `lib/render.ts`
   - the action paths in `lib/parser.ts`
   - `hydrateActionScriptSources` / `resolveActionScriptFile` in `lib/assets.ts`
   - the wiring in `App.tsx`
2. **Provenance:** git history, the other branches, and the repository's own process notes (`REPEAT_METRICS.md`).
3. **Executable probes:** 23 Vitest probes that exercise the real code.
   - UI probes mount the real `ExecuteTab` in jsdom with a recording 2D context, then click **Play**, **Step** and **Export TS**.
   - Runtime probes drive `SwfRuntime` and the Flash scope directly.
   - Parser probes feed minimal JPEXS XML containing the tags a game uses.
   - Each probe **asserts the current, broken behaviour**, so the file passes today and serves as evidence. Once the engine works, the probes will start failing, and each one can then be inverted into a regression test.

   ```bash
   npx vitest run --config audits/probes/vitest.config.ts   # 23 passed
   ```

   The probes have their own config and are not part of `npm test`.

---

## 3. What "playing a SWF" requires, and what exists

```
JPEXS dump ──► parser ──► frame/clip/button scripts ──► [ execute ] ──► display list ──► renderer ──► canvas
                 │                 │                        │               │               │
                 │                 │                        │               │               └─ render() never called (EX-01)
                 │                 │                        │               └─ none: frames are derived arithmetically (EX-21)
                 │                 │                        └─ no transpiler/interpreter (EX-09); API stub only logs (EX-10…14)
                 │                 └─ button & clip handlers dropped (EX-15, EX-16); fallback decoder wrong (EX-18…20)
                 └─ AS3 (DoABC) treated like AS1/2 (EX-17)
```

| Flash Player behaviour a game relies on | Present? |
|---|---|
| Frame loop: run frame scripts on entering a frame, then render | ❌ Scripts are never run. Rendering is never invoked |
| `stop()` / `play()` / `gotoAndStop()` / `gotoAndPlay()` on any clip | ❌ They only log (EX-10). There is no per-clip playhead (EX-21) |
| Independent playheads for every movie-clip instance | ❌ A child's frame is `(parentFrame − startFrame) mod frameCount` |
| Runtime display list (`attachMovie`, `duplicateMovieClip`, `removeMovieClip`, `createEmptyMovieClip`) | ❌ They log and return a proxy. Nothing is drawn |
| Scriptable instance properties (`_x`, `_y`, `_rotation`, `_alpha`, `_visible`, `_currentframe`…) | ❌ Reads return `0` or a proxy. Writes are discarded (EX-12, EX-14) |
| Variables, objects, functions, `_root` / `_parent` / `_global` / `this` | ❌ Writes are no-ops. `_root`, `_parent` and `_global` evaluate to `0` (EX-11) |
| Button states and handlers (`on(press)`, `on(release)`, rollover) | ❌ Handlers are not parsed (EX-15). Buttons always draw frame 0 (EX-22) |
| Clip events (`onClipEvent(load/enterFrame/keyDown/mouseDown)`), `onEnterFrame` | ❌ Not parsed (EX-16). There is no event loop |
| `Key.isDown`, `Mouse`, `Stage`, `setInterval`, `Sound`, `Date`, `Array`… | ❌ Any API not hard-coded throws `TypeError: … is not a function` (EX-13) |
| `hitTest` | ❌ Always returns `false` |
| Keyboard and mouse input | ❌ No listeners (EX-08) |
| Sound (`StartSound`, `Sound` objects) | ❌ Events are parsed but never played |
| `#initclip` (`DoInitAction`) ordering | ❌ Not implemented |
| AS3 / AVM2 (`DoABC`) | ❌ No path at all (EX-17) |

The parts that do work are the frame clock (`engine/clock.ts`, 13 passing tests) and the static renderer (`lib/render.ts`), which draws any `(timeline, frame)` correctly and is what the Workbench uses.

---

## 4. Provenance: how it got this way

- **`REPEAT_METRICS.md`** is a log from an earlier AI session. It records the engine being rebuilt as seven small, "build-verified" steps: types, clock, decompiler, scope, runtime, ExecuteTab, and wiring. **None of those steps is a transpiler or an interpreter.** Its §7 lists tests for every engine module except the clock as *Pending*, and its conclusion says the code is "safe to work on again". It never says the engine plays anything. "Build-verified" meant the file compiled, not that it worked.
- **The earlier engine was deleted and not replaced.** `engine/types.ts` still documents a bridge "the transpiled ActionScript talks to" and an `orchestrator ↔ runtimeProxy` circular dependency. Neither module exists.
- **The replacement scope still has the problem it claims to remove.** `engine/scope.ts` says it "replaces the old untyped `new Proxy({ has(){ return true } })` trap", but the new proxy still implements `has() { return true }`. Its `set()` returns `true` without storing anything.
- **Dead code from the earlier engine is still there.**
  - `lib/render.ts` still exports "Code Orchestrator runtime helpers" (`runActorTick`, `drawActorFrame`, `renderOrchestratorScene`, `genActorOnFrame`). Nothing imports them, and they too only turn actions into strings.
  - `engine/decompiler.ts` is also imported nowhere, and its opcode table is wrong (EX-20).
- There is a single commit on `main` ("Initial commit"), so git history cannot recover the old engine.

---

## 5. Findings

Severity reflects the impact on the goal of playing the game. **Blocker** means that fixing everything else still leaves the game unplayable.

| ID | Severity | Finding | Probe |
|---|---|---|---|
| EX-09 | **Blocker** | No ActionScript transpiler, interpreter or evaluator exists | EX-09 |
| EX-02 | **Blocker** | Frame scripts are never dispatched: nothing reads `frame.events` during playback | EX-02 |
| EX-01 | **Blocker** | `SwfRuntime.render()` is never called, so the canvas is never drawn | EX-01 |
| EX-21 | **Blocker** | Stateless renderer: nested clips have no playhead of their own, and there is no runtime display list | EX-21 |
| EX-15 | **Blocker** | Button handlers (`BUTTONCONDACTION`, `on(...)`) are not parsed | EX-15 |
| EX-16 | **Blocker** | Clip handlers (`clipActions`, `onClipEvent(...)`) are not parsed | EX-16 |
| EX-08 | **Blocker** | No keyboard or mouse input path | EX-08 |
| EX-17 | **Blocker (AS3 games)** | `DoABC` is treated as an ordinary frame action, and there is no AVM2 | EX-17 |
| EX-10 | High | `gotoAndStop`, `gotoAndPlay`, `nextFrame` and `prevFrame` only log | EX-10 |
| EX-11 | High | `_root`, `_parent` and `_global` evaluate to the number `0` | EX-11 |
| EX-12 | High | Variables cannot be stored, and values stringify to `"[path]"` | EX-12 |
| EX-13 | High | Any API that isn't hard-coded throws `not a function` | EX-13 |
| EX-14 | High | `hitTest` is always `false`, `_x` and `_y` are always `0`, and `_currentframe` is a proxy | EX-14 |
| EX-18 | High | The inline bytecode fallback turns branches into comments, gets `GotoFrame` wrong and loses constants | EX-18 |
| EX-19 | Medium | SWF doubles are decoded with the wrong byte order | EX-19 |
| EX-20 | Medium | The opcode table in `engine/decompiler.ts` is wrong (and unused) | EX-20 |
| EX-25 | Medium | Only frame-script `.as` files are resolved. FFDec's button and clip-event exports are ignored | review |
| EX-04 | Medium | The first **Play** click pauses | EX-04 |
| EX-05 | Medium | **Step** never advances | EX-05 |
| EX-06 | Medium | **Reset** leaves the runtime playing while the UI shows paused | EX-06 |
| EX-07 | Medium | Resizing recreates the runtime and discards state | EX-07 |
| EX-03 | Medium | The frame counter never moves during playback | EX-03 |
| EX-22 | Medium | Buttons are always drawn in their Up state | EX-22 |
| EX-26 | Low | Sounds are never played | review |
| EX-23 | Low | **Export TS** produces a file that cannot compile, with the ActionScript left as comments | EX-23 |
| EX-24 | Low | Dead and misleading code: orchestrator helpers, `decompiler.ts`, and comments describing a missing engine | review |
| EX-27 | Low | Stage framing: never scaled up, offset by a fixed 40 px, not centred | review |

### 5.1 The Execute shell (`ExecuteTab.tsx`)

**EX-01 · Nothing is ever drawn.**
- The runtime is constructed with a `render` callback, but the animation loop only calls `runtime.tick(dt)`.
- `SwfRuntime.render(ctx)` is the only thing that invokes that callback, and nothing calls it.
- The canvas is never even asked for a 2D context.
- Probe: after two **Play** clicks and 400 ms, `tick` has been called more than 5 times, while `render` has been called 0 times and the canvas has received 0 draw calls.

**EX-02 · Frame scripts never run.**
- `SwfRuntime.tick` advances `FrameClock` and nothing else.
- No code looks up `doc.root.frames[frame].events` while playing, so no script, sound or label is ever dispatched to anything.
- Probe: after playing through the fixture's frame-25 action, the console still reads "No runtime events yet."

**EX-03 · The frame counter is frozen.**
- `setFrame(runtime.frame)` runs only inside the `onEvent` handler.
- The runtime never emits events (see EX-02), so the header reads "frame 1/N" indefinitely.

**EX-04 · The first Play click pauses.**
- `FrameClock` starts with `playing = true`, but the component's `playing` state starts as `false`.
- `togglePlay` sees `runtime.playing === true` and calls `pause()`, then copies `false` into React state.
- The loop only starts on the second click.

**EX-05 · Step does nothing.**
- `SwfRuntime.step()` calls `clock.pause()` and then `clock.tick(1000/fps)`.
- `tick` returns immediately when the clock isn't playing, so the frame never advances.

**EX-06 · Reset desynchronises the UI.**
- `clock.reset()` sets `playing = true`, while the UI sets `playing` to `false`.
- The next **Play** click pauses again, repeating EX-04.

**EX-07 · Resizing destroys the runtime.**
- The runtime effect depends on `[doc, cache, size]` because the render closure captures `size`.
- A resize, including the first one reported by the `ResizeObserver` right after mount, builds a new runtime and discards the old one's frame, state and listeners.
- The old runtime is never disposed.

**EX-08 · No input.**
- There are no keyboard, mouse or pointer handlers anywhere in the tab.
- The runtime has no API that accepts input.

**EX-27 · Stage framing (low).**
- `Math.min(…, 1)` means the stage is never scaled up.
- It is drawn at a fixed 40 px offset and not centred.
- This is cosmetic, but a small stage renders small.

### 5.2 The runtime and the Flash scope (`engine/runtime.ts`, `engine/scope.ts`)

**EX-09 · There is nothing to run the scripts with.**
- `SwfRuntime` builds a `FlashScope`, but no code ever evaluates ActionScript against it.
- There is no transpiler to JavaScript, no AVM1 bytecode interpreter, and no `new Function` or `with (scope)` evaluator.
- The scope is only reachable from tests.

**EX-10 · Timeline control is cosmetic.**
- `gotoAndStop`, `gotoAndPlay`, `nextFrame` and `prevFrame` emit a log line and leave the clock alone. Frame labels are not resolved.
- Only `stop()` and `play()` touch the clock, and there is just one clock, for the main timeline.

**EX-11 · `_root`, `_parent` and `_global` evaluate to `0`.**
- The proxy's fallback returns `0` for any property that starts with `_` and has at most 7 characters. This was meant for `_x` and `_y`, but it also catches `_root` (5 characters), `_parent` (7) and `_global` (7).
- So `_root.gotoAndStop(2)` throws `TypeError`.
- This is probably the most common line in AS2 games.

**EX-12 · No state.**
- `set()` returns `true` and stores nothing, and every read of an unknown name returns a new proxy.
- `score = 5; score + 1` gives `"[_global.score]1"`.
- Counters, flags, health and positions cannot work.

**EX-13 · Unknown APIs throw.**
- The proxy target is a plain object, so calling anything outside the hard-coded list, such as `Key.isDown(37)`, `setInterval(...)`, `new Sound()` or `Math`-like objects other than `Math` itself, throws `TypeError: … is not a function`.

**EX-14 · Queries return constants.**
- `hitTest` always returns `false`.
- `_x`, `_y`, `_width` and similar always return `0`.
- `_currentframe` (13 characters) is a proxy object, so `if (_currentframe == 10)` is never true.

### 5.3 Script inputs (`lib/parser.ts`, `lib/assets.ts`)

**EX-15 · Button handlers are dropped.**
- `buildButtonTimeline` reads the `BUTTONRECORD`s (the state artwork) and ignores the button's `BUTTONCONDACTION` records, which hold `on(press)`, `on(release)`, rollover and so on.
- Probe: a `DefineButton2` with a release action produces zero action events.
- Clickable menus, "Start" buttons and inventory UIs therefore have no behaviour to run.

**EX-16 · Clip events are dropped.**
- The `PlaceObject2/3` branch reads the matrix, colour, name and depth, and ignores `clipActions` (`onClipEvent(load)`, `(enterFrame)`, `(keyDown)`, `(mouseDown)`…).
- In AS1/2 games, per-frame movement and input logic usually lives here.

**EX-25 · Button and clip `.as` exports are never resolved.**
- `hydrateActionScriptSources` and `resolveActionScriptFile` only look for `DoAction.as` / `DoInitAction.as` under `frame_N` folders.
- FFDec exports button and placed-object handlers as files named after the event, such as `on(release).as`, in per-object folders like `PlaceObject_ID…` ([JPEXS issue #774](https://www.free-decompiler.com/flash/issues/774-single-file-action-script-export)). These are never matched.

**EX-17 · AS3 has no path.**
- `DoABC`/`DoABC2` tags are classified as `action` and handled like AS1/2 frame scripts.
- AS3 content is compiled ABC bytecode for a different virtual machine (AVM2), with classes, packages, the event model and the display-object API. It cannot be executed by anything shaped like the current runtime.

**EX-18 · The inline bytecode fallback produces non-runnable, sometimes wrong, code.**
When no `.as` file is found, `actionDetail` → `decodeActionBytes` turns the raw `actionBytes` into pseudo-source:

| Original ActionScript | Bytes | Decoder output |
|---|---|---|
| `gotoAndStop(5);` | `81 02 00 04 00 07 00` | `gotoAndPlay(4); stop();`: wrong verb and a 0-based frame |
| `if (!a) { play(); }` | `96 … 1C 12 9D 02 00 01 00 06 00` | `// Not`, `// gotoFrame2();`, `play();`, `getVariable("a");`: **the condition is gone and `play()` becomes unconditional** |
| `score = 1;` (constant pool) | `88 … 96 02 00 08 00 96 … 1D` | `constant8(0) = 1;`: the variable name is lost |
| `trace(1.5);` | `96 09 00 06 00 00 F8 3F 00 00 00 00 26` | `trace(5.30239915e-315);` |

Specific decoder errors:
- `0x99` is `ActionJump`, but it is labelled `BranchIfTrue` and emitted as a comment.
- `0x9D` is `ActionIf`, but it is labelled `GotoFrame2` and emitted as a comment.
- `0x9E` is `ActionCall`, but it is labelled `Try`.
- `0x8E` (`DefineFunction2`) is missing, so function bodies are decoded inline as top-level statements.
- Constant-pool pushes (types 8/9) are not resolved against `ConstantPool`.

Stack-to-source decompilation without control-flow reconstruction cannot produce executable code. It is fine as a listing, but it cannot drive a game.

**EX-19 · Doubles are misread.** SWF stores a push-double as two little-endian 32-bit words with the high word first. The decoder reads eight bytes as one little-endian float64, so `1.5` becomes `5.3e-315`.

**EX-20 · `engine/decompiler.ts` has a wrong opcode table.** It maps `0x06 Play` to "Less", `0x07 Stop` to "Greater", `0x04 NextFrame` to "Divide", `0x3D CallFunction` to "Add" and `0x8E DefineFunction2` to "Goto". It is not imported anywhere, but it looks like the engine's decoder and would mislead anyone who builds on it.

### 5.4 The display model (`lib/render.ts`)

**EX-21 · Nested clips cannot play on their own.**
- `render()` and `flatten()` are pure functions of `(timeline, frame)`. Every nested sprite's frame is computed as `localFrameOf(item, parentFrame, count) = (parentFrame − item.startFrame) mod count`.
- This works well for previewing, which is why the Workbench uses it, but it rules out Flash semantics:
  - **With the main timeline stopped on frame 1**, which is how almost every game is built, the parent frame is constant, so **every nested clip freezes.** The probe shows the hero sprite's frame never changes.
  - A clip's own `stop()` cannot hold it: the probe shows the fixture sprite playing straight through its frame-13 `stop()` as the root advances (frames 12 → 13 → 14).
  - There is no per-instance state: no scripted `_x`, `_y` or `_alpha` overrides and no `_visible`. Nothing created by `attachMovie` can appear, because the display list is fixed by the parser snapshot (`frame.display`).

**EX-22 · Buttons are always drawn in their Up state.** The renderer hard-codes button frame 0, so there is no Over or Down state and no hit area.

### 5.5 Everything else

**EX-26 · No audio.** `StartSound` events are parsed, but nothing decodes or plays them.

**EX-23 · Export TS cannot compile.** It emits `new FrameClock(…)` and `createFlashScope(clock.bridge)` with no imports; `FrameClock` has no `bridge` property. The ActionScript is included only as `// ActionScript:` comments inside a `switch`. It is a commented outline, not a transpiled runtime.

**EX-24 · Misleading and dead code.** This includes the orchestrator helpers in `render.ts`, the unused `engine/decompiler.ts`, the `types.ts` comments describing modules that don't exist, and `REPEAT_METRICS.md` calling the engine complete. Together they make the Execute feature look much further along than it is, which is likely how the "transpiled ActionScript" belief arose.

---

## 6. Why the quick fixes alone won't make it playable

Fixing EX-01 and EX-03 through EX-07 takes about an hour. After that, pressing **Play** would show the main timeline animating, with nested clips following it. **That is the Workbench preview in a different tab, not a game.** Its first `stop()` would be ignored (no execution), and a stop on frame 1 couldn't hold nested clips anyway (EX-21). Nothing would respond to input, and buttons would do nothing.

Actually playing the game requires the four layers in §1: execution, a stateful display list, an event loop with input, and button and clip handlers.

---

## 7. Paths forward

Which path fits depends on something this audit cannot see: **whether the game is ActionScript 1/2 (`DoAction` tags, AVM1) or ActionScript 3 (`DoABC` tags, AVM2).** The dump's XML answers this. If it contains `DoABC`/`DoABC2Tag`, the game is AS3.

### Option A: embed a Flash emulator (Ruffle)
- Ruffle is an open-source Flash Player emulator in Rust/WebAssembly with a web build. It supports AS1, 2 and 3 "pretty well, but … not finished" ([Ruffle README](https://github.com/ruffle-rs/ruffle)). Reported coverage is about 99% of the AS1/2 language and 90% of the AS3 language, with roughly 82% of the APIs ([Wikipedia](https://en.wikipedia.org/wiki/Ruffle_(software))).
- **Input:** Ruffle plays a `.swf`. The app loads JPEXS XML dumps, but FFDec can import XML back into a SWF (its feature list includes "SWF to XML export and import again" ([FFDec build.properties](https://github.com/jindrapetrik/jpexs-decompiler/blob/master/build.properties))). The original SWF, if you have it, is the simplest input.
- **Pros:** highest fidelity; handles AS1/2/3, sound and input; a small amount of integration work.
- **Cons:** the game runs inside Ruffle rather than the app's own engine, and edits made in the Workbench (labels, actors) don't affect playback unless they are written back into a SWF.

### Option B: a real AVM1 runtime inside the app (AS1/2 games only)
- **Execute the bytecode, not the decompiled text.**
  - The `actionBytes` in the XML are the ground truth, and interpreting them avoids the ambiguity of decompiling.
  - They do need a correct decoder, which means rewriting `decodeActionBytes` (EX-18–20).
- **Work required:**
  1. A correct AVM1 decoder and a stack-machine interpreter: constant pool, registers, `DefineFunction`/`DefineFunction2`, branches, `With`, `Try`, `Enumerate`, `InitObject`/`InitArray`, `NewObject`/`NewMethod`, and SWF6-and-earlier case-insensitivity.
  2. A **stateful display list** of `MovieClip` instances, each with its own playhead, timeline execution (place, move and remove ops), and scriptable properties. The renderer would draw these instances instead of `(timeline, frame)`.
  3. The Flash frame loop:
     - enter frame, then run `DoInitAction` → frame scripts → `onClipEvent(enterFrame)`/`onEnterFrame`, then render;
     - `gotoAndX` semantics and label resolution.
  4. The parser capturing `BUTTONCONDACTION` and `CLIPACTIONRECORD` bytecode (EX-15, EX-16); button state machine and hit testing.
  5. Built-ins: `Key`, `Mouse`, `Stage`, `Math`, `String`, `Array`, `Object`, `Date`, `setInterval`, `Sound`, `MovieClip.prototype`, `Object.registerClass` and `#initclip`.
  6. Keyboard, mouse and audio wiring.
- **Pros:** runs inside the app's engine, so Workbench data such as actors and labels can plug in; everything is inspectable in the app.
- **Cons:** a substantial project. Realistically it is several focused milestones (interpreter → display list → events/input → built-ins/audio). Each is testable with the probe approach above, but game-specific API gaps will keep appearing.

### Option C: transpile FFDec's decompiled AS2 text to JavaScript
- **Not recommended as the primary path.**
- **It depends on decompiled text, which can be lossy.** It also only exists for scripts FFDec exported: button and clip handlers need EX-25.
- **It needs a real AS2 parser**, covering classes, `on(...)` blocks, `onClipEvent`, `tellTarget` and slash syntax.
- **It still needs everything in Option B's steps 2–6.** Only the interpreter is replaced, and it is replaced with something harder to make correct.

### Recommendation
1. **Decide between Option A and Option B based on the goal.**
   - If the goal is to play the game faithfully in the app soon, use **Option A** (Ruffle), fed with the original SWF or an XML → SWF rebuild.
   - If the goal is the app's own engine driving the extracted content, which is what the Execute tab and the Game Engine workspace were designed for, use **Option B**, and only for AS1/2 games.
2. **Whichever option is chosen:**
   - Fix the shell bugs (EX-01, EX-03–07).
   - Delete or correct the misleading code (EX-20, EX-24).
   - Make **Export TS** honest, or remove it (EX-23).
   - Turn the probes in `audits/probes/` into regression tests as each layer lands.

---

## 8. Appendix: probe results

```
 ✓ EX-01 nothing is ever drawn — SwfRuntime.render() is never called
 ✓ EX-02 no frame script is executed — the console stays empty while frames with stop()/actions pass
 ✓ EX-03 the frame counter never moves while playing
 ✓ EX-04 the first click on ▶ Play pauses
 ✓ EX-05 Step does nothing
 ✓ EX-06 Reset leaves runtime "playing" but the UI "paused"
 ✓ EX-07 resizing recreates the runtime, discarding game state
 ✓ EX-08 no keyboard or mouse input reaches the runtime
 ✓ EX-09 there is no transpiler/interpreter — nothing in src evaluates ActionScript
 ✓ EX-10 timeline control calls only log
 ✓ EX-11 _root, _parent and _global resolve to the number 0
 ✓ EX-12 variables cannot be stored
 ✓ EX-13 any API not hard-coded throws "not a function"
 ✓ EX-14 hitTest always false; _x/_y always 0; _currentframe not a number
 ✓ EX-15 button handlers (BUTTONCONDACTION) are dropped
 ✓ EX-16 clip handlers (clipActions) are dropped
 ✓ EX-17 AS3 (DoABC) classified as an ordinary frame action
 ✓ EX-18 inline bytecode fallback: branches → comments, GotoFrame off-by-one, constants lost
 ✓ EX-19 SWF doubles decoded with the wrong byte order
 ✓ EX-20 engine/decompiler.ts opcode table is wrong
 ✓ EX-21 nested clips cannot play on their own
 ✓ EX-22 buttons are always drawn in their Up state
 ✓ EX-23 Export TS references undeclared symbols and ships AS as comments
 Tests  23 passed (23)
```
