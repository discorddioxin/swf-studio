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
import { parseSwfBinary } from './swf/binary';
import { swfFilesToFiles } from './bundled';
import { orderSources, swfSourcesFromFiles } from './swfSources';
import type { SwfDocument } from '../types';

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
    // FFDec exports carry their whole folder; a raw .swf carries nothing but itself.
    const parts = splitPackages(expandedFiles.filter((file) => !/\.swf$/i.test(file.name)));
    const xmlParts = new Map(parts.map((part) => [filePath(part.xmlFile), part]));
    const filesByKey = new Map<string, File>();
    for (const file of expandedFiles) {
      const key = filePath(file);
      if (!filesByKey.has(key)) filesByKey.set(key, file);
    }

    const sources = orderSources(swfSourcesFromFiles(expandedFiles), mainKey);
    if (!sources.length) throw new Error('No .swf or .xml SWF found in that selection — expected a raw SWF or a JPEXS XML dump.');
    await new Promise((resolve) => setTimeout(resolve, 30)); // let the busy message paint
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      onProgress?.(`Parsing ${source.fileName}${sources.length > 1 ? ` (${i + 1}/${sources.length})` : ''}…`);
      if (source.kind === 'binary') {
        const file = filesByKey.get(source.key);
        if (!file) continue;
        const { doc, files: parsedFiles } = await parseSwfBinary(await file.arrayBuffer(), source.fileName);
        built.push(await buildPackage(swfFilesToFiles(parsedFiles, source.stem), doc, onChange));
      } else {
        const part = xmlParts.get(source.key);
        if (!part) continue;
        const doc = parseSwfXml(await part.xmlFile.text(), { fileName: part.xmlFile.name });
        built.push(await buildPackage(part.files, doc, onChange));
      }
    }
    if (!built.length) throw new Error('No readable SWF files found in the selected uploads.');
    return built;
  } catch (error) {
    built.forEach((pkg) => pkg.cache.dispose());
    throw error;
  }
}
