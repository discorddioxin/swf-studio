import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultActorCapabilities, type Actor, type ActorLayer, type CharLabel, type Clip, type FrameMarker, type Project } from '../types';

const KEY = (name: string) => `swfforge:project:${name}`;

export function emptyProject(swfName: string): Project {
  return { swfName, updatedAt: Date.now(), characters: {}, clips: [], markers: [], containers: [], actors: [], vocab: [] };
}

export function loadProject(swfName: string): Project {
  try {
    const raw = localStorage.getItem(KEY(swfName));
    if (raw) {
      const p = JSON.parse(raw) as Project;
      return { containers: [], actors: [], ...emptyProject(swfName), ...p, swfName };
    }
  } catch { /* ignore */ }
  return emptyProject(swfName);
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function useProject(swfName: string) {
  const [project, setProject] = useState<Project>(() => emptyProject(swfName));

  useEffect(() => { setProject(loadProject(swfName)); }, [swfName]);

  useEffect(() => {
    if (!swfName) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(KEY(swfName), JSON.stringify({ ...project, updatedAt: Date.now() })); }
      catch { /* quota */ }
    }, 400);
    return () => clearTimeout(t);
  }, [project, swfName]);

  const setLabel = useCallback((id: number, patch: Partial<CharLabel>) => {
    setProject((p) => {
      const cur: CharLabel = p.characters[id] ?? { tags: [] };
      const next = { ...cur, ...patch };
      const vocab = new Set(p.vocab);
      (next.tags ?? []).forEach((t) => vocab.add(t));
      if (next.category) vocab.add('cat:' + next.category);
      return { ...p, characters: { ...p.characters, [id]: next }, vocab: [...vocab] };
    });
  }, []);

  const addClip = useCallback((c: Omit<Clip, 'id'>) => {
    const clip = { ...c, id: uid() };
    setProject((p) => ({ ...p, clips: [...p.clips, clip] }));
    return clip;
  }, []);

  const updateClip = useCallback((id: string, patch: Partial<Clip>) => {
    setProject((p) => ({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  }, []);

  const removeClip = useCallback((id: string) => {
    setProject((p) => ({
      ...p,
      clips: p.clips.filter((c) => c.id !== id),
      actors: (p.actors ?? []).map((a) => ({ ...a, clipIds: a.clipIds.filter((clipId) => clipId !== id) })),
    }));
  }, []);

  const addActor = useCallback((a: Omit<Actor, 'id'>) => {
    const actor = {
      ...a,
      id: uid(),
      capabilities: a.capabilities ?? defaultActorCapabilities(),
      actions: a.actions ?? [],
      sequences: a.sequences ?? [],
      keyBindings: a.keyBindings ?? {},
      layer: a.layer ?? ('World' as ActorLayer),
      depth: a.depth ?? 0,
    };
    setProject((p) => ({ ...p, actors: [...(p.actors ?? []), actor] }));
    return actor;
  }, []);

  const updateActor = useCallback((id: string, patch: Partial<Actor>) => {
    setProject((p) => ({ ...p, actors: (p.actors ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }, []);

  const removeActor = useCallback((id: string) => {
    setProject((p) => ({ ...p, actors: (p.actors ?? []).filter((a) => a.id !== id) }));
  }, []);

  const assignClip = useCallback((actorId: string, clipId: string, assigned: boolean) => {
    setProject((p) => ({
      ...p,
      actors: (p.actors ?? []).map((a) => {
        if (a.id !== actorId) return a;
        const ids = new Set(a.clipIds);
        assigned ? ids.add(clipId) : ids.delete(clipId);
        return { ...a, clipIds: [...ids] };
      }),
    }));
  }, []);

  const addMarker = useCallback((m: Omit<FrameMarker, 'id'>) => {
    const marker = { ...m, id: uid() };
    setProject((p) => ({ ...p, markers: [...p.markers, marker] }));
    return marker;
  }, []);

  const updateMarker = useCallback((id: string, patch: Partial<FrameMarker>) => {
    setProject((p) => ({ ...p, markers: p.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }, []);

  const removeMarker = useCallback((id: string) => {
    setProject((p) => ({ ...p, markers: p.markers.filter((m) => m.id !== id) }));
  }, []);

  const addContainer = useCallback((c: Omit<import('../types').AnimationContainer, 'id'>) => {
    const container = { ...c, id: uid() };
    setProject((p) => ({ ...p, containers: [...(p.containers ?? []), container] }));
    return container;
  }, []);

  const updateContainer = useCallback((id: string, patch: Partial<import('../types').AnimationContainer>) => {
    setProject((p) => ({ ...p, containers: (p.containers ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  }, []);

  const removeContainer = useCallback((id: string) => {
    setProject((p) => ({ ...p, containers: (p.containers ?? []).filter((c) => c.id !== id) }));
  }, []);

  const importProject = useCallback((p: Project) => setProject({ ...emptyProject(swfName), ...p, swfName }), [swfName]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    Object.values(project.characters).forEach((c) => c.tags?.forEach((t) => s.add(t)));
    project.clips.forEach((c) => c.tags?.forEach((t) => s.add(t)));
    project.markers.forEach((m) => m.tags?.forEach((t) => s.add(t)));
    (project.containers ?? []).forEach((c) => c.tags?.forEach((t) => s.add(t)));
    (project.actors ?? []).forEach((a) => a.tags?.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [project]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    Object.values(project.characters).forEach((c) => c.category && s.add(c.category));
    return [...s].sort();
  }, [project]);

  return {
    project, setProject, setLabel, addClip, updateClip, removeClip,
    addActor, updateActor, removeActor, assignClip,
    addMarker, updateMarker, removeMarker, addContainer, updateContainer, removeContainer, importProject, allTags, categories,
  };
}

export type ProjectApi = ReturnType<typeof useProject>;
