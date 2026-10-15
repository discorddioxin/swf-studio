// P-06: inspecting an AS3 program must not run it. A class's static initializer
// (`cinit`) is game code; it runs when the player links the program, once.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { AbcFile } from '../../../../transcom/decompiler/swf/abc';
import { transpileAbc } from '../../../../transcom/transpiler/avm2';
import { attr, body, method, OPEN, RETURN_VOID } from '../../../../transcom/transpiler/avm2/testAbc';
import { parseSwfXml } from '../../../lib/parser';
import type { LoadedAsset } from '../../../lib/assets';
import { analyzeAs3Program } from '../analyze';
import { expectedClasses, linkProgram } from '../loader';
import { TOP_LEVEL } from '../packages';
import { FlashPlayer } from '../player';
import { runtime } from '../context';
import { GAME_XML, SOURCES } from './gameFixture';

/** `package com.game { class Main extends MovieClip { static: trace("cinit") } }` */
function tracingDocumentClass(): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN], strings: ['', 'cinit'],
    namespaces: [{ kind: '?', name: '' }], nsSets: [],
    multinames: [
      { kind: '?', name: '' },
      { kind: 'QName', name: 'trace', ns: '', nsKind: 'package' },
      { kind: 'QName', name: 'Main', ns: 'com.game', nsKind: 'package' },
      { kind: 'QName', name: 'MovieClip', ns: 'flash.display', nsKind: 'package' },
    ],
    methods: [method(), method(), method()],
    metadata: [],
    classes: [{
      instance: { name: 'com.game.Main', superName: 'flash.display.MovieClip', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false, traits: [] },
      cinit: 1, traits: [],
    }],
    scripts: [{ init: 2, traits: [{ name: 'com.game.Main', kind: 'class', attr, classIndex: 0, slotId: 1, metadata: [] }] }],
    bodies: [
      body(0, [...OPEN, 0xd0, 0x49, 0x00, RETURN_VOID]),            // super()
      body(1, [...OPEN, 0x5d, 1, 0x2c, 1, 0x4f, 1, 1, RETURN_VOID]),  // findpropstrict trace; pushstring "cinit"; callpropvoid trace 1
      body(2, [...OPEN, RETURN_VOID]),
    ],
  };
}

const originalTrace = TOP_LEVEL.trace;
let player: FlashPlayer | null = null;
afterEach(() => { TOP_LEVEL.trace = originalTrace; player?.dispose(); player = null; runtime.player = null; });

describe('analyzeAs3Program', () => {
  it('runs no static initializer; the player runs it exactly once', () => {
    const traces: string[] = [];
    TOP_LEVEL.trace = (...args: unknown[]) => { traces.push(args.join(' ')); };
    const doc = parseSwfXml(GAME_XML, { fileName: 'game.swf' });
    const sources = transpileAbc({ abc: tracingDocumentClass() }).files;

    const analysis = analyzeAs3Program(sources, expectedClasses(doc));
    expect(analysis.errors).toEqual([]);
    expect(analysis.classes.map((c) => c.qualifiedName)).toEqual(['com.game.Main']);
    expect(analysis.displayClasses).toEqual(['com.game.Main']);
    expect(traces).toEqual([]);

    const assets = { get: (): LoadedAsset => ({ status: 'error' }), preview: () => undefined };
    player = new FlashPlayer({ doc, assets, program: () => linkProgram(analysis.compiled) });
    player.start();
    player.step();
    expect(traces).toEqual(['cinit']);
  });

  it('agrees with linking on hand-written code: classes, display classes, symbol classes', () => {
    const doc = parseSwfXml(GAME_XML, { fileName: 'game.swf' });
    const analysis = analyzeAs3Program(SOURCES, expectedClasses(doc));
    const linked = linkProgram(analysis.compiled);
    expect(analysis.classes).toEqual(expect.arrayContaining(linked.classes));
    expect(analysis.classes).toHaveLength(linked.classes.length);
    expect(analysis.errors).toEqual([]);
    expect(analysis.unresolved).toEqual(expectedClasses(doc).filter((n) => !linked.getDefinition(n)));
    expect(analysis.displayClasses.sort()).toEqual(['com.game.Enemy', 'com.game.Hero', 'com.game.Main']);
  });

  it('follows superclasses through imports, local classes and default exports', () => {
    const analysis = analyzeAs3Program([
      { path: 'a/Base.ts', text: 'import { Sprite } from "flash/display"; export class Base extends Sprite {}' },
      { path: 'a/Mid.ts', text: 'import { Base } from "./Base"; class Local extends Base {} export class Mid extends Local {}' },
      { path: 'a/Top.ts', text: 'import Mid2 from "./Default"; export class Top extends Mid2 {}' },
      { path: 'a/Default.ts', text: 'import { Mid } from "./Mid"; export default class Default extends Mid {}' },
      { path: 'a/Model.ts', text: 'import { EventDispatcher } from "flash/events"; export class Model extends EventDispatcher {}' },
      { path: 'a/IThing.ts', text: 'export const IThing = __interface("a.IThing");' },
      { path: 'a/helper.ts', text: 'export function helper() { return 1; }' },
    ], []);
    expect(analysis.errors).toEqual([]);
    expect(analysis.displayClasses.sort()).toEqual(['a.Base', 'a.Default', 'a.Mid', 'a.Top']);
    // an interface is an object at run time, not a class; a function named like its file is
    expect(analysis.classes.map((c) => c.qualifiedName).sort()).toEqual(['a.Base', 'a.Default', 'a.Mid', 'a.Model', 'a.Top', 'a.helper']);
  });

  it('reports what linking would: missing imports, compile errors, unresolved symbol classes', () => {
    const analysis = analyzeAs3Program([
      { path: 'a/Broken.ts', text: 'import { Nope } from "./Missing"; export class Broken extends Nope {}' },
      { path: 'a/Syntax.ts', text: 'export class Syntax { oops( }' },
    ], ['a.Broken', 'a.Gone', 'flash.display.MovieClip']);
    expect(analysis.errors.map((e) => e.path).sort()).toEqual(['a/Broken.ts', 'a/Syntax.ts']);
    expect(analysis.errors.find((e) => e.path === 'a/Broken.ts')!.message).toMatch(/Cannot resolve import "\.\/Missing"/);
    expect(analysis.unresolved).toEqual(['a.Gone']);
    expect(analysis.displayClasses).toEqual([]);
  });
});
