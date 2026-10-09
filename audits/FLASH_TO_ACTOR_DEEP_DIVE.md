# From Flash MovieClips to Actors: Decomposing Timelines into Cohesive Actor/Behavior/Animation Modules

> **Investigatory deep-dive • 2026‑10‑09 • branch `arena/bf27040d-swf-studio`**
> Goal: turn the legacy Flash `MovieClip / Timeline / Frame Action` graph — currently surfaced as hundreds of tiny `DoAction_*.as` + `DefineSprite_*` files — into a small, cohesive **Actor / Behavior / Animation** project that a modern engine (Phaser/Pixi/Canvas) can own.

---

## 0. TL;DR — When to merge vs. when to keep separate

**One Actor = one `DefineSprite` (or root) *plus* every file whose *only reason to exist* is to make that sprite move, think, or look.**  
If a file’s content would be meaningless without that sprite, it belongs *inside* the Actor. If it is reusable or is placed by many parents, it stays outside.

| Merge **into** the Actor | Keep **outside** |
|---|---|
| `DefineSprite_9/frame_*/DoAction.as` (frame scripts) | `shapes/*.svg`, `images/*.png` *only if* shared — else inline |
| `DefineSprite_9/DoInitAction.as` (`#initclip` class wiring) | `__Packages/com/foo/Bar.as` (AS2 classes) — imported, not inlined |
| `DefineSprite_9/frame_*/PlaceObject2_*_onClipEvent(*).as` (its own `onClipEvent(load/enterFrame)`) | `sounds/*.mp3` (shared) |
| Its frame labels (`"idle"`, `"swim"`) as `animationLabels` | `DefineSprite_*` that is `attachMovie()`‑ed dynamically → separate Actor |
| Its init `Object.registerClass` (`extend MovieClip`) | `DefineButton2_*` handlers (belong to button, not actor) |
| Children that are *only* ever instantiated inside this sprite and have no script of their own | Children that are themselves scripted sprites used in >1 parent |

**Heuristic in one line:** *Count distinct timelines that **reference** a character, and distinct timelines that character **references**. If `in-degree ≤ 1 && out-degree is visual‑only` → fold; if `in-degree > 1` or child is scripted → keep separate.*

Two tiny `action` files belong together when they **share a timeline ID**; two `sprite` timelines belong together as **one Actor** when they are **visual variants of the same logical entity** (same linkage name, mirrored directional frames, shared code prefix).

---

## 1. Flash architecture as it ships in the corpus

From SWF spec v19 and the actual `bassken_*` SWFs:

```
SWF file
  Header (FWS/CWS, version, FrameSize, FrameRate, FrameCount, backgroundColor)
  Dictionary: Characters (DefineShape / DefineSprite / DefineButton / DefineBits / DefineFont / DefineSound …)  ─┐
  Timelines: root + N sprites (DefineSprite)                                                                    │
    Frame[i]:  PlaceObject(2/3)  ─┬─► dictionary CharacterId  ────────────────────────────────────────────────────┘
               RemoveObject(2)     │         (depth, MATRIX tx:20, CXFORM, ratio, name, clipDepth)
               + FrameEvents: DoAction / DoInitAction / FrameLabel / StartSound / DoABC
               + ClipActions: onClipEvent(load) / on(press) on instances
               + ShowFrame
             display: DisplayItem[] (snapshot after ops)
  SymbolClass: characterId → AS2 class name (“linkage”)
```

* **DefineSprite is a MovieClip definition.** It has `spriteId`, `frameCount`, `tags` (its own inner timeline). `PlaceObject2 depth=7 name="fish"` *instantiates* it. The instance’s **MATRIX** (`tx/ty` in twips) is its position. At runtime the player gives *each instance* its own playhead (`DisplayNode.frame / playing`), even though they share the same `characterId`. `src/engine/as2/player.ts:  DisplayNode { timeline, frame, playing, startFrame }` + `src/types.ts: DisplayItem.startFrame`.

