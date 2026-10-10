import JSZip from 'jszip';
import { assetFor } from './assets';
import { defaultActorCapabilities, type AssetBundle, type FlattenedSprite, type FrameActionDetail, type Matrix, type Project, type SwfDocument, type Timeline } from '../types';
import { TWIPS } from '../types';

export interface ExportOptions {
  resolvedDisplayLists: boolean;
  includeKeyframes: boolean;
  pretty: boolean;
  skipIgnored: boolean;
  mergeVariants?: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = {
  resolvedDisplayLists: true,
  includeKeyframes: true,
  pretty: true,
  skipIgnored: true,
  mergeVariants: false,
};

const ident = (s: string) =>
  s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1') || 'unnamed';

export function displayName(doc: SwfDocument, project: Project, id: number): string {
  const lbl = project.characters[id];
  const ch = doc.characters.get(id);
  const raw = lbl?.name || ch?.className || ch?.exportName || `${ch?.kind ?? 'char'}_${id}`;
  return ident(raw);
}

function px(m: Matrix) {
  return { a: r6(m.a), b: r6(m.b), c: r6(m.c), d: r6(m.d), x: r6(m.tx / TWIPS), y: r6(m.ty / TWIPS) };
}

function decompose(m: Matrix) {
  const scaleX = Math.hypot(m.a, m.b);
  const scaleY = Math.hypot(m.c, m.d);
  const rotation = Math.atan2(m.b, m.a);
  const skewX = Math.atan2(-m.c, m.d) - rotation;
  return {
    x: r6(m.tx / TWIPS), y: r6(m.ty / TWIPS),
    scaleX: r6(m.a < 0 && Math.abs(m.b) < 1e-6 ? -scaleX : scaleX),
    scaleY: r6(scaleY),
    rotationDeg: r6((rotation * 180) / Math.PI),
    skewXDeg: r6((skewX * 180) / Math.PI),
  };
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function buildFramesForContainer(
  timeline: Timeline, start: number, end: number
): FrameActionDetail[] {
  const frames: FrameActionDetail[] = [];
  for (let i = start; i <= end; i++) {
    const f = timeline.frames[i];
    if (!f) continue;
    frames.push({
      index: i - start,
      absoluteFrame: i,
      label: f.label ?? undefined,
      opsCount: f.ops.length,
      events: f.events
        .filter((e) => e.kind !== 'place' && e.kind !== 'remove' && e.kind !== 'define')
        .map((e) => ({
          kind: e.kind,
          tagType: e.tagType,
          detail: e.detail,
          characterId: e.characterId,
          externalActions: e.externalActions,
        })),
      instances: f.display.map((d) => ({
        characterId: d.characterId,
        name: d.name ?? undefined,
        depth: d.depth,
      })),
      ops: f.ops.map((op) => ({ ...op })),
      special: f.special,
      kinds: [...f.kinds],
    });
  }
  return frames;
}

function rectPx(r?: { xMin: number; xMax: number; yMin: number; yMax: number }) {
  if (!r) return null;
  return {
    x: r6(r.xMin / TWIPS), y: r6(r.yMin / TWIPS),
    width: r6((r.xMax - r.xMin) / TWIPS), height: r6((r.yMax - r.yMin) / TWIPS),
  };
}

export function buildBundle(
  doc: SwfDocument, project: Project, assets: AssetBundle | null, opts: ExportOptions,
  flattenedSprites: FlattenedSprite[] = [],
): Record<string, unknown> {
  const ignored = new Set(
    Object.entries(project.characters).filter(([, v]) => v.ignore).map(([k]) => Number(k)),
  );

  const characters = [...doc.characters.values()]
    .filter((c) => !(opts.skipIgnored && ignored.has(c.id)))
    .map((c) => {
      const lbl = project.characters[c.id];
      const file = assets ? assetFor(assets, c.id, c.kind, c.externalFile) : undefined;
      return {
        id: c.id,
        key: displayName(doc, project, c.id),
        kind: c.kind,
        swfTag: c.tagType,
        className: c.className ?? null,
        exportName: c.exportName ?? null,
        bounds: rectPx(c.bounds),
        frameCount: c.frameCount ?? null,
        timeline: c.timelineId ?? null,
        uses: c.uses,
        asset: file ? file.path : null,
        assetKind: file?.ext ?? null,
        label: {
          name: lbl?.name ?? null,
          category: lbl?.category ?? null,
          tags: lbl?.tags ?? [],
          notes: lbl?.notes ?? null,
        },
        specialFrames: c.specialFrames ?? 0,
      };
    });

  const timelines = [...doc.timelines.values()]
    .filter((t) => !(opts.skipIgnored && t.characterId != null && ignored.has(t.characterId)))
    .map((t) => serializeTimeline(doc, project, t, opts));

  const events = [...doc.timelines.values()].flatMap((t) =>
    t.frames.flatMap((f) =>
      f.events
        .filter((e) => e.kind === 'action' || e.kind === 'sound' || e.kind === 'label' || e.kind === 'other')
        .map((e) => ({
          timeline: t.id,
          timelineName: t.characterId != null ? displayName(doc, project, t.characterId) : 'main',
          frame: f.index,
          kind: e.kind,
          swfTag: e.tagType,
          detail: e.detail,
          characterId: e.characterId ?? null,
          characterKey: e.characterId != null ? displayName(doc, project, e.characterId) : null,
        })),
    ),
  );

  const clips = project.clips.map((c) => {
    const tl = doc.timelines.get(c.timelineId);
    const frameData = c.frames ?? (tl ? buildFramesForContainer(tl, c.start, c.end) : []);
    return {
      id: c.id,
      key: ident(c.name),
      name: c.name,
      timeline: c.timelineId,
      owner: tl?.characterId != null ? displayName(doc, project, tl.characterId) : 'main',
      from: c.start,
      to: c.end,
      frameCount: c.end - c.start + 1,
      loop: c.loop,
      fps: c.fps ?? doc.header.frameRate,
      durationMs: Math.round(((c.end - c.start + 1) / (c.fps ?? doc.header.frameRate)) * 1000),
      tags: c.tags,
      notes: c.notes ?? null,
      // A clip is a portable animation unit: every frame retains its events,
      // code/source reference, sound triggers, display instances and ops.
      frames: frameData,
    };
  });

  const actors = (project.actors ?? []).map((actor) => {
    const capabilities = actor.capabilities ?? defaultActorCapabilities();
    const clipRef = (clipId: string | undefined) => {
      if (!clipId) return null;
      const clip = clips.find((candidate) => candidate.id === clipId);
      return clip ? { id: clip.id, key: clip.key, name: clip.name } : { id: clipId, key: null, name: null };
    };
    const movement = Object.fromEntries(
      Object.entries(capabilities.movementClips).map(([slot, clipId]) => [slot, clipRef(clipId)]),
    );
    return {
      id: actor.id,
      name: actor.name,
      tags: actor.tags,
      notes: actor.notes ?? null,
      classifications: actor.classifications ?? [],
      actions: actor.actions ?? [],
      sequences: actor.sequences ?? [],
      keyBindings: actor.keyBindings ?? {},
      layer: actor.layer ?? 'World',
      depth: actor.depth ?? 0,
      capabilities: {
        combatMode: capabilities.combat,
        canMove: capabilities.canMove,
        canWalk: capabilities.canWalk ?? false,
        useFlippedAnimations: capabilities.useFlippedAnimations ?? false,
        mirrorSide: capabilities.mirrorSide ?? (capabilities.useFlippedAnimations ? 'right' : 'none'),
        canAttack: capabilities.combat === 'combat' || capabilities.combat === 'canAttack',
        canBeAttacked: capabilities.combat === 'combat' || capabilities.combat === 'canBeAttacked',
        movement,
        idleAnimations: Object.fromEntries(
          Object.entries(capabilities.idleAnimations ?? {}).map(([facing, clipId]) => [facing, clipRef(clipId)]),
        ),
        walking: Object.fromEntries(
          Object.entries(capabilities.walkingClips ?? {}).map(([direction, clipId]) => [direction, clipRef(clipId)]),
        ),
        attacks: capabilities.attackClipIds.map((clipId) => clipRef(clipId)),
        defense: clipRef(capabilities.defenseClipId),
      },
      clips: actor.clipIds
        .map((clipId) => {
          const clip = clips.find((candidate) => candidate.id === clipId);
          if (!clip) return null;
          return {
            id: clip.id,
            key: clip.key,
            timeline: clip.timeline,
            frameCount: clip.frameCount,
            from: clip.from,
            to: clip.to,
            loop: clip.loop,
            fps: clip.fps,
            frames: clip.frames,
          };
        })
        .filter((clip): clip is NonNullable<typeof clip> => clip !== null),
    };
  });

  const markers = project.markers.map((m) => ({
    id: m.id,
    timeline: m.timelineId,
    frame: m.frame,
    type: m.type,
    name: m.name,
    payload: m.payload ?? null,
    tags: m.tags,
    clips: project.clips
      .filter((c) => c.timelineId === m.timelineId && m.frame >= c.start && m.frame <= c.end)
      .map((c) => ({ clip: ident(c.name), localFrame: m.frame - c.start })),
  }));

  const tagIndex: Record<string, { characters: number[]; clips: string[]; markers: string[]; actors: string[] }> = {};
  const push = (t: string, bucket: 'characters' | 'clips' | 'markers' | 'actors', v: never) => {
    tagIndex[t] ??= { characters: [], clips: [], markers: [], actors: [] };
    (tagIndex[t][bucket] as unknown[]).push(v);
  };
  Object.entries(project.characters).forEach(([id, l]) =>
    l.tags?.forEach((t) => push(t, 'characters', Number(id) as never)));
  project.clips.forEach((c) => c.tags?.forEach((t) => push(t, 'clips', ident(c.name) as never)));
  project.markers.forEach((m) => m.tags?.forEach((t) => push(t, 'markers', m.name as never)));
  project.actors?.forEach((a) => a.tags?.forEach((t) => push(t, 'actors', a.name as never)));

  const manifest = {
    generator: 'SWF Forge',
    generatedAt: new Date().toISOString(),
    source: { xml: doc.header.fileName, assetRoot: assets?.rootName ?? null, swfVersion: doc.header.version ?? null },
    stage: {
      width: r6((doc.header.stage.xMax - doc.header.stage.xMin) / TWIPS),
      height: r6((doc.header.stage.yMax - doc.header.stage.yMin) / TWIPS),
      originX: r6(doc.header.stage.xMin / TWIPS),
      originY: r6(doc.header.stage.yMin / TWIPS),
    },
    frameRate: doc.header.frameRate,
    frameCount: doc.header.frameCount,
    units: { source: 'twips (1/20 px)', exported: 'pixels' },
    counts: {
      characters: characters.length,
      timelines: timelines.length,
      clips: clips.length,
      markers: markers.length,
      events: events.length,
      containers: (project.containers ?? []).length,
      actors: actors.length,
      flattenedSprites: flattenedSprites.length,
    },
    files: ['characters.json', 'timelines.json', 'clips.json', 'actors.json', 'events.json', 'markers.json', 'tags.json', 'containers.json', 'flattened.json', 'assets.json', 'project.json'],
  };

  const assetIndex = assets
    ? {
        root: assets.rootName,
        byCharacter: Object.fromEntries(
          [...doc.characters.values()]
            .map((c) => [c.id, assetFor(assets, c.id, c.kind, c.externalFile)?.path])
            .filter(([, p]) => !!p),
        ),
        unmatched: assets.files.filter((f) => f.guessedId == null || !doc.characters.has(f.guessedId)).map((f) => f.path),
      }
    : { root: null, byCharacter: {}, unmatched: [] };

  return {
    'manifest.json': manifest,
    'characters.json': { characters },
    'timelines.json': { timelines },
    'clips.json': { clips },
    'actors.json': { actors },
    'events.json': { events },
    'markers.json': { markers },
    'tags.json': { vocabulary: Object.keys(tagIndex).sort(), index: tagIndex },
    'containers.json': { containers: project.containers ?? [] },
    'flattened.json': {
      sprites: flattenedSprites.map((sprite) => ({
        id: sprite.id,
        characterId: sprite.characterId,
        timeline: sprite.timelineId,
        name: sprite.name,
        frameCount: sprite.frameCount,
        frames: sprite.frames.map(({ blob: _blob, url: _url, ...frame }) => frame),
      })),
    },
    'assets.json': assetIndex,
    'project.json': project,
  };
}

function serializeTimeline(doc: SwfDocument, project: Project, t: Timeline, opts: ExportOptions) {
  return {
    id: t.id,
    kind: t.kind,
    characterId: t.characterId ?? null,
    key: t.characterId != null ? displayName(doc, project, t.characterId) : 'main',
    frameCount: t.frameCount,
    labels: t.frames.filter((f) => f.label).map((f) => ({ frame: f.index, name: f.label })),
    frames: t.frames.map((f) => ({
      index: f.index,
      label: f.label ?? null,
      special: f.special,
      ...(opts.includeKeyframes
        ? {
            ops: f.ops.map((o) => ({
              op: o.op,
              depth: o.depth,
              characterId: o.characterId ?? null,
              instanceName: o.name ?? null,
              matrix: o.matrix ? px(o.matrix) : null,
              ratio: o.ratio != null ? r6(o.ratio / 65535) : null,
              clipDepth: o.clipDepth ?? null,
              blendMode: o.blendMode ?? null,
              hasFilters: !!o.hasFilters,
              colorTransform: o.colorTransform ?? null,
              swfTag: o.tagType,
            })),
          }
        : {}),
      ...(opts.resolvedDisplayLists
        ? {
            display: f.display.map((d) => ({
              depth: d.depth,
              characterId: d.characterId,
              characterKey: displayName(doc, project, d.characterId),
              instanceName: d.name ?? null,
              matrix: px(d.matrix),
              transform: decompose(d.matrix),
              alpha: r6(Math.max(0, Math.min(1, (d.colorTransform?.am ?? 1) + (d.colorTransform?.aa ?? 0) / 255))),
              colorTransform: d.colorTransform ?? null,
              morphRatio: d.ratio ? r6(d.ratio / 65535) : 0,
              clipDepth: d.clipDepth ?? null,
              blendMode: d.blendMode ?? null,
              bornAtFrame: d.startFrame,
            })),
          }
        : {}),
      events: f.events
        .filter((e) => e.kind !== 'place' && e.kind !== 'remove' && e.kind !== 'define')
        .map((e) => ({ kind: e.kind, swfTag: e.tagType, detail: e.detail, characterId: e.characterId ?? null })),
    })),
  };
}

export function bundleToText(bundle: Record<string, unknown>, pretty: boolean) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bundle)) out[k] = JSON.stringify(v, null, pretty ? 2 : 0);
  return out;
}

