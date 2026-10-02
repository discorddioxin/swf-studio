import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { collectSwfSources, orderSources, pickMainSource, swfSourcesFromFiles } from './swfSources';

function file(path: string, bytes: string | Uint8Array = ''): File {
  const f = new File([bytes as unknown as BlobPart], path.split('/').pop()!);
  Object.defineProperty(f, 'webkitRelativePath', { value: path, configurable: true });
  return f;
}

const keys = (list: { key: string }[]) => list.map((s) => s.key);

describe('the SWFs in a selection', () => {
  it('lists every .swf and .xml, shallowest first (main movie above its externals)', () => {
    const sources = swfSourcesFromFiles([
      file('game/assets/shapes/1.svg'),
      file('game/external/scene/scene.swf'),
      file('game/main.swf'),
      file('game/external/scene/scene.xml'),
      file('game/README.txt'),
    ]);
    expect(keys(sources)).toEqual([
      'game/main.swf',
      'game/external/scene/scene.swf',
      'game/external/scene/scene.xml',
    ]);
    expect(sources[0]).toMatchObject({ stem: 'main', fileName: 'main.swf', kind: 'binary', root: 'game', depth: 1 });
    expect(sources[2]).toMatchObject({ kind: 'xml', fileName: 'scene.xml' });
  });

  it('qualifies the label with the folder only when two SWFs share a stem', () => {
    const sources = swfSourcesFromFiles([
      file('upload/a/game.swf'),
      file('upload/b/game.swf'),
      file('upload/other.swf'),
    ]);
    expect(sources.map((s) => s.label)).toContain('game — upload/a');
    expect(sources.map((s) => s.label)).toContain('game — upload/b');
    expect(sources.map((s) => s.label)).toContain('other');
  });

  it('picks the requested main, falling back to the first listed source', () => {
    const sources = swfSourcesFromFiles([file('aaa.swf'), file('zzz.swf')]);
    expect(sources.map((s) => s.key)).toEqual(['aaa.swf', 'zzz.swf']);
    expect(pickMainSource(sources, 'zzz.swf')?.key).toBe('zzz.swf');
    expect(pickMainSource(sources, 'gone.swf')?.key).toBe('aaa.swf');
    expect(pickMainSource(sources, null)?.key).toBe('aaa.swf');
    expect(pickMainSource([], 'aaa.swf')).toBeUndefined();
  });

  it('reads the SWF names inside ZIP archives without unpacking them', async () => {
    const zip = new JSZip();
    zip.file('fish/main.swf', 'x');
    zip.file('fish/external/scene/scene.swf', 'x');
    zip.file('fish/notes.txt', 'x');
    zip.folder('fish/empty');
    const archive = new File([await zip.generateAsync({ type: 'nodebuffer' }) as unknown as BlobPart], 'game.zip');

    const sources = await collectSwfSources([archive, file('loose.swf')]);
    expect(keys(sources)).toEqual(['loose.swf', 'fish/main.swf', 'fish/external/scene/scene.swf']);
  });
});

describe('main SWF ordering', () => {
  const swf = 'upload/main.swf';
  const dep = 'upload/external/scene/scene.swf';

  it('puts the chosen main first and keeps the rest in listing order', () => {
    const sources = swfSourcesFromFiles([file(swf), file('upload/extra.swf'), file(dep)]);
    // listing order is shallowest-first: extra.swf, main.swf, then the nested scene
    expect(keys(orderSources(sources, dep))).toEqual([dep, 'upload/extra.swf', swf]);
    expect(keys(orderSources(sources, null))).toEqual(['upload/extra.swf', swf, dep]);
  });

  it('keeps one copy when a movie is uploaded as both .swf and .xml, preferring the XML export', () => {
    const sources = swfSourcesFromFiles([file('upload/scene.swf'), file('upload/scene.xml')]);
    const ordered = orderSources(sources, null);
    expect(ordered).toHaveLength(1);
    expect(ordered[0].kind).toBe('xml');
  });

  it('honours an explicitly chosen .swf over its XML twin', () => {
    const sources = swfSourcesFromFiles([file('upload/scene.xml'), file('upload/scene.swf')]);
    const ordered = orderSources(sources, 'upload/scene.swf');
    expect(ordered).toHaveLength(1);
    expect(ordered[0]).toMatchObject({ key: 'upload/scene.swf', kind: 'binary' });
  });

  it('never merges different movies', () => {
    const sources = swfSourcesFromFiles([file('a/bassken_scene.swf'), file('b/bassken_fish4.20.swf')]);
    expect(orderSources(sources, null)).toHaveLength(2);
  });
});