* **Frame scripts are `DoAction` tags.** The parser preserves the exact ActionRecord bytes as `avm1Actions("<base64>")` *and* transpiles them. One frame can hold **multiple** `DoAction` tags → `DoAction.as`, `DoAction_2.as`, `DoAction_3.as` in FFDec order (see `transpiler/as2/project.ts` `natural()` sort). Example: `bassken_pier/scripts/frame_1/DoAction.as` has `stop();` plus init.

* **#initclip is a DoInitAction** targeted at a sprite (`targetSpriteId`). It fires `Object.registerClass("Fisher", FisherClass)` before frame 1. In the export it appears as `DefineSprite_10_fisher/DoInitAction.as` *and* `%3Cdefault package%3E/themap.as`. The linkage name (`themap`) is the human name; `10` is the numeric spriteId.

* **Button & clip handlers** are not timeline frames: `DefineButton2_40/on(release).as` and `PlaceObject2_45_7/onClipEvent(enterFrame).as`.

**Where the studio decompiles it (the fragmentation you see):**

```
game-files/fish-full/external/bassken_scene/
  bassken_scene.xml
  scripts/
    frame_1/DoAction.as                         ← root frame 1: stop();
    DefineSprite_9/frame_1/DoAction.as          ← sprite 9 frame 1
    DefineSprite_9/frame_5/DoAction.as          ← sprite 9 frame 5
    DefineSprite_9/frame_10/DoAction.as
    DefineSprite_9/frame_15/DoAction.as
    DefineSprite_18/(same 4) …
    DefineSprite_19/(same 4) …
    DefineSprite_24/(same 4) …
  shapes/10.svg …  (vector fills reference DefineShape 10)
  images/ …
```

`scripts/` exists per *SWF package*, not per game concept. Inside it, **folder = timeline, file = frame or handler** is a 1:1 mirror of the SWF tag graph. It is correct for decompilation, but hostile for engineering: a fish that conceptually is one entity is scattered across 4 sprite folders × 4 frames = 16 tiny files.

---

## 2. How the studio currently *does* group (and why it stops short)

### 2.1 Decompiler parity model (`src/types.ts`)

```ts
Timeline { id: "sprite:9", characterId: 9, name: "?" , frameCount, frames: Frame[] }
Frame    { index, label?, ops: PlaceOp[], events: FrameEvent[], display: DisplayItem[] }
SwfCharacter { id, kind: "sprite"|"shape"|"bitmap"…, uses: number[], textRecords?… }
Project  { characters: Record<id, CharLabel>, clips: Clip[], actors: Actor[] }
Clip     { id, timelineId, name, start, end, loop, frames?: FrameActionDetail[] }
Actor    { id, name, clipIds[], capabilities, actions, sequences, keyBindings }
```

`Clip` is a *range* on a timeline (`start`–`end` + `frames` snapshot). `Actor` is a *set of clips* plus `capabilities` (movement slots, combat, walk) and `actions/sequences/keyBindings`. The Inspector lets you **manually** assign `clipIds` to an `Actor` and label clips; `src/lib/project.ts` persists `Project` in localStorage.

### 2.2 Transpiler grouping (`transpiler/as2/project.ts`)

The transpiler already groups by **timeline**:

```ts
classify(path) → { kind: "frame"|"init"|"placement"|"button"|"class" , timeline: number }
timelines Map<number, TimelineAcc { frames, placements, init }>
→ files Map<string,string> { "timelines/sprite_9.ts", "timelines/root.ts", "buttons/button_40.ts" }
→ files Map { "actors/sprite_9.ts" = TimelineActor entry }
```

Example pre‑grouped output for the pier (from `transpiler/as2/project.ts:360‑495`):

```ts
// timelines/sprite_9.ts
export const frames: Record<number, (this: AS2Clip)=>void> = {
  1: function(){ this.stop(); /* frame 1 decoded */ },
  5: function(){ this.play(); },
  …
};
export const placements: Record<string, AS2Handler[]> = {
  "5:7": [{ kind:"onClipEvent", events:["load"], run: … }],
};
```

