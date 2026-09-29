import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { transform } from 'sucrase';
import { describe, expect, it } from 'vitest';
import { classify, parseProgram, tokenize, transpileProject, transpileScript } from '..';

const script = (src: string) => transpileScript(src).code;

describe('lexer', () => {
  it('tokenizes AS2 incl. FFDec markers and tracks newlines', () => {
    const t = tokenize('var a:Number = 0x1F; // c\n§§push(a);');
    expect(t.map((x) => x.value)).toEqual(['var', 'a', ':', 'Number', '=', '0x1F', ';', '§§push', '(', 'a', ')', ';', '']);
    expect(t[7].nlBefore).toBe(true);
  });
});

describe('parser', () => {
  it('parses handlers, classes and AS1 syntax', () => {
    const body = parseProgram(`
      on(press, release) { play(); }
      onClipEvent(enterFrame) { _x++; }
      if (a eq "x" and not b) tellTarget("/m") { stop(); }
      dynamic class com.x.Foo extends MovieClip implements IThing {
        private static var count:Number = 0;
        var speed:Number;
        function Foo() { super(); }
        function get value():Number { return speed; }
        public function tick(dt:Number):Void { speed += dt; }
      }`);
    expect(body.map((s) => s.k)).toEqual(['on', 'onClipEvent', 'if', 'class']);
    const cls = body[3];
    if (cls.k !== 'class') throw new Error();
    expect(cls.decl.name).toBe('com.x.Foo');
    expect(cls.decl.dynamic).toBe(true);
    expect(cls.decl.members.map((m) => `${m.kind}:${m.name}`)).toEqual(['field:count', 'field:speed', 'method:Foo', 'getter:value', 'method:tick']);
  });

  it('handles ASI, for-in, labels, switch, try/catch', () => {
    expect(() => parseProgram(`
      var o = {a: 1, "b c": 2}
      for (var k in o) trace(k)
      outer: for (var i = 0; i < 3; i++) { switch (i) { case 1: break outer; default: continue; } }
      try { throw "x" } catch (e) { trace(e) } finally { }
      x = y ? 1 : 2
      i++
    `)).not.toThrow();
  });

  it('reports parse errors with a line number', () => {
    expect(() => parseProgram('var a = ;\n')).toThrow(/line 1/);
  });
});

