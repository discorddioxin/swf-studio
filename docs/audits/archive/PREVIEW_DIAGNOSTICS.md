# Preview shutdown investigation

Date: 2026-10-02

## Conclusion and limits

An immediate application-server crash was **not reproduced**. The evidence instead points to replacement/removal of the Arena sandbox between attempts:

- The background process handle from the previous attempt returned `not_found`, not an exit code or crash trace.
- The sandbox identifier changed again, and the VM uptime at the start of this investigation was about 14 seconds.
- Dependencies and the old processes were absent in the new VM.
- The earlier user-visible `502 / Sandbox not found` is produced by the upstream sandbox gateway, before Vite or this application's HTTP server receives a request.

There are no recoverable crash logs or memory counters from the previous VM, so this does **not** establish why the platform removed it or rule out every previous failure. Current-session tests show no immediate server exit, resource exhaustion, or OOM kill. An application process cannot preserve a sandbox that the platform destroys.

An unauthenticated request to the current public gateway returned **Missing Traffic Access Token**, rather than **Sandbox not found**. Access must go through Arena's authenticated **SWF Studio / LIVE PREVIEW** UI, not a manually constructed or old `.e2b.app` link. If that UI itself continues reporting a missing sandbox, reconnect/reopen the Arena workspace or contact Arena support with the preview failure and this report. Do not share authentication tokens.

## Resource measurements

The VM has approximately 3.9 GiB of physical RAM; the effective user cgroup memory limit is 3,997,061,120 bytes. Disk had about 20 GiB available at entry. No restrictive CPU limit or process-count limit was configured.

| Check | Observation |
| --- | --- |
| Vite dependency/module crawl and first load/idle probe | 325 HTTP requests, 0 failures, approximately 91 seconds |
| Correctly measured Vite + esbuild probe | 241 requests, 0 failures, approximately 90 seconds |
| Vite + esbuild RSS in that measured probe | Peaked at 246.16 MiB; fell to 204.70 MiB after garbage collection/idle |
| Vite + esbuild CPU in that probe | Approximately 0.47 CPU-seconds over 90 seconds |
| Vite + esbuild open descriptors | 39 idle; 50 during requests; returned to 39 |
| Production preview probe | 370 requests, 0 failures, approximately 91 seconds |
| Production Node server RSS | 55.28 MiB initially; 68.73 MiB peak; 68.14 MiB after idle |
| Production Node JS heap | 6.71–8.02 MiB during the probe; 7.30 MiB after idle |
| Production lifecycle observation | Stayed up for about 349 seconds, with RSS stable at 68.14 MiB, before an intentional diagnostic restart |
| OOM accounting | `max=0`, `oom=0`, `oom_kill=0`, `oom_group_kill=0` throughout |

These measurements cover short server-side load/idle probes, not a long-duration browser heap profile. Production numbers are for the Node server itself, not the temporary npm launchers/probe/test processes. The final preview is launched directly with `node server/preview-server.mjs`, so it has no persistent Vite, esbuild, or npm processes.

The first probe's original resource samples mistakenly measured the launch shell; they were discarded. The second probe recursively measured the actual Node Vite process and its esbuild child. Only those corrected measurements are used above.

The current kernel had no OOM/segfault/killed-process messages. A boot-time `systemd-network-generator.service` failure was present, but `systemd-networkd` was running, dependency downloads worked, and the servers remained reachable in this VM. That boot message does not explain the prior sandbox's removal.

## Changes made

### Lower-overhead, diagnosable preview

`server/preview-server.mjs` now serves the production build without a bundler or file watcher. It:

- Binds to `0.0.0.0:5173`, accepts preview Host headers, and does not block iframe embedding.
- Streams assets with backpressure instead of retaining downloaded SWFs in server memory.
- Serves the manifest, all six raw SWFs, and all nine bundled fonts with correct MIME types.
- Restricts file access to the real production directory, including symlink checks.
- Provides `GET /__preview_health` with PID, uptime, memory, request count, and error count.
- Logs startup, listening, resource samples every 30 seconds, fatal errors, shutdown signals, and normal exit codes.
- Keeps bounded workspace logs: `.preview/server.jsonl` and `.preview/server.jsonl.1`, at most approximately 1 MiB each. No request headers or credentials are logged.
- Fails explicitly if the production build is missing or the requested port is occupied; it does not silently select a different preview port.

The intentional restart verified that SIGTERM and normal exit code 0 are recorded. SIGKILL or destruction of the entire VM cannot execute an exit handler; the last resource record and startup sandbox identifiers still help distinguish an abrupt disappearance from a normal shutdown.

Vite's development defaults now also bind publicly on a strict port 5173.

### Browser-side leaks and errors

These are separate from the server disappearance; SWF parsing/game execution run in the user's browser:

- Disposed `AssetCache` instances can no longer allocate new SVG URLs or repopulate entries from late async reads. Disposal is idempotent; rejected text reads are handled.
- AS2 audio decoding/playback ignores late completions after disposal. URL and decoded-audio caches are cleared.
- Embedded FontFace registrations are owned by the Execute session, removed when it aborts/unmounts, and not installed by late font loads.
- Partially failed package loads and bundled-external merges release the caches they created. Installed packages are released on replacement/unmount, outside replayable React state updaters.
- The external-package array is memoized to avoid unnecessary Execute rebuilds/font registration caused by unrelated parent renders.
- Sprite flattening releases earlier PNG URLs on failure, supports cancellation, and frees generated URLs on replacement/unmount. Late PNG encoding cannot allocate URLs after cancellation.
- The new lossless-bitmap regression test exposed a wrong color-channel offset for RGB32/XRGB pixels. The reserved byte is now skipped; both bundled image-oracle tests pass.

## Validation

- Full Vitest suite: **129 passed, 1 skipped** across 19 files.
- The skipped test requires an external real-game fixture configured with `AS2_GAME_DIR`; the missing main fishing SWF has not been substituted or fabricated.
- `./node_modules/.bin/tsc --noEmit`: clean.
- `npm run build`: successful; production index approximately 1,063.85 kB.
- `git diff --check`: clean.
- Final HTTP checks: root page, manifest, all 6 SWFs, all 9 fonts, and health endpoint returned 200, including a request with the actual preview Host header.
- New tests cover disposed caches, late audio/font/PNG completion, object-URL cleanup, static serving, HEAD requests, malformed paths, symlink escape, aborted streaming, resource health, occupied-port errors, and log rotation.

`npm audit --omit=dev` reported **0 vulnerabilities**. The full dependency audit reports two existing development-only advisories (Vite and esbuild, affecting Windows development-server paths). They are not evidence of a Linux server shutdown; dependency versions were not changed as part of this investigation.

## Reproduce and inspect

```sh
npm ci
npm run preview:stable          # build, then start the production preview
# In another terminal:
npm run preview:check           # bounded 60-second load + 30-second idle probe
```

For the lowest runtime overhead, run these sequentially instead:

```sh
npm run build
node server/preview-server.mjs
```

The probe overwrites `.preview/load-test.json`; the corrected Vite measurements from this investigation are in `.preview/vite-load-test.json`. These diagnostic artifacts are ignored by Git. Read `.preview/server.jsonl` after a failed preview: a recorded signal/exit/fatal error points to a process event, while a new sandbox ID/short VM uptime with no previous shutdown record points to sandbox replacement or abrupt termination. Absence of a shutdown record alone cannot distinguish SIGKILL from VM removal.
