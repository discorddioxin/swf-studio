// Turning an upload into loaded packages, in play order.
//
// The selection may hold raw `.swf` binaries, JPEXS/FFDec XML exports (each
// with its folder of shapes/, scripts/, …) or ZIPs of either. Every SWF found
// becomes a package: the *main* one first — that is the document the workbench
// and the Execute workspace play — then its dependencies (the SWFs a game
// pulls in at run time with loadMovie / Loader).
//
//   loadUploadedPackages(files, mainKey)
//     expandUploadFiles        ZIPs → File objects with relative paths
//     swfSourcesFromFiles      every .swf / .xml in the selection
//     orderSources             the picked main first, duplicate forms merged
//     parseSwfBinary/parseSwfXml → SwfDocument + its asset files
//     buildPackage             AssetBundle + AssetCache

import { AssetCache, expandUploadFiles, filePath, hydrateActionScriptSources, ingestFiles, patchButtonAssetIds, splitPackages, type SwfPackage } from './assets';
import { parseSwfXml } from './parser';
import { parseSwfBinary, type SwfFile } from './swf/binary';
import { swfFilesToFiles } from './bundled';
import { isSwfXmlExport, orderSources, swfSourcesFromFiles } from './swfSources';
import type { SwfDocument } from '../types';
import { DependencyFiles, type DependencyAddition } from '../engine/flash/dependencies';


export interface UploadProgress {
  /** progress message for the Loader ("Parsing scene.swf (2/4)…") */
  onProgress?: (message: string) => void;
  /** called when an asset cache has new content (thumbnails, waveform, …) */
  onChange?: () => void;
}

/** Bundle + cache one parsed document (shared by uploads and bundled SWFs). */
export async function buildPackage(files: File[], doc: SwfDocument, onChange: () => void = () => {}): Promise<SwfPackage> {
  const bundle = ingestFiles(files);
  patchButtonAssetIds(bundle, doc);
  await hydrateActionScriptSources(doc, bundle);
  const cache = new AssetCache(bundle, onChange);
  cache.useExternals(doc.characters.values());
  return { doc, bundle, cache };
}

/**
 * Parse an upload into packages, the main movie first. Anything already built
 * is disposed if a later SWF fails, so a failed load leaves nothing behind.
 */
export async function loadUploadedPackages(
  files: File[],
  mainKey?: string | null,
  progress: UploadProgress = {},
): Promise<SwfPackage[]> {
  const { onProgress, onChange } = progress;
  const built: SwfPackage[] = [];
  try {
    onProgress?.('Indexing files…');
    if (files.some((file) => /\.zip$/i.test(file.name))) onProgress?.('Unpacking ZIP archives…');
    const expandedFiles = await expandUploadFiles(files);
    // An .xml is an FFDec export only with a <swf> root; any other XML is data the
    // movie loads at run time, like every other non-SWF file of the upload.
    const dataXml = new Set<File>();
    for (const file of expandedFiles) if (/\.xml$/i.test(file.name) && !(await isSwfXmlExport(file))) dataXml.add(file);
    const dependencyFiles = new DependencyFiles(expandedFiles
      .filter((file) => !/\.swf$/i.test(file.name) && (dataXml.has(file) || !/\.xml$/i.test(file.name)))
      .map((file) => ({ path: filePath(file), file })));
    // FFDec exports carry their whole folder; a raw .swf carries nothing but itself.
    const parts = splitPackages(expandedFiles.filter((file) => !/\.swf$/i.test(file.name) && !dataXml.has(file)));
    const xmlParts = new Map(parts.map((part) => [filePath(part.xmlFile), part]));
    const filesByKey = new Map<string, File>();
    for (const file of expandedFiles) {
      const key = filePath(file);
      if (!filesByKey.has(key)) filesByKey.set(key, file);
    }

    const sources = orderSources(swfSourcesFromFiles(expandedFiles.filter((file) => !dataXml.has(file))), mainKey);
    if (!sources.length) throw new Error('No .swf or .xml SWF found in that selection — expected a raw SWF or a JPEXS XML dump.');
    await new Promise((resolve) => setTimeout(resolve, 30)); // let the busy message paint
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      onProgress?.(`Parsing ${source.fileName}${sources.length > 1 ? ` (${i + 1}/${sources.length})` : ''}…`);
      if (source.kind === 'binary') {
        const file = filesByKey.get(source.key);
        if (!file) continue;
        let parsed: { doc: SwfDocument; files: SwfFile[] };
        try {
          parsed = await parseSwfBinary(await file.arrayBuffer(), source.fileName);
        } catch (error) {
          // Which of several uploaded SWFs failed is not guessable from the
          // message alone ("unknown filter 51" says nothing about the file).
          // The parser's own message already names the tag and record.
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`${source.fileName}: ${message}`);
        }
        const { doc, files: parsedFiles } = parsed;
        built.push(await buildPackage(swfFilesToFiles(parsedFiles, source.stem), doc, onChange));
      } else {
        const part = xmlParts.get(source.key);
        if (!part) continue;
        const doc = parseSwfXml(await part.xmlFile.text(), { fileName: part.xmlFile.name });
        built.push(await buildPackage(part.files, doc, onChange));
      }
    }
    if (!built.length) throw new Error('No readable SWF files found in the selected uploads.');
    for (const pkg of built) pkg.dependencyFiles = dependencyFiles;
    return built;
  } catch (error) {
    built.forEach((pkg) => pkg.cache.dispose());
    throw error;
  }
}

/** What adding dependencies to a session produced. */
export interface SessionDependencies {
  /** a package per added SWF, named as the movie asks for it */
  packages: SwfPackage[];
  /** the session's files with the added non-SWF files; the same object when none was added */
  dependencyFiles: DependencyFiles | null;
  /** the paths the files went under */
  added: string[];
}

/**
 * Add files to a loaded session (the Execute tab's "Add Dependency"). A SWF is
 * parsed into a package under the name the movie requested — loadMovie and
 * Loader find loaded SWFs by name — and anything else (XML, MP3, CSS, images, …)
 * joins the session's uploaded files under the requested path. If a SWF cannot
 * be read nothing is added, and the error names the file.
 */
export async function addSessionDependencies(
  additions: readonly DependencyAddition[],
  existing: DependencyFiles | null,
  onChange: () => void = () => {},
): Promise<SessionDependencies> {
  const isSwf = (a: DependencyAddition) => /\.swf$/i.test(a.path) || /\.swf$/i.test(a.file.name);
  const packages: SwfPackage[] = [];
  try {
    for (const addition of additions.filter(isSwf)) {
      const name = addition.path.slice(addition.path.lastIndexOf('/') + 1) || addition.file.name;
      let parsed: { doc: SwfDocument; files: SwfFile[] };
      try {
        parsed = await parseSwfBinary(await addition.file.arrayBuffer(), name);
      } catch (error) {
        throw new Error(`${addition.file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      packages.push(await buildPackage(swfFilesToFiles(parsed.files, name.replace(/\.swf$/i, '')), parsed.doc, onChange));
    }
  } catch (error) {
    packages.forEach((pkg) => pkg.cache.dispose());
    throw error;
  }
  const others = additions.filter((a) => !isSwf(a));
  const dependencyFiles = others.length
    ? (existing ?? new DependencyFiles()).with(others.map((a) => ({ path: a.path, file: a.file })))
    : existing;
  for (const pkg of packages) pkg.dependencyFiles = dependencyFiles ?? undefined;
  return { packages, dependencyFiles, added: additions.map((a) => a.path) };
}
