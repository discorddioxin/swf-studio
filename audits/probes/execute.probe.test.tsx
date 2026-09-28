// @vitest-environment jsdom
// ---------------------------------------------------------------------------
// Execute-tab audit probes (see audits/EXECUTE_AUDIT.md).
//
// Each probe asserts the CURRENT (broken) behaviour, so this file passes on
// the audited code and documents the evidence. When the engine is fixed, the
// probes will fail one by one, which is the signal to turn them into real
// regression tests with the expectations inverted.
//
//   npx vitest run --config audits/probes/vitest.config.ts
// ---------------------------------------------------------------------------
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExecuteTab } from '../../src/components/ExecuteTab';
import { fixtureFiles } from '../../src/components/__tests__/fixtures/jpexsDump';
import { decompileActionScriptBytecode } from '../../src/engine/decompiler';
import { SwfRuntime } from '../../src/engine/runtime';
import { AssetCache, hydrateActionScriptSources, ingestFiles } from '../../src/lib/assets';
import { parseSwfXml } from '../../src/lib/parser';
import { flatten } from '../../src/lib/render';
import type { SwfDocument } from '../../src/types';

// ---------------------------------------------------------------- harness --
const drawCalls: string[] = [];
beforeAll(() => {
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(this); });
    };
  }
  // jsdom has no canvas: record every 2D-context call instead.
  const ctx = new Proxy({}, {
    get: (_t, prop) => (prop === 'canvas' ? { width: 800, height: 520 } : (...args: unknown[]) => { drawCalls.push(String(prop)); void args; return { addColorStop() {} }; }),
    set: () => true,
  });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as never;
  URL.createObjectURL = () => 'blob:probe';
  URL.revokeObjectURL = () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); drawCalls.length = 0; });

async function loadFixture() {
  const bundle = ingestFiles(fixtureFiles());
  const doc = parseSwfXml(await bundle.xmlFile!.text(), { fileName: bundle.xmlFile!.name });
  await hydrateActionScriptSources(doc, bundle);
  return { bundle, doc, cache: new AssetCache(bundle, () => {}) };
}
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const playButton = () => [...document.querySelectorAll('button')].find((b) => /Play|Pause/.test(b.textContent ?? ''))!;
const header = () => document.body.textContent!.match(/frame (\d+)\/(\d+)/)!;

function parse(xml: string): SwfDocument {
  return parseSwfXml(`<?xml version="1.0"?><swf type="SWF" version="8" frameRate="12" frameCount="1">
    <displayRect type="RECT" Xmax="8000" Xmin="0" Ymax="6000" Ymin="0"/><tags>${xml}<item type="EndTag"/></tags></swf>`, { fileName: 'probe.xml' });
}
const actionEvents = (doc: SwfDocument) => [...doc.timelines.values()].flatMap((t) => t.frames.flatMap((f) => f.events.filter((e) => e.kind === 'action')));

// ------------------------------------------------------------------ probes --
describe('EX-A · Execute tab UI (real component, fixture dump)', () => {
  it('EX-01: nothing is ever drawn — SwfRuntime.render() is never called', async () => {
    const renderSpy = vi.spyOn(SwfRuntime.prototype, 'render');
    const tickSpy = vi.spyOn(SwfRuntime.prototype, 'tick');
    const { doc, cache } = await loadFixture();
    render(<ExecuteTab doc={doc} cache={cache} />);
    fireEvent.click(playButton()); fireEvent.click(playButton()); // see EX-04
    await wait(400);
    expect(tickSpy.mock.calls.length).toBeGreaterThan(5); // the clock IS running…
    expect(renderSpy).not.toHaveBeenCalled();             // …but nothing renders it
    expect(drawCalls.filter((c) => /draw|fill|stroke/.test(c))).toEqual([]);
  });

  it('EX-02: no frame script is executed — the console stays empty while frames with stop()/actions pass', async () => {
    const { doc, cache } = await loadFixture();
    render(<ExecuteTab doc={doc} cache={cache} />);
    fireEvent.click(playButton()); fireEvent.click(playButton());
    await wait(1200); // 24 fps → ~28 frames, passing root frame 25's DoAction
    expect(document.body.textContent).toContain('No runtime events yet.');
  });

  it('EX-03: the frame counter never moves while playing (it only updates on runtime events)', async () => {
    const { doc, cache } = await loadFixture();
    render(<ExecuteTab doc={doc} cache={cache} />);
    fireEvent.click(playButton()); fireEvent.click(playButton());
    await wait(500);
    expect(header()[1]).toBe('1');
  });

  it('EX-04: the first click on ▶ Play pauses (runtime starts "playing", UI starts "paused")', async () => {
    const { doc, cache } = await loadFixture();
    render(<ExecuteTab doc={doc} cache={cache} />);
    expect(playButton().textContent).toContain('Play');
    fireEvent.click(playButton());
    expect(playButton().textContent).toContain('Play'); // still "Play": the click paused the clock
  });

  it('EX-05: Step does nothing (pause() then tick() — and tick() returns early when paused)', () => {
    const rt = new SwfRuntime({ frameRate: 24, totalFrames: 48, render: () => {} });
    rt.step(); rt.step(); rt.step();
    expect(rt.frame).toBe(0);
  });

  it('EX-06: Reset leaves runtime "playing" but the UI "paused" (next Play click pauses again)', () => {
    const rt = new SwfRuntime({ frameRate: 24, totalFrames: 48, render: () => {} });
    rt.pause(); rt.reset();
    expect(rt.playing).toBe(true);
  });

  it('EX-07: resizing recreates the runtime (effect depends on `size`), discarding game state', () => {
    const src = readFileSync('src/components/ExecuteTab.tsx', 'utf8');
    expect(src).toMatch(/\}, \[doc, cache, size\]\);/);
  });

  it('EX-08: no keyboard or mouse input reaches the runtime', () => {
    const src = readFileSync('src/components/ExecuteTab.tsx', 'utf8');
    expect(src).not.toMatch(/keydown|keyup|onMouse|onPointer|mousedown|pointerdown/);
  });
});

