// A CI-sized AS3 movie, hand-assembled, so the AVM2 path (SWF reader → ABC
// reader → lift → link → FlashPlayer) is tested without the game corpus.
//
// It is the program a compiler emits for:
//
//   package fixture {
//     import flash.display.*; import flash.events.*;
//     public class Ball extends Sprite {           // SymbolClass-linked to sprite 1
//       public function Ball() { trace("ball"); }
//     }
//     public class Main extends MovieClip {        // the document class
//       public var frames:int;
//       public function Main() { trace("main"); addEventListener("enterFrame", onFrame); }
//       public function onFrame(e:*):void { frames++; trace("frame"); }
//     }
//   }
//
// with frame 1 placing sprite 1 (a Ball) at depth 1. The committed bytes are
// `as3Fixture.swf`; `avm2Fixture.test.ts` checks they are what this file writes
// (`UPDATE_FIXTURES=1 npx vitest run avm2Fixture` rewrites them).
import type { AbcFile } from '../../../../../transcom/decompiler/swf/abc';
import { attr, body, fn, method, OPEN, RETURN_VOID, slot } from '../../../../../transcom/transpiler/avm2/testAbc';
import { writeAbc } from '@/testing/abcWriter';
import { tag, writeSwf } from '@/testing/swfWriter';

// multiname indices the code below uses
const MN = { Main: 1, Ball: 2, MovieClip: 3, Sprite: 4, DisplayObjectContainer: 5, InteractiveObject: 6, DisplayObject: 7, EventDispatcher: 8, Object: 9, trace: 10, addEventListener: 11, onFrame: 12, frames: 13 } as const;
// string indices
const STR = { main: 14, ball: 15, frame: 16, enterFrame: 17 } as const;

const qname = (ns: string, name: string) => ({ kind: 'QName', name, ns, nsKind: 'package' });
const getlex = (mn: number) => [0x60, mn];
const traceString = (s: number) => [0x5d, MN.trace, 0x2c, s, 0x4f, MN.trace, 1]; // findpropstrict trace; pushstring; callpropvoid trace 1
const SUPER = [0xd0, 0x49, 0x00]; // getlocal0; constructsuper 0

// The scope chain a class body closes over: Object … its base class, as `newclass` wants it.
const SPRITE_CHAIN = [MN.Object, MN.EventDispatcher, MN.DisplayObject, MN.InteractiveObject, MN.DisplayObjectContainer];
const defineClass = (chain: number[], base: number, classIndex: number, name: number) => [
  0x65, 0x00, // getscopeobject 0 (the script's global, where initproperty defines it)
  ...chain.flatMap((mn) => [...getlex(mn), 0x30]),
  ...getlex(base), 0x58, classIndex, // newclass
  ...chain.map(() => 0x1d), // popscope each
  0x68, name, // initproperty
];

/** Method body with the scope depths a compiler gives a class member nested `depth` deep. */
const member = (index: number, code: number[], depth: number) => ({ ...body(index, code), initScopeDepth: depth, maxScopeDepth: depth + 1 });

