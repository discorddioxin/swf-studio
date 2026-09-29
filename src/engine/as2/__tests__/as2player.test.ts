// @vitest-environment jsdom
// AS2 player semantics against a tiny SWF (TEST FIXTURE ONLY – never imported by the app).
// Scripts use FFDec's export layout, so this also exercises as2ts project mapping.
import { describe, expect, it } from 'vitest';
import { parseSwfXml } from '../../../lib/parser';
import { buildAS2Program } from '../program';
import { AS2Player } from '../player';

const M = (tx: number, ty: number) => `<matrix type="MATRIX" hasScale="false" hasRotate="false" translateX="${tx}" translateY="${ty}"/>`;
const place = (depth: number, id: number, name: string | null, tx = 0, ty = 0) =>
  `<item type="PlaceObject2Tag" depth="${depth}" characterId="${id}" placeFlagHasCharacter="true" placeFlagHasMatrix="true"${name ? ` name="${name}"` : ''}>${M(tx, ty)}</item>`;
const show = '<item type="ShowFrameTag"/>';
const label = (n: string) => `<item type="FrameLabelTag" name="${n}"/>`;
const shape = (id: number, w: number, h: number) =>
  `<item type="DefineShapeTag" shapeId="${id}"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="${w * 20}" Ymax="${h * 20}"/></item>`;
const doAction = '<item type="DoActionTag"/>';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="7" frameRate="12" frameCount="4">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="8000" Ymax="6000"/>
  <tags>
    ${shape(1, 20, 40)}
    ${shape(3, 60, 20)}
    <item type="DefineEditTextTag" characterID="12" hasText="true" readOnly="true" fontHeight="240" initialText="0" variableName="score" html="false">
      <bounds type="RECT" Xmin="0" Ymin="0" Xmax="2000" Ymax="400"/>
    </item>
    <item type="DefineSpriteTag" spriteId="11" frameCount="1">
      <subTags>${place(1, 1, null)}${show}<item type="EndTag"/></subTags>
    </item>
    <item type="DefineSpriteTag" spriteId="10" frameCount="3">
      <subTags>
        ${place(1, 11, 'body')}${doAction}${label('idle')}${show}
        ${label('run')}${show}
        ${label('jump')}${show}
        <item type="EndTag"/>
      </subTags>
    </item>
    <item type="ExportAssetsTag"><tags><item>10</item></tags><names><item>Hero</item></names></item>
    <item type="DefineButton2Tag" buttonId="20">
      <characters>
        <item type="BUTTONRECORD" buttonStateUp="true" buttonStateOver="true" buttonStateDown="true" buttonStateHitTest="true" characterId="3" placeDepth="1">${M(0, 0)}</item>
      </characters>
    </item>
    ${place(5, 10, 'hero', 2000, 2000)}${place(6, 12, 'scoreText', 200, 200)}${doAction}${label('menu')}${show}
    ${place(7, 20, 'startButton', 4000, 400)}${show}
    ${label('game')}${doAction}${show}
    <item type="RemoveObject2Tag" depth="5"/>${label('over')}${show}
    <item type="EndTag"/>
  </tags>
</swf>`;

const SOURCES = [
  {
    path: 'scripts/frame_1/DoAction.as',
    text: `stop();
