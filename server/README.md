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

## Security model and limits

The server is a small in-memory relay. Room state disappears when it stops.

- **Access token (optional).** Set `ROOM_TOKEN` to require a shared secret.
  Clients enter it in the Network panel, where it is kept in `sessionStorage`
  for that tab only. It is compared in constant time. A missing or wrong token
  closes the socket with code `4001`. Without `ROOM_TOKEN`, anyone who can
  reach the port can join.
- **Identity.** Each browser tab generates a user id and a private session key.
  A user id is unique within a room. Another connection that claims a live id
  without the matching key is refused with `4009`, so guests cannot impersonate
  each other. A reconnect from the same tab replaces its stale socket (`4010`).
  Relayed packets always carry the server-side id, whatever the payload says.
  Guest names are display-only and are not unique.
- **Limits.** Connections, rooms, clients per room, a hello deadline,
  per-connection rate limiting (token bucket), payload size (64 KB) and a
  bounded `bindings` object (32 entries, 32 characters each). A heartbeat
  (ping/pong) drops dead sockets.

Use `wss://` (TLS via a reverse proxy) when exposing the server beyond a LAN.
Otherwise the token travels in clear text.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Listen address |
| `ROOM_TOKEN` | unset | Shared access token. Unset means open. |
| `MAX_CONNECTIONS` | `256` | Concurrent sockets (`1013` when exceeded) |
| `MAX_ROOMS` | `64` | Concurrent rooms (`1013` when exceeded) |
| `MAX_CLIENTS_PER_ROOM` | `16` | Room capacity (`4003` when exceeded) |
| `HELLO_TIMEOUT_MS` | `10000` | Close sockets that never say hello (`4004`) |
| `HEARTBEAT_MS` | `30000` | Ping interval. Unresponsive sockets are terminated. |
| `RATE_CAPACITY` / `RATE_PER_SECOND` | `30` / `15` | Token bucket per connection. Excess messages are dropped. |
| `MAX_DROPPED_MESSAGES` | `100` | Dropped messages before the socket is closed (`4008`) |

Before closing for any of these reasons, the server sends an
`{ "type": "error", "code", "message" }` packet. The client shows it in the
Network panel.

## Tests

`npm test` includes `server/engine-server.test.mjs`. It starts the server on
an ephemeral port and checks each of the rules above. To embed the server,
use `createEngineServer(options)`.