describe('EX-B · Runtime and scope', () => {
  const rt = () => new SwfRuntime({ frameRate: 24, totalFrames: 48, render: () => {} });

  it('EX-09: there is no transpiler/interpreter — nothing in src evaluates ActionScript', () => {
    const files = ['src/engine/runtime.ts', 'src/engine/scope.ts', 'src/components/ExecuteTab.tsx', 'src/lib/render.ts'];
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/new Function|eval\(|\bwith\s*\(/);
  });

  it('EX-10: timeline control calls only log — gotoAndStop/gotoAndPlay/nextFrame never move the playhead', () => {
    const r = rt();
    (r.scope.gotoAndStop as (f: number) => void)(10);
    (r.scope.nextFrame as () => void)();
    expect(r.frame).toBe(0);
  });

  it('EX-11: _root, _parent and _global resolve to the number 0 (any "_" name ≤ 7 chars)', () => {
    const s = rt().scope as unknown as Record<string, unknown>;
    expect(s._root).toBe(0);
    expect(s._parent).toBe(0);
    expect(s._global).toBe(0);
    expect(() => (s._root as { gotoAndStop: () => void }).gotoAndStop()).toThrow(TypeError);
  });

  it('EX-12: variables cannot be stored — set() is a no-op and reads return a proxy stringifying to "[path]"', () => {
    const s = rt().scope as unknown as Record<string, unknown>;
    s.score = 5;
    expect(typeof s.score).toBe('object');
    expect(`${s.score as string}`).toBe('[_global.score]');
    expect((s.score as number) + 1).toBe('[_global.score]1');
  });

  it('EX-13: any API not hard-coded throws "not a function" (Key.isDown, Math is fine, setInterval, new Sound…)', () => {
    const s = rt().scope as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>;
    expect(() => s.Key.isDown(37)).toThrow(TypeError);
    expect(() => (s.setInterval as unknown as () => void)()).toThrow(TypeError);
  });

  it('EX-14: hitTest always returns false; _x/_y are always 0; _currentframe is not even a number', () => {
    const s = rt().scope as unknown as Record<string, unknown>;
    expect((s.hitTest as (t: string) => boolean)('enemy')).toBe(false);
    expect(s._x).toBe(0);
    expect(s._y).toBe(0);
    expect(typeof s._currentframe).toBe('object'); // a proxy: `_currentframe == 1` is never true
  });
});

describe('EX-C · Parser inputs a player needs but never gets', () => {
  it('EX-15: button handlers (DefineButton2 BUTTONCONDACTION, i.e. on(release)) are dropped', () => {
    const doc = parse(`
      <item type="DefineShapeTag" shapeId="1"><shapeBounds type="RECT" Xmax="400" Xmin="0" Ymax="400" Ymin="0"/></item>
      <item type="DefineButton2Tag" buttonId="2">
        <characters><item type="BUTTONRECORD" buttonStateUp="true" buttonStateHitTest="true" characterId="1" placeDepth="1"/></characters>
        <actions><item type="BUTTONCONDACTION" condOverDownToOverUp="true" actionBytes="0700"/></actions>
      </item>
      <item type="PlaceObject2Tag" depth="1" characterId="2" placeFlagHasCharacter="true"/>
      <item type="ShowFrameTag"/>`);
    expect(doc.timelines.get('button:2')).toBeTruthy();
    expect(actionEvents(doc)).toEqual([]);
  });

  it('EX-16: clip handlers (PlaceObject2 clipActions, i.e. onClipEvent(enterFrame)) are dropped', () => {
    const doc = parse(`
      <item type="DefineShapeTag" shapeId="1"><shapeBounds type="RECT" Xmax="400" Xmin="0" Ymax="400" Ymin="0"/></item>
      <item type="PlaceObject2Tag" depth="1" characterId="1" placeFlagHasCharacter="true" placeFlagHasClipActions="true">
        <clipActions type="CLIPACTIONS"><clipActionRecords><item type="CLIPACTIONRECORD" actionBytes="0600"><eventFlags type="CLIPEVENTFLAGS" clipEventEnterFrame="true"/></item></clipActionRecords></clipActions>
      </item>
      <item type="ShowFrameTag"/>`);
    expect(actionEvents(doc)).toEqual([]);
    expect(doc.root.frames[0].events.map((e) => e.kind)).toEqual(['define', 'place']);
  });

  it('EX-17: AS3 (DoABC) is classified as an ordinary frame action — no AVM2 path exists', () => {
    const doc = parse(`<item type="DoABC2Tag" name="frame1" flags="1" actionBytes="10002e00"/><item type="ShowFrameTag"/>`);
    expect(actionEvents(doc).map((e) => e.tagType)).toEqual(['DoABC2Tag']);
  });

  it('EX-18: inline bytecode fallback — branches become comments, GotoFrame is off-by-one "gotoAndPlay", constants are lost', () => {
    // gotoAndStop(5): GotoFrame 4 (0-based) + Stop
    const goto = parse(`<item type="DoActionTag" actionBytes="81020004000700"/><item type="ShowFrameTag"/>`);
    expect(actionEvents(goto)[0].detail).toContain('gotoAndPlay(4);');
    // if (a) { play(); }: Push "a", GetVariable, Not, If +1, Play
    const branch = parse(`<item type="DoActionTag" actionBytes="9603000061001c129d020001000600"/><item type="ShowFrameTag"/>`);
    expect(actionEvents(branch)[0].detail).toContain('// gotoFrame2();');
    // ConstantPool ["score"], Push constant8(0), Push 1, SetVariable
    const pool = parse(`<item type="DoActionTag" actionBytes="880800010073636f726500960200080096050007010000001d00"/><item type="ShowFrameTag"/>`);
    expect(actionEvents(pool)[0].detail).toContain('constant8(0) = 1;');
  });

  it('EX-19: SWF doubles (mixed-endian) are decoded as plain little-endian', () => {
    // Push double 1.5 → SWF stores high word first: 00 00 f8 3f 00 00 00 00
    const doc = parse(`<item type="DoActionTag" actionBytes="960900060000f83f000000002600"/><item type="ShowFrameTag"/>`);
    expect(actionEvents(doc)[0].detail).not.toContain('trace(1.5)');
  });

  it('EX-20: engine/decompiler.ts opcode table is wrong (0x07 Stop → "Greater", 0x06 Play → "Less")', () => {
    expect(decompileActionScriptBytecode('0700')).toMatch(/^Greater/);
    expect(decompileActionScriptBytecode('0600')).toMatch(/^Less/);
  });
});

describe('EX-D · Renderer model', () => {
  it('EX-21: nested clips cannot play on their own — their frame is derived from the parent playhead', async () => {
    const { doc } = await loadFixture();
    // Root stopped on frame 1 (the usual game setup): the hero sprite's frame
    // is the same no matter how much time passes.
    const heroFrameAt = () => flatten(doc, doc.root, 0).find((f) => f.timelineId === 'sprite:10')!.localFrame;
    expect(new Set([heroFrameAt(), heroFrameAt(), heroFrameAt()]).size).toBe(1);
    // …and a sprite with stop() on its frame 13 still "plays" through it as the root advances.
    const at = (rootFrame: number) => flatten(doc, doc.root, rootFrame).find((f) => f.timelineId === 'sprite:10')!.localFrame;
    expect([at(12), at(13), at(14)]).toEqual([12, 13, 14]);
  });

  it('EX-22: buttons are always drawn in their Up state (frame 0)', () => {
    const src = readFileSync('src/lib/render.ts', 'utf8');
    expect(src).toMatch(/child\.kind === 'button' \? 0/);
  });
});

describe('EX-E · Export TS', () => {
  it('EX-23: exported "runtime" references undeclared FrameClock/createFlashScope and a non-existent clock.bridge, and ships AS as comments', async () => {
    const { doc, cache } = await loadFixture();
    let exported = '';
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { void (b as Blob).text().then((t) => { exported = t; }); return 'blob:x'; });
    HTMLAnchorElement.prototype.click = () => {};
    render(<ExecuteTab doc={doc} cache={cache} />);
    fireEvent.click(screen.getByText('Export TS'));
    await wait(50);
    expect(exported).toContain('new FrameClock(');
    expect(exported).not.toMatch(/import .*FrameClock/);
    expect(exported).toContain('createFlashScope(clock.bridge)');
    expect(exported).toMatch(/\/\/ ActionScript:/);
  });
});
