# AVM1 decoding and editable TypeScript

Raw SWFs contain binary AVM1 ActionRecords, not formatted ActionScript source.
The importer still preserves them losslessly as `avm1Actions("<base64>")` in the
original source view. **The TypeScript transpiler now decodes supported blocks
into executable imperative code by default**, rather than passing every block
to the interpreter.

## The setMessage example

Input:

```ts
avm1Actions("lg4AAAAHAQAAAABfcm9vdAAclgYAAG1haW4ATpYMAABzZXRNZXNzYWdlAFIXAA==");
```

Generated behavior:

```ts
$rt.invoke($t._root?.main, "setMessage", "");
```

This calls `_root.main.setMessage("")`. There are no encoded arguments or hidden
instructions left in this block. Change the receiver, method, or message in the
generated TypeScript. `$rt.invoke` keeps the receiver as `this` and ignores
missing/non-function methods, as AS2 does. Once your destination types guarantee
the method exists, replace it with a direct `main.setMessage("")` call.

A Stop action (`BwA=`) now emits `$t.stop();`. GotoFrame uses one-based frame
numbers. Arithmetic, property reads/writes, calls, local functions and supported
branches become ordinary expressions, assignments, functions, `if/else`, and
`while` blocks. There is no emitted operand-stack interpreter or opcode switch.

## Decoder architecture

`transpiler/as2/avm1.ts` is DOM-independent and does not execute input code:

1. Validate Base64, record lengths, terminated UTF-8 strings, function bodies,
   and branch boundaries. Function bodies are outside the header's record length.
2. Resolve constant pools and all Push literal encodings (including SWF's
   word-swapped doubles), lift the operand stack into expressions, and snapshot
   values live across other operations into block-local temporaries.
3. Recover empty-stack, reducible forward conditionals and pre-test loops.
   Preserve reverse-pushed argument order, register snapshots, single evaluation
   of duplicate values, and dynamic function receivers.
4. Emit TypeScript inside a lexical block. The regular AS2 emitter supplies
   timeline/global imports. `$rt.avm1` contains small conversion/call helpers,
   **not** a second bytecode interpreter.

The generated loop guard shares a one-million-iteration budget across loops in each decoded invocation. Input size,
function nesting, and control-flow nesting also have decoder limits.

## Coverage and safe fallback

Supported families include constants, variables with literal identifier names,
members, arithmetic/comparisons/conversions, calls/construction, arrays/objects,
registers, Trace, basic timeline controls, numeric property access, DefineFunction,
a subset of DefineFunction2 preloads, and structured conditionals/pre-test loops.

This is not a complete AVM1 decompiler. `with`, `try/catch`, enumeration,
`super`, special arguments/scope behavior, target changes, dynamic variable paths,
context-sensitive global calls, stack-valued joins, irreducible jumps, unsupported
preloads, scene-biased jumps, and unknown/malformed records retain the interpreter.
Function-local declarations whose scope cannot safely be reconstructed also fall
back. Constants changing across control-flow paths are not guessed.

**Fallback is atomic per action block.** No decoded prefix is executed before
replaying the original bytes. A warning and generated comment identify the byte
offset and reason; `game/as2ts-report.md` lists them. Source wrappers are recognized
in the parsed AST, not replaced by a regex inside comments or string literals.

To force original-byte execution for an export:

```sh
npm run as2ts -- scripts -o converted --interpret-avm1
```

The library APIs `transpileScript` and `transpileProject` also accept
`{ avm1: 'interpret' }`. The default is `decode`.

## Actors, animations, sprites and graphics

Each generated timeline also has an `actors/<name>.ts` migration entry point.
Workbench names and frame labels become class names and explicit `action_*`
methods. Actor construction does not run scripts or introduce another clock.

The composition-based `Actor` API exposes:

- `sprite`: pixel position, normalized scale/opacity, rotation in degrees,
  visibility;
- `animation`: play a named animation/frame, pause, seek, read current frame;
- optional `graphics`: drawing operations using normalized opacity;
- `children` and `update(deltaSeconds)` for authored game behavior.

`TimelineActor` and `flashActorPorts` are explicit compatibility adapters. For
example, after constructing a generated `HeroBallActor` around a host sprite:

```ts
hero.moveTo(160, 90);
hero.sprite.opacity = 0.8;
hero.animation.play("run");
hero.graphics?.beginFill(0xffcc00);
```

Move decoded behavior from `timelines/` into the actor's own game methods as you
adapt it. Do **not** dispatch `action_*` methods at the same time as the legacy
host dispatches those frame callbacks. The host still owns animation timing and
SWF rendering. This layer does not infer game entities, animation ranges, physics,
or a scene hierarchy from arbitrary bytecode; it provides typed boundaries for
incrementally replacing those legacy dependencies with your destination engine.

## Using the app

- The TypeScript project view shows the same decoded executable modules used by
  Execute, plus actor migration modules.
- The ActionScript view uses decoded imperative logic where possible, retains a
  diagnostic listing for unsupported blocks, and offers the untouched wrapper.
- **Export TypeScript** downloads generated sources, actor modules, all AS2
  runtime sources, a diagnostics report, and an npm/TypeScript configuration.
  Run `npm install` then `npm run check` in the extracted folder.
- This is a source export, not a self-running game. Assets and the renderer/host,
  input and networking integrations are separate. Legacy dynamic typing and
  interpreter fallbacks still require review during migration.

Original comments, variable names lost by compilation, and application intent
cannot in general be recovered. Original bytes remain available for comparison.

## Code references

- `decompiler/swf/bitio.ts`: original ActionRecord transport.
- `transpiler/as2/avm1.ts`: validated decoding, expression lifting and control flow.
- `transpiler/as2/emit.ts`: executable decoder integration and diagnostics.
- `transpiler/as2/project.ts`: timeline wiring and actor entry points.
- `src/runtime/as2/actor.ts`: actor/renderer ports and the Flash adapter.
- `src/runtime/as2/avm1.ts`: fallback interpreter and shared semantic helpers.
- `src/lib/typescriptExport.ts`: editable project ZIP.
- `src/lib/avm1Disassembly.ts`: source inspection, not an execution path.
