// Bundled raw .swf loading: game-files/manifest.json lists the .swf files
// shipped in the repo (regenerate them with tools/xml2swf/generate-bundled.mjs).
// Everything is fetched relative to the page so it works behind any dev-server
// or preview origin without hard-coded hosts.

import { parseSwfBinary, type SwfFile } from './swf/binary';
import type { SwfDocument } from '../types';

export interface BundledSwf {
  /** package name without extension, e.g. "bassken_overview" */
  name: string;
  /** path relative to the public root, e.g. "fish-full/swfs/bassken_overview.swf" */
  path: string;
  /** committed FFDec font exports (ttf cannot be synthesized from binary) */
  fonts?: string[];
  /** Optional source files which replace the matching synthetic AVM1 script. */
  scriptOverrides?: { path: string; target: string }[];
}

/** Fetch game-files/manifest.json from the public root. */
export async function fetchBundledManifest(): Promise<BundledSwf[]> {
  const res = await fetch('manifest.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`bundled manifest.json: HTTP ${res.status}`);
  const data = await res.json();
  const list: unknown = Array.isArray(data) ? data : data?.swfs;
  if (!Array.isArray(list)) throw new Error('bundled manifest.json has no "swfs" array');
  const out: BundledSwf[] = [];
  for (const raw of list) {
    if (typeof raw === 'string') {
      const base = raw.split('/').pop() ?? raw;
      out.push({ name: base.replace(/\.swf$/i, ''), path: raw });
    } else if (raw && typeof raw.path === 'string') {
      const base = raw.path.split('/').pop() ?? raw.path;
      const fonts = Array.isArray(raw.fonts) ? raw.fonts.filter((f: unknown): f is string => typeof f === 'string') : undefined;
      const scriptOverrides = Array.isArray(raw.scriptOverrides)
        ? raw.scriptOverrides.filter((override: unknown): override is { path: string; target: string } =>
            !!override && typeof override === 'object'
            && typeof (override as { path?: unknown }).path === 'string'
            && typeof (override as { target?: unknown }).target === 'string')
        : undefined;
      out.push({
        name: typeof raw.name === 'string' && raw.name ? raw.name : base.replace(/\.swf$/i, ''),
        path: raw.path,
        ...(fonts?.length ? { fonts } : {}),
        ...(scriptOverrides?.length ? { scriptOverrides } : {}),
      });
    }
  }
  if (!out.length) throw new Error('bundled manifest.json lists no swfs');
  return out;
}

export interface BundledPackage {
  doc: SwfDocument;
  /** synthetic File[] (with webkitRelativePath) ready for ingestFiles() */
  files: File[];
}

/**
 * Wrap the asset files the binary parser synthesized (scripts/, shapes/, …)
 * as upload Files under `prefix`, so a raw .swf upload goes through the same
 * `ingestFiles` path as an FFDec folder.
 */
export function swfFilesToFiles(files: SwfFile[], prefix: string): File[] {
  return files.map((f) => {
    const copy = f.bytes.slice(); // fresh ArrayBuffer-backed view for Blob
    const file = new File([copy.buffer as ArrayBuffer], f.path.split('/').pop() ?? f.path);
    Object.defineProperty(file, 'webkitRelativePath', {
      value: `${prefix}/${f.path}`,
      configurable: true,
    });
    if (f.tagOrder != null) Object.defineProperty(file, '__swfTagOrder', { value: f.tagOrder, configurable: true });
    if (f.targetSpriteId != null) Object.defineProperty(file, '__swfTargetSpriteId', { value: f.targetSpriteId, configurable: true });
    return file;
  });
}

/** Fetch one bundled .swf and parse it with the binary SWF parser. */
export async function fetchBundledSwf(
  entry: BundledSwf,
  onProgress?: (message: string) => void,
): Promise<BundledPackage> {
  onProgress?.(`Fetching bundled ${entry.name}.swf…`);
  const res = await fetch(entry.path);
  if (!res.ok) throw new Error(`${entry.path}: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  onProgress?.(`Parsing bundled ${entry.name}.swf…`);
  const fileName = entry.path.split('/').pop() ?? `${entry.name}.swf`;
  const { doc, files } = await parseSwfBinary(buffer, fileName);
  const asFiles = swfFilesToFiles(files, entry.name);
  for (const override of entry.scriptOverrides ?? []) {
    try {
      const source = await fetch(override.path);
      if (!source.ok) throw new Error(`${override.path}: HTTP ${source.status}`);
      const sourceText = await source.text();
      const relativePath = `${entry.name}/${override.target.replace(/\\/g, '/').replace(/^\/+/, '')}`;
      const index = asFiles.findIndex((file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath === relativePath);
      if (index < 0) {
        console.warn(`bundled script override target not found: ${relativePath}`);
        continue;
      }
      const replacement = new File([sourceText], override.target.split(/[\\/]/).pop() ?? 'DoAction.as', { type: 'text/plain' });
      Object.defineProperty(replacement, 'webkitRelativePath', { value: relativePath, configurable: true });
      const original = asFiles[index] as File & { __swfTagOrder?: number; __swfTargetSpriteId?: number };
      if (original.__swfTagOrder != null) Object.defineProperty(replacement, '__swfTagOrder', { value: original.__swfTagOrder, configurable: true });
      if (original.__swfTargetSpriteId != null) Object.defineProperty(replacement, '__swfTargetSpriteId', { value: original.__swfTargetSpriteId, configurable: true });
      asFiles[index] = replacement;
    } catch (e) {
      console.warn(`bundled script override unavailable (${override.path}):`, e);
    }
  }
  // ttf fonts from the committed FFDec export
  for (const fontPath of entry.fonts ?? []) {
    try {
      const res = await fetch(fontPath);
      if (!res.ok) continue;
      const copy = new Uint8Array(await res.arrayBuffer());
      const file = new File([copy.buffer as ArrayBuffer], fontPath.split('/').pop() ?? 'font.ttf');
      Object.defineProperty(file, 'webkitRelativePath', {
        value: `${entry.name}/${fontPath.replace(/^fish-full\/external\//, '')}`,
        configurable: true,
      });
      asFiles.push(file);
    } catch (e) {
      console.warn(`bundled font ${fontPath} unavailable:`, e);
    }
  }
  return { doc, files: asFiles };
}
