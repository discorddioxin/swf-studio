# AVM1 action streams and Execute timelines

> Historical audit: supported AVM1 blocks now compile to executable TypeScript.
> See [AVM1 decoding and migration](./AVM1_ACTIONS_ENCODING.md) for the current
> decoder, interpreter fallback policy, actor modules, and source export.

## Findings from the bundled SWFs

The `avm1Actions` Base64 value is **not** a list of ordinary function arguments. It is a byte-for-byte encoding of SWF AVM1 ActionRecords. The SWF parser preserves those bytes and the generated TypeScript calls the interpreter with the owning timeline clip (`$t`) plus that Base64 payload. Older traced builds appended source file, line, and generated module as report metadata; those were never AVM1 arguments and have now been removed from the runtime call. Source paths remain available in the static ActionScript and generated-module views.

The audit parsed the eight bundled fish SWFs under `game-files/fish-full/swfs/`. It statically extracted each `avm1Actions` stream, grouped identical byte sequences, and recorded the source-tag path. No SWF was executed for this audit and no network request was made.

| Bundled SWF | Call sites | Unique payloads in this SWF |
|---|---:|---:|
| `OmnitureActionSource.swf` | 4 | 3 |
| `bassken_fish4.20.swf` | 1 | 1 |
| `bassken_game4.21.swf` | 168 | 67 |
| `bassken_overview.swf` | 9 | 4 |
| `bassken_pier.swf` | 4 | 1 |
| `bassken_scene.swf` | 18 | 1 |
| `game_chat.swf` | 116 | 84 |
| `gsecs2.9.swf` | 214 | 153 |
| **Total** | **534** | **249 unique across all eight** |

The per-SWF unique counts overlap: the same exact payload can occur in multiple SWFs. Across the global set, there are 249 distinct streams. The median unique-stream size is 97 bytes (74 bytes when weighted by call sites); the largest is 24,332 bytes. The 249 unique streams total 468,723 bytes, while the 534 call sites total 566,746 bytes of encoded payload. The most repeated stream is only 2 bytes and appears at 151 call sites.

### What the bytes mean

