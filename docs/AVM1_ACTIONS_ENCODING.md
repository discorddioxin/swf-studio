# Why `$rt.avm1Actions` Has a Base64 Argument

## Short answer

A generated call currently looks like:

```ts
$rt.avm1Actions($t, "B5YcAAYAAAAAAAAAAABsb2FkQnV0dG9ucwA9FwA=");
```

`$t` is the target timeline clip. The second argument is **Base64-encoded AVM1 ActionRecords**, not ordinary function arguments, a hash, or encrypted source. Raw SWFs store ActionScript 1/2 behavior as binary records; Base64 transports those exact bytes safely through generated TypeScript. The runtime decodes the string and executes the original records.

Older tracing builds also appended the source path, source line, and generated module. These were per-call reporting metadata—not AVM1 arguments—and have been removed with the runtime Action reports. Original source paths remain in the read-only ActionScript view and generated module banners.

## Encoding and ActionRecord framing

Base64 is reversible, printable transport encoding. It does not recover original comments/formatting and is not an obfuscation or security boundary. SWF AVM1 records are framed as follows (confirmed against [Ruffle's AVM1 reader](https://github.com/ruffle-rs/ruffle/blob/master/swf/src/avm1/read.rs)):

- opcodes below `0x80` are one byte;
- opcodes at or above `0x80` have a little-endian 16-bit payload length and then that payload;
- an `ActionPush` payload (`0x96`) stores typed values such as strings, numbers, booleans, registers, and constant-pool references.

For a concrete example, `B5YcAAYAAAAAAAAAAABsb2FkQnV0dG9ucwA9FwA=` decodes to 35 bytes:

```text
07 96 1c 00 06 00 00 00 00 00 00 00 00 00
6c 6f 61 64 42 75 74 74 6f 6e 41 63 74 69 6f 6e 73 00
3d 17 00
```

| Byte offset | Bytes | Meaning |
|---:|---|---|
| 0 | `07` | `ActionStop` — stop timeline playback; the current script continues executing. |
| 1–31 | `96 1c 00 …` | `ActionPush` with a 28-byte payload; pushes numeric zero and the NUL-terminated function name `loadButtonActions`. |
| 32 | `3d` | `ActionCallFunction`; the stack contains a zero-argument call. |
| 33 | `17` | `ActionPop`; discard the return value. |
| 34 | `00` | `ActionEnd`; end the stream. |

A useful high-level approximation is:

```actionscript
stop();
loadButtonActions();
```

That is explanatory pseudocode only. Execute uses the original bytecode, not a source reconstruction.

Ruffle's [AVM1 types](https://github.com/ruffle-rs/ruffle/blob/master/swf/src/avm1/types.rs) and [runtime](https://github.com/ruffle-rs/ruffle/blob/master/core/src/avm1/runtime.rs) are useful references for interpreting the typed stack values and their execution semantics. The best-effort decoder in this repository does not reconstruct every branch/function in a complex stream; the original bytes remain authoritative.

## Current path through the app

```text
raw SWF ActionRecord bytes
  → decompiler/swf/bitio.ts: avm1ActionSource() / bytesToBase64()
  → avm1Actions("<base64>") in a synthesized source file
  → transpiler emits $rt.avm1Actions($t, "<base64>")
  → runtime decodes and executes the original AVM1 instructions
```

The synthesized `.as` path is a useful tag/source location, not proof that a raw SWF retained formatted ActionScript source. Action streams can come from `DoAction`, `DoInitAction`, button conditions, and clip actions.

Per-opcode/runtime Action reports were removed because recording instruction names, stack snapshots, formatted bytes, and hundreds of log rows per script added avoidable work to normal execution. AVM1 bytecode still executes. The Code Editor retains a read-only, clearly labeled, best-effort disassembly with a raw-bytecode toggle; Logs, Problems, and mocked Req/Res diagnostics remain separate.

For the per-SWF payload counts, paths, decoded examples, and analytics-stream investigation, see [AVM1 action audit and Execute timelines](./AVM1_ACTIONS_AND_EXECUTE_TIMELINES.md).

## Code references

- `decompiler/swf/bitio.ts` — byte-to-Base64 wrapper (`avm1ActionSource`, `bytesToBase64`).
- `decompiler/swf/binary.ts` — extracts ActionRecord bytes from SWF tags.
- `transpiler/as2/emit.ts` — emits a minimal timeline-context runtime call.
- `src/runtime/as2/index.ts` — `$rt.avm1Actions(from, base64)` runtime entry point.
- `src/runtime/as2/avm1.ts` — bytecode decoder/interpreter.
- `src/lib/avm1Disassembly.ts` and `src/components/CodeWorkspace.tsx` — read-only disassembly and raw-bytecode views.
