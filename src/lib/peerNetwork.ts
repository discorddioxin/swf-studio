import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_NETWORK_URL, NETWORK_ENABLED } from './networkConfig';

export type ControlMode = 'keyboard' | 'mouse' | 'gamepad';
export type PeerPacket =
  | { type: 'room-state'; count: number; users: NetworkUser[] }
  | { type: 'hello'; userId: string; username: string; room: string; token?: string; key?: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'presence'; userId: string; username: string; actorId: string | null; instanceId: string | null; mode: ControlMode; bindings: Record<string, string> }
  | { type: 'chat'; id: string; userId: string; username: string; text: string; at: number }
  | { type: 'control'; userId: string; username: string; instanceId: string | null; actorId: string | null; mode: ControlMode; bindings: Record<string, string> };

export interface NetworkUser { userId: string; username: string; instanceId: string | null; actorId: string | null; mode: ControlMode; bindings: Record<string, string>; online: boolean; }
export interface NetworkChatMessage { id: string; userId: string; username: string; text: string; at: number; }

/** Close codes sent by server/engine-server.mjs, mapped to user-facing text. */
const CLOSE_MESSAGES: Record<number, string> = {
  4001: 'The server refused the connection: a valid access token is required.',
  4003: 'That room is full.',
  4004: 'The server closed the connection: no hello was received in time.',
  4008: 'Disconnected for sending too many messages.',
  4009: 'This user id is already connected to that room.',
  1013: 'The server is full. Try again later.',
};

function sessionValue(key: string) {
  try { return sessionStorage.getItem(key) ?? ''; } catch { return ''; }
}

function localValue(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

export function usePeerNetwork() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<'off' | 'ready' | 'connecting' | 'connected' | 'error'>('off');
  const [serverUrl, setServerUrl] = useState(() => localValue('swfforge:server-url', DEFAULT_NETWORK_URL));
  const [room, setRoom] = useState(() => localValue('swfforge:room', 'default'));
  const [username, setUsernameState] = useState(() => localValue('swfforge:guest-name', `Guest-${Math.random().toString(36).slice(2, 6)}`));
  // Kept for this tab only (sessionStorage), never in localStorage.
  const [token, setTokenState] = useState(() => sessionValue('swfforge:room-token'));
  const [connectedCount, setConnectedCount] = useState(0);
  const [users, setUsers] = useState<NetworkUser[]>([]);
  const [messages, setMessages] = useState<NetworkChatMessage[]>([]);
  const [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null);
  const userId = useRef(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  // Private per-session secret: lets this tab reconnect under the same id while
  // stopping anyone else from claiming it. Sent only in hello, never relayed.
  const sessionKey = useRef(typeof crypto !== 'undefined' && crypto.randomUUID ? `${crypto.randomUUID()}${crypto.randomUUID()}` : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}${Date.now()}`);
  const presence = useRef({ userId: userId.current, username, actorId: null as string | null, instanceId: null as string | null, mode: 'keyboard' as ControlMode, bindings: {} as Record<string, string> });

  const send = useCallback((packet: PeerPacket) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(packet));
  }, []);

  const updatePresence = useCallback((patch: Partial<typeof presence.current>) => {
    presence.current = { ...presence.current, ...patch, username };
    if (enabled) send({ type: 'presence', ...presence.current });
  }, [enabled, send, username]);

  const connect = useCallback(() => {
    if (!NETWORK_ENABLED) return;
    socket.current?.close(); setError(''); setStatus('connecting'); setMessages([]); setUsers([]); setConnectedCount(0);
    const target = serverUrl.trim().replace(/\/$/, '');
    if (!/^wss?:\/\//i.test(target)) { setStatus('error'); setError('Use a ws:// or wss:// server URL.'); return; }
    localStorage.setItem('swfforge:server-url', target); localStorage.setItem('swfforge:room', room || 'default');
    const ws = new WebSocket(target); socket.current = ws;
    // "connected" is set once the server accepts the hello (first room-state), not on open.
    ws.onopen = () => { send({ type: 'hello', userId: userId.current, username, room: room || 'default', key: sessionKey.current, ...(token ? { token } : {}) }); };
    ws.onclose = (event) => {
      if (socket.current !== ws) return; // superseded by a newer connection
      const refusal = CLOSE_MESSAGES[event.code];
      if (refusal) { setStatus('error'); setError((current) => current || refusal); }
      else setStatus((prev) => (prev === 'error' ? 'error' : enabled ? 'ready' : 'off'));
      setConnectedCount(0); setUsers([]);
    };
    ws.onerror = () => { if (ws.readyState !== WebSocket.OPEN) { setStatus('error'); setError('Could not connect to the game server.'); } };
    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data) as PeerPacket & { type: string; users?: NetworkUser[]; count?: number };
        if (packet.type === 'error') { setStatus('error'); setError(String((packet as { message?: unknown }).message || 'The game server refused the request.')); return; }
        if (packet.type === 'room-state') { setStatus('connected'); setConnectedCount(packet.count ?? 0); setUsers(packet.users ?? []); return; }
        if (packet.type === 'chat') setMessages((current) => current.some((message) => message.id === packet.id) ? current : [...current.slice(-99), packet]);
        if (packet.type === 'presence' || packet.type === 'control') setUsers((current) => [...current.filter((user) => user.userId !== packet.userId), { ...(current.find((user) => user.userId === packet.userId) ?? { online: true }), ...packet, online: true } as NetworkUser]);
      } catch { setError('The game server sent invalid data.'); }
    };
  }, [enabled, room, send, serverUrl, token, username]);

  const enable = useCallback(() => { if (NETWORK_ENABLED) { setEnabled(true); setStatus('ready'); setError(''); } }, []);
  const disable = useCallback(() => { socket.current?.close(); socket.current = null; setEnabled(false); setStatus('off'); setConnectedCount(0); setUsers([]); setMessages([]); }, []);
  const setUsername = useCallback((value: string) => { const next = value.trim().slice(0, 24) || `Guest-${userId.current.slice(0, 4)}`; setUsernameState(next); localStorage.setItem('swfforge:guest-name', next); updatePresence({ username: next }); }, [updatePresence]);
  const setToken = useCallback((value: string) => {
    setTokenState(value);
    try { if (value) sessionStorage.setItem('swfforge:room-token', value); else sessionStorage.removeItem('swfforge:room-token'); } catch { /* storage unavailable */ }
  }, []);
  const sendChat = useCallback((text: string) => {
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    if (socket.current?.readyState !== WebSocket.OPEN) { setStatus('error'); setError('Connect to a room before chatting.'); return; }
    const packet: PeerPacket = { type: 'chat', id: `${userId.current}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, userId: userId.current, username, text: clean, at: Date.now() };
    send(packet); setMessages((current) => [...current.slice(-99), packet]);
  }, [send, username]);
  useEffect(() => () => socket.current?.close(), []);

  return { networkEnabled: NETWORK_ENABLED, enabled, status, serverUrl, room, token, username, userId: userId.current, connectedCount, users, messages, error, setServerUrl, setRoom, setToken, setUsername, enable, disable, connect, send, sendChat, updatePresence };
}