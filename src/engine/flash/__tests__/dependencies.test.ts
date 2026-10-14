// What a requested URL names, what type of file it is, and how an uploaded file is
// found for it.
import { describe, expect, it } from 'vitest';
import { DependencyFiles, DependencyTracker, dependencyKind, dependencyPath, isServiceEndpoint } from '../dependencies';

const file = (name: string, text = name) => new File([text], name.split('/').pop()!);

describe('dependency URLs', () => {
  it('names the file path without scheme, host, query or dot segments', () => {
    expect(dependencyPath('http://cdn.example.com/games/pinball/gameConfig.xml?v=3#x')).toBe('games/pinball/gameConfig.xml');
    expect(dependencyPath('./navPages/../navPages/phone.css')).toBe('navPages/phone.css');
    expect(dependencyPath('sounds\\splash%20one.mp3')).toBe('sounds/splash one.mp3');
  });

  it('tells file types apart by extension, then by the API that asked', () => {
    expect(dependencyKind('a/b.swf', 'URLLoader.load')).toBe('swf');
    expect(dependencyKind('a/b.mp3', 'Loader.load')).toBe('audio');
    expect(dependencyKind('a/b.css', 'URLLoader.load')).toBe('css');
    expect(dependencyKind('a/b.png', 'loadMovie')).toBe('image');
    expect(dependencyKind('a/b.flv', 'NetStream.play')).toBe('video');
    expect(dependencyKind('data', 'XML.load')).toBe('xml');
    expect(dependencyKind('stream?id=1', 'Sound.loadSound')).toBe('audio');
  });

  it('keeps server endpoints apart from files', () => {
    expect(isServiceEndpoint('http://www.gaiaonline.com/chat/gsi/gateway.php')).toBe(true);
    expect(isServiceEndpoint('http://www.gaiaonline.com/chat/gsi/')).toBe(true);
    expect(isServiceEndpoint('games/pinball/gameConfig.xml')).toBe(false);
    expect(isServiceEndpoint('scores.xml', 'POST')).toBe(false);
  });

  it('records one entry per file however often and by whom it is asked for', () => {
    const t = new DependencyTracker();
    t.record({ url: 'http://h/x/a.xml?1', api: 'XML.load', requestedBy: 'a.swf' });
    t.record({ url: 'x/A.xml', api: 'URLLoader.load', requestedBy: 'b.swf' });
    t.record({ url: 'http://h/gateway.php', api: 'LoadVars.sendAndLoad', method: 'POST' });
    expect(t.files()).toHaveLength(1);
    expect(t.files()[0]).toMatchObject({ kind: 'xml', count: 2, apis: ['XML.load', 'URLLoader.load'], requestedBy: ['a.swf', 'b.swf'] });
    expect(t.services()).toHaveLength(1);
    expect(t.list().map((d) => d.service)).toEqual([false, true]);
  });
});

describe('uploaded dependency files', () => {
  const files = new DependencyFiles([
    { path: 'pinball/games/pinball/gameConfig.xml', file: file('gameConfig.xml', '<config/>') },
    { path: 'pinball/xml/scores.xml', file: file('scores.xml') },
    { path: 'upload/sounds/theme.mp3', file: file('theme.mp3') },
    { path: 'a/dup.css', file: file('dup.css') },
    { path: 'b/dup.css', file: file('dup.css') },
  ]);

  it('finds a file by its whole path, a path suffix, or a file name only it has', async () => {
    expect(await files.text('http://null.gaiaonline.com/games/pinball/gameConfig.xml')).toBe('<config/>');
    expect(files.find('xml/scores.xml')?.name).toBe('scores.xml');
    expect(files.find('http://cdn/media/theme.mp3')?.name).toBe('theme.mp3');
    expect(files.find('elsewhere/dup.css')).toBeUndefined(); // two uploads share the name
    expect(files.find('a/dup.css')).toBeTruthy();
    expect(files.find('missing.xml')).toBeUndefined();
  });
});
