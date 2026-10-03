// @vitest-environment jsdom
// Uploading SWFs: the raw .swf binaries (parsed by the binary parser) and the
// JPEXS XML exports go through the same loader, and the SWF the user picked as
// the main movie comes out first — the rest are dependencies.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { loadUploadedPackages } from './swfLoading';
import { isAs2Bundle } from '../components/As2Execute';

const ROOT = resolve(__dirname, '../../game-files');

// jsdom's Blob has no text()/arrayBuffer(); browsers do.
beforeAll(() => {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(this); });
    };
  }
});

function binarySwf(name: string, path = name): File {
  const bytes = readFileSync(resolve(ROOT, 'fish-full/swfs', `${name}.swf`));
  const file = new File(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    `${name}.swf`,
  );
  Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
  return file;
}

function xmlExport(name: string, path = `${name}/${name}.xml`): File {
  const text = readFileSync(resolve(ROOT, 'fish-full/external', name, `${name}.xml`), 'utf8');
  const file = new File([text], `${name}.xml`);
  Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
  return file;
}

const names = (packages: { doc: { header: { fileName: string } } }[]) => packages.map((p) => p.doc.header.fileName);

describe('uploading SWFs', () => {
  it('parses a raw .swf into a package the workbench can open', async () => {
    const [pkg] = await loadUploadedPackages([binarySwf('bassken_overview', 'bassken_overview.swf')]);
    expect(pkg.doc.header.fileName).toBe('bassken_overview.swf');
    expect(Number(pkg.doc.header.version)).toBeGreaterThan(0);
    expect(pkg.doc.timelines.size).toBeGreaterThan(0);
    // the binary parser synthesizes the ActionScript export the Execute tab needs
    expect(pkg.bundle.files.some((f) => /\.as$/i.test(f.path))).toBe(true);
    expect(pkg.bundle.files.some((f) => f.category === 'other')).toBe(false);
    // …so an uploaded AS2 SWF plays on the AS2 player, dependencies and all
    expect(isAs2Bundle(pkg.doc, pkg.bundle)).toBe(true);
  }, 30000);

  it('uses the picked SWF as the main movie and the others as dependencies', async () => {
    const files = [
      binarySwf('bassken_scene', 'external/bassken_scene/bassken_scene.swf'),
      binarySwf('bassken_overview', 'bassken_overview.swf'),
    ];
    const byDefault = await loadUploadedPackages(files);
    expect(names(byDefault)).toEqual(['bassken_overview.swf', 'bassken_scene.swf']);

    const picked = await loadUploadedPackages(files, 'external/bassken_scene/bassken_scene.swf');
    expect(names(picked)).toEqual(['bassken_scene.swf', 'bassken_overview.swf']);
    picked.forEach((pkg) => pkg.cache.dispose());
    byDefault.forEach((pkg) => pkg.cache.dispose());
  }, 30000);

  it('reads the same movie from the XML export when both forms are uploaded', async () => {
    const both = [xmlExport('bassken_scene', 'scene/bassken_scene.xml'), binarySwf('bassken_scene', 'scene/bassken_scene.swf')];
    const preferred = await loadUploadedPackages(both);
    expect(preferred).toHaveLength(1);
    expect(preferred[0].bundle.xmlName).toBe('bassken_scene.xml');

    const explicit = await loadUploadedPackages(both, 'scene/bassken_scene.swf');
    expect(explicit).toHaveLength(1);
    expect(explicit[0].bundle.xmlName).toBe('');
    expect(explicit[0].doc.header.fileName).toBe('bassken_scene.swf');
    preferred.concat(explicit).forEach((pkg) => pkg.cache.dispose());
  }, 30000);

  it('loads SWFs out of a ZIP and finds them before unpacking', async () => {
    const zip = new JSZip();
    zip.file('game/main.swf', readFileSync(resolve(ROOT, 'fish-full/swfs/bassken_overview.swf')));
    zip.file('game/external/scene/scene.swf', readFileSync(resolve(ROOT, 'fish-full/swfs/bassken_scene.swf')));
    zip.file('game/readme.txt', 'not a swf');
    const archive = new File([await zip.generateAsync({ type: 'blob' })], 'game.zip');

    const packages = await loadUploadedPackages([archive], 'game/external/scene/scene.swf');
    expect(names(packages)).toEqual(['scene.swf', 'main.swf']);
    packages.forEach((pkg) => pkg.cache.dispose());
  }, 30000);

  it('reports an upload that holds no SWF at all', async () => {
    const notes = new File(['hello'], 'notes.txt');
    Object.defineProperty(notes, 'webkitRelativePath', { value: 'notes.txt', configurable: true });
    await expect(loadUploadedPackages([notes])).rejects.toThrow(/No \.swf or \.xml SWF/);
  });

  it('reports a corrupt .swf instead of opening an empty document', async () => {
    const broken = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'broken.swf');
    Object.defineProperty(broken, 'webkitRelativePath', { value: 'broken.swf', configurable: true });
    await expect(loadUploadedPackages([broken])).rejects.toThrow();
  });
});
