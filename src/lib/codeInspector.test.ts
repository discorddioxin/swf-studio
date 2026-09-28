import { describe, expect, it } from 'vitest';
import { analyzeCode, analyzeCodebase, buildAssetDescriptors, type AssetDescriptor } from './codeInspector';
import type { Project, SwfDocument } from '../types';

const ASSETS: AssetDescriptor[] = [
  { name: 'heroBall', assetId: 7, assetKind: 'sprite' },
  { name: 'explosion', assetId: 9, assetKind: 'sprite' },
];

const one = (source: string, assets = ASSETS) => analyzeCode([{ label: 'src', source }], assets);
const base = (source: string, assets = ASSETS) =>
  analyzeCodebase([{ id: 's1', label: 'src', timelineId: 'root', source }], assets);
const edges = (source: string) =>
  base(source).references.filter((r) => r.via !== 'asset').map((r) => `${r.fromName}-${r.via}->${r.toName}@${r.fromLine}`);

describe('analyzeCode — method discovery', () => {
  it('finds AS2/AS3 functions that declare a return type (CI-01)', () => {
    const a = one('public function move(dx:Number):void {\n  x += dx;\n}\nfunction reset():Void {\n}');
    expect(a.methods.map((m) => [m.name, m.params, m.startLine, m.endLine])).toEqual([
      ['move', ['dx'], 1, 3],
      ['reset', [], 4, 5],
    ]);
  });

  it('finds getters/setters as methods', () => {
    const a = one('function get hp():Number { return 1; }\nfunction set hp(v:Number):Void { }');
    expect(a.methods.map((m) => [m.name, m.kind])).toEqual([['hp', 'method'], ['hp', 'method']]);
  });

  it('is not derailed by braces inside strings (CI-03)', () => {
    const a = one('function a() {\n  trace("}");\n  heroBall.play();\n}\nfunction b() {}');
    const fa = a.methods.find((m) => m.name === 'a')!;
    expect([fa.startLine, fa.endLine]).toEqual([1, 4]);
    expect(fa.assetRefs).toEqual(['heroBall']);
  });

  it('ignores code inside comments (CI-03)', () => {
    const a = one('// function ghost() {\n/* function ghost2() { */\nfunction real() {}');
    expect(a.methods.map((m) => m.name)).toEqual(['real']);
  });

  it('indexes nested definitions and does not credit parents with child refs (CI-04)', () => {
    const a = one('this.init = function() {\n  this.onEnterFrame = function() {\n    heroBall.play();\n  };\n  explosion.stop();\n};');
    expect(a.methods.map((m) => [m.name, m.kind, m.startLine, m.endLine])).toEqual([
      ['init', 'method', 1, 6],
      ['onEnterFrame', 'method', 2, 4],
    ]);
    expect(a.methods[0].assetRefs).toEqual(['explosion']);
    expect(a.methods[1].assetRefs).toEqual(['heroBall']);
    // The parent's body is still shown in full.
    expect(a.methods[0].body).toContain('heroBall.play()');
  });

  it('classifies function expressions consistently (CI-11)', () => {
    const a = one([
      'btn.onRelease = function go() {}',
      'btn.onPress = function() {}',
      'var helper = function(a) {}',
      'onEnterFrame = function() {}',
      'Hero.prototype.jump = function(h) {}',
      'var api = { fire: function(n) {} };',
      'setInterval(function() {}, 10);',
    ].join('\n'));
    expect(a.methods.map((m) => [m.name, m.kind])).toEqual([
      ['btn.onRelease', 'handler'],
      ['btn.onPress', 'handler'],
      ['helper', 'function'],
      ['onEnterFrame', 'handler'],
      ['jump', 'method'],
      ['fire', 'method'],
    ]);
  });

  it('does not report calls for nested definitions or keywords', () => {
    const a = one('function a() {\n  function inner() {}\n  if (x) { b(1); }\n  return c();\n}');
    expect(a.methods[0].calls.sort()).toEqual(['b', 'c']);
  });
});

