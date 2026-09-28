// TEST FIXTURE ONLY (never imported by the app). A tiny AS3 game in two
// halves, the way SWF Studio receives a real one:
//   * XML  – the JPEXS dump: symbols, timelines, labels, SymbolClass linkage
//   * SOURCES – the game's AS3 classes transpiled to TypeScript, using the
//     import spellings AS3→TS transpilers emit (flash/display/MovieClip,
//     flash.events.Event, relative and package-style paths).

const M = (a: number, d: number, tx: number, ty: number) =>
  `<matrix type="MATRIX" hasScale="true" scaleX="${Math.round(a * 65536)}" scaleY="${Math.round(d * 65536)}" translateX="${tx}" translateY="${ty}"/>`;
const place = (depth: number, id: number, name: string | null, tx: number, ty: number) =>
  `<item type="PlaceObject2Tag" depth="${depth}" characterId="${id}" placeFlagHasCharacter="true" placeFlagHasMatrix="true"${name ? ` name="${name}"` : ''}>${M(1, 1, tx, ty)}</item>`;
const show = '<item type="ShowFrameTag"/>';
const label = (n: string) => `<item type="FrameLabelTag" name="${n}"/>`;
const shape = (id: number, w: number, h: number) =>
  `<item type="DefineShapeTag" shapeId="${id}"><shapeBounds type="RECT" Xmin="0" Ymin="0" Xmax="${w * 20}" Ymax="${h * 20}"/></item>`;

export const GAME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" version="10" frameRate="30" frameCount="3">
  <displayRect type="RECT" Xmin="0" Ymin="0" Xmax="8000" Ymax="6000"/>
  <tags>
    <item type="SetBackgroundColorTag"><backgroundColor type="RGB" red="16" green="32" blue="48"/></item>
    ${shape(1, 20, 40)}
    ${shape(2, 30, 30)}
    ${shape(3, 60, 20)}
    ${shape(4, 60, 20)}
    <item type="DefineEditTextTag" characterID="12" hasText="true" readOnly="true" fontHeight="360" initialText="Score: ?" variableName="">
      <bounds type="RECT" Xmin="0" Ymin="0" Xmax="3000" Ymax="500"/>
    </item>
    <item type="DefineSpriteTag" spriteId="10" frameCount="3">
      <subTags>
        ${place(1, 1, 'body', 0, 0)}${label('idle')}${show}
        ${label('run')}${show}
        <item type="RemoveObject2Tag" depth="1"/>${place(1, 2, 'body', 0, 0)}${label('jump')}${show}
        <item type="EndTag"/>
      </subTags>
    </item>
    <item type="DefineSpriteTag" spriteId="11" frameCount="1">
      <subTags>${place(1, 2, null, 0, 0)}${show}<item type="EndTag"/></subTags>
    </item>
    <item type="DefineButton2Tag" buttonId="20">
      <characters>
        <item type="BUTTONRECORD" buttonStateUp="true" buttonStateHitTest="true" characterId="3" placeDepth="1">${M(1, 1, 0, 0)}</item>
        <item type="BUTTONRECORD" buttonStateOver="true" buttonStateDown="true" characterId="4" placeDepth="1">${M(1, 1, 0, 0)}</item>
      </characters>
    </item>
    <item type="SymbolClassTag">
      <tags><item>0</item><item>10</item><item>11</item></tags>
      <names><item>com.game.Main</item><item>com.game.Hero</item><item>com.game.Enemy</item></names>
    </item>
    ${place(10, 10, 'hero', 2000, 2000)}${place(20, 12, 'scoreText', 200, 200)}${place(30, 20, 'startButton', 5000, 400)}${label('menu')}${show}
    ${label('game')}${show}
    <item type="RemoveObject2Tag" depth="10"/><item type="RemoveObject2Tag" depth="30"/>${label('gameover')}${show}
    <item type="EndTag"/>
  </tags>
</swf>`;

export const SOURCES: { path: string; text: string }[] = [
  {
    path: 'transpiled/com/game/Main.ts',
    text: `
