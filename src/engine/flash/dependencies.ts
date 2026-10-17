// Files a movie asks for at run time, for both players (AVM1 and AVM2).
//
// A SWF carries its own shapes, bitmaps, fonts, sounds and code. Anything else it
// needs, it requests by URL while it plays: another SWF (loadMovie, Loader), an
// MP3 (Sound.loadSound, Sound.load), XML, CSS, text and URL variables (XML.load,
// StyleSheet.load, LoadVars, URLLoader), images and video. Those files can be
// uploaded next to the SWF; whatever is requested and not there is a *missing
// dependency*, and the user is shown exactly which file, of what type, asked for
// by which movie through which API.
//
// A request to a server-side endpoint (a gateway script, a URL with no file
// behind it) is not a file the user could supply: those are kept apart as
// service endpoints, which need a live server or a game adapter.

export type DependencyKind = 'swf' | 'image' | 'audio' | 'video' | 'xml' | 'css' | 'text' | 'variables' | 'font' | 'data';

export const DEPENDENCY_KIND_LABEL: Record<DependencyKind, string> = {
  swf: 'SWF', image: 'Image', audio: 'Audio', video: 'Video', xml: 'XML', css: 'CSS',
  text: 'Text', variables: 'URL variables', font: 'Font', data: 'Data',
};

const EXTENSION_KIND: Record<string, DependencyKind> = {
  swf: 'swf', spl: 'swf',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image', webp: 'image',
  mp3: 'audio', wav: 'audio', aac: 'audio', m4a: 'audio', ogg: 'audio',
  flv: 'video', f4v: 'video', mp4: 'video', m4v: 'video', mov: 'video',
  xml: 'xml', mxml: 'xml', rss: 'xml',
  css: 'css',
  txt: 'text', json: 'text', csv: 'text', html: 'text', htm: 'text', ini: 'text', cfg: 'text', conf: 'text', properties: 'text',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
  bin: 'data', dat: 'data', amf: 'data', zip: 'data', zlib: 'data',
};

/** Server-side scripts: a request to one is a service call, not a file. */
const SERVICE_EXTENSION = /^(php\d?|aspx?|ashx|asmx|axd|jsp|jspx|cgi|pl|py|rb|cfm|cfc|do|action|dll|exe)$/i;

/** What an API loads when the URL itself does not say. */
const API_KIND: Record<string, DependencyKind> = {
  loadMovie: 'swf', loadMovieNum: 'swf', 'MovieClipLoader.loadClip': 'swf', 'Loader.load': 'swf',
  'Sound.loadSound': 'audio', 'Sound.load': 'audio',
  'NetStream.play': 'video',
  'XML.load': 'xml', 'XML.sendAndLoad': 'xml',
  'StyleSheet.load': 'css',
  loadVariables: 'variables', loadVariablesNum: 'variables', 'LoadVars.load': 'variables', 'LoadVars.sendAndLoad': 'variables',
  'URLLoader.load': 'text',
};

