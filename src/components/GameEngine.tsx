import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AssetCache } from '../lib/assets';
import { buildFramesForContainer } from '../lib/exporter';
import { drawTimeline } from '../lib/render';
import type {
  Actor, ActorAction, ActorCapabilities, ActorFacing, ActorLayer, ActorMirrorSide, ActorSequence, Clip, FrameActionDetail, SwfDocument, Timeline,
} from '../types';
import { defaultActorCapabilities } from '../types';
import { cn } from '../utils/cn';
import { Button, Chip, EVENT_COLOR, inputCls } from './ui';
import { usePeerNetwork } from '../lib/peerNetwork';
import { readGameData } from '../lib/gameData';
import { NetworkPanel as RoomNetworkPanel } from './NetworkPanel';

interface RuntimeClip {
  id: string;
  name: string;
  timelineId: string;
  start: number;
  end: number;
  frameCount: number;
  loop: boolean;
  fps?: number;
  frames: FrameActionDetail[];
}

interface RuntimeActor {
  id: string;
  name: string;
  tags: string[];
  classifications?: string[];
  notes?: string;
  capabilities?: ActorCapabilities;
  actions: ActorAction[];
  sequences: ActorSequence[];
  keyBindings: Record<string, string>;
  clips: RuntimeClip[];
  layer: ActorLayer;
  depth: number;
}

interface RuntimeInstance {
  id: string;
  actorId: string;
  clipId?: string;
  frame: number;
  x: number;
  y: number;
  sequenceId?: string;
  sequenceStep?: number;
  facing: ActorFacing;
  layer: ActorLayer;
  depth: number;
  ownerUserId?: string;
}

interface SequenceRun {
  instanceId: string;
  sequenceId: string;
  stepIndex: number;
}

interface VerificationItem {
  level: 'pass' | 'warn' | 'fail';
  text: string;
}

interface GameEngineProps {
  doc: SwfDocument;
  cache: AssetCache;
  actors: Actor[];
  clips: Clip[];
  tick?: number;
}

function normalizeRuntimeKey(value: string) {
  const key = value.trim().toLowerCase();
  return key === ' ' || key === 'spacebar' ? 'space' : key;
}

const LAYER_ORDER: Record<ActorLayer, number> = {
  Background: 0,
  World: 100,
  Foreground: 200,
  HUD: 1000,
};


type WalkDirection = 'left' | 'right' | 'up' | 'down';

interface ResolvedMotion {
  clip?: RuntimeClip;
  flipX: boolean;
}

function mirrorSideFor(actor: RuntimeActor): ActorMirrorSide {
  return actor.capabilities?.mirrorSide ?? (actor.capabilities?.useFlippedAnimations ? 'right' : 'none');
}

function idleClipFor(actor: RuntimeActor, facing: ActorFacing): ResolvedMotion {
  const capabilities = actor.capabilities;
  const side = facing.includes('left') ? 'left' : 'right';
  const mirrorSide = mirrorSideFor(actor);
  const generatedFacing: Partial<Record<ActorFacing, ActorFacing>> = {
    'front-left': 'front-right',
    'back-left': 'back-right',
    'front-right': 'front-left',
    'back-right': 'back-left',
  };
  const sourceFacing = mirrorSide === side ? generatedFacing[facing] : undefined;
  const directId = sourceFacing
    ? capabilities?.idleAnimations?.[sourceFacing]
    : capabilities?.idleAnimations?.[facing] ?? capabilities?.movementClips.idle;
  const direct = actor.clips.find((clip) => clip.id === directId);
  if (direct) return { clip: direct, flipX: !!sourceFacing };

  const anyIdle = Object.values(capabilities?.idleAnimations ?? {}).find((id) => id);
  return { clip: actor.clips.find((clip) => clip.id === anyIdle) ?? actor.clips[0], flipX: false };
}

function walkingClipFor(actor: RuntimeActor, direction: WalkDirection): ResolvedMotion {
  const capabilities = actor.capabilities;
  const mirrorSide = mirrorSideFor(actor);
  const generated = mirrorSide === direction && (direction === 'left' || direction === 'right');
  const sourceDirection = generated ? (direction === 'left' ? 'right' : 'left') : direction;
  const directId = capabilities?.walkingClips?.[sourceDirection];
  const direct = actor.clips.find((clip) => clip.id === directId);
  if (direct) return { clip: direct, flipX: generated };
  return { clip: undefined, flipX: false };
}

function walkDirectionFor(keys: Set<string>): WalkDirection | null {
  if (keys.has('a') && !keys.has('d')) return 'left';
  if (keys.has('d') && !keys.has('a')) return 'right';
  if (keys.has('w') && !keys.has('s')) return 'up';
  if (keys.has('s') && !keys.has('w')) return 'down';
  if (keys.has('a')) return 'left';
  if (keys.has('d')) return 'right';
  if (keys.has('w')) return 'up';
  if (keys.has('s')) return 'down';
  return null;
}

function facingForDirection(direction: WalkDirection): ActorFacing {
  if (direction === 'left') return 'front-left';
  if (direction === 'right') return 'front-right';
  if (direction === 'up') return 'back-right';
  return 'front-right';
}