Ruffle's AVM1 reader defines the framing used here: opcodes below `0x80` are a single byte; opcodes at or above `0x80` have a little-endian 16-bit payload length followed by that many bytes. An `ActionPush` record (`0x96`) then stores typed values, such as NUL-terminated strings, numbers, booleans, registers, and constant-pool references. See Ruffle's [AVM1 reader](https://github.com/ruffle-rs/ruffle/blob/master/swf/src/avm1/read.rs), [AVM1 action/value types](https://github.com/ruffle-rs/ruffle/blob/master/swf/src/avm1/types.rs), and [AVM1 runtime](https://github.com/ruffle-rs/ruffle/blob/master/core/src/avm1/runtime.rs).

A few decoded examples demonstrate why the Base64 should be understood as executable bytecode rather than as a normal data argument:

- **`BwA=` → `07 00`:** `ActionStop`, then `ActionEnd`. It stops the target MovieClip timeline; the final zero is the stream terminator, not a second operation. This is the most common payload (151 occurrences).
- **`AA==` → `00`:** just `ActionEnd`, so it contains no executable action record.
- **`B5YcAAYAAAAAAAAAAABsb2FkQnV0dG9uQWN0aW9ucwA9FwA=` (35 bytes):** `Stop`, then a zero-argument `loadButtonActions()` call, then `Pop` to discard its result. This exact stream occurs five times in `bassken_game4.21.swf`.
- **The recurring 46-byte stream `885f37ffaeaa`:** pushes an empty string and the usual AVM1 method-call operands, then invokes `_root.main.setMessage("")` and discards the result. It appears at 19 source sites and apparently clears the game's message field.

The parser can preserve and execute bytecode that its best-effort source-level disassembler cannot fully reconstruct. ActionRecords can contain branches, functions, constant pools, and nested code, so the raw bytes and hashes are authoritative; generated pseudo-source for a complex stream is only a reading aid.

### `OmnitureActionSource.swf`

The exact call-site mapping in the bundled SWF is:

| Payload hash (short SHA-256) | Bytes | Source tag(s) | Static interpretation |
|---|---:|---|---|
| `d154fe2abf32` | 10,640 | `scripts/frame_1/DoAction.as` | Large tracking-library/bootstrap stream. Its constant pool includes tracker configuration and data names (`requestList`, `accountVarList`, `products`, `events`, `pageName`, `visitorID`, `trackLocal`, `autoTrack`), link/click-map helpers, and request/query-string helpers such as `trackLink`, `trackDownloadLinks`, `send`, `loadVars`, and `sendAndLoad`. That identifies it as analytics code, not fish-game timeline logic. The available raw decoder does not reconstruct every branch, so this is a static identification rather than a claim about which tracking branch ran. |
| `0a6361b3a802` | 2 | `scripts/frame_1/DoAction_2.as`; `scripts/frame_3/DoAction.as` | `Stop` followed by `ActionEnd`. |
| `716191c9222d` | 38 | `scripts/frame_2/DoAction.as` | `Play`; resolve `this`; call `this.indexMovie()` with no arguments; discard the return value. |

The neighboring exported wrapper, `game-files/fish-full/external/gsecs2.9/scripts/__Packages/com/omniture/ActionSource.as`, is a hidden `MovieClip` loader/delegator: it creates a child named `s`, loads a supplied movie into that child, polls until `s.track` exists, broadcasts `loaded`, and delegates `track()` / `trackLink()` to the child. The exported `gsecs2.9` frame-1 loader initializes the wrapper with these static values:

| Field | Value in the export |
|---|---|
| `account` | `gaiainteractiveprod` |
| `trackLocal` | `true` |
| `pageName`, `pageURL` | empty strings |
| `charSet` | `ISO-8859-1` |
| `currencyCode` | `USD` |
| `trackClickMap` | `true` |
| `movieID` | empty string |
| `visitorNamespace` | `gaiainteractive` |
| `dc` | `112` |
| `debugTracking` | `true` |

The script assigns `currencyCode` directly on the loaded tracker child (`_global.s`); the other settings are assigned through the wrapper. GSECS's exported `connectToSushi()` also invokes the tracker wrapper's `sendPixelRequest("SERVER INIT")`, and has failure-event calls for the error and selected server IP. This establishes that the analytics API is wired into server lifecycle code, but does not prove which network branch the 10,640-byte library stream would take. The loader also has a tracker-movie URL string reference and calls `loadActionSource` with it. This investigation read the string from the bundled export; it did not fetch it or make a request. In Execute, external SWFs are resolved against loaded bundled packages by filename (`createExternalResolver`); mock network/server implementations remain the only game-server interfaces.

## Why runtime Action reports were removed

Before this change, every `$rt.avm1Actions` call opted into per-instruction tracing. The interpreter formatted instruction names and record bytes, copied operand-stack snapshots, built a large log object, and queued it for React to retain/render. A single call could record hundreds of instructions; the bundled library payloads make that work especially wasteful. The Actions console therefore amplified the cost of normal bytecode execution.

Execute now runs the original byte stream without constructing per-opcode reports, adding one log entry per `avm1Actions` invocation, or passing unused source-location strings into the runtime. Source paths remain in module banners and the static Code Editor/disassembly view. The runtime Logs, Problems, and mocked Req/Res views are unchanged; AVM1 warnings and real application errors are still reported.

## Execute's running-timeline sidebar

The AS2 player exposes a small read-only snapshot of live multi-frame MovieClip timelines whose own play state is `playing`. Execute samples it at 10 Hz and only updates the sidebar when a timeline, frame, label, or path changes. Each row shows the Workbench/project name where available, the instance path, frame cells with tag-event colors, and a playhead marker at the current 1-based frame. Single-frame sprites and stopped timelines are omitted. The Execute-wide Pause state freezes the playheads and is shown separately from each clip's own play state.

## Reproduce the static audit

Run from the repository root:

```sh
npm test -- debug/tools/vitest/avm1-action-audit.dev.test.ts
```

The developer tool reads only bundled SWFs and writes the detailed static listing and summary to `debug/tools/e2e-output/avm1-action-audit/`. Its pseudo-disassembly is intentionally not treated as an authoritative decompilation of complex streams.
