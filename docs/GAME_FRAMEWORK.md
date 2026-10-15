# The game framework — what a Flash game becomes when the timeline goes away

> 2026‑10‑14 · `src/game-framework/` · companion to `docs/audits/archive/FLASH_TO_ACTOR_DEEP_DIVE.md`

## 1. Two outputs, on purpose

A SWF can be transcribed two ways, and both are wanted:

| | **Tier 1 — 1:1** | **Tier 2 — clean** |
|---|---|---|
| What it is | the movie, as written | the game, restructured |
| Where it lives | `transcom/transpiler/` → `src/engine/flash/*` | `src/game-framework/*` |
| Vocabulary | `MovieClip`, `gotoAndPlay`, `addEventListener('enterFrame')`, timelines, `_root` | actors, materials, behaviours, signals, systems |
| Why | fidelity: it *is* the Flash semantics, so behaviour is preserved exactly as the specifications define it | ownership: one place per concern, no display list, no frame scripts, no globals |
| Use | running a shipped SWF | porting a game, extending it, testing it without a timeline |

Tier 1 already works: pinball (435 classes) and tiles (35) boot through `FlashPlayer`
with the document class, the timeline and the library — 11 of pinball's 3,690 method
bodies are refused, each one named with its byte offset, and 0. Tier 2 is this
framework, built and tested in the same window.

`src/runtime/as2/actor.ts` is the older, in-host bridge for AVM1: it hands a live
`AS2Clip` three ports (sprite / animation / graphics) so behaviour can move out of a
timeline frame by frame without changing the host. The framework below is the
standalone target that needs no host at all — the AVM1 and AVM2 transcriptions both
aim at it.

## 2. The pieces

```
src/game-framework/
  World.ts                 one clock, one set of systems, one actor set
  core/
    Actor.ts               a body, a look, behaviours; the unit a MovieClip becomes
    Material.ts            a timeline's frames, playable, with no timeline
    Script.ts              the actor's named behaviours and what asks for them
    Signal.ts              the only way anything tells anything else
  systems/
    PhysicsSystem.ts       motion, gravity, ground, bounds
    InputSystem.ts         named actions, from a keyboard or from anywhere else
    CollisionSystem.ts     overlaps → `hit` / `hit:<label>` signals
    AnimationSystem.ts     advances materials, selects the state's look
    SpawnSystem.ts         factories: where actors come from
    CameraSystem.ts        what the player sees (follow, clamp, shake)
    AudioSystem.ts         named cues and loops behind a `Mixer`
    RenderSystem.ts        draws actors in depth order through a `Renderer`
  examples/pinballTable.ts a whole table: ball, bumpers, flippers, scoreboard
  __tests__/               headless proof: 11 tests, real behaviours, fixed dt
```

Contracts, in one line each:

* **Actor** — `x/y`, a `body`, a `material`, `script`, and a `signals` hub. It never
  reads input, never animates itself, never moves itself and never touches another actor.
* **Material** — frames with holds, `play()`, `stop()`, `goto(frame)`, `advance(dt)`,
  `onComplete`. `gotoAndStop("kick")` is `gotoFrame('kick', 1)`.
* **Script** — `behaviour(name, run, { on: ['hit:bumper'] })`; `attach(actor)` is the
  only place a behaviour meets the world; `dispose()` unhooks everything.
* **Signal / Signals** — typed channels; a throwing listener is reported and does not
  stop the others. `World.signals` is the hub, so anything can subscribe before
  anything runs.
* **World** — `add(actor, ...labels)`, `create(kind, …)`, `step(dt)`, `start(target)`.
  One step is: input → behaviours → physics → collisions → animation → camera → draw.
  `frameRate` fixes the step; `dt` is seconds, never frames.

## 3. The mapping (Flash → framework)