export async function downloadBundle(bundle: Record<string, unknown>, opts: ExportOptions, name: string, flattenedSprites: FlattenedSprite[] = []) {
  const zip = new JSZip();
  const folder = zip.folder(name) ?? zip;
  const texts = bundleToText(bundle, opts.pretty);
  for (const [k, v] of Object.entries(texts)) folder.file(k, v);
  for (const sprite of flattenedSprites) {
    for (const frame of sprite.frames) folder.file(frame.path, frame.blob);
  }
  folder.file('README.md', readme(name, Object.keys(texts)));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  triggerDownload(blob, `${name}-bundle.zip`);
}

export function downloadJson(obj: unknown, filename: string) {
  triggerDownload(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function readme(name: string, files: string[]) {
  return `# ${name} — converted SWF data bundle

Generated by SWF Forge from a JPEXS XML dump.

* All geometry is in **pixels** (the SWF twips have already been divided by 20).
* \`matrix\` is \`[a b c d]\` + \`x/y\` translation, matching the SWF MATRIX layout
  (x' = a*x + c*y + tx, y' = b*x + d*y + ty). \`transform\` is the same matrix
  decomposed into x/y/scale/rotation/skew for engines that prefer that.
* \`timelines[].frames[].display\` is the fully resolved display list for that
  frame — no need to replay place/remove ops. \`ops\` keeps the raw keyframe data.
* Nested sprites advance with \`localFrame = (parentFrame - bornAtFrame) % frameCount\`.
* \`morphRatio\` is normalised 0..1 (SWF stores 0..65535).

Files: ${files.join(', ')}
`;
}