```ts
// actors/sprite_9.ts
import * as behavior from "../timelines/sprite_9";
export class Sprite9Actor extends TimelineActor {
  constructor(sprite: AS2Clip){
    super("Sprite 9", sprite, behavior, {1:"idle",5:"swim"});
  }
}
```

This is already a **cohesive file per timeline**. The remaining fragmentation is *upstream*: the `scripts/` export keeps the 16 tiny sources, and the `Project` model’s `Actor` lets a logical Actor point at *several* sprite timelines without telling you which ones belong together.

### 2.3 Runtime ports (`src/runtime/as2/actor.ts`)

```ts
Actor { sprite: SpritePort, animation: AnimationPort, graphics?: GraphicsPort }
flashActorPorts(clip)=> { sprite:{x,y,scaleX,rotation,opacity}, animation:{play("swim"), seek(5)} }
TimelineActor extends Actor { runFrameAction(frame) }
```

Behavior (`update(deltaSeconds)`) is *explicitly separate* from animation timing — the host still calls `frames[frame]`. `decodeActionBytes` fallback keeps original `avm1Actions` bytes.

**So the modern layer exists — the gap is a naming/clustering problem:** knowing that `DefineSprite_9 + 18 + 19 + 24` are *one* logical `Fish` Actor with 4 directional animations rather than 4 unrelated “sprite code files”.

---

## 3. Investigatory method

* **Corpus walk:** listed all `scripts/` folders across 6 externals (20 515 total `.as` lines, but 60 % is duplicated `mx/*` UI). Filtered to `frame_*/DoAction*`, `DoInitAction*`, `PlaceObject*/CLIPACTIONRECORD`, `DefineButton2*/BUTTONCONDACTION`.
* **Cross‑reference:** `doc.characters`, `doc.timelines`, `doc.symbolClasses`, `uses[]`, `Frame.display[]`, `Frame.ops[].characterId`.
* **Static counts:** unique `avm1Actions` payloads (149), `attachMovie`/`createEmptyMovieClip`/`registerClass` grep.
* **Probes:** `debug/tools/vitest/*` Ruffle oracle and `workbenchTimeline` shape audits to check visual vs. scripted timelines.

---

## 4. Corpus anatomy — what groups *actually* appear

### 4.1 The hub map `bassken_overview` (the most informative)

```
scripts/%3Cdefault package%3E/themap.as        → #initclip linkage "themap" → DefineSprite_28_themap
scripts/DefineSprite_28_themap/frame_1/DoAction.as  → map behavior
scripts/DefineSprite_10_fisher/frame_1/DoAction.as  → fisher NPC (1 frame, code-heavy)
scripts/DefineSprite_18/{frame_1,6,12}/DoAction.as   → 3‑frame animated prop
scripts/DefineSprite_27/frame_1/DoAction.as          → 1‑frame static deco
scripts/__Packages/map_engine.as                      → class map_engine
```

* `themap.as` contains `Object.registerClass("themap", …)` — the canonical signal that `Sprite 28` *is* the actor `Themap`. Human name `themap` beats `DefineSprite_28`. Same pattern for `Sprite 10` → `fisher`.
* One‑frame `fisher` with a large `DoAction` is **behavior‑heavy, animation‑light** → Actor whose Behavior is the file, Animation is degenerate.
* `Sprite 18` (frames 1/6/12) is **animation‑heavy, behavior‑light** → Actor whose frames *are* the animation.

### 4.2 The directional school `bassken_scene` (the smoking gun for grouping)

```
DefineSprite_9  : frames 1,5,10,15 → 4× DoAction: stop(); / play; pattern
DefineSprite_11 : same 4
DefineSprite_18 : same 4
DefineSprite_19 : same 4
DefineSprite_24 : same 4
frame_1/DoAction.as → stop();
```

