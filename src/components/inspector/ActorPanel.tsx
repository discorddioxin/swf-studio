// Inspector "Actors" tab.
// Extracted verbatim from Inspector.tsx (DECOMPOSITION_SPEC phases 3–10).

import { useState } from 'react';
import { Empty, Head } from './shared';
import type { AssetCache } from '../../lib/assets';
import { buildFramesForContainer } from '../../lib/exporter';
import type { ProjectApi } from '../../lib/project';
import { defaultActorCapabilities, type ActorAction, type ActorCombatMode, type ActorLayer, type ActorMirrorSide, type ActorSequence, type SwfDocument } from '../../types';
import { cn } from '../../utils/cn';
import { charName } from '../Sidebar';
import { Button, Field, TagInput, inputCls } from '../ui';
import { ACTOR_CLASSIFICATIONS, ACTOR_COMBAT_OPTIONS, ACTOR_FACING_SLOTS, ACTOR_LAYERS, ACTOR_MOVEMENT_SLOTS, ACTOR_WALK_SLOTS } from './actorConsts';
import { collectActorImageDependencies, normalizeActorKey } from './actorHelpers';
import { ActorCodeDependencies, ActorImageDependencies, ActorSoundDependencies } from './actorDependencies';
import { ActorProposals } from './ActorProposals';

// ---------------------------------------------------------------- actors ----

type ActorDependencyTab = 'code' | 'images' | 'sounds';

