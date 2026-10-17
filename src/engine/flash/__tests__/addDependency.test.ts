// "Add Dependency": where a picked file goes, and how the session's files grow.
// A file picked for one missing entry is stored under the path the movie asked
// for, whatever it is called; picked for the whole list, each file goes to the
// missing entry of the same name, or under its own name. Adding makes a new set:
// the running player keeps the one it started with.
import { describe, expect, it } from 'vitest';
import { DependencyFiles, DependencyTracker, matchDependencyFiles } from '../dependencies';

const file = (name: string, text = name) => new File([text], name);

function missing() {
  const t = new DependencyTracker();
  t.record({ url: 'http://cdn.example.com/games/pinball/xml/Scores.xml?v=3', api: 'URLLoader.load', requestedBy: 'game.swf' });
  t.record({ url: 'sfx/splash.mp3', api: 'Sound.loadSound', requestedBy: 'game.swf' });
  t.record({ url: 'http://www.example.com/gsi/gateway.php', api: 'LoadVars.sendAndLoad', method: 'POST' });
  return t.list();
}

describe('matchDependencyFiles', () => {
  it('for one entry: the requested path, whatever the file is called; one file only', () => {
    const [scores] = missing();
    expect(matchDependencyFiles([file('my-scores.xml'), file('other.xml')], missing(), scores).map((a) => [a.file.name, a.path]))
      .toEqual([['my-scores.xml', 'games/pinball/xml/Scores.xml']]);
  });

  it('for the list: by name (any case) to the requested path, else under its own name', () => {
    const picked = [file('scores.XML'), file('splash.mp3'), file('extra.css'), file('gateway.php')];
    expect(matchDependencyFiles(picked, missing()).map((a) => a.path))
      .toEqual(['games/pinball/xml/Scores.xml', 'sfx/splash.mp3', 'extra.css', 'gateway.php']);
  });
});

describe('DependencyFiles.with', () => {
  it('a new set with the added files; the old one is unchanged; an added file wins at its path', async () => {
    const before = new DependencyFiles([{ path: 'game/xml/scores.xml', file: file('scores.xml', 'old') }]);
    const after = before.with([
      { path: 'game/xml/scores.xml', file: file('scores.xml', 'new') },
      { path: 'sfx/splash.mp3', file: file('splash.mp3') },
    ]);
    expect(after).not.toBe(before);
    expect(before.find('sfx/splash.mp3')).toBeUndefined();
    expect(after.find('http://cdn/x/sfx/splash.mp3')?.name).toBe('splash.mp3');
    expect(await after.text('game/xml/scores.xml')).toBe('new');
    expect(await before.text('game/xml/scores.xml')).toBe('old');
  });
});