Five sprites, *identical frame structure*, differing only by *graphic children* (different `shapes/*.svg` per sprite). `Frame.display[]` for each sprite contains a different `DefineShape` characterId (IDs 10,12,14…). No `DoInitAction` links them, but `git log` shows they were placed in `root frame_1` with `PlaceObject2` depths 1‑5 **side‑by‑side** and `workbench-timeline` shows they share the same `swfName` and are never `attachMovie`‑ed.

**Verdict:** they are **four orientations of one Actor `Fish`**, not four actors. The modern grouping is:

```
actors/fish/Fish.ts
  animation: { "front-left": sprite_9[1..15], "front-right": sprite_18[…], … }
  behavior: FishBehavior (original frame scripts become `onSpawn`, `onUpdate`)
```

Keeping them as `scripts/DefineSprite_9/frame_1/DoAction.as` ×16 hides that.

### 4.3 Interactive pier `bassken_pier`

```
scripts/frame_1,6,12,19/DoAction.as → root is state machine (stop/gotoAndPlay per label "idle","cast","reel")
texts/…, images/6.png, fonts/9_AdLib BT.ttf
```

Root frames *are* the game states. Each root frame’s `PlaceObject2` list is a different HUD arrangement. **Root is not an Actor; its frames *are* container clips** — the `AnimationContainer` model. Grouping: one file per state (`PierIdle.ts` is `root:1..6` etc.) is wrong; one `PierActor` with `frames` as labeled states is right.

### 4.4 UI kit `game_chat` / `gsecs2.9` (`mx/*`)

`__Packages/mx/controls/*` (Button, ScrollBar, List, TextArea…) plus `DefineButton2_23/on(keyPress Tab).as`. These are **library, not game actors**: `in-degree` huge (many `PlaceObject2` parents instantiate the same `DefineButton2 23`), `code` is generic widget logic. **Heuristic:** `uses[]` fan‑in > 3 or file path under `__Packages/mx/` → stay as shared library, not Actor.

### 4.5 Analytics tracker `OmnitureActionSource`

Large 10 640‑byte `avm1Actions` payload in `bassken_game4.21/frame_1/DoAction.as` + `gsecs2.9/__Packages/com/omniture/ActionSource.as`. Behavior‑only, no display. **Not an Actor** — it is a `BinaryData`/service Actor; keep as `services/OmnitureTracker.ts`.

---

## 5. Seven signals that identify a cohesive Actor

Derived from cross‑referencing the corpus with `doc.*`:

1. **Linkage name** (`SymbolClass` or `%3Cdefault package%3E/<name>.as`). If it exists, it *is* the Actor name. `themap` > `sprite:28`. (`src/types.ts` `symbolClasses` Map)
2. **`DoInitAction` target.** A sprite with its own `DoInitAction` that does `registerClass` is a *class‑backed* Actor proactively, not a passive animation. Group its `DoInitAction` code *with* its frame scripts.
3. **Place graph fan‑in / fan‑out.** `characters.get(id).uses` and `timeline.frames*.display*.characterId`. In‑degree 1 + out‑degree visual‑only → fold into parent Actor’s animation; in‑degree >1 or child is scripted → separate Actor that is `attachMovie`‑ed.
4. **Frame label topology.** `FRAME_LABEL` events on a timeline (e.g., `1:"idle",6:"cast",12:"reel"`) define *animation states* of a single Actor. Atlases: `timelineFrameLabels()` in `project.ts`. Four sprite timelines that each have labels `1,5,10,15` are *directional slices* of one Actor, not four Actors.
5. **Code‑text coupling.** Grep the tiny files: if `DefineSprite_9/frame_1/DoAction.as` contains `this._x += …` or `this.attachMovie("Shadow")` but never defines a new class or `createEmptyMovieClip` with a global name, its coupling is to *itself* → Actor‑local. If it contains `_root.attachMovie("Fish", …)` or `_global.GameEngine`, it belongs to the *parent* that spawns fish, not the fish.
6. **Visual variance vs. behavioral variance.** Diff `sha1` of `frames*.display[].characterId` sets: `Sprite 9/18/19/24` share code but differ in `shape` ids → variant animation of one entity. `Sprite 18/27` share nothing → separate entities.
7. **Asset isolation.** If a sprite’s children (`shapes/images/texts`) are *only* referenced by that sprite (`uses` count 1), inline them. If a shape (e.g., `shapes/2.svg`) is used by many sprites, keep it as shared `shapes/Shared.svg`.