/** The path a URL names, without scheme, host, query or fragment: `http://h/a/b.xml?x` → `a/b.xml`. */
export function dependencyPath(url: string): string {
  let s = String(url ?? '').trim().replace(/\\/g, '/');
  s = s.replace(/[?#].*$/, '');
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, ''); // scheme://host
  s = s.replace(/^(file|asfunction|javascript|event):/i, '');
  try { s = decodeURIComponent(s); } catch { /* keep as written */ }
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join('/');
}

const extensionOf = (path: string) => {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
};

/** True for a request that needs a server rather than a file: a script, or a URL naming no file. */
export function isServiceEndpoint(url: string, method?: string): boolean {
  const path = dependencyPath(url);
  const ext = extensionOf(path);
  if (SERVICE_EXTENSION.test(ext)) return true;
  if (!path) return true;
  if (!ext) return true; // `…/gateway`, `…/api/login`: nothing to upload
  return !!method && method.toUpperCase() === 'POST' && !EXTENSION_KIND[ext];
}

/** The type of file a request asks for: by its extension, else by the API that asked. */
export function dependencyKind(url: string, api: string): DependencyKind {
  return EXTENSION_KIND[extensionOf(dependencyPath(url))] ?? API_KIND[api] ?? 'data';
}

export interface DependencyRequest {
  url: string;
  /** The API that asked, e.g. `loadMovie`, `XML.load`, `URLLoader.load`. */
  api: string;
  /** The movie (and script) whose code made the request. */
  requestedBy?: string;
  /** Overrides the kind inferred from the URL and API. */
  kind?: DependencyKind;
  method?: string;
  /** Expected to be absent (an adapter says it is a live asset): listed, not warned about. */
  optional?: boolean;
}

export interface MissingDependency {
  /** normalised path (lower case) — one entry per file however often it is asked for */
  key: string;
  /** the URL as first requested */
  url: string;
  /** the file path the URL names */
  path: string;
  kind: DependencyKind;
  /** a server endpoint rather than a file */
  service: boolean;
  apis: string[];
  requestedBy: string[];
  count: number;
  optional: boolean;
}

/** The missing dependencies of one play session. */
export class DependencyTracker {
  private readonly entries = new Map<string, MissingDependency>();
  /** bumps on every change, so a UI can tell cheaply whether to re-read */
  version = 0;
  constructor(private readonly onChange?: (entry: MissingDependency, isNew: boolean) => void) {}

  /** Record a request nothing answered. Returns the entry and whether it is new. */
  record(request: DependencyRequest): { entry: MissingDependency; isNew: boolean } {
    const path = dependencyPath(request.url);
    const service = isServiceEndpoint(request.url, request.method);
    const key = (service ? `service:${path || request.url}` : path || request.url).toLowerCase();
    let entry = this.entries.get(key);
    const isNew = !entry;
    if (!entry) {
      entry = {
        key, url: request.url, path, service,
        kind: request.kind ?? dependencyKind(request.url, request.api),
        apis: [], requestedBy: [], count: 0, optional: !!request.optional,
      };
      this.entries.set(key, entry);
    }
    entry.count++;
    if (!request.optional) entry.optional = false;
    if (!entry.apis.includes(request.api)) entry.apis.push(request.api);
    if (request.requestedBy && !entry.requestedBy.includes(request.requestedBy)) entry.requestedBy.push(request.requestedBy);
    this.version++;
    this.onChange?.(entry, isNew);
    return { entry, isNew };
  }

  /** Every missing dependency, files before service endpoints, in request order. */
  list(): MissingDependency[] {
    const all = [...this.entries.values()];
    return [...all.filter((e) => !e.service), ...all.filter((e) => e.service)];
  }
  /** Missing files the user could add. */
  files(): MissingDependency[] { return [...this.entries.values()].filter((e) => !e.service); }
  /** Server endpoints nothing answered. */
  services(): MissingDependency[] { return [...this.entries.values()].filter((e) => e.service); }
  get size() { return this.entries.size; }
  has(url: string): boolean {
    const path = dependencyPath(url).toLowerCase();
    return this.entries.has(path) || this.entries.has(`service:${path}`);
  }
}

/** One line describing a missing dependency: `XML  config/game.xml — XML.load by game.swf`. */
export function describeDependency(d: MissingDependency): string {
  const by = d.requestedBy.length ? ` by ${d.requestedBy.join(', ')}` : '';
  return `${d.service ? 'Service endpoint' : DEPENDENCY_KIND_LABEL[d.kind]} ${d.service ? d.url : d.path || d.url} — ${d.apis.join(', ')}${by}`;
}

/**
 * Non-SWF files uploaded with the movies, found by the URL a movie asks for:
 * the whole path first, then a path suffix (`http://cdn/x/sounds/a.mp3` finds an
 * upload at `game/sounds/a.mp3`), then a file name nobody else shares.
 */
export class DependencyFiles {
  private readonly byPath = new Map<string, File>();
  private readonly byName = new Map<string, File[]>();
  private readonly urls = new Map<File, string>();
  constructor(readonly files: readonly { path: string; file: File }[] = []) {
    for (const f of files) {
      const path = dependencyPath(f.path).toLowerCase();
      if (!this.byPath.has(path)) this.byPath.set(path, f.file);
      const name = path.slice(path.lastIndexOf('/') + 1);
      const list = this.byName.get(name) ?? [];
      list.push(f.file);
      this.byName.set(name, list);
    }
  }
  get size() { return this.byPath.size; }

  /**
   * These files plus `added` — a new set; this one is left as it is (a running
   * player keeps what it started with). An added file wins over one already here
   * at the same path.
   */
  with(added: readonly { path: string; file: File }[]): DependencyFiles {
    return new DependencyFiles([...added, ...this.files]);
  }

  find(url: string): File | undefined {
    const path = dependencyPath(url).toLowerCase();
    if (!path) return undefined;
    const exact = this.byPath.get(path);
    if (exact) return exact;
    let best: { file: File; len: number } | undefined;
    for (const [p, file] of this.byPath) {
      const shared = p.endsWith(`/${path}`) ? path.length : path.endsWith(`/${p}`) ? p.length : 0;
      if (shared && (!best || shared > best.len)) best = { file, len: shared };
    }
    if (best) return best.file;
    const named = this.byName.get(path.slice(path.lastIndexOf('/') + 1));
    return named?.length === 1 ? named[0] : undefined;
  }

  async text(url: string): Promise<string | null> {
    const file = this.find(url);
    return file ? readText(file) : null;
  }

  async bytes(url: string): Promise<Uint8Array | null> {
    const file = this.find(url);
    return file ? new Uint8Array(await readBuffer(file)) : null;
  }

  /** An object URL for the file (audio, images), released by `dispose`. */
  objectUrl(url: string): string | null {
    const file = this.find(url);
    if (!file || typeof URL === 'undefined' || !URL.createObjectURL) return null;
    let u = this.urls.get(file);
    if (!u) { u = URL.createObjectURL(file); this.urls.set(file, u); }
    return u;
  }

  dispose() {
    for (const u of this.urls.values()) { try { URL.revokeObjectURL(u); } catch { /* ignore */ } }
    this.urls.clear();
  }
}

/** A file the user adds to the session, stored under the path a movie asks for. */
export interface DependencyAddition {
  file: File;
  /** where the movie will find it: the requested path, or the file's own name */
  path: string;
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * Where picked files go. For one missing entry (`target`), the file is stored
 * under the path that entry was requested at, whatever it is called. Otherwise
 * each file goes under the requested path of the missing file of the same name
 * (case-insensitive), and under its own name when none matches — a movie asking
 * for that name later still finds it.
 */
export function matchDependencyFiles(files: readonly File[], missing: readonly MissingDependency[], target?: MissingDependency): DependencyAddition[] {
  if (target) {
    const path = target.path || dependencyPath(target.url);
    return files.slice(0, 1).map((file) => ({ file, path: path || file.name }));
  }
  const byName = new Map<string, MissingDependency>();
  for (const d of missing) {
    if (d.service) continue;
    const name = baseName(d.path).toLowerCase();
    if (name && !byName.has(name)) byName.set(name, d);
  }
  return files.map((file) => {
    const match = byName.get(file.name.toLowerCase());
    return { file, path: match?.path || file.name };
  });
}

/** Blob reads that also work where Blob lacks text()/arrayBuffer() (jsdom). */
function readBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
async function readText(file: Blob): Promise<string> {
  return new TextDecoder().decode(await readBuffer(file));
}