describe('analyzeCode — members', () => {
  it('does not also index `var f = function` as a member (CI-02)', () => {
    const a = one('var go = function(a) {\n  trace(a);\n};');
    expect(a.methods.map((m) => m.name)).toEqual(['go']);
    expect(a.members).toEqual([]);
  });

  it('understands typed, uninitialised, modified and const declarations (CI-06)', () => {
    const a = one('var speed:Number = 5;\nvar hp;\nprivate var _x:int = 0; // note\nstatic const MAX:int = 3;');
    expect(a.members.map((m) => [m.name, m.kind, m.value])).toEqual([
      ['speed', 'var', '5'],
      ['hp', 'var', ''],
      ['_x', 'var', '0'],
      ['MAX', 'const', '3'],
    ]);
  });

  it('treats vars inside function bodies as locals, but keeps this.x assignments (CI-08)', () => {
    const a = one('var score = 0;\nfunction a() {\n  var i = 0;\n  this.lives = 3;\n}');
    expect(a.members.map((m) => [m.name, m.kind])).toEqual([['score', 'var'], ['lives', 'property']]);
  });

  it('does not treat `this.x == y` as an assignment', () => {
    expect(one('this.x == 5;').members).toEqual([]);
  });
});

describe('analyzeCode — asset relationships', () => {
  it('reports via and the actual line of each reference', () => {
    const a = one('function spawn() {\n  trace(1);\n  _root.attachMovie("explosion", "e1", 1);\n  heroBall.play();\n}');
    expect(a.relationships.map((r) => [r.assetName, r.via, r.line, r.assetId])).toEqual([
      ['explosion', 'attachMovie', 3, 9],
      ['heroBall', 'identifier', 4, 7],
    ]);
    expect(a.assetIndex.explosion.usedBy).toHaveLength(1);
  });

  it('ignores asset names that only appear in comments', () => {
    expect(one('function f() {\n  // heroBall\n}').relationships).toEqual([]);
  });

  it('keeps a summary for empty sources', () => {
    const a = analyzeCode([{ label: 'empty', source: '   ' }, { label: 'x', source: 'var a = 1;' }], ASSETS);
    expect(a.counts.sources).toBe(2);
    expect(a.sources[0]).toMatchObject({ label: 'empty', methodCount: 0 });
  });

  it('is safe for asset names that collide with Object.prototype (CI-05)', () => {
    const a = one('function f() { constructor.play(); }', [{ name: 'constructor', assetId: 1 }]);
    const key: string = 'constructor';
    expect(a.assetIndex[key].usedBy).toHaveLength(1);
  });
});

