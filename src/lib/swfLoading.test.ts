// @vitest-environment jsdom
// Uploading SWFs: the raw .swf binaries (parsed by the binary parser) and the
// JPEXS XML exports go through the same loader, and the SWF the user picked as
// the main movie comes out first — the rest are dependencies.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { loadUploadedPackages } from './swfLoading';
import { isSwfXmlExport } from './swfSources';
import { isAs2Bundle } from '../components/As2Execute';
import { bundledExportDir, bundledExportedNames, bundledMainName, bundledSwfFile, bundledSwfNames } from './__tests__/bundledSet';


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
  const bytes = readFileSync(bundledSwfFile(name));
  const file = new File(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    `${name}.swf`,
  );
  Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
  return file;
}

function xmlExport(name: string, path = `${name}/${name}.xml`): File {
  const text = readFileSync(resolve(bundledExportDir(name), `${name}.xml`), 'utf8');
  const file = new File([text], `${name}.xml`);
  Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
  return file;
}

const names = (packages: { doc: { header: { fileName: string } } }[]) => packages.map((p) => p.doc.header.fileName);

describe('uploading SWFs', () => {
  it('parses a raw .swf into a package the workbench can open', async () => {
    const movie = bundledSwfNames()[1];
    const [pkg] = await loadUploadedPackages([binarySwf(movie, `${movie}.swf`)]);
    expect(pkg.doc.header.fileName).toBe(`${movie}.swf`);
    expect(Number(pkg.doc.header.version)).toBeGreaterThan(0);
    expect(pkg.doc.timelines.size).toBeGreaterThan(0);
    // the binary parser synthesizes the ActionScript export the Execute tab needs
    expect(pkg.bundle.files.some((f) => /\.as$/i.test(f.path))).toBe(true);
    expect(pkg.bundle.files.some((f) => f.category === 'other')).toBe(false);
    // …so an uploaded AS2 SWF plays on the AS2 player, dependencies and all
    expect(isAs2Bundle(pkg.doc, pkg.bundle)).toBe(true);
  }, 30000);

  it('uses the picked SWF as the main movie and the others as dependencies', async () => {
    const [first, second] = bundledSwfNames().slice(1);
    const files = [
      binarySwf(second, `external/${second}/${second}.swf`),
      binarySwf(first, `${first}.swf`),
    ];
    const byDefault = await loadUploadedPackages(files);
    expect(names(byDefault)).toEqual([`${first}.swf`, `${second}.swf`]);

    const picked = await loadUploadedPackages(files, `external/${second}/${second}.swf`);
    expect(names(picked)).toEqual([`${second}.swf`, `${first}.swf`]);
    picked.forEach((pkg) => pkg.cache.dispose());
    byDefault.forEach((pkg) => pkg.cache.dispose());
  }, 30000);

  it('reads the same movie from the XML export when both forms are uploaded', async () => {
    const scene = bundledExportedNames()[0];
    const both = [xmlExport(scene, `scene/${scene}.xml`), binarySwf(scene, `scene/${scene}.swf`)];
    const preferred = await loadUploadedPackages(both);
    expect(preferred).toHaveLength(1);
    expect(preferred[0].bundle.xmlName).toBe(`${scene}.xml`);

    const explicit = await loadUploadedPackages(both, `scene/${scene}.swf`);
    expect(explicit).toHaveLength(1);
    expect(explicit[0].bundle.xmlName).toBe('');
    expect(explicit[0].doc.header.fileName).toBe(`${scene}.swf`);
    preferred.concat(explicit).forEach((pkg) => pkg.cache.dispose());
  }, 30000);

  it('loads SWFs out of a ZIP and finds them before unpacking', async () => {
    const zip = new JSZip();
    zip.file('game/main.swf', readFileSync(bundledSwfFile(bundledMainName())));
    zip.file('game/external/scene/scene.swf', readFileSync(bundledSwfFile(bundledSwfNames()[1])));
    zip.file('game/readme.txt', 'not a swf');
    const archive = new File([await zip.generateAsync({ type: 'blob' })], 'game.zip');

    const packages = await loadUploadedPackages([archive], 'game/external/scene/scene.swf');
    expect(names(packages)).toEqual(['scene.swf', 'main.swf']);
    packages.forEach((pkg) => pkg.cache.dispose());
  }, 30000);

  it('keeps every non-SWF file of the upload for the movie to load, data XML included', async () => {
    const main = bundledMainName();
    const data = (name: string, text: string, path: string) => {
      const file = new File([text], name);
      Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
      return file;
    };
    const config = data('gameConfig.xml', '<?xml version="1.0"?>\n<!-- settings -->\n<config><level n="1"/></config>', 'game/games/demo/gameConfig.xml');
    const sound = data('theme.mp3', 'ID3', 'game/sounds/theme.mp3');
    const style = data('phone.css', 'p { color: red }', 'game/navPages/phone.css');
    const packages = await loadUploadedPackages([binarySwf(main, `game/${main}.swf`), config, sound, style]);
    // the data XML is not taken for an FFDec export: one movie, not two
    expect(names(packages)).toEqual([`${main}.swf`]);
    const files = packages[0].dependencyFiles!;
    expect(await files.text('http://cdn.example.com/games/demo/gameConfig.xml')).toContain('<level n="1"/>');
    expect(files.find('sounds/theme.mp3')?.name).toBe('theme.mp3');
    expect(files.find('navPages/phone.css')?.name).toBe('phone.css');
    packages.forEach((pkg) => pkg.cache.dispose());
  }, 30000);

  it('tells an FFDec SWF export from a data XML by its <swf> root', async () => {
    const movie = bundledExportedNames()[0];
    expect(await isSwfXmlExport(xmlExport(movie))).toBe(true);
    expect(await isSwfXmlExport(new File(['<?xml version="1.0"?><!DOCTYPE c><c><swf/></c>'], 'c.xml'))).toBe(false);
    expect(await isSwfXmlExport(new File(['<!-- x --><swf version="8">'], 'c.xml'))).toBe(true);
  });

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