| Flash | Framework | Note |
|---|---|---|
| `MovieClip` subclass | `Actor` subclass | one class per logical entity |
| timeline frames / labels | `Material` | frames are data (`art`), labels are state names |
| frame script (`stop()`, `gotoAndPlay("kick")`) | `Script` behaviour + `Actor.play/gotoFrame` | the code that ran *because* a frame arrived is now a named behaviour |
| `addEventListener('enterFrame', …)` | a system step, or a `Script` behaviour named `enterFrame` | the one callback that has to stay per-frame |
| custom `Event` + `dispatchEvent` | `Signal` | `World.signals` is the hub |
| `attachMovie`, `new Foo()`, `duplicateMovieClip` | `SpawnSystem.register(kind, factory)` + `create` | factories name their kind |
| `hitTest` / `hitTestObject` | `CollisionSystem` + `hit:<label>` | labels are the instance name or the class name |
| `_x += vx`, `_y += vy`, gravity in a frame script | `PhysicsSystem` and the actor's `body` | `vx/vy` are per second, not per frame |
| `play()`, `stop()`, `gotoAndStop()` | `Actor.play/stop/gotoFrame` | same names, same meaning, no timeline |
| `scrollRect` / camera clip | `CameraSystem` | `toScreen` is what `localToGlobal` computed |
| `Sound` / `SoundChannel` / library ids | `AudioSystem` + named cues | `SilentMixer` runs headless |
| `onRelease`, `stage.addEventListener(KeyboardEvent)` | `InputSystem.bind(action, keys)` | actors read `actor.input`, never the keyboard |
| `setInterval`, `Timer`, frame counting | system `dt` | one clock, in seconds |
| `parent` / `_root` globals, `PinballCore.__Root` | signals, or a service the systems own | the globals are replaced by the wiring, in one place |
| `_visible`, `_alpha` | `visible`, renderer state | the renderer decides pixels |
| frame labels `idle/walk/jump` | `animations: { idle, walk, jump, fall }` | `selectAnimation()` picks by state |

## 4. The same class, both ways

Lifted 1:1 from the pinball movie (`com/gaiaonline/games/gPinball/compound_elements/KickBumper.ts`):

```ts
export class KickBumper extends MovieClip {
  public constructor() {
    super();
    this.__Location = "table";
    this.__SndEffect = "none";
    this.__SID = 13;
    this.addEventListener("enterFrame", this.init, false, 0, true);
  }
  public init(param1: Event): void {
    this.removeEventListener("enterFrame", this.init);
    this.kickbase_mc.init(1, 2, this.__Location, this.bumperHit, 0);
  }
  public bumperHit(...rest: any[]): void {
    if (this.__SndEffect != "none") PinballCore.__Root.playSound(this.__SndEffect);
    PinballCore.__Root.__HitQueue.push(this.__SID);
    this.gotoAndPlay("kick");
  }
  public kickbase_mc: any;
  public __SID: any = 13;
}
```

The same thing as an actor (`src/game-framework/examples/pinballTable.ts`):

```ts
export class Bumper extends Actor {
  constructor(id, x, y, signals, materials, points, cue) {
    super({ id, x, y, depth: 5, body: { width: 34, height: 34, gravity: 0 } }, 'Bumper', signals, materials);
    this.play('bumper');
    signals.define<HitEvent>('hit:bumper').on((hit) => {
      if (hit.actor !== this || hit.other.kind !== 'Ball') return;
      this.kick(hit.other);
    });
  }
  private kick(ball: Actor): void {
    const away = normalize(ball.x - this.x, ball.y - this.y);
    ball.vx = away.x * 320 + ball.vx * 0.2;
    ball.vy = away.y * 320 + ball.vy * 0.2 - 60;
    this.play('bumper.kick');                       // was gotoAndPlay("kick")
    this.material!.onComplete = () => this.play('bumper');
    this.signal<void>(this.cue).emit();             // was playSound(__SndEffect)
    this.signal<ScoreEvent>('scored').emit({ id: this.id, points: this.points, at: { x: this.x, y: this.y } });
  }
}
```

What changed, and why it is the same game:

* `addEventListener('enterFrame', init)` is gone: the table wires the bumper to the
  one signal it cares about (`hit:bumper`) instead of polling every frame. `init` was
  only *looking* for the hit.
