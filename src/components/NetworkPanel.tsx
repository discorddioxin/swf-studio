import { useState } from 'react';
import type { usePeerNetwork } from '../lib/peerNetwork';
import { Button, inputCls } from './ui';

type NetworkApi = ReturnType<typeof usePeerNetwork>;

export function NetworkPanel({ network, onClose }: { network: NetworkApi; onClose: () => void }) {
  const [chat, setChat] = useState('');
  return (
    <section className="border-b border-emerald-900/40 bg-emerald-950/10 px-3 py-3 text-xs">
      <div className="mx-auto grid max-w-6xl gap-3 lg:grid-cols-[1fr_1.5fr_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><b className="text-emerald-200">Room connection</b><button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">close</button></div>
          <p className="text-[10px] text-zinc-500">Optional guest room. No authentication. Use the same server URL and room on each machine.</p>
          <div className="flex gap-1"><input className={inputCls} value={network.serverUrl} onChange={(e) => network.setServerUrl(e.target.value)} placeholder="ws://localhost:8787" /><Button className="py-1 text-[10px]" onClick={network.connect}>connect</Button></div>
          <div className="flex gap-1"><input className={inputCls} value={network.room} onChange={(e) => network.setRoom(e.target.value)} placeholder="room" /><input className={inputCls} value={network.username} onChange={(e) => network.setUsername(e.target.value)} placeholder="Guest name" /></div>
          <div className="text-[10px] text-zinc-600">{network.status} · {network.connectedCount} connected</div>
          {network.error && <div className="text-[10px] text-amber-300">{network.error}</div>}
        </div>
        <div className="space-y-2"><b className="text-[10px] uppercase tracking-wider text-zinc-500">Chat</b><div className="flex min-h-12 flex-wrap content-start gap-1 rounded border border-zinc-800 bg-zinc-950/50 p-1">{network.messages.length ? network.messages.slice(-8).map((m) => <span key={m.id} className="rounded bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-400"><b className="text-emerald-300">{m.username}</b> {m.text}</span>) : <span className="px-1 py-1 text-[10px] text-zinc-600">No messages yet.</span>}</div><div className="flex gap-1"><input className={inputCls} disabled={network.status !== 'connected'} value={chat} onChange={(e) => setChat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { network.sendChat(chat); setChat(''); } }} placeholder={network.status === 'connected' ? `Message ${network.room || 'room'}…` : 'Connect first'} /><Button className="py-1 text-[10px]" disabled={network.status !== 'connected'} onClick={() => { network.sendChat(chat); setChat(''); }}>send</Button></div></div>
        <div className="space-y-2"><b className="text-[10px] uppercase tracking-wider text-zinc-500">Guests</b>{network.users.map((user) => <div key={user.userId} className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-[10px] text-zinc-400"><b className="text-emerald-300">{user.username}</b> · {user.mode} · {user.actorId ?? 'selecting'}</div>)}</div>
      </div>
    </section>
  );
}