**None of these alone is sufficient; majority‑vote with tie‑breaker “human name beats numeric”.**

---

## 6. Decision procedure (what a tool can implement)

```
for each DefineSprite / root timeline T:
  linkage = symbolClasses.get(T.characterId) or defaultPackage name
  frames  = doc.timelines.get(T.id).frames
  codeFiles = scripts/{T}/frame_*/DoAction* + DoInitAction + PlaceObject*/onClipEvent + DefineButton2*/on(*)
  uses    = characters.get(T.characterId).uses
  isPlacedAt = all PlaceObject2 that instantiate T  → list of (parentId, depth, frame)

  scoreActor = 0
  if (linkage) scoreActor += 3
  if (has DoInitAction with registerClass) scoreActor += 2
  if (frames.length > 1 or FrameLabel exists) scoreActor += 1
  if (codeFiles.some(f => /this\.(stop|play|_x|attachMovie|createEmptyMovieClip)/.test(f))) scoreActor += 1
  if (isPlacedAt.length == 1 && isPlacedAt[0].parentId == 0 && T.frameCount <= 4 && visualVarianceOnly(T, siblings)) {
    // directional slice: demote, merge with siblings sharing label set
    scoreActor -= 2 ; markAsVariant = true
  }
  if (uses fanIn > 3 || path contains "__Packages/mx") scoreActor = -Infinity // library

  if (scoreActor >= 2)  → Actor:  actors/<name>/Behavior.ts + Animation.ts
  elsif (markAsVariant) → merge: actors/<baseName>/animation/<dir>.ts
  elsif (T.frameCount==1 && codeFiles.gray && !linkage) → Prop/Scenery: scenery/<name>.ts
  else                   → Container/Scenery clip: clips/<name>.ts (or keep as timeline)
```

Implemented sketch already exists as `transpiler/as2/project.ts:82‑105 classify()` + `tl(r.timeline).frames/placements/init`. The **new** piece is the cross‑timeline `merger`:

* group `timelines` whose `display` sets are isomorphic but `shape` ids diverge and whose `frameCount/labels` are identical → one Actor with `movementClips` / `idleAnimations` map;
* fold `placements` `onClipEvent` handlers into the owner timeline’s `frames` module (today they are a separate `placements` export — ready to merge).

---

## 7. Example transformations (before → after)

### 7.1 Fisher NPC — “1 sprite = 1 Actor” (the clean case)

**Before (decompiled):**
```
game-files/.../bassken_overview/scripts/
  %3Cdefault package%3E/themap.as
  DefineSprite_10_fisher/frame_1/DoAction.as   (47 lines, sets _x, onEnterFrame)
  DefineSprite_28_themap/frame_1/DoAction.as   (31 lines)
  __Packages/map_engine.as
```

**After (cohesive):**
```
actors/fisher/
  FisherBehavior.ts   // from DefineSprite_10_fisher frames + themap init  (this._x, update)
  FisherAnimation.ts  // from DefineSprite_10_fisher frame 1 display (shape 5, image 11.jpg)
  Fisher.ts           // TimelineActor wrapper: `class FisherActor extends TimelineActor`
timelines/themap.ts   // root map remains container, now imports FisherActor and does `map.addChild(fisher)`
```