log = [];
log.push("frame1 hero=" + (hero != undefined) + " body=" + (hero.body != undefined));
undefinedThing.child.method();
nothing.x = 5;
_global.sharedCount = 0;
function addScore(n) { score = Number(score) + n; }`,
  },
  { path: 'scripts/frame_3/DoAction.as', text: `log.push("game frame"); hero.gotoAndStop("jump");` },
  { path: 'scripts/DefineSprite_10/frame_1/DoAction.as', text: `stop(); _root.log.push("hero frame1 " + this._name);` },
  { path: 'scripts/frame_1/PlaceObject2_10_5/onClipEvent(load).as', text: `onClipEvent(load){ _root.log.push("hero load"); }` },
  { path: 'scripts/frame_1/PlaceObject2_10_5/onClipEvent(enterFrame).as', text: `onClipEvent(enterFrame){ _global.sharedCount++; }` },
  { path: 'scripts/DefineButton2_20/on(release).as', text: `on(release){ log.push("release this=" + this._name); gotoAndStop("game"); }` },
  { path: 'scripts/Hero.as', text: `Object.registerClass("Hero", HeroClip);` },
  {
    path: 'scripts/__Packages/HeroClip.as',
    text: `class HeroClip extends MovieClip {
  var speed:Number;
  function HeroClip() { _root.log.push("ctor " + this._name + " speed=" + speed + " body=" + (this.body != undefined)); }
  function run() { this._x += speed; }
}`,
  },
];

function boot() {
  const doc = parseSwfXml(XML, { fileName: 'fixture.xml' });
  const build = buildAS2Program(SOURCES);
  expect(build.errors).toEqual([]);
  const logs: string[] = [];
  const player = new AS2Player({ doc, program: build.program, onLog: (e) => logs.push(`${e.level}: ${e.message}`) });
  player.start();
  const root = player.root.obj as any;
  return { doc, player, root, logs };
}

describe('AS2 player', () => {
  it('runs frame scripts after placement, honours stop() and never throws on undefined', () => {
    const { player, root, logs } = boot();
    expect(root.log[0]).toBe('frame1 hero=true body=true');
    for (let i = 0; i < 10; i++) player.tick();
    expect(player.root.frame).toBe(0); // stop() on frame 1: the timeline no longer loops through every state
    expect(logs.filter((l) => l.startsWith('error'))).toEqual([]);
  });

  it('builds linked classes before their constructor body and runs clip events in order', () => {
    const { root } = boot();
    const i = (s: string) => root.log.findIndex((l: string) => l.startsWith(s));
    // the timeline-placed hero was constructed before _root's frame script created _root.log (as in Flash)
    expect(root.log).not.toContain('ctor hero speed=undefined body=true');
    expect(root.log).toContain('hero frame1 hero');
    expect(i('hero load')).toBeGreaterThan(i('hero frame1'));
    expect(typeof root.hero.run).toBe('function');
    root.hero.speed = 5;
    root.hero.run();
    expect(root.hero._x).toBe(105);
  });

  it('attachMovie passes the init object before the constructor runs', () => {
    const { root, player } = boot();
    const h = root.attachMovie('Hero', 'h2', 10, { speed: 3 });
    expect(h._name).toBe('h2');
    expect(root.h2).toBe(h);
    expect(root.log).toContain('ctor h2 speed=3 body=true');
    expect(h.getDepth()).toBe(10);
    h.removeMovieClip();
    expect(root.h2).toBeUndefined();
    expect(player.root.children.some((c) => c.name === 'h2')).toBe(false);
  });

  it('dispatches onClipEvent(enterFrame) each tick and binds text variables', () => {
    const { player, root } = boot();
    root.play();
    player.tick();
    expect(root.startButton).toBeTruthy(); // placed on frame 2
    root.stop();
    const before = root._global.sharedCount;
    player.tick(); player.tick();
    expect(root._global.sharedCount).toBe(before + 2);
    root.addScore(7);
    player.tick();
    expect(root.scoreText.text).toBe('7');
  });

  it('button on(release) runs on the parent timeline; goto diffs the display list', () => {
    const { player, root } = boot();
    root.gotoAndStop(2);
    expect(root.startButton).toBeTruthy();
    // button at (200px, 20px), 60×20
    player.pointerMove(210, 25);
    player.pointerDown(210, 25);
    player.pointerUp(210, 25);
    expect(root.log).toContain('release this=');
    expect(player.root.frame).toBe(2);
    expect(root.log).toContain('game frame');
    expect(root.hero._currentframe).toBe(3);
    root.gotoAndStop('over');
    expect(root.hero).toBeUndefined();
    root.gotoAndStop('menu');
    expect(root.hero).toBeTruthy();
    expect(root.startButton).toBeUndefined();
  });

  it('runs setInterval on game time', () => {
    const { player, root } = boot();
    let n = 0;
    player.setTimer(() => { n++; }, 50);
    player.advanceBy(60);
    player.advanceBy(60);
    expect(n).toBe(2);
    expect(player.gameTime).toBe(120);
    void root;
  });
});
