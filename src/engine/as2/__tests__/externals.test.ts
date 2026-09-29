// @vitest-environment jsdom
// External SWFs (loadMovie / MovieClipLoader) on the AS2 player, with two tiny
// synthetic SWFs (TEST FIXTURES ONLY – never imported by the app).
import { describe, expect, it } from 'vitest';
import { parseSwfXml } from '../../../lib/parser';
import { splitPackages } from '../../../lib/assets';
import { buildAS2Program } from '../program';
import { AS2Player } from '../player';
import { createExternalResolver, swfNameOf } from '../externals';

const show = '<item type="ShowFrameTag"/>';
const doAction = '<item type="DoActionTag"/>';
const shape = (id: number) => `<item type="DefineShapeTag" shapeId="${id}"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="200" Ymax="200"/></item>`;
const sprite = (id: number, shapeId: number) =>
  `<item type="DefineSpriteTag" spriteId="${id}" frameCount="1"><subTags><item type="PlaceObject2Tag" depth="1" characterId="${shapeId}" placeFlagHasCharacter="true"/>${show}<item type="EndTag"/></subTags></item>`;
const exportAs = (id: number, name: string) => `<item type="ExportAssetsTag"><tags><item>${id}</item></tags><names><item>${name}</item></names></item>`;
const swf = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="7" frameRate="12" frameCount="1"><displayRect type="RECT" Xmin="0" Ymin="0" Xmax="8000" Ymax="6000"/>
<tags>${body}<item type="EndTag"/></tags></swf>`;

// main movie: exports its own "fisher" (no class) and loads the lake SWF into a holder clip
const MAIN = swf(`${shape(1)}${sprite(2, 1)}${exportAs(2, 'fisher')}${doAction}${show}`);
const MAIN_SOURCES = [{
  path: 'scripts/frame_1/DoAction.as',
  text: `stop();
this.createEmptyMovieClip("holder", 10);
var mcl = new MovieClipLoader();
mcl.addListener({ onLoadInit: function(t) { _root.initTarget = t._name; _root.initFisher = t.f.kind; } });
mcl.loadClip("../lakes/lake_scene.swf?v=2", holder);
_root.attachMovie("fisher", "mainFisher", 20);`,
}];

// external SWF: a class registered for its own "fisher" symbol, attached from its root frame
const LAKE = swf(`${shape(1)}${sprite(5, 1)}${exportAs(5, 'fisher')}${doAction}${show}`);
const LAKE_SOURCES = [
  { path: 'scripts/__Packages/lake/Fisher.as', text: `class lake.Fisher extends MovieClip {
  var kind = "lake";
  function Fisher() { super(); _root.ctorSawKind = this.kind; }
}` },
  { path: 'scripts/%3Cdefault package%3E/fisher.as', text: 'Object.registerClass("fisher", lake.Fisher);' },
  { path: 'scripts/frame_1/DoAction.as', text: 'stop();\nthis.attachMovie("fisher", "f", 1);\n_root.lakeRoot = this._name;' },
];

const until = async (player: AS2Player, done: () => boolean) => {
  for (let i = 0; i < 40 && !done(); i++) { player.tick(); await new Promise((r) => setTimeout(r, 0)); }
};

describe('external SWFs', () => {
  it('maps loadMovie URLs to SWF names', () => {
    expect(swfNameOf('../sharedsource/GSECS/gsecs2.9.swf?x=1')).toBe('gsecs2.9');
    expect(swfNameOf('bassken_fish4.20.swf')).toBe('bassken_fish4.20');
    expect(swfNameOf('C:\\game\\Bassken_Scene.XML')).toBe('bassken_scene');
  });

  it('loads an external SWF into a clip with its own classes and library', async () => {
    const doc = parseSwfXml(MAIN, { fileName: 'main.xml' });
    const lake = parseSwfXml(LAKE, { fileName: 'lake_scene.xml' });
    const built: string[] = [];
    const player = new AS2Player({
      doc,
      program: buildAS2Program(MAIN_SOURCES).program,
      resolveExternal: createExternalResolver(
        [{ name: 'lake_scene', doc: lake, assets: null, sources: () => LAKE_SOURCES }],
        { onBuild: (s, b) => { built.push(s.name); expect(b.errors).toEqual([]); } },
      ),
    });
    player.start();
    const root = player.root.obj as any;
    await until(player, () => root.initTarget !== undefined);

    expect(built).toEqual(['lake_scene']);
    expect([...player.missingExternals]).toEqual([]);
    // the loaded SWF's root frame ran inside the holder (this = holder)
    expect(root.lakeRoot).toBe('holder');
    // its Object.registerClass applied to its own "fisher"; the instance initialiser was set before the ctor ran
    expect(root.holder.f.kind).toBe('lake');
    expect(root.ctorSawKind).toBe('lake');
    expect(root.initTarget).toBe('holder');
    expect(root.initFisher).toBe('lake');
    // the main movie's "fisher" is a different symbol without that class
    expect(root.mainFisher).toBeTruthy();
    expect(root.mainFisher.kind).toBeUndefined();
    player.dispose();
  });

  it('reports SWFs that are not loaded as missing', async () => {
    const doc = parseSwfXml(MAIN, { fileName: 'main.xml' });
    const player = new AS2Player({ doc, program: buildAS2Program(MAIN_SOURCES).program, resolveExternal: createExternalResolver([]) });
    player.start();
    const root = player.root.obj as any;
    await until(player, () => root.initTarget !== undefined);
    expect([...player.missingExternals]).toEqual(['../lakes/lake_scene.swf?v=2']);
    player.dispose();
  });
});

describe('splitPackages', () => {
  const file = (path: string) => {
    const f = new File(['x'], path.split('/').pop()!);
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
  };
  it('gives every FFDec export in a folder its own files, main movie first', () => {
    const parts = splitPackages([
      file('game/external/lake/shapes/1.svg'),
      file('game/shapes/1.svg'),
      file('game/external/lake/lake.xml'),
      file('game/main.xml'),
      file('game/scripts/frame_1/DoAction.as'),
      file('game/external/lake/scripts/frame_1/DoAction.as'),
    ]);
    const paths = (i: number) => parts[i].files.map((f) => (f as any).webkitRelativePath).sort();
    expect(parts.map((p) => p.xmlFile.name)).toEqual(['main.xml', 'lake.xml']);
    expect(paths(0)).toEqual(['game/main.xml', 'game/scripts/frame_1/DoAction.as', 'game/shapes/1.svg']);
    expect(paths(1)).toEqual(['game/external/lake/lake.xml', 'game/external/lake/scripts/frame_1/DoAction.as', 'game/external/lake/shapes/1.svg']);
  });
});
