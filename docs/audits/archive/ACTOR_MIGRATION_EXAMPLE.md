# Actor Migration Example — bassken_overview & bassken_scene

## Before (16 tiny files)
```
game-files/fish-full/external/bassken_scene/scripts/
  DefineSprite_9/frame_1/DoAction.as  (stop();)
  DefineSprite_9/frame_5/DoAction.as  (play();)
  DefineSprite_9/frame_10/DoAction.as (play();)
  DefineSprite_9/frame_15/DoAction.as (stop();)
  DefineSprite_18/... (same 4)
  DefineSprite_19/... (same 4)
  DefineSprite_24/... (same 4)  → 16 files
```

## After (P4 mergeVariants)
```
actors/fish/
  FishActor.ts                // extends TimelineActor, selects animation by facing
  animation/
    FrontLeft.ts  ← sprite_9
    FrontRight.ts ← sprite_18
    BackLeft.ts   ← sprite_19
    BackRight.ts  ← sprite_24
timelines/sprite_9.ts  → shim: export * from "../actors/fish/animation/FrontLeft"
```

## bassken_overview
Before: `DefineSprite_10_fisher/frame_1/DoAction.as` (47 lines), `DefineSprite_28_themap` (31 lines), `%3Cdefault package%3E/themap.as` (registerClass)
After:
```
timelines/fisher.ts  (human name, was sprite_10)
timelines/themap.ts  (was sprite_28) + shim timelines/sprite_28.ts
actors/fisher/FisherActor.ts
actors/themap/ThemapActor.ts
```

## Verification
```
npm run as2ts -- game-files/fish-full/external/bassken_scene -o /tmp/out --merge-variants
cat /tmp/out/actors/_proposal.json # → fish:9,18,19,24
cat /tmp/out/as2ts-report.md | grep -A 5 "Actor Proposals"
npx vitest run transpiler/as2/__tests__/project.variants.test.ts
```