import { MovieClip } from "flash/display/MovieClip";
import { SimpleButton } from "flash/display/SimpleButton";
import { Event } from "flash.events.Event";
import { KeyboardEvent } from "flash/events/KeyboardEvent";
import { MouseEvent } from "flash/events/MouseEvent";
import { TextField } from "flash/text/TextField";
import { Keyboard } from "flash/ui/Keyboard";
import { setTimeout } from "flash/utils";
import { Hero } from "./Hero";
import { Enemy } from "com/game/Enemy";
import { GameConfig } from "../../util/GameConfig";

export class Main extends MovieClip {
  public hero: Hero;
  public scoreText: TextField;
  public startButton: SimpleButton;
  public score: number = 0;
  public enemies: Array<Enemy> = [];
  public log: string[] = [];

  constructor() {
    super();
    this.log.push("ctor hero=" + (this.hero instanceof Hero) + " stage=" + (this.stage != null) + " frame=" + this.currentFrame);
    this.addFrameScript(0, this.frame1, 1, this.frame2, 2, this.frame3);
    this.stage.addEventListener(KeyboardEvent.KEY_DOWN, this.onKeyDown);
    this.addEventListener(Event.ENTER_FRAME, this.onEnterFrame);
    GameConfig.starts++;
  }

  private frame1(): void {
    this.stop();
    this.scoreText.text = "Score: " + this.score;
    this.startButton.addEventListener(MouseEvent.CLICK, this.onStart);
    this.log.push("frame1");
  }

  private frame2(): void {
    this.stop();
    this.log.push("frame2 enemies=" + this.enemies.length);
    const enemy: Enemy = new Enemy(GameConfig.enemySpeed);
    enemy.x = 300;
    enemy.y = this.hero.y;
    this.addChild(enemy);
    this.enemies.push(enemy);
    setTimeout(() => { this.log.push("bonus"); this.score += 10; }, 500);
  }

  private frame3(): void {
    this.log.push("frame3 hero=" + this.hero);
    trace("GAME OVER", this.score);
  }

  private onStart = (e: MouseEvent): void => {
    this.log.push("click " + e.currentTarget.name);
    this.gotoAndStop("game");
    this.log.push("after goto frame=" + this.currentFrame);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.currentLabel != "game") return;
    if (e.keyCode == Keyboard.RIGHT) { this.hero.x += 10; this.hero.gotoAndStop("run"); }
    if (e.keyCode == Keyboard.SPACE) this.hero.jump();
  };

  private onEnterFrame(e: Event): void {
    if (this.currentLabel != "game") return;
    for (const enemy of this.enemies) {
      enemy.update();
      if (enemy.hitTestObject(this.hero)) {
        this.removeChild(enemy);
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        this.gotoAndStop("gameover");
        return;
      }
    }
    this.score += 1;
    this.scoreText.text = "Score: " + this.score;
  }
}
`,
  },
  {
    path: 'transpiled/com/game/Hero.ts',
    text: `
import { MovieClip } from "flash/display/MovieClip";
import { Event } from "flash/events/Event";

export class Hero extends MovieClip {
  public body: any;
  public jumps: number = 0;
  public addedToStage: boolean = false;
  public ctorInfo: string;

  constructor() {
    super();
    this.ctorInfo = "parent=" + (this.parent != null ? this.parent.name : "null") + " name=" + this.name + " x=" + this.x + " body=" + (this.body != null);
    this.stop();
    this.addEventListener(Event.ADDED_TO_STAGE, () => { this.addedToStage = true; });
  }

  public jump(): void {
    this.jumps++;
    this.gotoAndStop("jump");
  }
}
`,
  },
  {
    path: 'transpiled/com/game/Enemy.ts',
    text: `
import { MovieClip } from "flash.display.MovieClip";

export class Enemy extends MovieClip {
  private speed: number;
  constructor(speed: number = 1) {
    super();
    this.speed = speed;
  }
  public update(): void {
    this.x -= this.speed;
  }
}
`,
  },
  {
    path: 'transpiled/util/GameConfig.ts',
    text: `
export class GameConfig {
  public static enemySpeed: number = 50;
  public static starts: number = 0;
}
`,
  },
  // Type declarations and unrelated assets must be ignored by the loader.
  { path: 'transpiled/types/flash.d.ts', text: 'declare module "flash/display/MovieClip" { export class MovieClip {} }' },
];