export function GameEngine({ doc, cache, actors, clips, tick = 0 }: GameEngineProps) {
  const [engineActors, setEngineActors] = useState<RuntimeActor[]>([]);
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [instances, setInstances] = useState<RuntimeInstance[]>([]);
  const [controlledInstanceId, setControlledInstanceId] = useState<string | null>(null);
  const [sequenceRun, setSequenceRun] = useState<SequenceRun | null>(null);
  const [runtimeFrame, setRuntimeFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [walking, setWalking] = useState(false);
  const [walkDirection, setWalkDirection] = useState<WalkDirection | null>(null);
  const [audio, setAudio] = useState(true);
  const [report, setReport] = useState<VerificationItem[] | null>(null);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [controlMode, setControlMode] = useState<'keyboard' | 'mouse' | 'gamepad'>('keyboard');
  const [mouseTarget, setMouseTarget] = useState<{ x: number; y: number } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const gameDataRef = useRef<HTMLInputElement>(null);
  const lastSound = useRef<string>('');
  const pressedKeys = useRef<Set<string>>(new Set());
  const network = usePeerNetwork();

  const projectActors = useMemo(() => normalizeProjectActors(actors, clips, doc), [actors, clips, doc]);

  useEffect(() => {
    if (!engineActors.length && projectActors.length) {
      setEngineActors(projectActors);
      setSelectedActorId(projectActors[0].id);
      const first = projectActors[0];
      setInstances([{ id: `instance:${first.id}`, actorId: first.id, clipId: first.clips[0]?.id, frame: 0, x: 275, y: 200, facing: 'front-right', layer: first.layer, depth: first.depth, ownerUserId: undefined }]);
      setControlledInstanceId(`instance:${first.id}`);
    }
  }, [engineActors.length, projectActors]);

  const selectedActor = engineActors.find((actor) => actor.id === selectedActorId) ?? null;
  const selectedClip = selectedActor?.clips.find((clip) => clip.id === selectedClipId)
    ?? selectedActor?.clips[0]
    ?? null;
  const frameCount = selectedClip?.frameCount ?? 1;
  const currentFrame = selectedClip?.frames?.[Math.max(0, Math.min(frameCount - 1, runtimeFrame))];
  const currentEvents = currentFrame?.events ?? [];
  const scene = instances.map((instance) => {
    const actor = engineActors.find((item) => item.id === instance.actorId);
    if (!actor) return null;
    const controlled = instance.id === controlledInstanceId;
    const idle = idleClipFor(actor, instance.facing);
    const runningSequence = controlled && sequenceRun?.instanceId === instance.id
      ? actor.sequences.find((sequence) => sequence.id === sequenceRun.sequenceId)
      : undefined;
    const sequenceClipId = runningSequence?.steps[sequenceRun?.stepIndex ?? 0]?.clipId;
    const clip = controlled
      ? (walking && walkDirection && actor.capabilities?.canWalk
        ? walkingClipFor(actor, walkDirection).clip ?? actor.clips.find((item) => item.id === (sequenceClipId ?? selectedClip?.id ?? instance.clipId))
        : actor.clips.find((item) => item.id === (sequenceClipId ?? selectedClip?.id ?? instance.clipId)))
      : idle.clip;
    const motion = !controlled
      ? idle
      : walking && walkDirection && actor.capabilities?.canWalk
        ? walkingClipFor(actor, walkDirection)
        : idle.clip?.id === clip?.id ? idle : { clip, flipX: false };
    if (!motion.clip) return null;
    const source = doc.timelines.get(motion.clip.timelineId);
    if (!source) return null;
    const localFrame = controlled ? runtimeFrame : instance.frame;
    return { ...instance, actor, clip: motion.clip, flipX: motion.flipX, timeline: source, frame: Math.min(source.frameCount - 1, motion.clip.start + localFrame), controlled };
  }).filter((item): item is NonNullable<typeof item> => !!item).sort((a, b) => {
    const layerDelta = LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer];
    return layerDelta || a.depth - b.depth;
  });

  useEffect(() => {
    setRuntimeFrame(0);
    setReport(null);
  }, [selectedActorId, selectedClipId]);

  useEffect(() => {
    if (!selectedActorId || !selectedClipId) return;
      setInstances((current) => current.map((instance) => instance.id === controlledInstanceId && instance.actorId === selectedActorId
      ? { ...instance, clipId: selectedClipId, frame: 0 }
      : instance));
  }, [selectedActorId, selectedClipId, controlledInstanceId]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (selectedClip) {
        setRuntimeFrame((value) => {
          if (value >= frameCount - 1) {
            if (sequenceRun?.instanceId === controlledInstanceId) {
              const actor = engineActors.find((item) => item.id === selectedActorId);
              const sequence = actor?.sequences.find((item) => item.id === sequenceRun.sequenceId);
              const nextIndex = (sequenceRun.stepIndex ?? 0) + 1;
              if (sequence && nextIndex < sequence.steps.length) {
                const nextClip = actor?.clips.find((item) => item.id === sequence.steps[nextIndex].clipId);
                if (nextClip) {
                  setSelectedClipId(nextClip.id);
                  setSequenceRun({ ...sequenceRun, stepIndex: nextIndex });
                  return 0;
                }
              } else if (sequence?.loop && sequence.steps[0]) {
                const firstClip = actor?.clips.find((item) => item.id === sequence.steps[0].clipId);
                if (firstClip) {
                  setSelectedClipId(firstClip.id);
                  setSequenceRun({ ...sequenceRun, stepIndex: 0 });
                  return 0;
                }
              }
              setSequenceRun(null);
              return value;
            }
            return selectedClip.loop ? 0 : value;
          }
          return value + 1;
        });
      }
    }, 1000 / Math.max(1, selectedClip?.fps ?? doc.header.frameRate));
    return () => window.clearInterval(timer);
  }, [playing, selectedClip, frameCount, doc.header.frameRate, controlledInstanceId, engineActors, sequenceRun, selectedActorId]);

  // Uncontrolled actors keep their idle clips alive independently of the
  // currently controlled actor and its action/sequence playback.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setInstances((current) => current.map((instance) => {
        if (instance.id === controlledInstanceId) return instance;
        const actor = engineActors.find((item) => item.id === instance.actorId);
        const idle = actor ? idleClipFor(actor, instance.facing) : undefined;
        if (!idle?.clip) return instance;
        return { ...instance, frame: instance.frame >= idle.clip.frameCount - 1 ? (idle.clip.loop ? 0 : instance.frame) : instance.frame + 1 };
      }));
    }, 1000 / Math.max(1, doc.header.frameRate));
    return () => window.clearInterval(timer);
  }, [doc.header.frameRate, engineActors, controlledInstanceId]);

  useEffect(() => {
    const updateWalking = () => {
      const direction = walkDirectionFor(pressedKeys.current);
      if (!direction) {
        setWalkDirection(null);
        setWalking(false);
        const instance = instances.find((item) => item.id === controlledInstanceId);
        const actor = instance ? engineActors.find((item) => item.id === instance.actorId) : undefined;
        const idle = actor ? idleClipFor(actor, instance?.facing ?? 'front-right') : undefined;
        if (idle?.clip) setSelectedClipId(idle.clip.id);
        return;
      }
      const instance = instances.find((item) => item.id === controlledInstanceId);
      const actor = instance ? engineActors.find((item) => item.id === instance.actorId) : undefined;
      if (!instance || !actor || !(actor.capabilities?.canMove || actor.capabilities?.canWalk)) return;
      setWalkDirection(direction);
      setWalking(true);
      const facing = facingForDirection(direction);
      setInstances((current) => current.map((item) => item.id === controlledInstanceId ? { ...item, facing } : item));
      const walkClip = actor.capabilities?.canWalk ? walkingClipFor(actor, direction).clip : undefined;
      if (walkClip) setSelectedClipId(walkClip.id);
      setPlaying(true);
    };

    const onKey = (event: KeyboardEvent) => {
      if (controlMode !== 'keyboard' || !controlledInstanceId || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName ?? '')) return;
      const movementKey = normalizeRuntimeKey(event.key);
      if (['w', 'a', 's', 'd'].includes(movementKey)) {
        event.preventDefault();
        pressedKeys.current.add(movementKey);
        updateWalking();
        return;
      }
      const controlled = instances.find((instance) => instance.id === controlledInstanceId);
      const controlledActor = controlled ? engineActors.find((actor) => actor.id === controlled.actorId) : undefined;
      const binding = controlledActor?.keyBindings?.[normalizeRuntimeKey(event.key)] ?? controlledActor?.keyBindings?.[normalizeRuntimeKey(event.code)];
      const action = binding ? controlledActor?.actions.find((item) => item.id === binding) : undefined;
      if (action && controlledActor) {
        event.preventDefault();
        setSelectedActorId(controlledActor.id);
        if (action.sequenceId) {
          const sequence = controlledActor.sequences.find((item) => item.id === action.sequenceId);
          const first = sequence?.steps[0];
          if (sequence && first) {
            setSelectedClipId(first.clipId);
            setSequenceRun({ instanceId: controlledInstanceId, sequenceId: sequence.id, stepIndex: 0 });
            setRuntimeFrame(0);
            setPlaying(true);
          }
        } else if (action.clipId) {
          setSequenceRun(null);
          setSelectedClipId(action.clipId);
          setRuntimeFrame(0);
          setPlaying(true);
        }
        return;
      }
      const delta = 12;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      setInstances((current) => current.map((instance) => {
        if (instance.id !== controlledInstanceId) return instance;
        return {
          ...instance,
          x: instance.x + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0),
          y: instance.y + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0),
        };
      }));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = normalizeRuntimeKey(event.key);
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      pressedKeys.current.delete(key);
      updateWalking();
    };
    const onBlur = () => {
      pressedKeys.current.clear();
      updateWalking();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); };
  }, [controlMode, controlledInstanceId, engineActors, instances]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!walking || !controlledInstanceId || !walkDirection) return;
      const speed = 120;
      const step = speed / 60;
      setInstances((current) => current.map((instance) => {
        if (instance.id !== controlledInstanceId) return instance;
        return {
          ...instance,
          x: instance.x + (walkDirection === 'left' ? -step : walkDirection === 'right' ? step : 0),
          y: instance.y + (walkDirection === 'up' ? -step : walkDirection === 'down' ? step : 0),
        };
      }));
    }, 1000 / 60);
    return () => window.clearInterval(timer);
  }, [walking, controlledInstanceId, walkDirection]);

  useEffect(() => {
    if (controlMode !== 'mouse' || !mouseTarget || !controlledInstanceId) return;
    const timer = window.setInterval(() => {
      setInstances((current) => current.map((instance) => {
        if (instance.id !== controlledInstanceId) return instance;
        const dx = mouseTarget.x - instance.x;
        const dy = mouseTarget.y - instance.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 2) return instance;
        const amount = Math.min(120 / 60, distance);
        const direction: WalkDirection = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        const facing = facingForDirection(direction);
        return { ...instance, x: instance.x + dx / distance * amount, y: instance.y + dy / distance * amount, facing };
      }));
    }, 1000 / 60);
    return () => window.clearInterval(timer);
  }, [controlMode, controlledInstanceId, mouseTarget]);

  useEffect(() => {
    if (controlMode !== 'gamepad' || !controlledInstanceId) return;
    let raf = 0;
    const poll = () => {
      const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected);
      if (pad) {
        const x = Math.abs(pad.axes[0] ?? 0) > 0.15 ? pad.axes[0] : 0;
        const y = Math.abs(pad.axes[1] ?? 0) > 0.15 ? pad.axes[1] : 0;
        if (x || y) {
          const direction: WalkDirection = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
          setWalkDirection(direction); setWalking(true);
          setInstances((current) => current.map((instance) => instance.id === controlledInstanceId ? { ...instance, x: instance.x + x * 2, y: instance.y + y * 2, facing: facingForDirection(direction) } : instance));
        } else {
          setWalkDirection(null); setWalking(false);
        }
        if (pad.buttons[0]?.pressed) setPlaying(true);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [controlMode, controlledInstanceId]);

  useEffect(() => {
    if (!audio || !selectedClip || !currentFrame) return;
    for (const event of currentEvents) {
      if (event.kind !== 'sound' || event.characterId == null) continue;
      const soundKey = `${selectedClip.id}:${runtimeFrame}:${event.characterId}`;
      if (lastSound.current === soundKey) continue;
      lastSound.current = soundKey;
      const preview = cache.preview(event.characterId, 'sound');
      if (!preview) continue;
      const player = new Audio(preview.url);
      player.volume = 0.7;
      void player.play().catch(() => {});
    }
  }, [audio, cache, currentEvents, currentFrame, runtimeFrame, selectedClip]);

  useEffect(() => {
    if (!network.enabled || !network.connectedCount) return;
    const instance = instances.find((item) => item.id === controlledInstanceId);
    network.send({ type: 'control', userId: network.userId, username: network.username, instanceId: controlledInstanceId, actorId: instance?.actorId ?? null, mode: controlMode, bindings: engineActors.find((actor) => actor.id === instance?.actorId)?.keyBindings ?? {} });
  }, [controlMode, controlledInstanceId, engineActors, instances, network.connectedCount, network.enabled, network.send, network.userId, network.username]);

  const importActors = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = normalizeImportedActors(parsed, doc, clips);
      if (!imported.length) throw new Error('No actors were found. Choose actors.json or a project JSON export.');
      setEngineActors((existing) => mergeActors(existing, imported));
      setSelectedActorId(imported[0].id);
      setSelectedClipId(imported[0].clips[0]?.id ?? null);
      const created = imported.map((actor, index) => ({ id: `instance:${actor.id}:${Date.now()}:${index}`, actorId: actor.id, clipId: actor.clips[0]?.id, frame: 0, x: 275 + index * 40, y: 200 + index * 20, facing: 'front-right' as ActorFacing, layer: actor.layer, depth: actor.depth, ownerUserId: undefined }));
      setInstances((existing) => [...existing, ...created]);
      setControlledInstanceId(created[0]?.id ?? null);
      setReport([{ level: 'pass', text: `Imported ${imported.length} actor${imported.length === 1 ? '' : 's'} into the isolated runtime.` }]);
    } catch (error) {
      setReport([{ level: 'fail', text: error instanceof Error ? error.message : 'Could not import actor JSON.' }]);
    }
  };

  const importGameData = async (file: File) => {
    try {
      const payload = await readGameData(file);
      if (!payload.actors.length && !payload.clips.length) throw new Error('No actors or clips found in this Game Data file. Choose an exported SWF Forge ZIP or project JSON.');
      const imported = normalizeImportedActors({ actors: payload.actors, clips: payload.clips }, doc, clips);
      if (!imported.length) throw new Error('Game Data contained clips but no actor relationships could be restored.');
      setEngineActors((existing) => mergeActors(existing, imported));
      const created = imported.map((actor, index) => ({ id: `instance:${actor.id}:${Date.now()}:${index}`, actorId: actor.id, clipId: actor.clips[0]?.id, frame: 0, x: 275 + index * 40, y: 200 + index * 20, facing: 'front-right' as ActorFacing, layer: actor.layer, depth: actor.depth }));
      setInstances((existing) => [...existing, ...created]);
      setSelectedActorId(imported[0].id);
      setSelectedClipId(imported[0].clips[0]?.id ?? null);
      setControlledInstanceId(created[0]?.id ?? null);
      setReport([{ level: 'pass', text: `Loaded ${payload.sourceName}: ${imported.length} actors, ${payload.clips.length} clips, and their relationships.` }]);
    } catch (error) {
      setReport([{ level: 'fail', text: error instanceof Error ? error.message : 'Could not load Game Data.' }]);
    }
  };

  const importProjectActors = () => {
    if (!projectActors.length) {
      setReport([{ level: 'warn', text: 'This project has no actors yet. Create actors in the Actors tab first.' }]);
      return;
    }
    setEngineActors((existing) => mergeActors(existing, projectActors));
    setSelectedActorId(projectActors[0].id);
    setSelectedClipId(projectActors[0].clips[0]?.id ?? null);
    const created = projectActors.map((actor, index) => ({ id: `instance:${actor.id}:${Date.now()}:${index}`, actorId: actor.id, clipId: actor.clips[0]?.id, frame: 0, x: 275 + index * 40, y: 200 + index * 20, facing: 'front-right' as ActorFacing, layer: actor.layer, depth: actor.depth, ownerUserId: undefined }));
    setInstances((existing) => [...existing, ...created]);
    setControlledInstanceId(created[0]?.id ?? null);
    setReport([{ level: 'pass', text: `Imported ${projectActors.length} current project actor${projectActors.length === 1 ? '' : 's'}.` }]);
  };

  const verify = () => {
    if (!selectedActor) return;
    const results: VerificationItem[] = [];
    if (!selectedActor.clips.length) results.push({ level: 'warn', text: 'Actor has no assigned clips.' });
    else results.push({ level: 'pass', text: `${selectedActor.clips.length} assigned clip${selectedActor.clips.length === 1 ? '' : 's'} available.` });

    for (const clip of selectedActor.clips) {
      if (!clip.frames.length) results.push({ level: 'warn', text: `${clip.name}: no frame snapshot data.` });
      else if (clip.frames.length !== clip.frameCount) results.push({ level: 'warn', text: `${clip.name}: ${clip.frames.length}/${clip.frameCount} frame records.` });
      else results.push({ level: 'pass', text: `${clip.name}: all ${clip.frameCount} frame records are present.` });
      if (!doc.timelines.has(clip.timelineId)) results.push({ level: 'warn', text: `${clip.name}: source timeline is not in the current document.` });
    }

    const caps = selectedActor.capabilities ?? defaultActorCapabilities();
    if (caps.canMove) {
      const assigned = Object.entries(caps.movementClips).filter(([, clipId]) => clipId);
      results.push(assigned.length ? { level: 'pass', text: `Movement has ${assigned.length} assigned animation slot${assigned.length === 1 ? '' : 's'}.` } : { level: 'warn', text: 'Can Move is enabled but no movement animations are assigned.' });
    }
    if (caps.combat !== 'none') {
      if (caps.combat === 'combat' || caps.combat === 'canAttack') results.push(caps.attackClipIds.length ? { level: 'pass', text: `${caps.attackClipIds.length} attack animation${caps.attackClipIds.length === 1 ? '' : 's'} assigned.` } : { level: 'warn', text: 'Attack capability is enabled but no attack clips are assigned.' });
      if (caps.combat === 'combat' || caps.combat === 'canBeAttacked') results.push(caps.defenseClipId ? { level: 'pass', text: 'Defense animation assigned.' } : { level: 'warn', text: 'Defense capability is enabled but no defense clip is assigned.' });
    }
    setReport(results);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-zinc-100">Isolated Game Engine</div>
          <div className="text-[10px] text-zinc-500">Test actor clips, frame events, sounds, and capability wiring without the SWF main timeline.</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {network.networkEnabled && <Button variant={network.enabled ? 'primary' : 'ghost'} onClick={() => { if (network.enabled) network.disable(); else { network.enable(); setNetworkOpen(true); } }}>
            {network.enabled ? `Network ${network.connectedCount ? `· ${network.connectedCount}` : ''}` : 'Network off'}
          </Button>}
          <select className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-400" value={controlMode} onChange={(event) => setControlMode(event.target.value as typeof controlMode)} title="Input device for the selected actor">
            <option value="keyboard">Keyboard</option>
            <option value="mouse">Mouse</option>
            <option value="gamepad">Gamepad</option>
          </select>
          <Button onClick={importProjectActors}>Import project actors</Button>
          <Button onClick={() => gameDataRef.current?.click()}>Import Game Data</Button>
          <Button variant="primary" onClick={() => importRef.current?.click()}>Import actors.json</Button>
          <input ref={gameDataRef} type="file" accept=".zip,.json,application/zip,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importGameData(file); event.currentTarget.value = ''; }} />
          <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importActors(file); event.currentTarget.value = ''; }} />
        </div>
      </div>

      {network.networkEnabled && network.enabled && networkOpen && <RoomNetworkPanel network={network} onClose={() => setNetworkOpen(false)} />}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Scene instances ({instances.length})</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {instances.map((instance) => {
              const actor = engineActors.find((item) => item.id === instance.actorId);
              if (!actor) return null;
              const controlled = instance.id === controlledInstanceId;
              return (
                <div key={instance.id} className={cn('mb-1 rounded border px-2 py-2', controlled ? 'border-emerald-600/60 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-900/40')}>
                  <button className="w-full text-left" onClick={() => { setSequenceRun(null); setSelectedActorId(actor.id); setSelectedClipId(instance.clipId ?? actor.clips[0]?.id ?? null); }}>
                    <div className="truncate text-xs font-medium text-zinc-200">♙ {actor.name}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">{controlled ? 'controlled' : 'idle autonomous'} · {instance.layer} · depth {instance.depth} · {Math.round(instance.x)},{Math.round(instance.y)}</div>
                    {!!actor.classifications?.length && <div className="mt-1 flex flex-wrap gap-1">{actor.classifications.map((classification) => <span key={classification} className="rounded border border-amber-500/20 px-1 text-[9px] text-amber-300/80">{classification}</span>)}</div>}
                  </button>
                  <div className="mt-1 flex items-center gap-1">
                    <Button className="flex-1 py-1 text-[10px]" variant={controlled ? 'primary' : 'ghost'} onClick={() => { setSequenceRun(null); setControlledInstanceId(instance.id); setSelectedActorId(actor.id); setSelectedClipId(instance.clipId ?? actor.clips[0]?.id ?? null); }}>
                      {controlled ? 'control' : 'take control'}
                    </Button>
                    <Button className="py-1 text-[10px]" variant="danger" onClick={() => { setInstances((current) => current.filter((item) => item.id !== instance.id)); if (controlled) setControlledInstanceId(null); }}>×</Button>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <select
                      className="rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-[10px] text-zinc-400"
                      value={instance.layer}
                      onChange={(event) => setInstances((current) => current.map((item) => item.id === instance.id ? { ...item, layer: event.target.value as ActorLayer } : item))}
                    >
                      {(['Background', 'World', 'Foreground', 'HUD'] as ActorLayer[]).map((layer) => <option key={layer} value={layer}>{layer} Layer</option>)}
                    </select>
                    <input
                      type="number"
                      className="rounded border border-zinc-800 bg-zinc-950 px-1 py-1 text-[10px] text-zinc-400"
                      value={instance.depth}
                      title="Higher depth draws later within the layer"
                      onChange={(event) => setInstances((current) => current.map((item) => item.id === instance.id ? { ...item, depth: Number(event.target.value) || 0 } : item))}
                    />
                  </div>
                </div>
              );
            })}
            {!instances.length && <div className="p-3 text-center text-xs text-zinc-600">Import actors to begin.</div>}
          </div>
          <div className="border-t border-zinc-800 p-2">
            <select
              className={cn(inputCls, 'text-[11px]')}
              value=""
              onChange={(event) => {
                const actor = engineActors.find((item) => item.id === event.target.value);
                if (!actor) return;
                const instance = { id: `instance:${actor.id}:${Date.now()}`, actorId: actor.id, clipId: actor.clips[0]?.id, frame: 0, x: 275 + instances.length * 35, y: 200 + instances.length * 20, facing: 'front-right' as ActorFacing, layer: actor.layer, depth: actor.depth };
                setInstances((current) => [...current, instance]);
                if (!controlledInstanceId) { setControlledInstanceId(instance.id); setSelectedActorId(actor.id); setSelectedClipId(instance.clipId ?? null); }
              }}
            >
              <option value="">＋ Add actor instance…</option>
              {engineActors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
            </select>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <select className={cn(inputCls, 'w-52')} value={selectedClip?.id ?? ''} onChange={(event) => { setSequenceRun(null); setSelectedClipId(event.target.value || null); }} disabled={!selectedActor}>
              <option value="">Select clip…</option>
              {selectedActor?.clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name} · {clip.frameCount}f</option>)}
            </select>
            <Button variant="ghost" onClick={() => setRuntimeFrame(0)} disabled={!selectedClip}>⏮</Button>
            <Button variant="ghost" onClick={() => setRuntimeFrame((value) => Math.max(0, value - 1))} disabled={!selectedClip}>◀</Button>
            <Button variant="primary" onClick={() => setPlaying((value) => !value)} disabled={!selectedClip}>{playing ? '❚❚' : '▶'}</Button>
            <Button variant="ghost" onClick={() => setRuntimeFrame((value) => Math.min(frameCount - 1, value + 1))} disabled={!selectedClip}>▶</Button>
            <Button variant="ghost" onClick={() => setRuntimeFrame(frameCount - 1)} disabled={!selectedClip}>⏭</Button>
            <label className="flex items-center gap-1 text-xs text-zinc-500">frame
              <input type="number" min={1} max={frameCount} value={runtimeFrame + 1} onChange={(event) => setRuntimeFrame(Math.max(0, Math.min(frameCount - 1, Number(event.target.value) - 1)))} className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100" />
              / {frameCount}
            </label>
            <Button variant={audio ? 'primary' : 'default'} onClick={() => setAudio((value) => !value)}>{audio ? '🔊 audio' : '🔈 muted'}</Button>
            <Button onClick={verify} disabled={!selectedActor}>verify actor</Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="grid min-h-full grid-cols-[minmax(0,1fr)_300px] gap-3">
              <div className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
                {scene.length ? (
                  <EngineScene doc={doc} cache={cache} instances={scene} tick={tick} mouseEnabled={controlMode === 'mouse'} onMouseTarget={setMouseTarget} />
                ) : (
                  <div className="flex min-h-[420px] flex-1 items-center justify-center text-center text-xs text-zinc-600">
                    <div>{selectedClip ? 'This imported clip has no matching timeline in the current document.' : 'Import an actor and choose a clip to run it.'}<br /><span className="text-[10px]">Frame data and events remain testable without source visuals.</span></div>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-zinc-200">Runtime frame</span><Chip className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{currentFrame ? `f${currentFrame.index + 1}` : 'no data'}</Chip></div>
                {selectedClip && <div className="space-y-1 text-[10px] text-zinc-500"><div>{selectedClip.name}</div><div>{selectedClip.loop ? 'Looping' : 'One-shot'} · {selectedClip.fps ?? doc.header.frameRate} fps</div><div>{currentFrame?.instances.length ?? 0} instances · {currentEvents.length} events</div></div>}
                <div className="space-y-1">
                  {currentEvents.map((event, index) => <div key={`${event.tagType}-${index}`} className="rounded border border-zinc-800 bg-zinc-950/50 p-1.5"><span className={cn('mr-1 inline-block h-1.5 w-1.5 rounded-full', EVENT_COLOR[event.kind as keyof typeof EVENT_COLOR]?.dot ?? 'bg-zinc-500')} /> <span className="text-[10px] text-zinc-300">{event.tagType}</span><div className="mt-0.5 max-h-20 overflow-auto whitespace-pre-wrap text-[10px] text-zinc-500">{event.detail}</div></div>)}
                  {!currentEvents.length && <div className="text-[10px] text-zinc-600">No code or sound events on this frame.</div>}
                </div>
                {selectedActor && (
                  <div className="space-y-2 border-t border-zinc-800 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Keyboard actions</div>
                    {Object.entries(selectedActor.keyBindings).map(([key, actionId]) => {
                      const action = selectedActor.actions.find((item) => item.id === actionId);
                      return <button key={key} className="flex w-full items-center gap-2 rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-left hover:border-sky-500/40" onClick={() => triggerRuntimeAction(selectedActor, actionId, controlledInstanceId, setSelectedClipId, setSequenceRun, setRuntimeFrame, setPlaying)}><span className="min-w-12 rounded border border-sky-500/30 bg-sky-500/10 px-1 text-center text-[10px] text-sky-200">{key}</span><span className="text-[10px] text-zinc-300">{action?.name ?? 'missing action'}</span></button>;
                    })}
                    {!Object.keys(selectedActor.keyBindings).length && <div className="text-[10px] text-zinc-600">Assign keys to actions in the Actors tab.</div>}
                    {!!selectedActor.sequences.length && <div className="space-y-1 pt-1"><div className="text-[10px] uppercase tracking-wider text-zinc-600">Sequences</div>{selectedActor.sequences.map((sequence) => <div key={sequence.id} className="rounded border border-violet-500/20 bg-violet-500/5 px-2 py-1 text-[10px] text-violet-200"><div className="font-medium">{sequence.name}</div><div className="text-zinc-500">{sequence.steps.map((step) => selectedActor.clips.find((clip) => clip.id === step.clipId)?.name ?? 'missing').join(' → ') || 'no steps'}</div></div>)}</div>}
                  </div>
                )}
              </div>
            </div>

            {report && <div className="mt-3 space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Verification report</div>{report.map((item, index) => <div key={index} className={cn('rounded border px-2 py-1.5 text-xs', item.level === 'pass' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : item.level === 'warn' ? 'border-amber-500/20 bg-amber-500/5 text-amber-300' : 'border-rose-500/20 bg-rose-500/5 text-rose-300')}>{item.level === 'pass' ? '✓' : item.level === 'warn' ? '!' : '×'} {item.text}</div>)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeProjectActors(actors: Actor[], clips: Clip[], doc: SwfDocument): RuntimeActor[] {
  return actors.map((actor) => ({
    id: actor.id,
    name: actor.name,
    tags: actor.tags,
    classifications: actor.classifications,
    notes: actor.notes,
    capabilities: actor.capabilities,
    actions: actor.actions ?? [],
    sequences: actor.sequences ?? [],
    keyBindings: actor.keyBindings ?? {},
    layer: actor.layer ?? 'World',
    depth: actor.depth ?? 0,
    clips: actor.clipIds.map((clipId) => normalizeClip(clips.find((clip) => clip.id === clipId), doc)).filter((clip): clip is RuntimeClip => !!clip),
  }));
}

function normalizeClip(clip: Clip | undefined, doc: SwfDocument): RuntimeClip | undefined {
  if (!clip) return undefined;
  const timeline = doc.timelines.get(clip.timelineId);
  return {
    id: clip.id,
    name: clip.name,
    timelineId: clip.timelineId,
    start: clip.start,
    end: clip.end,
    frameCount: clip.end - clip.start + 1,
    loop: clip.loop,
    fps: clip.fps,
    frames: clip.frames ?? (timeline ? buildFramesForContainer(timeline, clip.start, clip.end) : []),
  };
}

function normalizeImportedActors(raw: unknown, doc: SwfDocument, projectClips: Clip[]): RuntimeActor[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as { actors?: unknown; project?: { actors?: unknown; clips?: unknown }; clips?: unknown };
  const rawActors = Array.isArray(data.actors) ? data.actors : Array.isArray(data.project?.actors) ? data.project.actors : [];
  const rawClips = Array.isArray(data.clips) ? data.clips : Array.isArray(data.project?.clips) ? data.project.clips : projectClips;
  const clipMap = new Map<string, RuntimeClip>();
  for (const rawClip of rawClips) {
    const clip = rawClip as Partial<RuntimeClip> & { id?: string; timeline?: string; start?: number; end?: number; from?: number; to?: number };
    if (!clip.id) continue;
    clipMap.set(String(clip.id), {
      id: String(clip.id), name: String(clip.name ?? clip.id), timelineId: String(clip.timelineId ?? clip.timeline ?? ''),
      start: Number(clip.start ?? clip.from ?? 0), end: Number(clip.end ?? clip.to ?? 0),
      frameCount: Number(clip.frameCount ?? clip.frames?.length ?? 0), loop: Boolean(clip.loop), fps: clip.fps,
      frames: Array.isArray(clip.frames) ? clip.frames as FrameActionDetail[] : [],
    });
  }
  return rawActors.map((rawActor) => {
    const actor = rawActor as Partial<RuntimeActor> & { clipIds?: string[] };
    const inlineClips = Array.isArray(actor.clips) ? actor.clips as RuntimeClip[] : [];
    const actorClips = inlineClips.length ? inlineClips : (actor.clipIds ?? []).map((id) => clipMap.get(String(id))).filter((clip): clip is RuntimeClip => !!clip);
    return { id: String(actor.id ?? `imported-${Math.random().toString(36).slice(2)}`), name: String(actor.name ?? 'Imported Actor'), tags: actor.tags ?? [], classifications: actor.classifications, notes: actor.notes, capabilities: normalizeImportedCapabilities(actor.capabilities), actions: actor.actions ?? [], sequences: actor.sequences ?? [], keyBindings: actor.keyBindings ?? {}, layer: actor.layer ?? 'World', depth: actor.depth ?? 0, clips: actorClips };
  }).map((actor) => ({
    ...actor,
    clips: actor.clips.map((clip) => clip.frames.length ? clip : { ...clip, frames: doc.timelines.get(clip.timelineId) ? buildFramesForContainer(doc.timelines.get(clip.timelineId)!, clip.start, clip.end) : [] }),
  }));
}

function normalizeImportedCapabilities(raw: unknown): ActorCapabilities | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<ActorCapabilities> & {
    combatMode?: ActorCapabilities['combat'];
    canAttack?: boolean;
    canBeAttacked?: boolean;
    canWalk?: boolean;
    useFlippedAnimations?: boolean;
    mirrorSide?: ActorMirrorSide;
    movement?: Record<string, string | { id?: string } | null>;
    idleAnimations?: Record<string, string | { id?: string } | null>;
    walking?: Record<string, string | { id?: string } | null>;
    attacks?: (string | { id?: string } | null)[];
    defense?: string | { id?: string } | null;
  };
  const combat = value.combat ?? value.combatMode ?? (
    value.canAttack && value.canBeAttacked ? 'combat' : value.canAttack ? 'canAttack' : value.canBeAttacked ? 'canBeAttacked' : 'none'
  );
  const movementClips = Object.fromEntries(
    Object.entries(value.movement ?? value.movementClips ?? {}).map(([slot, clip]) => [slot, typeof clip === 'string' ? clip : clip?.id]).filter((entry): entry is [string, string] => !!entry[1]),
  ) as ActorCapabilities['movementClips'];
  const idleAnimations = Object.fromEntries(
    Object.entries(value.idleAnimations ?? {}).map(([facing, clip]) => [facing, typeof clip === 'string' ? clip : clip?.id]).filter((entry): entry is [string, string] => !!entry[1]),
  ) as ActorCapabilities['idleAnimations'];
  const walkingClips = Object.fromEntries(
    Object.entries(value.walking ?? value.walkingClips ?? {}).map(([direction, clip]) => [direction, typeof clip === 'string' ? clip : clip?.id]).filter((entry): entry is [string, string] => !!entry[1]),
  ) as ActorCapabilities['walkingClips'];
  const attackClipIds = (value.attackClipIds ?? value.attacks ?? []).map((clip) => typeof clip === 'string' ? clip : clip?.id).filter((clip): clip is string => !!clip);
  const defenseClipId = typeof value.defenseClipId === 'string' ? value.defenseClipId : typeof value.defense === 'string' ? value.defense : value.defense?.id;
  return { combat, canMove: Boolean(value.canMove), canWalk: Boolean(value.canWalk), useFlippedAnimations: Boolean(value.useFlippedAnimations), mirrorSide: value.mirrorSide ?? (value.useFlippedAnimations ? 'right' : 'none'), movementClips, idleAnimations, walkingClips, attackClipIds, defenseClipId };
}

function mergeActors(existing: RuntimeActor[], incoming: RuntimeActor[]) {
  return [...existing.filter((actor) => !incoming.some((item) => item.id === actor.id)), ...incoming];
}

function triggerRuntimeAction(
  actor: RuntimeActor,
  actionId: string,
  instanceId: string | null,
  setSelectedClipId: (id: string) => void,
  setSequenceRun: Dispatch<SetStateAction<SequenceRun | null>>,
  setRuntimeFrame: (frame: number) => void,
  setPlaying: (playing: boolean) => void,
) {
  const action = actor.actions.find((item) => item.id === actionId);
  if (!action) return;
  if (action.sequenceId) {
    const sequence = actor.sequences.find((item) => item.id === action.sequenceId);
    const first = sequence?.steps[0];
    if (!sequence || !first || !instanceId) return;
    setSelectedClipId(first.clipId);
    setSequenceRun({ instanceId, sequenceId: sequence.id, stepIndex: 0 });
  } else if (action.clipId) {
    setSequenceRun(null);
    setSelectedClipId(action.clipId);
  }
  setRuntimeFrame(0);
  setPlaying(true);
}

interface EngineSceneItem {
  id: string;
  x: number;
  y: number;
  frame: number;
  controlled: boolean;
  flipX: boolean;
  layer: ActorLayer;
  depth: number;
  timeline: Timeline;
}

function EngineScene({ doc, cache, instances, tick, mouseEnabled, onMouseTarget }: { doc: SwfDocument; cache: AssetCache; instances: EngineSceneItem[]; tick: number; mouseEnabled: boolean; onMouseTarget: (target: { x: number; y: number }) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 900, h: 520 });

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSize({ w: element.clientWidth, h: element.clientHeight }));
    observer.observe(element);
    setSize({ w: element.clientWidth, h: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.w * dpr));
    canvas.height = Math.max(1, Math.floor(size.h * dpr));
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stage = doc.header.stage;
    const stageWidth = (stage.xMax - stage.xMin) / 20;
    const stageHeight = (stage.yMax - stage.yMin) / 20;
    const zoom = Math.max(0.05, Math.min(3, Math.min((size.w - 48) / stageWidth, (size.h - 48) / stageHeight)));
    const offsetX = (size.w - stageWidth * zoom) / 2;
    const offsetY = (size.h - stageHeight * zoom) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);
    ctx.fillStyle = '#17171c';
    ctx.fillRect(0, 0, stageWidth, stageHeight);
    ctx.strokeStyle = 'rgba(148,163,184,.55)';
    ctx.lineWidth = 1 / zoom;
    ctx.strokeRect(0, 0, stageWidth, stageHeight);

    ctx.save();
    ctx.scale(1 / 20, 1 / 20);
    ctx.translate(-stage.xMin, -stage.yMin);
    for (const instance of instances) {
      ctx.save();
      ctx.translate(stage.xMin + instance.x * 20, stage.yMin + instance.y * 20);
      if (instance.flipX) ctx.scale(-1, 1);
      drawTimeline(ctx, {
        doc,
        cache,
        timeline: instance.timeline,
        frame: instance.frame,
        view: { zoom: 1, panX: 0, panY: 0 },
        showOutlines: false,
        showMasks: true,
        background: 'transparent',
      }, instance.timeline, instance.frame, undefined, 0);
      if (instance.controlled) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2 * 20;
        ctx.beginPath();
        ctx.arc(0, 0, 8 * 20, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }, [cache, doc, instances, size, tick]);

  return (
    <div ref={wrapRef} className="relative min-h-[420px] flex-1 overflow-hidden bg-zinc-900/60" style={{ backgroundImage: 'linear-gradient(45deg,#18181b 25%,transparent 25%),linear-gradient(-45deg,#18181b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#18181b 75%),linear-gradient(-45deg,transparent 75%,#18181b 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0' }}>
      <canvas
        ref={canvasRef}
        className={cn('absolute inset-0', mouseEnabled ? 'cursor-crosshair' : 'cursor-default')}
        onPointerDown={(event) => {
          if (!mouseEnabled) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const stage = doc.header.stage;
          const stageWidth = (stage.xMax - stage.xMin) / 20;
          const stageHeight = (stage.yMax - stage.yMin) / 20;
          const zoom = Math.max(0.05, Math.min(3, Math.min((size.w - 48) / stageWidth, (size.h - 48) / stageHeight)));
          const offsetX = (size.w - stageWidth * zoom) / 2;
          const offsetY = (size.h - stageHeight * zoom) / 2;
          onMouseTarget({
            x: Math.max(0, Math.min(stageWidth, (event.clientX - rect.left - offsetX) / zoom)),
            y: Math.max(0, Math.min(stageHeight, (event.clientY - rect.top - offsetY) / zoom)),
          });
        }}
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded border border-zinc-800 bg-zinc-950/85 px-2 py-1 text-[10px] text-zinc-500">
        {instances.length} scene actor{instances.length === 1 ? '' : 's'} · Arrow keys move controlled actor
      </div>
    </div>
  );
}