* `PinballCore.__Root` (a static root reference used as a message bus) becomes two
  signals — `sfx.bumper` and `scored` — so the scoreboard, the mixer and the history
  subscribe independently, and nothing depends on the root being loaded.
* `gotoAndPlay("kick")` becomes `play('bumper.kick')` over a material that ends on a
  known frame, so "when the kick is over" is an `onComplete` instead of a frame number.
* `__SID`/`__Location`/`__SndEffect` stay as data with names: `id`/`points`/`cue`.

## 5. What a Tier‑2 transcription has to emit

The lifter already produces an AST per class and per method (`transcom/transpiler/avm2/lift.ts`)
and prints Tier‑1 modules (`transcom/transpiler/avm2/emit.ts`). The Tier‑2 printer is the same
AST with a different vocabulary, and these are the rewrites it needs:

1. `extends MovieClip` → `extends Actor`; display-list placement (`x`, `y`, `depth`,
   `parent`) → a spawn option plus `World.add`.
2. Frame scripts → named behaviours. **Determine the trigger from where the frame code
   is called**: `enterFrame` stays `enterFrame`; a frame that follows an animation's
   last frame is an `onComplete`; a frame reached from `gotoAndPlay("hit")` is the
   `hit` behaviour.
3. Timeline frame labels → `Material`s, labels as state names (`animations: {idle, walk,
   jump, fall}`); `FrameLabel` ranges split one timeline into materials.
4. `_x`/`_y` writes that are motion → a velocity write; writes to `this.x` from a
   `setInterval`/frame loop → the same, with the frame rate divided out.
5. Custom events and root globals used as message buses → signals with a domain name
   (`hit:bumper`, `scored`, `drained`); the root becomes the wiring in the table/main.
6. Sound ids → cue names; `SoundChannel` handles → `AudioSystem.loop/stop`.
7. Anything the transpiler cannot classify stays a Tier‑1 module and is *called* from
   the actor — refusing beats inventing.

## 6. Running it

```ts
const table = new PinballTable({ width: 300, height: 480, renderer: new CanvasRenderer(context) });
table.world.input.bind('action', ' ', 'ArrowUp', 'z');
table.launch();
table.world.start(canvas);        // requestAnimationFrame, fixed 1/60 steps
```

Headless, deterministic — the test file is the example:

```ts
const table = new PinballTable();
const ball = table.launch();
for (let i = 0; i < 240; i += 1) table.step(1 / 60);
expect(table.history.length).toBeGreaterThan(0);       // it hit a bumper
expect(table.scoreboard.score).toBe(100 * table.history.length);
```

`npx vitest run src/game-framework` → 11 passed. The tests cover: the launch arc
reaching a bumper and scoring through the signal, the one-shot kick material returning
to rest, a flipper kicking only while `action` is down, the drain removing a ball from
every system, multiball draining one ball without disturbing the other, materials
advancing on the system clock, the camera following and the renderer drawing in depth
order, a script honouring and then dropping its signals, material `goto/play/onComplete`,
a throwing listener not stopping the others, and input driven without a keyboard.

## 7. Honest gaps

* **Art.** A material's `art` is `unknown` on purpose: the tier‑2 printer will put a
  texture/atlas id there. Nothing in the framework draws real sprite art yet — the
  canvas renderer fills boxes for actors whose art it has no image for.
* **UI.** Buttons, text fields and the display list are not modelled (Tier 1 has them
  in `flash.*`); a tier‑2 game needs a `UiSystem` before ports like `fl.controls` land.
* **The printer itself.** Section 5 is a design, not code: today the pipeline emits
  Tier 1 for AVM2 and a proposal artifact for AVM1 (`transcom/transpiler/as2/project.ts`). The
  next step is a tier‑2 emitter that consumes the same lifted AST.
* **AVM1.** The framework is AVM2‑shaped (classes, signals, materials); the AVM1 path
  keeps its in-host bridge (`src/runtime/as2/actor.ts`) until both tiers converge here.
