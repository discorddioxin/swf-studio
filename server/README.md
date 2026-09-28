# Optional SWF Forge Room Server

The frontend works without this server. Do not deploy it if multiplayer is not
needed.

## Run locally

From the project root:

```bash
node server/engine-server.mjs
```

The room server listens on `ws://0.0.0.0:8787` by default.

## Enable the client feature

Networking is disabled by default. Build with:

```bash
VITE_ENABLE_NETWORK=true npm run build
```

Then deploy the frontend and the room server separately. In the Game Engine,
enter the WebSocket URL and room name, then connect.

## Disable/remove networking

Build normally:

```bash
npm run build
```

Do not deploy `server/engine-server.mjs`. The Network control and networking
panel are not rendered when `VITE_ENABLE_NETWORK` is not exactly `true`.

The server is intentionally a small unauthenticated relay. Guest identity is
the browser-generated user ID plus the user-entered guest name. Room state is
held in memory and disappears when the server stops.