describe('analyzeCodebase', () => {
  it('does not crash on symbols named like Object.prototype members (CI-05)', () => {
    const a = base('function toString() {\n  return "x";\n}\nfunction constructor() {}\nfunction f() { toString(); }');
    expect(a.counts.methods).toBe(3);
    const [toStr, hasOwn]: string[] = ['toString', 'hasOwnProperty'];
    expect(a.byName[toStr].definitions).toHaveLength(1);
    expect(a.byName[toStr].references).toHaveLength(1);
    expect(a.byName[hasOwn]).toBeUndefined();
  });

  it('classifies member reads and writes correctly (CI-07)', () => {
    const src = [
      'var score = 0;',
      'function check() {',
      '  if (score == 10) {}',
      '}',
      'function bump() {',
      '  score += 1;',
      '}',
      'function setIt() {',
      '  this.score = 3;',
      '}',
      'function inc() {',
      '  ++score;',
      '}',
    ].join('\n');
    expect(edges(src)).toEqual([
      'check-read->score@3',
      'bump-read->score@6',
      'bump-write->score@6',
      'setIt-write->score@9',
      'inc-read->score@12',
      'inc-write->score@12',
    ]);
  });

  it('reports the line of the reference, not of the definition (CI-09)', () => {
    expect(edges('function a() {\n\n\n\n  b();\n}\nfunction b() {}')).toEqual(['a-call->b@5']);
  });

  it('ignores local declarations, object keys and other objects\' properties', () => {
    const src = 'var hp = 1;\nfunction a() {\n  var hp = 2;\n  var o = { hp: 3 };\n  enemy.hp = 4;\n}';
    expect(edges(src)).toEqual([]);
  });

  it('does not produce edges from comments or strings', () => {
    expect(edges('var hp = 1;\nfunction a() {\n  // hp = 3\n  trace("hp");\n}')).toEqual([]);
  });

  it('records asset edges with ids', () => {
    const a = base('function f() {\n  heroBall.play();\n}');
    expect(a.references).toEqual([
      expect.objectContaining({ fromName: 'f', toKind: 'asset', toName: 'heroBall', assetId: 7, fromLine: 2 }),
    ]);
    expect(a.assetIndex.heroBall.usedBy).toEqual([{ fromName: 'f', fromSourceId: 's1', line: 2, lines: [2] }]);
  });

  it('scales linearly on large sources (CI-10)', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `function f${i}(a) {\n  var x = a + ${i};\n  heroBall.play();\n  return x;\n}`).join('\n');
    const t0 = performance.now();
    const a = base(big);
    expect(a.counts.methods).toBe(3000);
    // Previously ~2.5s due to O(n) line lookups; now well under a second.
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('former limitations (audit §6)', () => {
  it('masks regex literals so quotes/braces inside them do not derail parsing (L-1)', () => {
    const src = 'function a(s) {\n  var r = /["{]/g;\n  heroBall.play();\n}\nfunction b() {\n  return x / 2 / y;\n}\nfunction c() {}';
    const a = one(src);
    expect(a.methods.map((m) => [m.name, m.startLine, m.endLine, m.assetRefs])).toEqual([
      ['a', 1, 4, ['heroBall']],
      ['b', 5, 7, []],
      ['c', 8, 8, []],
    ]);
  });

  it('keeps division working next to regex detection', () => {
    expect(edges('var total = 1;\nvar n = 2;\nfunction avg() {\n  return total / n;\n}')).toEqual([
      'avg-read->total@4', 'avg-read->n@4',
    ]);
  });

  it('indexes every declarator of a multi-declaration (L-2)', () => {
    const a = one('var a = 1, b:Number = f(1, 2), c;\nconst X = 1, Y = [1, 2]; var ignored = 3;');
    expect(a.members.map((m) => [m.name, m.kind, m.value])).toEqual([
      ['a', 'var', '1'], ['b', 'var', 'f(1, 2)'], ['c', 'var', ''],
      ['X', 'const', '1'], ['Y', 'const', '[1, 2]'],
    ]);
  });

  it('attributes initializer references to the right declarator', () => {
    expect(edges('var a = 1, b = a + 1;')).toEqual(['b-read->a@1']);
  });

  it('resolves names by scope: params, locals, catch vars and closures shadow members (L-3)', () => {
    const src = [
      'var hp = 10;',
      'var speed = 1;',
      'function heal(hp) {',            // param shadows member
      '  return hp + 1;',
      '}',
      'function loop() {',
      '  for (var i = 0, speed = 2; i < 3; i++) {}',   // local shadows member
      '  try {} catch (hp) { trace(hp); }',
      '  var tick = function() { speed++; };',        // closure sees outer local
      '  return this.hp;',                             // explicit member access
      '}',
      'function hurt() {',
      '  hp -= 1;',
      '}',
    ].join('\n');
    expect(edges(src)).toEqual(['loop-read->hp@10', 'hurt-read->hp@13', 'hurt-write->hp@13']);
  });

  it('a local shadows a method of the same name', () => {
    expect(edges('function jump() {}\nfunction run(jump) {\n  jump();\n}\nfunction go() {\n  jump();\n}')).toEqual(['go-call->jump@6']);
  });

  it('resolves _root/_global/_parent member access like this.x (L-3)', () => {
    expect(edges('var score = 0;\nfunction a() {\n  _root.score += 5;\n  _global.score = 1;\n  enemy.score = 2;\n}')).toEqual([
      'a-read->score@3', 'a-write->score@3',
    ]);
  });

  it('records every usage line of an edge, not just the first (L-4)', () => {
    const a = base('var hp = 1;\nfunction f() {\n  hp = 2;\n  trace(1);\n  hp = 3;\n  heroBall.play();\n  heroBall.stop();\n}');
    const write = a.references.find((r) => r.via === 'write')!;
    expect([write.fromLine, write.lines]).toEqual([3, [3, 5]]);
    const asset = a.references.find((r) => r.via === 'asset')!;
    expect(asset.lines).toEqual([6, 7]);
    const rel = one('function f() {\n  heroBall.play();\n\n  heroBall.stop();\n}').relationships[0];
    expect([rel.line, rel.lines]).toEqual([2, [2, 4]]);
  });
});

describe('buildAssetDescriptors', () => {
  it('collects class, export, label and synthetic names plus clips', () => {
    const doc = {
      characters: new Map([[3, { id: 3, kind: 'sprite', className: 'Hero', exportName: 'hero_mc' }]]),
    } as unknown as SwfDocument;
    const project = { characters: { 3: { name: 'Player' } }, clips: [{ name: 'run' }] } as unknown as Project;
    expect(buildAssetDescriptors(doc, project)).toEqual([
      { name: 'Hero', assetId: 3, assetKind: 'sprite' },
      { name: 'hero_mc', assetId: 3, assetKind: 'sprite' },
      { name: 'Player', assetId: 3, assetKind: 'sprite' },
      { name: 'sprite_3', assetId: 3, assetKind: 'sprite' },
      { name: 'run', assetKind: 'clip' },
    ]);
  });
});