export function ActorPanel({ doc, cache, api, selectedActorId, onOpenTimeline, setFrame, setLoopRange }: {
  doc: SwfDocument;
  cache: AssetCache;
  api: ProjectApi;
  selectedActorId: string | null;
  onOpenTimeline: (id: string) => void;
  setFrame: (f: number) => void;
  setLoopRange: (r: [number, number] | null) => void;
}) {
  const [dependencyTab, setDependencyTab] = useState<ActorDependencyTab>('code');
  const [newActionName, setNewActionName] = useState('');
  const [newActionTarget, setNewActionTarget] = useState('');
  const [newBindingKey, setNewBindingKey] = useState('');
  const [newBindingAction, setNewBindingAction] = useState('');
  const [newSequenceName, setNewSequenceName] = useState('');
  const actor = (api.project.actors ?? []).find((a) => a.id === selectedActorId);
  if (!actor) return (
    <div className="space-y-2">
      <ActorProposals doc={doc} api={api} onOpenTimeline={onOpenTimeline} setFrame={setFrame} setLoopRange={setLoopRange} />
      <Empty>Select or create an actor from the Actors list.</Empty>
    </div>
  );

  const clips = api.project.clips;
  const assigned = new Set(actor.clipIds);
  const capabilities = actor.capabilities ?? defaultActorCapabilities();
  const assignedClips = clips.filter((clip) => assigned.has(clip.id));
  const canAttack = capabilities.combat === 'combat' || capabilities.combat === 'canAttack';
  const canBeAttacked = capabilities.combat === 'combat' || capabilities.combat === 'canBeAttacked';
  const updateCapabilities = (patch: Partial<typeof capabilities>) => {
    api.updateActor(actor.id, { capabilities: { ...capabilities, ...patch } });
  };
  const actions: ActorAction[] = actor.actions ?? [];
  const sequences: ActorSequence[] = actor.sequences ?? [];
  const keyBindings = actor.keyBindings ?? {};
  const actionId = () => Math.random().toString(36).slice(2, 10);
  const targetOptions = [
    ...assignedClips.map((clip) => ({ value: `clip:${clip.id}`, label: `Clip · ${clip.name}` })),
    ...sequences.map((sequence) => ({ value: `sequence:${sequence.id}`, label: `Sequence · ${sequence.name}` })),
  ];
  const clipFrames = assignedClips.flatMap((clip) => {
    const timeline = doc.timelines.get(clip.timelineId);
    return (clip.frames ?? (timeline ? buildFramesForContainer(timeline, clip.start, clip.end) : [])).map((frameData) => ({
      ...frameData,
      clipName: clip.name,
      clipId: clip.id,
    }));
  });

  const codeEvents = clipFrames.flatMap((frameData) => frameData.events
    .filter((event) => event.kind === 'action')
    .map((event) => ({ ...event, clipName: frameData.clipName, frame: frameData.index })));
  const soundEvents = clipFrames.flatMap((frameData) => frameData.events
    .filter((event) => event.kind === 'sound')
    .map((event) => ({ ...event, clipName: frameData.clipName, frame: frameData.index })));

  const imageDependencies = collectActorImageDependencies(doc, api.project, cache, clipFrames.map((frameData) => frameData.instances.map((instance) => instance.characterId)).flat());
  const soundDependencies = new Map<string, { id?: number; name: string; preview?: ReturnType<AssetCache['preview']>; frames: string[] }>();
  soundEvents.forEach((event) => {
    const id = event.characterId;
    const key = id == null ? 'stream' : `sound:${id}`;
    const current = soundDependencies.get(key) ?? {
      id,
      name: id == null ? 'Streaming audio' : doc.characters.get(id) ? charName(doc.characters.get(id)!, api.project) : `Sound #${id}`,
      preview: id == null ? undefined : cache.preview(id, 'sound'),
      frames: [],
    };
    current.frames.push(`${event.clipName} · f${event.frame + 1}`);
    soundDependencies.set(key, current);
  });

  return (
    <div className="space-y-4 p-3 text-xs">
      <ActorProposals doc={doc} api={api} onOpenTimeline={onOpenTimeline} setFrame={setFrame} setLoopRange={setLoopRange} />
      <div className="space-y-2 rounded-lg border border-emerald-900/40 bg-emerald-950/10 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xl text-emerald-300">♙</span>
          <input
            className={cn(inputCls, 'flex-1 font-semibold text-emerald-200')}
            value={actor.name}
            onChange={(e) => api.updateActor(actor.id, { name: e.target.value })}
          />
          <Button variant="danger" onClick={() => api.removeActor(actor.id)}>×</Button>
        </div>
        <Field label="Notes">
          <textarea
            className={cn(inputCls, 'h-16 resize-none')}
            value={actor.notes ?? ''}
            onChange={(e) => api.updateActor(actor.id, { notes: e.target.value })}
            placeholder="Role, state machine notes, gameplay ownership…"
          />
        </Field>
        <Field label="Tags">
          <TagInput tags={actor.tags} suggestions={api.allTags} onChange={(tags) => api.updateActor(actor.id, { tags })} />
        </Field>
        <Field label="Classifications" hint="Use these as gameplay/content categories in the engine export.">
          <div className="grid grid-cols-2 gap-1">
            {ACTOR_CLASSIFICATIONS.map((classification) => {
              const selected = (actor.classifications ?? []).includes(classification);
              return (
                <label key={classification} className={cn('flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px]', selected ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-200' : 'border-zinc-800 text-zinc-500')}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      const next = new Set(actor.classifications ?? []);
                      event.target.checked ? next.add(classification) : next.delete(classification);
                      api.updateActor(actor.id, { classifications: [...next] });
                    }}
                    className="accent-emerald-500"
                  />
                  {classification}
                </label>
              );
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Runtime layer" hint="HUD always renders above World.">
            <select className={inputCls} value={actor.layer ?? 'World'} onChange={(e) => api.updateActor(actor.id, { layer: e.target.value as ActorLayer })}>
              {ACTOR_LAYERS.map((layer) => <option key={layer} value={layer}>{layer} Layer</option>)}
            </select>
          </Field>
          <Field label="Depth" hint="Higher draws later within the layer.">
            <input type="number" className={inputCls} value={actor.depth ?? 0} onChange={(e) => api.updateActor(actor.id, { depth: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-amber-900/40 bg-amber-950/10 p-3">
        <div className="flex items-center justify-between">
          <Head>Gameplay capabilities</Head>
          <span className="text-[10px] text-zinc-600">drives generated actor data</span>
        </div>
        <Field label="Combat mode" hint="Combat enables both attack and defense capability sets.">
          <select
            className={inputCls}
            value={capabilities.combat}
            onChange={(e) => updateCapabilities({ combat: e.target.value as ActorCombatMode })}
          >
            {ACTOR_COMBAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>

        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={capabilities.canMove}
            onChange={(e) => updateCapabilities({ canMove: e.target.checked })}
            className="accent-amber-500"
          />
          Can Move
        </label>

        {capabilities.canMove && (
          <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Movement animations</div>
            {!assignedClips.length && <div className="text-[10px] text-zinc-600">Assign clips above to populate these selectors.</div>}
            <div className="grid grid-cols-2 gap-2">
              {ACTOR_MOVEMENT_SLOTS.map((slot) => (
                <label key={slot.key} className="block">
                  <span className="mb-1 block text-[10px] text-zinc-500">{slot.label}</span>
                  <select
                    className={cn(inputCls, 'py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-35')}
                    value={capabilities.movementClips[slot.key] ?? ''}
                    onChange={(e) => updateCapabilities({ movementClips: { ...capabilities.movementClips, [slot.key]: e.target.value || undefined } })}
                  >
                    <option value="">Not assigned</option>
                    {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={!!capabilities.canWalk}
            onChange={(e) => updateCapabilities({ canWalk: e.target.checked })}
            className="accent-amber-500"
          />
          Can Walk
        </label>

        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Invert one facing side</div>
          <div className="flex rounded border border-zinc-800 bg-zinc-950/50 p-0.5">
            {([
              ['none', 'None'],
              ['left', 'Invert left'],
              ['right', 'Invert right'],
            ] as [ActorMirrorSide, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => updateCapabilities({ mirrorSide: value, useFlippedAnimations: value !== 'none' })}
                className={cn(
                  'flex-1 rounded px-1.5 py-1 text-[10px] font-medium',
                  (capabilities.mirrorSide ?? (capabilities.useFlippedAnimations ? 'right' : 'none')) === value
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
                )}
              >{label}</button>
            ))}
          </div>
          <div className="text-[10px] text-zinc-600">The selected side is generated from the opposite side and its selectors are disabled.</div>
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Optional idle facing animations</div>
          <div className="grid grid-cols-2 gap-2">
            {ACTOR_FACING_SLOTS.map((slot) => (
              <label key={slot.key} className="block">
                <span className="mb-1 block text-[10px] text-zinc-500">{slot.label}</span>
                <select
                    className={cn(inputCls, 'py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-35')}
                    disabled={(capabilities.mirrorSide ?? (capabilities.useFlippedAnimations ? 'right' : 'none')) === (slot.key.includes('left') ? 'left' : 'right')}
                  value={capabilities.idleAnimations?.[slot.key] ?? ''}
                  onChange={(e) => updateCapabilities({ idleAnimations: { ...capabilities.idleAnimations, [slot.key]: e.target.value || undefined } })}
                >
                  <option value="">Not assigned</option>
                  {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        {capabilities.canWalk && (
          <div className="space-y-2 rounded border border-amber-500/20 bg-amber-500/5 p-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-300">Walking animations</div>
            <div className="text-[10px] text-zinc-500">Held WASD moves the actor through the runtime world and selects these clips.</div>
            <div className="grid grid-cols-2 gap-2">
              {ACTOR_WALK_SLOTS.map((slot) => (
                <label key={slot.key} className="block">
                  <span className="mb-1 block text-[10px] text-zinc-500">{slot.label}</span>
                  <select
                    className={cn(inputCls, 'py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-35')}
                    disabled={(capabilities.mirrorSide ?? (capabilities.useFlippedAnimations ? 'right' : 'none')) === ((slot.key === 'left') ? 'left' : (slot.key === 'right') ? 'right' : 'none')}
                    value={capabilities.walkingClips?.[slot.key] ?? ''}
                    onChange={(e) => updateCapabilities({ walkingClips: { ...capabilities.walkingClips, [slot.key]: e.target.value || undefined } })}
                  >
                    <option value="">Not assigned</option>
                    {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {canAttack && (
          <div className="space-y-2 rounded border border-rose-900/40 bg-rose-950/10 p-2">
            <div className="text-[10px] uppercase tracking-wider text-rose-300">Attack animations</div>
            {!assignedClips.length && <div className="text-[10px] text-zinc-600">Assign clips above to select attack animations.</div>}
            <div className="grid grid-cols-2 gap-1">
              {assignedClips.map((clip) => (
                <label key={clip.id} className="flex items-center gap-1.5 rounded px-1 py-1 text-[11px] text-zinc-300 hover:bg-zinc-900">
                  <input
                    type="checkbox"
                    checked={capabilities.attackClipIds.includes(clip.id)}
                    onChange={(e) => {
                      const next = new Set(capabilities.attackClipIds);
                      e.target.checked ? next.add(clip.id) : next.delete(clip.id);
                      updateCapabilities({ attackClipIds: [...next] });
                    }}
                    className="accent-rose-500"
                  />
                  <span className="truncate">{clip.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {canBeAttacked && (
          <Field label="Defense animation" hint="Used when this actor receives damage or is targeted by an attack.">
            <select
              className={inputCls}
              value={capabilities.defenseClipId ?? ''}
              onChange={(e) => updateCapabilities({ defenseClipId: e.target.value || undefined })}
            >
              <option value="">Not assigned</option>
              {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
            </select>
          </Field>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-sky-900/40 bg-sky-950/10 p-3">
        <div className="flex items-center justify-between">
          <Head>Keyboard actions & sequences</Head>
          <span className="text-[10px] text-zinc-600">used by Game Engine</span>
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Create action</div>
          <div className="flex gap-1">
            <input className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={newActionName} onChange={(e) => setNewActionName(e.target.value)} placeholder="action name, e.g. throw" />
            <select className={cn(inputCls, 'w-40 py-1 text-[11px]')} value={newActionTarget} onChange={(e) => setNewActionTarget(e.target.value)}>
              <option value="">target…</option>
              {targetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Button
              className="py-1 text-[11px]"
              disabled={!newActionName.trim() || !newActionTarget}
              onClick={() => {
                const [kind, id] = newActionTarget.split(':');
                const action: ActorAction = { id: actionId(), name: newActionName.trim(), ...(kind === 'clip' ? { clipId: id } : { sequenceId: id }) };
                api.updateActor(actor.id, { actions: [...actions, action] });
                setNewActionName(''); setNewActionTarget('');
              }}
            >＋</Button>
          </div>
          <div className="space-y-1">
            {actions.map((action) => {
              const target = action.clipId ? assignedClips.find((clip) => clip.id === action.clipId)?.name : sequences.find((sequence) => sequence.id === action.sequenceId)?.name;
              return (
                <div key={action.id} className="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1 text-[11px]">
                  <span className="flex-1 text-zinc-200">{action.name}</span>
                  <span className="truncate text-zinc-500">{target ?? 'missing target'}</span>
                  <button className="text-zinc-600 hover:text-rose-400" onClick={() => {
                    api.updateActor(actor.id, { actions: actions.filter((item) => item.id !== action.id), keyBindings: Object.fromEntries(Object.entries(keyBindings).filter(([, id]) => id !== action.id)) });
                  }}>×</button>
                </div>
              );
            })}
            {!actions.length && <div className="text-[10px] text-zinc-600">Create an action, then bind it to a keyboard key below.</div>}
          </div>
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Keyboard bindings</div>
          <div className="flex gap-1">
            <input className={cn(inputCls, 'w-28 py-1 text-[11px]')} value={newBindingKey} onChange={(e) => setNewBindingKey(e.target.value)} placeholder="key, e.g. Space" />
            <select className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={newBindingAction} onChange={(e) => setNewBindingAction(e.target.value)}>
              <option value="">action…</option>
              {actions.map((action) => <option key={action.id} value={action.id}>{action.name}</option>)}
            </select>
            <Button
              className="py-1 text-[11px]"
              disabled={!newBindingKey.trim() || !newBindingAction}
              onClick={() => {
                const key = normalizeActorKey(newBindingKey);
                api.updateActor(actor.id, { keyBindings: { ...keyBindings, [key]: newBindingAction } });
                setNewBindingKey(''); setNewBindingAction('');
              }}
            >＋</Button>
          </div>
          {Object.entries(keyBindings).map(([key, actionIdValue]) => (
            <div key={key} className="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1 text-[11px]">
              <span className="min-w-16 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-center text-sky-200">{key}</span>
              <span className="flex-1 text-zinc-300">{actions.find((action) => action.id === actionIdValue)?.name ?? 'missing action'}</span>
              <button className="text-zinc-600 hover:text-rose-400" onClick={() => {
                const next = { ...keyBindings }; delete next[key]; api.updateActor(actor.id, { keyBindings: next });
              }}>×</button>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Animation sequences</div>
          <div className="flex gap-1">
            <input className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={newSequenceName} onChange={(e) => setNewSequenceName(e.target.value)} placeholder="sequence name, e.g. throw" />
            <Button
              className="py-1 text-[11px]"
              disabled={!newSequenceName.trim()}
              onClick={() => {
                const sequence: ActorSequence = { id: actionId(), name: newSequenceName.trim(), steps: [], loop: false };
                api.updateActor(actor.id, { sequences: [...sequences, sequence] });
                setNewSequenceName('');
              }}
            >＋ sequence</Button>
          </div>
          {sequences.map((sequence) => (
            <div key={sequence.id} className="space-y-2 rounded border border-zinc-800 bg-zinc-900 p-2">
              <div className="flex items-center gap-1">
                <input className={cn(inputCls, 'flex-1 py-1 text-[11px]')} value={sequence.name} onChange={(e) => api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, name: e.target.value } : item) })} />
                <label className="flex items-center gap-1 text-[10px] text-zinc-500"><input type="checkbox" checked={!!sequence.loop} onChange={(e) => api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, loop: e.target.checked } : item) })} /> loop</label>
                <button className="text-zinc-600 hover:text-rose-400" onClick={() => api.updateActor(actor.id, { sequences: sequences.filter((item) => item.id !== sequence.id), actions: actions.filter((action) => action.sequenceId !== sequence.id) })}>×</button>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {sequence.steps.map((step, index) => (
                  <span key={`${step.clipId}-${index}`} className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">
                    {assignedClips.find((clip) => clip.id === step.clipId)?.name ?? 'missing clip'}
                    <button className="text-violet-400 hover:text-rose-300" onClick={() => api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, steps: item.steps.filter((_, stepIndex) => stepIndex !== index) } : item) })}>×</button>
                  </span>
                ))}
                {!sequence.steps.length && <span className="text-[10px] text-zinc-600">No steps yet.</span>}
              </div>
              <select
                className={cn(inputCls, 'py-1 text-[11px]')}
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  api.updateActor(actor.id, { sequences: sequences.map((item) => item.id === sequence.id ? { ...item, steps: [...item.steps, { clipId: e.target.value }] } : item) });
                }}
              >
                <option value="">＋ add clip step…</option>
                {assignedClips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
              </select>
            </div>
          ))}
          {!sequences.length && <div className="text-[10px] text-zinc-600">Build ordered sequences such as throw → release → reset, then bind them to a key.</div>}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Head>Assigned Clips ({actor.clipIds.length})</Head>
        <span className="text-[10px] text-zinc-600">clip frames are snapshotted</span>
      </div>

      <div className="space-y-1.5">
        {clips.map((clip) => {
          const checked = assigned.has(clip.id);
          const frameInfo = clip.frames ?? [];
          const eventCount = frameInfo.reduce((n, f) => n + f.events.length, 0);
          const soundCount = frameInfo.reduce((n, f) => n + f.events.filter((e) => e.kind === 'sound').length, 0);
          const codeCount = frameInfo.reduce((n, f) => n + f.events.filter((e) => e.kind === 'action').length, 0);
          return (
            <div
              key={clip.id}
              className={cn('rounded border p-2 transition', checked ? 'border-emerald-700/60 bg-emerald-950/15' : 'border-zinc-800 bg-zinc-900/50')}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => api.assignClip(actor.id, clip.id, e.target.checked)}
                  className="mt-1 accent-emerald-500"
                  title="Assign clip to actor"
                />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => { onOpenTimeline(clip.timelineId); setFrame(clip.start); setLoopRange([clip.start, clip.end]); }}
                >
                  <div className="truncate font-medium text-zinc-200">{clip.name}</div>
                  <div className="text-[10px] text-zinc-500">
                    {clip.end - clip.start + 1} frames · {frameInfo.length || 'legacy'} frame data
                  </div>
                </button>
                <span className="text-[10px] text-zinc-600">{clip.loop ? 'loop' : 'once'}</span>
              </div>
              <div className="mt-1 pl-6 text-[10px] text-zinc-500">
                {eventCount} events · <span className="text-rose-300/80">{codeCount} code</span> · <span className="text-cyan-300/80">{soundCount} sounds</span>
              </div>
            </div>
          );
        })}
        {!clips.length && <p className="rounded border border-dashed border-zinc-800 p-3 text-center text-zinc-600">Create a clip from a highlighted timeline range first.</p>}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <div className="mb-2 flex border-b border-zinc-800">
          {([
            ['code', 'Code', codeEvents.length],
            ['images', 'Images', imageDependencies.length],
            ['sounds', 'Sounds', soundDependencies.size],
          ] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              onClick={() => setDependencyTab(tab)}
              className={cn(
                'flex-1 border-b-2 px-2 py-1.5 text-[11px] font-medium',
                dependencyTab === tab ? 'border-emerald-500 text-emerald-200' : 'border-transparent text-zinc-500 hover:text-zinc-300',
              )}
            >{label} <span className="text-[10px] text-zinc-600">{count}</span></button>
          ))}
        </div>

        {dependencyTab === 'code' && (
          <ActorCodeDependencies events={codeEvents} />
        )}
        {dependencyTab === 'images' && (
          <ActorImageDependencies dependencies={imageDependencies} />
        )}
        {dependencyTab === 'sounds' && (
          <ActorSoundDependencies dependencies={[...soundDependencies.values()]} />
        )}
      </div>
    </div>
  );
}