export function as3FixtureAbc(): AbcFile {
  return {
    version: '46.16', ints: [0], uints: [0], doubles: [NaN],
    strings: ['', 'fixture', 'Main', 'Ball', 'flash.display', 'MovieClip', 'Sprite', 'DisplayObjectContainer', 'InteractiveObject',
      'DisplayObject', 'flash.events', 'EventDispatcher', 'Object', 'trace', 'main', 'ball', 'frame', 'enterFrame', 'addEventListener',
      'onFrame', 'frames', 'int', 'void'],
    namespaces: [{ kind: '?', name: '' }, { kind: 'package', name: 'fixture' }, { kind: 'package', name: 'flash.display' },
      { kind: 'package', name: 'flash.events' }, { kind: 'package', name: '' }],
    nsSets: [[]],
    multinames: [
      { kind: '?', name: '' },
      qname('fixture', 'Main'), qname('fixture', 'Ball'),
      qname('flash.display', 'MovieClip'), qname('flash.display', 'Sprite'), qname('flash.display', 'DisplayObjectContainer'),
      qname('flash.display', 'InteractiveObject'), qname('flash.display', 'DisplayObject'), qname('flash.events', 'EventDispatcher'),
      qname('', 'Object'), qname('', 'trace'), qname('', 'addEventListener'), qname('', 'onFrame'), qname('', 'frames'),
      qname('', 'int'), qname('', 'void'),
    ],
    methods: [
      method(), // 0 Ball()
      method(), // 1 Ball$cinit
      method(), // 2 Main()
      { ...method(['']), returnType: 'void' }, // 3 Main.onFrame(e:*):void
      method(), // 4 Main$cinit
      method(), // 5 script init
    ],
    metadata: [],
    classes: [
      {
        instance: { name: 'fixture.Ball', superName: 'flash.display.Sprite', interfaces: [], iinit: 0, sealed: true, isFinal: false, isInterface: false, traits: [] },
        cinit: 1, traits: [],
      },
      {
        instance: {
          name: 'fixture.Main', superName: 'flash.display.MovieClip', interfaces: [], iinit: 2, sealed: true, isFinal: false, isInterface: false,
          traits: [{ ...slot('frames', 'int'), slotId: 1 }, fn('onFrame', 3)],
        },
        cinit: 4, traits: [],
      },
    ],
    scripts: [{
      init: 5,
      traits: [
        { name: 'fixture.Ball', kind: 'class', attr, slotId: 1, classIndex: 0, metadata: [] },
        { name: 'fixture.Main', kind: 'class', attr, slotId: 2, classIndex: 1, metadata: [] },
      ],
    }],
    bodies: [
      member(0, [...OPEN, ...SUPER, ...traceString(STR.ball), RETURN_VOID], 7),
      member(1, [...OPEN, RETURN_VOID], 6),
      member(2, [
        ...OPEN, ...SUPER, ...traceString(STR.main),
        0xd0, 0x2c, STR.enterFrame, 0xd0, 0x66, MN.onFrame, // this; "enterFrame"; this.onFrame
        0x4f, MN.addEventListener, 2, // callpropvoid addEventListener 2
        RETURN_VOID,
      ], 8),
      member(3, [
        ...OPEN,
        0xd0, 0xd0, 0x66, MN.frames, 0xc0, 0x61, MN.frames, // this.frames = this.frames + 1 (increment_i)
        ...traceString(STR.frame),
        RETURN_VOID,
      ], 8),
      member(4, [...OPEN, RETURN_VOID], 7),
      {
        ...body(5, [
          ...OPEN,
          ...defineClass(SPRITE_CHAIN, MN.Sprite, 0, MN.Ball),
          ...defineClass([...SPRITE_CHAIN, MN.Sprite], MN.MovieClip, 1, MN.Main),
          RETURN_VOID,
        ]),
        maxStack: 2, maxScopeDepth: 8,
      },
    ],
  };
}

export const AS3_FIXTURE = {
  documentClass: 'fixture.Main',
  linked: [1, 'fixture.Ball'] as const,
  background: 0x336699,
};

export function as3FixtureSwf(): Uint8Array {
  return writeSwf({
    version: 10, width: 320, height: 240, frameRate: 24,
    tags: [
      tag.fileAttributes({ as3: true }),
      tag.backgroundColor(AS3_FIXTURE.background),
      tag.defineSprite(1, [tag.showFrame(), tag.end()]),
      tag.doAbc('fixture', writeAbc(as3FixtureAbc())),
      tag.symbolClass([[0, AS3_FIXTURE.documentClass], [...AS3_FIXTURE.linked]]),
      tag.placeObject2(1, 1),
      tag.showFrame(),
      tag.end(),
    ],
  });
}
