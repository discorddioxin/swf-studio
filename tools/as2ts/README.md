# as2ts: ActionScript 1/2 to TypeScript

A standalone transpiler that turns decompiled **ActionScript 1/2** (the output of
[JPEXS FFDec](https://github.com/jindrapetrik/jpexs-decompiler)) into ordinary,
strictly-typed **TypeScript**. The generated code runs on the AS2 runtime in
`src/runtime/as2`. It does not use Flash or Ruffle.

The transpiler lives in the repository-root `transpiler/as2/` (lexer → parser → emitter → project
mapper, with no DOM dependency). This folder is its command-line front end.

## Quick start

```bash
git clone -b arena/01a0e624-swf-studio https://github.com/discorddioxin/swf-studio
cd swf-studio
npm install

# 1. decompile the SWF's scripts with FFDec (Windows: ffdec.bat, macOS/Linux: ffdec.sh)
ffdec -export script ./ffdec-out bassken_game4.20.swf

# 2. transpile the whole export
npm run as2ts -- ./ffdec-out -o src/games/gaia-fishing

# a single file is printed to stdout
npm run as2ts -- ./ffdec-out/scripts/frame_1/DoAction.as
```

The input can be an FFDec export folder, a `.zip` of one, or a single `.as` file.

| Option | Meaning |
|---|---|
| `-o, --out <dir>` | output folder (default `./as2ts-out`, git-ignored) |
| `--runtime <module>` | module the generated code imports from (default `@/runtime/as2`) |
| `--strict` | exit code 1 if any script failed to parse (useful in CI) |

## What it produces

```
src/games/gaia-fishing/
  index.ts                  export const program: AS2Program  (registry of everything below)
  timelines/root.ts         main timeline: frames{1: fn, 2: fn…}, placements{"frame:depth": handlers}
  timelines/sprite_30.ts    one module per DefineSprite that has code (+ `init` for DoInitAction)
  buttons/button_12.ts      on(release)/on(rollOver)… handlers of DefineButton2 #12
  classes/gaia/fishing/FishingGame.ts   AS2 classes from __Packages, as real TS classes
  as2ts-report.md           what went where, plus every warning/error with its line number
```

Example output for a frame script:

```ts
export const frames: Record<number, (this: AS2Clip) => void> = {
  1: function (this: AS2Clip): void {
    const $t = this;               // the timeline that owns the frame
    $t.stop();
    $t.onEnterFrame = function (this: any) {
      var p: any = this.getBytesLoaded() / this.getBytesTotal();
      if (p >= 1) { delete this.onEnterFrame; $t.gotoAndStop(2); }
    };
  },
};
```

## Translation rules

- **Timeline code** (frames, `on()`, `onClipEvent()`) runs with `$t` bound to the owning clip.
  - Frame-level `var` and `function` declarations become timeline properties, as they are in Flash.
  - Any identifier that isn't a local, a parameter, an import or a known global becomes `$t.name`. The runtime clip falls back to `_global`.
- **Nested functions** stay `function` expressions, so dynamic `this` works (`mc.onPress = function () { this._alpha = 50 }`).
- **Classes** become `export class` modules.
  - Unqualified members resolve to `this.x`, and statics to `ClassName.x`.
  - Getters, setters and `super` are preserved.
  - Field initialisers run at the top of the constructor.
  - Imports are resolved between files, including same-package classes.
- **Types:** `Number` → `number`, `String` → `string`, `Boolean` → `boolean`, `Void` → `void`, `Array` → `any[]`, `Object`/untyped → `any`. Class types keep their class.
- **Special forms:**
  - `Type(x)` → `$rt.cast(x, Type)`
  - `typeof` → `$rt.typeOf` (reports `"movieclip"`)
  - `eval`/`set`/`getProperty`/`setProperty`/`duplicateMovieClip`/`tellTarget` → timeline-aware `$rt.*` helpers
  - `with` → `$rt.scope`
  - `Object.registerClass` → `$rt.registerLinkage`
  - `#include` is inlined
  - AS1 `and`/`or`/`not`/`eq`… become JS operators
- **FFDec failures:** `§§push`-style markers become `$rt.ffdec("§§push")` and are listed in the report.
  - Files that cannot be parsed still produce a module that calls `$rt.untranslated(file, error)`, so nothing disappears silently.

## Checking the output

Every generated project is plain TypeScript. Run `npx tsc --noEmit -p .` if it is inside `src/`.

The test suite (`transpiler/as2/__tests__`) transpiles a sample FFDec project and type-checks the result with `tsc --strict` against the runtime.