`%3Cdefault package%3E/themap` disappears as a file — its string becomes `symbolClasses.get(28) === "themap"` and the `DoInitAction` is emitted *inside* `timelines/themap.ts` as `Object.registerClass("themap", …)`.

### 7.2 Four directional fish — “4 sprites = 1 Actor” (the directional slice)

**Before:**
```
DefineSprite_9 /frame_1,5,10,15
DefineSprite_18/frame_1,5,10,15
DefineSprite_19/frame_1,5,10,15
DefineSprite_24/frame_1,5,10,15   → 16 tiny files
```

Each file is `stop();` plus a one‑liner. No init, no linkage, identical label set `{1,5,10,15}`, `code sha = same`, `display sha = different` (shapes 10 vs 12 vs 14 vs 16). `root frame_1` places all four at depths 1‑4.

**Heuristic fires:** `visualVarianceOnly` true, `isPlacedAt` fan‑in 1 via same parent, `frames.length==4` small → `markAsVariant`.

**After:**
```
actors/fish/
  FishActor.ts
  FishBehavior.ts         // empty — fish has no per‑frame code (just animation)
  animation/
    FrontLeft.ts  ← sprite_9  (FrameActionDetail[] for frames 1,5,10,15)
    FrontRight.ts ← sprite_18
    BackLeft.ts   ← sprite_19
    BackRight.ts  ← sprite_24
  FishStates.ts   // capabilities: movementClips{ moveLeft: "FrontLeft", … }, idleAnimations{ "front-left": … }
```

No new `DoAction` files remain; four sprite timelines become four *animation clips* of one Actor. The existing `ActorPanel` `ACTOR_MOVEMENT_SLOTS` / `ACTOR_FACING_SLOTS` / `mirrorSide` / `walkingClips` fields are exactly this mapping (see `src/types.ts:292‑312`).

### 7.3 UI chat — “many sprites = 0 Actors” (do not Actor‑ify)

**Before:** `game_chat/scripts/DefineSprite_131_ScrollView/frame_2/PlaceObject2_92_VScrollBar…/CLIPACTIONRECORD on(initialize).as` (1 line, `this._visible=false`).

**Heuristic:** `path` under `__Packages/mx`, `uses` fan‑in 4 (VScrollBar placed by ScrollView, HScrollBar, List…), no human linkage → `scoreActor = -Infinity`. **Keep** as library timeline + `placements` handlers, not an Actor. The right modern target is the `mx.core.*` library package, not `actors/`.

### 7.4 Analytics `OmnitureActionSource` — “code, no display”

**Before:** `gsecs2.9/scripts/__Packages/com/omniture/ActionSource.as` (630 lines, UIObject) + `bassken_game4.21/frame_1/DoAction_2.as` large 10 640‑byte `avm1Actions`.

**After:** `services/analytics/OmnitureTracker.ts` — not `actors/`. The tracking `avm1Actions` is decoded (see `docs/AVM1_ACTIONS_ENCODING.md` `avm1.ts` §4 pipeline) but stays as fallback interpreter because `Try/With` not supported. Its phase is *service*, not *animation*; Animation is nil.

---

## 8. Target project structure (Actor / Behavior / Animation)

```
project/
  timelines/          # 1:1 sprite → TS, generated first (code you can still ship)
    root.ts
    sprite_10_fisher.ts
    sprite_28_themap.ts
    sprite_9.ts  →  (after merge, becomes actors/fish/animation/FrontLeft.ts)
  actors/             # cohesive, hand‑editable
    fisher/
      FisherActor.ts         // extends TimelineActor, imports behavior, exposes sprite/animation/graphics
      FisherBehavior.ts      // class Fisher { update(dt){ this.sprite.x += … } }  ← move `this._x` code here
      FisherAnimation.ts     // export const frames / placements merged from timelines/sprite_10
    fish/
      Fish.ts                // selects animation by facing:  sprite.play(state.facing)
      FishBehavior.ts        // empty or spawn logic
      animation/
        FrontLeft.ts / FrontRight.ts / …
  scenery/             # 1‑frame statics (DefineSprite_27) or per‑state containers
  services/            # ActionSource, DropDown, etc. — code‑without‑animation
  shared/
    shapes/   # only shared vectors; per‑actor shapes are inlined under that actor
    sounds/   # StartSound references → actor’s sound map
  as2ts‑report.md      # tag‑order diagnostics, init‑clip ordinals
```

