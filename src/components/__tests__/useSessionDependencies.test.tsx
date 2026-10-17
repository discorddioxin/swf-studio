// @vitest-environment jsdom
// The session's added dependencies: a new session starts with none, and an add
// that finishes after the session changed (New folder, another load) is dropped.
import { act, renderHook } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';
import { DependencyFiles } from '../../engine/flash/dependencies';
import type { SwfPackage } from '../../lib/assets';
import { ffdecSampleSwf } from '@/testing/movies';
import { useSessionDependencies } from '../useSessionDependencies';

// jsdom's Blob has no text()/arrayBuffer(); browsers do.
beforeAll(() => {
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(this); });
    };
  }
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.readAsArrayBuffer(this); });
    };
  }
});

function session() {
  const state = { generation: 0, packages: [] as SwfPackage[] };
  const hook = renderHook(() => useSessionDependencies({
    generation: () => state.generation,
    onPackages: (added) => state.packages.push(...added),
  }));
  return { state, hook };
}

it('adds to the session; a new session starts from its own files with nothing added', async () => {
  const { state, hook } = session();
  const upload = new DependencyFiles([{ path: 'game/config.xml', file: new File(['<c/>'], 'config.xml') }]);
  act(() => hook.result.current.reset(upload));
  await act(() => hook.result.current.adder.add([
    { file: new File(['<s/>'], 'scores.xml'), path: 'xml/scores.xml' },
    { file: new File([ffdecSampleSwf().slice().buffer as ArrayBuffer], 'scene.swf'), path: 'scene.swf' },
  ]));
  expect(hook.result.current.files?.find('xml/scores.xml')).toBeTruthy();
  expect(hook.result.current.files?.find('game/config.xml')).toBeTruthy();
  expect(hook.result.current.adder.added).toEqual(['xml/scores.xml', 'scene.swf']);
  expect(state.packages.map((p) => p.doc.header.fileName)).toEqual(['scene.swf']);

  act(() => hook.result.current.reset(null));
  expect(hook.result.current.files).toBeNull();
  expect(hook.result.current.adder.added).toEqual([]);
});

it('an add that finishes after the session changed is dropped', async () => {
  const { state, hook } = session();
  const pending = hook.result.current.adder.add([
    { file: new File([ffdecSampleSwf().slice().buffer as ArrayBuffer], 'scene.swf'), path: 'scene.swf' },
    { file: new File(['<s/>'], 'scores.xml'), path: 'xml/scores.xml' },
  ]);
  state.generation++; // another session started while the SWF was parsing
  await act(() => pending);
  expect(state.packages).toEqual([]);
  expect(hook.result.current.files).toBeNull();
  expect(hook.result.current.adder.added).toEqual([]);
});