describe('emitter scoping', () => {
  it('maps frame vars/functions and unresolved names to the timeline', () => {
    const code = script('var n = 1; function f(a) { var b = a + n; return b; } stop(); n = f(2);');
    expect(code).toContain('$t.n = 1;');
    expect(code).toContain('$t.f = function f(this: any, a: any)');
    expect(code).toContain('var b: any = a + $t.n;');
    expect(code).toContain('$t.stop();');
    expect(code).toContain('$t.n = $t.f(2);');
  });

  it('keeps dynamic this in nested functions and maps runtime globals', () => {
    const code = script('mc.onEnterFrame = function() { this._x += Key.isDown(Key.LEFT) ? -1 : 1; trace(getTimer()); };');
    expect(code).toContain('$t.mc.onEnterFrame = function(this: any) {');
    expect(code).toContain('this._x += Key.isDown(Key.LEFT) ? -1 : 1;');
    expect(code).toMatch(/import \{ Key, getTimer, trace, type AS2Clip \} from "@\/runtime\/as2";/);
  });

  it('translates contextual globals, eval assignment, with, typeof and Object.registerClass', () => {
    const code = script('eval("s" + i) = 3; setProperty(m, _alpha, 5); with (box) { w = 10; } x = typeof y; Object.registerClass("fish", Fish);');
    expect(code).toContain('$rt.set($t, "s" + $t.i, 3);');
    expect(code).toContain('$rt.setProperty($t, $t.m, "_alpha", 5);');
    expect(code).toContain('$rt.scope([$w1, $t], "w").w = 10;');
    expect(code).toContain('$t.x = $rt.typeOf($t.y);');
    expect(code).toContain('$rt.registerLinkage("fish", $t.Fish);');
  });

  it('flags FFDec undecompiled markers', () => {
    const r = transpileScript('§§push(1);');
    expect(r.code).toContain('$rt.ffdec("§§push")(1)');
    expect(r.diagnostics[0].message).toMatch(/could not be decompiled/);
  });

  it('emits classes with member resolution, statics, getters and super', () => {
    const { code } = transpileScript(`
      class game.Fish extends MovieClip {
        static var COUNT:Number = 0;
        var speed:Number = 2;
        function Fish() { COUNT++; }
        function get fast():Boolean { return speed > 5; }
        function swim(dt:Number):Void { _x += speed * dt; helper(); }
      }`);
    expect(code).toContain('export class Fish extends MovieClip {');
    expect(code).toContain('static COUNT: number = 0;');
    expect(code).toContain('declare speed: number;');
    expect(code).toMatch(/constructor\(\) \{\n\s+super\(\);\n\s+this\.speed = 2;\n\s+Fish\.COUNT\+\+;/);
    expect(code).toContain('get fast(): boolean {');
    expect(code).toContain('this._x += this.speed * dt;');
    expect(code).toContain('this.helper();'); // MovieClip subclass: unknown names are inherited members
    expect(code).toContain('$rt.registerClass("game.Fish", Fish);');
  });
});

describe('project mapping', () => {
  it('classifies FFDec export paths', () => {
    expect(classify('scripts/frame_1/DoAction.as')).toEqual({ kind: 'frame', timeline: 0, frame: 1 });
    expect(classify('scripts/DefineSprite_12_fish/frame_3/DoAction_2.as')).toEqual({ kind: 'frame', timeline: 12, frame: 3 });
    expect(classify('scripts/DefineButton2_40/on(release).as')).toEqual({ kind: 'button', button: 40 });
    expect(classify('scripts/frame_2/PlaceObject2_45_7/onClipEvent(load).as')).toEqual({ kind: 'placement', timeline: 0, frame: 2, character: 45, depth: 7 });
    expect(classify('scripts/DefineSprite_9/DoInitAction.as')).toEqual({ kind: 'init', timeline: 9 });
    expect(classify('scripts/__Packages/com/x/Foo.as')).toEqual({ kind: 'class' });
  });

  const project = [
    { path: 'scripts/frame_1/DoAction.as', content: 'stop();\nvar lobby = new com.game.Lobby(this);\nObject.registerClass("fishClip", com.game.Fish);' },
    { path: 'scripts/frame_1/DoAction_2.as', content: 'import com.game.Fish;\nvar f:Fish = Fish(attachMovie("fishClip", "f1", 1));' },
    { path: 'scripts/DefineSprite_5/frame_10/DoAction.as', content: '_parent.gotoAndStop(1);\n#include "shared.as"' },
    { path: 'scripts/DefineSprite_5/frame_10/shared.as', content: 'trace("included");' },
    { path: 'scripts/DefineButton2_7/on(release).as', content: 'on(release) { _root.lobby.join(); }' },
    { path: 'scripts/frame_1/PlaceObject2_5_3/onClipEvent(enterFrame).as', content: 'onClipEvent(enterFrame) { _rotation += 1; }' },
    { path: 'scripts/__Packages/com/game/Fish.as', content: 'class com.game.Fish extends MovieClip { var weight:Number; function Fish() { weight = random(10); } }' },
    { path: 'scripts/__Packages/com/game/Lobby.as', content: 'import com.game.Fish;\nclass com.game.Lobby { private var host:MovieClip; var fish:Array; function Lobby(h:MovieClip) { host = h; fish = []; } function join():Void { var f:Fish = null; fish.push(f); Fish.prototype; } }' },
    { path: 'scripts/broken/frame_2/DoAction.as', content: 'var = ;' },
  ];

  it('generates timelines, handlers, classes and an index', () => {
    const r = transpileProject(project);
    expect([...r.files.keys()].sort()).toEqual([
      'as2ts-report.md', 'buttons/button_7.ts', 'classes/com/game/Fish.ts', 'classes/com/game/Lobby.ts',
      'index.ts', 'timelines/root.ts', 'timelines/sprite_5.ts',
    ]);
    const root = r.files.get('timelines/root.ts')!;
    expect(root).toContain('import { Fish } from "../classes/com/game/Fish";');
    expect(root).toContain('$t.lobby = new Lobby($t);');
    expect(root).toContain('$rt.registerLinkage("fishClip", Fish);');
    expect(root).toContain('"1:3": [');
    expect(root).toContain('{ character: 5, kind: \'onClipEvent\', events: ["enterFrame"]');
    expect(root).toContain('$rt.untranslated("scripts/broken/frame_2/DoAction.as"');
    expect(r.files.get('timelines/sprite_5.ts')).toContain('trace("included");');
    expect(r.files.get('classes/com/game/Lobby.ts')).toContain('import { Fish } from "./Fish";');
    expect(r.files.get('index.ts')).toContain('5: sprite_5,');
    expect(r.summary).toMatch(/Errors: 1/);
  });

  it('produces TypeScript that type-checks against the runtime', () => {
    const r = transpileProject(project, { runtime: '../runtime/as2' });
    const repo = resolve(__dirname, '../../../..');
    const dir = mkdtempSync(join(tmpdir(), 'as2ts-check-'));
    try {
      for (const [p, c] of r.files) {
        if (!p.endsWith('.ts')) continue;
        // generated modules live in <dir>/game; runtime is copied next to it
        const full = join(dir, 'game', p);
        mkdirSync(dirname(full), { recursive: true });
        const depth = p.split('/').length - 1;
        writeFileSync(full, c.replace(/"\.\.\/runtime\/as2"/g, JSON.stringify('../'.repeat(depth + 1) + 'runtime/as2')));
        // and it must be valid for sucrase (what the engine loader uses)
        expect(() => transform(c, { transforms: ['typescript', 'imports'] })).not.toThrow();
      }
      mkdirSync(join(dir, 'runtime', 'as2'), { recursive: true });
      writeFileSync(join(dir, 'runtime', 'as2', 'index.ts'), readFileSync(join(repo, 'src/runtime/as2/index.ts'), 'utf8'));
      writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true, isolatedModules: true, useDefineForClassFields: true, lib: ['ES2020'], types: [] },
        include: ['game', 'runtime'],
      }));
      let out = '';
      try { execFileSync(process.execPath, [join(repo, 'node_modules/typescript/bin/tsc'), '-p', dir], { encoding: 'utf8' }); }
      catch (e) { out = (e as { stdout?: string }).stdout ?? String(e); }
      expect(out).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
