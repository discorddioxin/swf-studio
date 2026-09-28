import JSZip from 'jszip';
import { type AssetBundle, type AssetCategory, type AssetFile, type Rect, TWIPS, type SwfDocument, type Timeline } from '../types';

const CATEGORY_BY_DIR: Record<string, AssetCategory> = {
  shapes: 'shapes',
  morphshapes: 'morphshapes',
  images: 'images',
  sounds: 'sounds',
  texts: 'texts',
  fonts: 'fonts',
  buttons: 'buttons',
  scripts: 'texts',
};

/** last integer run in a name — "DefineButton2_23" -> 23, "12" -> 12 */
export function guessId(name: string): number | undefined {
  const m = name.match(/(\d+)(?!.*\d)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

export function ingestFiles(fileList: File[]): AssetBundle {
  const files: AssetFile[] = [];
  let xmlFile: File | undefined;
  let rootName = 'assets';
  let bestXmlDepth = Infinity;

  // Work out the browser-selected root folder when one exists. ZIP entries
  // are normalized below by asset directory, so multiple archives can merge.
  const rel = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const firstRelative = (fileList[0] as (File & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath;
  if (firstRelative?.includes('/')) rootName = firstRelative.split('/')[0];

  const knownDirs = new Set(Object.keys(CATEGORY_BY_DIR));

  for (const f of fileList) {
    const full = rel(f);
    const parts = full.split('/').filter(Boolean);
    const assetDirIndex = parts.findIndex((part) => knownDirs.has(part.toLowerCase()));
    const normalizedParts = assetDirIndex >= 0 ? parts.slice(assetDirIndex) : parts;
    const path = normalizedParts.join('/');
    const base = normalizedParts[normalizedParts.length - 1];
    const dot = base.lastIndexOf('.');
    const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
    const name = dot >= 0 ? base.slice(0, dot) : base;

    if (ext === 'xml') {
      if (parts.length - 1 < bestXmlDepth) { xmlFile = f; bestXmlDepth = parts.length - 1; }
      continue;
    }
    const dir = normalizedParts.length > 1 ? normalizedParts[0].toLowerCase() : '';
    const category: AssetCategory = CATEGORY_BY_DIR[dir] ?? 'other';
    // buttons live in buttons/DefineButton2_23/<state>.png — id comes from the folder
    const idSource = category === 'buttons' && normalizedParts.length > 2 ? normalizedParts[1] : name;
    files.push({ path, name, ext, category, file: f, guessedId: guessId(idSource) });
  }

  const byPath = new Map<string, AssetFile>();
  for (const a of files) {
    byPath.set(a.path.toLowerCase(), a);
    const segs = a.path.toLowerCase().split('/');
    if (segs.length >= 2) byPath.set(segs.slice(-2).join('/'), a);
    byPath.set(segs[segs.length - 1], a);
  }

  const byId = new Map<number, AssetFile[]>();
  for (const a of files) {
    if (a.guessedId == null) continue;
    const arr = byId.get(a.guessedId) ?? [];
    arr.push(a);
    byId.set(a.guessedId, arr);
  }
  // prefer an exact numeric filename match first, then "up" button states
  for (const arr of byId.values()) {
    arr.sort((x, y) => score(y) - score(x));
  }
  return {
    rootName,
    xmlFile,
    xmlName: xmlFile ? rel(xmlFile).split('/').pop()! : '',
    files,
    byId,
    byPath,
  };
}

/** Expand one or more ZIP uploads into File objects with relative paths. The
 * rest of the importer then treats archives and folders identically. */
export async function expandUploadFiles(files: File[]): Promise<File[]> {
  const expanded: File[] = [];
  for (const file of files) {
    if (!/\.zip$/i.test(file.name)) {
      expanded.push(file);
      continue;
    }
    const zip = await JSZip.loadAsync(file);
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const blob = await entry.async('blob');
      const path = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
      const output = new File([blob], path.split('/').pop() || 'asset', { type: blob.type || guessMime(path) });
      Object.defineProperty(output, 'webkitRelativePath', { value: path, configurable: true });
      expanded.push(output);
    }
  }
  return expanded;
}

function guessMime(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'xml' ? 'application/xml'
    : ext === 'svg' ? 'image/svg+xml'
    : ext === 'png' ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'mp3' ? 'audio/mpeg'
    : ext === 'wav' ? 'audio/wav'
    : 'application/octet-stream';
}

export function normalizeAssetPath(value: string): string {
  let path = value.trim().replace(/\\/g, '/').split('?')[0];
  try { path = decodeURIComponent(path); } catch { /* keep the original path */ }
  path = path.replace(/^file:\/\//i, '').replace(/^\.\//, '').toLowerCase();
  while (path.startsWith('../')) path = path.slice(3);
  return path.replace(/^\/+/, '');
}

/** Resolve a JPEXS `_externalActions` path against a selected folder. JPEXS
 * versions disagree about whether the XML's asset-root prefix is included. */
export function resolveAssetFile(bundle: AssetBundle, reference: string): AssetFile | undefined {
  const ref = normalizeAssetPath(reference);
  if (!ref) return undefined;

  const candidates = new Set<string>([ref]);
  const scriptsAt = ref.indexOf('scripts/');
  if (scriptsAt >= 0) candidates.add(ref.slice(scriptsAt));
  const assetsAt = ref.indexOf('assets/');
  if (assetsAt >= 0) candidates.add(ref.slice(assetsAt + 'assets/'.length));

  for (const file of bundle.files) {
    const filePath = normalizeAssetPath(file.path);
    for (const candidate of candidates) {
      if (filePath === candidate || filePath.endsWith('/' + candidate)) return file;
    }
  }

  // Last-resort basename matching is intentionally restricted to scripts so a
  // same-named image cannot be mistaken for ActionScript.
  const base = ref.split('/').pop();
  if (base?.endsWith('.as')) {
    const matches = bundle.files.filter((f) => f.ext === 'as' && f.name.toLowerCase() + '.as' === base);
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

/**
 * JPEXS's external script export is frame-scoped. Depending on the exporter
 * version, the XML may contain `_externalActions`, or it may only be possible
 * to identify the source from the owning sprite and frame:
 *
 *   scripts/DefineSprite_192/frame_1/DoAction.as
 *   scripts/DefineSprite_192/frame_1/DoInitAction.as
 *
 * Resolve both forms so the UI never falls back to byte counts when the .as
 * file is actually present in the selected folder.
 */
export function resolveActionScriptFile(
  bundle: AssetBundle,
  timeline: Pick<Timeline, 'characterId' | 'kind'>,
  frameIndex: number,
  tagType: string,
  references: string[] = [],
): AssetFile | undefined {
  for (const reference of references) {
    const hit = resolveAssetFile(bundle, reference);
    if (hit?.ext === 'as') return hit;
  }

  const frame = frameIndex + 1;
  const initFirst = /InitAction/i.test(tagType);
  const names = initFirst
    ? new Set(['doinitaction.as', 'doaction.as'])
    : new Set(['doaction.as', 'doinitaction.as']);
  const spriteTokens = timeline.characterId == null
    ? []
    : [`definesprite_${timeline.characterId}`, `definespritetag_${timeline.characterId}`];
  const frameToken = `frame_${frame}`;

  const scripts = bundle.files.filter((file) => {
    const path = normalizeAssetPath(file.path);
    const base = `${file.name}.${file.ext}`.toLowerCase();
    if (file.ext !== 'as' || !path.includes('scripts/')) return false;
    if (!names.has(base) || !path.includes(frameToken)) return false;
    return timeline.characterId == null || spriteTokens.some((token) => path.includes(token));
  });

  return scripts[0];
}

/** Attach the real exported source to parsed frame events before the document
 * enters React state. This makes clips, actors, the Code tab and exports all
 * consume the same resolved ActionScript text rather than separate fallbacks. */
export async function hydrateActionScriptSources(doc: SwfDocument, bundle: AssetBundle) {
  const loaded = new Map<string, string>();
  for (const timeline of doc.timelines.values()) {
    for (const frame of timeline.frames) {
      for (const event of frame.events) {
        if (event.kind !== 'action') continue;
        const refs = [event.externalActions, ...(event.externalActionCandidates ?? [])].filter(Boolean) as string[];
        const file = resolveActionScriptFile(bundle, timeline, frame.index, event.tagType, refs);
        if (!file) continue;
        const key = normalizeAssetPath(file.path);
        let source = loaded.get(key);
        if (source == null) {
          source = await file.file.text();
          loaded.set(key, source);
        }
        event.detail = source.trim();
        event.externalActions = file.path;
      }
    }
  }
}

function score(a: AssetFile): number {
  let s = 0;
  if (/^\d+$/.test(a.name)) s += 10;
  if (/up/i.test(a.name)) s += 4;
  if (a.category === 'shapes' || a.category === 'morphshapes') s += 3;
  if (a.ext === 'svg') s += 2;
  if (a.ext === 'png') s += 1;
  return s;
}

const KIND_TO_CATEGORY: Record<string, AssetCategory[]> = {
  shape: ['shapes', 'images'],
  morphshape: ['morphshapes', 'shapes'],
  bitmap: ['images', 'shapes'],
  button: ['buttons', 'images'],
  text: ['texts'],
  edittext: ['texts'],
  sound: ['sounds'],
  font: ['fonts'],
};

export function assetFor(
  bundle: AssetBundle, id: number, kind: string, externalFile?: string,
): AssetFile | undefined {
  if (externalFile) {
    const p = externalFile.replace(/\\/g, '/').toLowerCase();
    const segs = p.split('/');
    const hit = bundle.byPath.get(p)
      ?? (segs.length >= 2 ? bundle.byPath.get(segs.slice(-2).join('/')) : undefined)
      ?? bundle.byPath.get(segs[segs.length - 1]);
    if (hit) return hit;
  }
  const arr = bundle.byId.get(id);
  if (!arr || !arr.length) return undefined;
  const prefs = KIND_TO_CATEGORY[kind];
  // kinds with no exported representation (sprite / video / binary) must not
  // steal a file that happens to share the same numeric id
  if (!prefs) return undefined;
  for (const p of prefs) {
    const hit = arr.find((a) => a.category === p);
    if (hit) return hit;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Image cache.  SVGs exported by JPEXS may be authored either in pixels or in
// twips; we calibrate against the character bounds from the XML so placement is
// always exact regardless of the exporter's unit choice.
// ---------------------------------------------------------------------------

export interface LoadedAsset {
  status: 'loading' | 'ready' | 'error';
  img?: HTMLImageElement;
  url?: string;
  /** destination rect in TWIPS, in the character's own coordinate space */
  dest?: { x: number; y: number; w: number; h: number };
  text?: string;
  error?: string;
}

export class AssetCache {
  private map = new Map<string, LoadedAsset>();
  private urls: string[] = [];
  private externals = new Map<number, string>();
  constructor(private bundle: AssetBundle, private onChange: () => void) {}

  /** feed JPEXS `_externalFile` hints so matching never relies on guesswork */
  useExternals(chars: Iterable<{ id: number; externalFile?: string }>) {
    for (const c of chars) if (c.externalFile) this.externals.set(c.id, c.externalFile);
  }

  private resolve(id: number, kind: string) {
    return assetFor(this.bundle, id, kind, this.externals.get(id));
  }

  private patchSvgResources(text: string): string {
    return text.replace(/(href|xlink:href)\s*=\s*["']([^"']+)["']/g, (match, attr, ref) => {
      const parts = ref.split('/');
      const filename = parts[parts.length - 1];
      const filenameLower = filename.toLowerCase();

      let file = this.bundle.byPath.get(filenameLower)
        ?? this.bundle.byPath.get(ref.toLowerCase().replace(/^\.\.\//, ''));

      if (!file) {
        const id = guessId(filename);
        if (id != null) {
          file = assetFor(this.bundle, id, 'bitmap');
        }
      }

      if (file) {
        return `${attr}="${this.url(file)}"`;
      }
      return match;
    });
  }

  dispose() { this.urls.forEach((u) => URL.revokeObjectURL(u)); this.urls = []; this.map.clear(); }

  url(a: AssetFile): string {
    const key = 'url:' + a.path;
    const hit = this.map.get(key);
    if (hit?.url) return hit.url;
    const u = URL.createObjectURL(a.file);
    this.urls.push(u);
    this.map.set(key, { status: 'ready', url: u });
    return u;
  }

  /** synchronous object-url for thumbnails / audio players */
  preview(id: number, kind: string): { url: string; ext: string; path: string } | undefined {
    const a = this.resolve(id, kind);
    if (!a) return undefined;
    return { url: this.url(a), ext: a.ext, path: a.path };
  }

  get(id: number, kind: string, bounds?: Rect): LoadedAsset {
    const key = `${id}:${kind}`;
    const hit = this.map.get(key);
    if (hit) return hit;
    const a = this.resolve(id, kind);
    if (!a) {
      const miss: LoadedAsset = { status: 'error', error: 'no file' };
      this.map.set(key, miss);
      return miss;
    }
    const entry: LoadedAsset = { status: 'loading' };
    this.map.set(key, entry);
    if (a.ext === 'svg') this.loadSvg(key, a, bounds);
    else if (a.ext === 'png' || a.ext === 'jpg' || a.ext === 'jpeg' || a.ext === 'gif') this.loadRaster(key, a, bounds);
    else if (a.ext === 'txt' || a.ext === 'as') {
      a.file.text().then((t) => {
        this.map.set(key, { status: 'ready', text: t });
        this.onChange();
      });
    } else {
      this.map.set(key, { status: 'ready', url: this.url(a) });
    }
    return entry;
  }

  async waitFor(id: number, kind: string, bounds?: Rect): Promise<LoadedAsset> {
    const current = this.get(id, kind, bounds);
    if (current.status !== 'loading') return current;
    return new Promise((resolve) => {
      const started = performance.now();
      const poll = () => {
        const next = this.get(id, kind, bounds);
        if (next.status !== 'loading' || performance.now() - started > 15000) {
          resolve(next);
          return;
        }
        window.setTimeout(poll, 32);
      };
      poll();
    });
  }

  private finish(key: string, v: LoadedAsset) { this.map.set(key, v); this.onChange(); }

  private async loadSvg(key: string, a: AssetFile, bounds?: Rect) {
    try {
      let text = await a.file.text();
      text = this.patchSvgResources(text);
      const vb = parseViewBox(text);
      const blob = new Blob([text], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      this.urls.push(url);
      const img = await loadImage(url);
      let dest: LoadedAsset['dest'];
      if (bounds && (bounds.xMax - bounds.xMin > 0)) {
        dest = { x: bounds.xMin, y: bounds.yMin, w: bounds.xMax - bounds.xMin, h: bounds.yMax - bounds.yMin };
      } else if (vb) {
        let unit = 1;
        if (bounds && vb.w > 0) {
          const ratio = (bounds.xMax - bounds.xMin) / vb.w;
          const ratioY = vb.h > 0 ? (bounds.yMax - bounds.yMin) / vb.h : ratio;
          const r = (ratio + ratioY) / 2;
          unit = r > 5 ? TWIPS : r > 0.2 ? 1 : TWIPS;
        } else unit = TWIPS;
        dest = { x: vb.x * unit, y: vb.y * unit, w: vb.w * unit, h: vb.h * unit };
      } else {
        dest = { x: 0, y: 0, w: img.naturalWidth * TWIPS, h: img.naturalHeight * TWIPS };
      }
      this.finish(key, { status: 'ready', img, url, dest });
    } catch (e) {
      this.finish(key, { status: 'error', error: String(e) });
    }
  }

  private async loadRaster(key: string, a: AssetFile, bounds?: Rect) {
    try {
      const url = this.url(a);
      const img = await loadImage(url);
      const dest = bounds && bounds.xMax - bounds.xMin > 0
        ? { x: bounds.xMin, y: bounds.yMin, w: bounds.xMax - bounds.xMin, h: bounds.yMax - bounds.yMin }
        : { x: 0, y: 0, w: img.naturalWidth * TWIPS, h: img.naturalHeight * TWIPS };
      this.finish(key, { status: 'ready', img, url, dest });
    } catch (e) {
      this.finish(key, { status: 'error', error: String(e) });
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image failed to decode'));
    img.src = url;
  });
}

export function parseViewBox(svg: string): { x: number; y: number; w: number; h: number } | null {
  const m = svg.match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (m) {
    const p = m[1].trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every((n) => Number.isFinite(n))) return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  const w = svg.match(/\swidth\s*=\s*["']([\d.]+)/);
  const h = svg.match(/\sheight\s*=\s*["']([\d.]+)/);
  if (w && h) return { x: 0, y: 0, w: Number(w[1]), h: Number(h[1]) };
  return null;
}

export function patchButtonAssetIds(bundle: AssetBundle, doc: SwfDocument) {
  for (const tl of doc.timelines.values()) {
    if (tl.kind !== 'button' || tl.characterId == null) continue;
    const buttonId = tl.characterId;

    const buttonFiles = bundle.files.filter(
      (f) => f.category === 'buttons' && f.path.toLowerCase().includes(`button2_${buttonId}/`)
    );
    if (!buttonFiles.length) continue;

    const stateKeys = ['up', 'over', 'down', 'hit'] as const;
    stateKeys.forEach((key, stateIndex) => {
      const frame = tl.frames[stateIndex];
      if (!frame) return;

      const fileForState = buttonFiles.find((f) => f.name.toLowerCase().startsWith(key));
      if (!fileForState) return;

      for (const d of frame.display) {
        fileForState.guessedId = d.characterId;

        const existing = bundle.byId.get(d.characterId) ?? [];
        if (!existing.includes(fileForState)) {
          existing.push(fileForState);
          bundle.byId.set(d.characterId, existing);
        }
      }
    });
  }
}