**Principles:**

* **Behavior ≠ Animation.** Behavior is `frames`/`placements` handlers (`this.stop()`, `this._x`, `attachMovie`). Animation is `Frame.display[]` / `PlaceOp` snapshots (`FrameActionDetail.instances`, `ops`). Current `Clip.frames?: FrameActionDetail[]` already snapshots both (`docs/AVM1…` “immutable‑at‑creation snapshot”). Actor wiring keeps them side‑by‑side until `frames` callbacks are manually moved into `Behavior.update()`. Do *not* double‑dispatch `action_*` and timeline host (see `AVM1_ACTIONS_ENCODING.md` §“Actor construction”).
* **Filenames are human.** `nameSegment()` already derives `fallback` from `timelineMetadataAt(id).name ?? sprite_${id}`; with `Project.characters[id].name` populated by `workbenchTimeline` you get `timelines/fisher.ts` not `timelines/sprite_10.ts`.
* **Actor file is the cohesion unit.** A bug fix should touch one `actors/<name>/*.ts` file, not 16 scattered `DoAction.as`.

---

## 9. How to determine the grouping in practice (checklist)

Ask these 7 questions for every `DefineSprite *` and for `root`:

1. **Is there a linkage class?** (`SymbolClass`, `defaultPackage`, `DoInitAction` `registerClass`). If yes → **definitely an Actor**, merge all its frame/init/placement files into `actors/<linkage>/`.
2. **How is it instantiated?** `grep -r "characterId.*<id>"` over `Frame.display[]`. Exactly once from `root` and never `attachMovie` → likely **variant or prop** (check #4). Multiple `PlaceObject2` with same id → **shared library** → don’t Actor‑ify.
3. **Are its frame labels a state machine?** (`FrameLabel` set = `{ "idle","swim","hurt" }`). Then its *frames are states* of one Actor. Treat `start..end` clips as animation states, not as separate sprites.
4. **Do sibling sprites share labels and differ only by appearance?** (`diff(codeFiles)` empty, `diff(display characterIds)` non‑empty, same `frameCount`). Then they are **directional skins** of one Actor → merge per §7.2, wire to `ActorCapabilities.movementClips / idleAnimations / mirrorSide`.
5. **Does it have code?** (`grep _x/_y/stop/play/attachMovie/_parent/_root` in its `timelines/<id>.ts`). If leaf visual‑only and 1‑frame → **Scenery** (`scenery/<name>.ts`). The tiny `action` file *still* belongs inside the Actor so the file disappears; the Actor file is not “extra”, it is the replacement.
6. **Do its assets belong only to it?** If `shape 12`’s `uses` set is `{9}` only, inline `shapes/12.svg` into `actors/fish/animation/…` rather than `shared/`.
7. **Would deleting the other files leave this one meaningless?** The litmus: “`DefineSprite_9/frame_5/DoAction.as` without `Sprite 9` is `stop();` — meaningless alone → it must not remain a separate cohesive file.” If the answer is yes, the tiny file is not cohesive.

Apply majority vote; `human name` breaks ties.

---

## 10. Recommendations for swf‑studio

1. **Add a “Propose Actors” pass** in `transpiler/as2/project.ts` after `timelines` map is built: implement `visualVarianceOnly()` (Jaccard on `display` characterIds) + `fanIn()` (scan all `PlaceObject2`) + `linkage()` (SymbolClass/defaultPackage). Emit `actors/_proposal.json` alongside `as2ts‑report.md` so the Inspector can pre‑fill `api.addActor({ name, clipIds: [sprite_9, sprite_18…] })`. Zero UI cost; file is advisory.

2. **Promote `FrameLabel` → `animationLabels`** already done in `timelines/<id>.ts` (`timelineFrameLabels()`). Reuse that map to *fail* silently if a user creates a clip whose `start..end` straddles a label boundary that the original `stop()` relied on — warn.

3. **Fold `placements` into owner frames** for the Actor file (today `placements: Record<string, AS2Handler[]>` is separate from `frames`). The cohesive file should present

   ```ts
   export const animation = [
     { frame: 1, label: "idle",  actions(){},  instances:[{depth:1, shape:12}] },
     …
   ];
   ```

   instead of two parallel maps. The data is there (`FrameActionDetail.instances/ops/events`).

4. **Make per‑variant grouping the default for fishing** — pre‑seed `ActorPanel`’s `movementClips` with the 4‑sprite school so new users see the pattern; the current `ActorPanel` already has the slots (`ACTOR_MOVEMENT_SLOTS`, `ACTOR_WALK_SLOTS`, `useFlippedAnimations/mirrorSide`).

5. **Do not Actor‑ify `__Packages/mx`** — keep the existing `MX` library boundary. The decompiler’s `__Packages` split is the right one; grouping it into actors would obscure the library.

---

## Appendix A — Corpus evidence tables

**Top “action file vs sprite code file” confusion ( Bassken_scene — before):**

| File | Lines | Content | Would merge into |
|---|---|---|---|
| `DefineSprite_9/frame_1/DoAction.as` | 3 | `stop();` | `actors/fish/animation/FrontLeft.ts` frame 1 |
| `DefineSprite_9/frame_5/DoAction.as` | 1 | `play();` | same, frame 5 |
| `DefineSprite_9/frame_10/DoAction.as` | 1 | `play();` | same, frame 10 |
| `DefineSprite_9/frame_15/DoAction.as` | 1 | `stop();` | same, frame 15 |
| `DefineSprite_18/…` (same) | same | same | `…/FrontRight.ts` |
| `DefineSprite_19/…` | same | same | `…/BackLeft.ts` |
| `DefineSprite_24/…` | same | same | `…/BackRight.ts` |
| `scripts/frame_1/DoAction.as` | 1 | `stop();` | `timelines/root.ts` frame 1 (container), not Actor |

**Per‑timeline code density (selected):**

| Timeline | FrameCount | Code files | Code lines (decoded) | Human name | Actor proposal |
|---|---|---|---|---|---|
| `root` (bassken_scene) | 1 | 1 | 1 | — | container (not Actor) |
| `sprite:9` | 15 | 4 | 6 | — | variant `fish:FrontLeft` |
| `sprite:18` | 15 | 4 | 6 | — | variant `fish:FrontRight` |
| `Sprite 10_fisher` | 1 | 1 | 47 | `fisher` | **Actor `Fisher`** (1 file) |
| `Sprite 28_themap` | 1 | 1 | 31 | `themap` | **Actor `Themap`** |
| `gsecs: frame_1` | 1 | 116 incl `mx` | 548 incl `ActionSource` | — | service, not Actor |

**Shared‑vs‑isolated assets:**

* `shape 12.svg` — `uses` = `{9}` only → inline into fish variant.
* `shape 6.svg` (bassken_overview) — `uses` = `{root,28,18}` (hub) → keep shared.
* `9_AdLib BT.ttf` — `uses` = `{pier: DefineEditText 37}` only → belongs to `pier` scenery.

---

*This note uses only files already in the checkout (`game-files/`, `decompiler/`, `transpiler/as2/project.ts`, `src/types.ts`, `src/runtime/as2/actor.ts`). Re‑run `npm run as2ts -- …` after any proposed grouping to verify that the consolidated Actor file still round‑trips via `as2ts-report.md` diagnostics (tag order, DoInitAction ordinals).*

