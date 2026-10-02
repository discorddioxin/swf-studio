# Preview and resource diagnostics

For a browser preview without Vite's file watcher and transformation work:

```sh
npm ci
npm run preview:stable
```

This builds the application and serves `dist/` on `0.0.0.0:5173`. Use Arena's
**SWF Studio LIVE PREVIEW** panel so the current sandbox and access
authentication are handled by the platform. Direct sandbox URLs may be stale
or require a traffic access token.

For the lowest process overhead, build once and start Node directly:

```sh
npm run build
node server/preview-server.mjs
```

`npm run preview` also starts the production server, but expects a build to
already exist. `npm run dev` remains the Vite development server, with HMR.
Both bind to `0.0.0.0:5173` by default and fail clearly on an occupied port.

## Diagnose

- `GET /__preview_health`: uptime, memory, request/error counts, and PID.
- `.preview/server.jsonl`: start/sandbox identity, resource samples, fatal
  errors, shutdown signals, and exit codes. Rotates at approximately 1 MiB,
  retaining one backup. Does not log headers or authentication tokens.
- `npm run preview:check`: in a separate terminal while the production server
  is running. Exercises the page, manifest, raw SWFs, and fonts for 60 seconds,
  then observes 30 seconds of idle. Writes `.preview/load-test.json`.

Server environment options: `HOST` (default `0.0.0.0`), `PORT` (default `5173`),
`PREVIEW_ROOT` (default `dist`). The checker accepts `PREVIEW_URL` (default
`http://127.0.0.1:5173/`, used only by this server-side diagnostic script).

A browser-side object URL leak cannot itself stop the Node HTTP server. A
`Sandbox not found` gateway response is also distinct from an app exception.
No local server can survive the platform removing its VM; if that response
persists in the authenticated preview UI, the Arena sandbox connection needs
attention. See `audits/PREVIEW_DIAGNOSTICS.md` for the measurements and fixes.
