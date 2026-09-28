// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { hydrateActionScriptSources, ingestFiles } from '../../lib/assets';
import { analyzeCode } from '../../lib/codeInspector';
import { demoFiles } from '../../lib/demo';
import { parseSwfXml } from '../../lib/parser';
import { emptyProject } from '../../lib/project';
import type { AssetBundle, SwfDocument } from '../../types';
import { CodeInspector } from '../CodeInspector';
import { CodeInspectorView } from '../CodeInspectorView';
import { ErrorBoundary } from '../ErrorBoundary';
import { CodePanel, isBytecodeAttr } from '../inspector/CodePanel';

beforeAll(() => {
  // jsdom's Blob has no text(); the app relies on it for .as files.
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
});
afterEach(cleanup);

async function loadDemo(scriptOverride?: string): Promise<{ bundle: AssetBundle; doc: SwfDocument }> {
  let files = demoFiles();
  if (scriptOverride != null) {
    files = files.map((f) => (f.name === 'DoAction.as'
      ? Object.defineProperty(new File([scriptOverride], f.name), 'webkitRelativePath', { value: f.webkitRelativePath })
      : f));
  }
  const bundle = ingestFiles(files);
  const doc = parseSwfXml(await bundle.xmlFile!.text(), { fileName: bundle.xmlFile!.name });
  await hydrateActionScriptSources(doc, bundle);
  return { bundle, doc };
}

/** Buttons whose text matches (accessible-name queries are slow in jsdom). */
const buttons = (re: RegExp) => [...document.querySelectorAll('button')].filter((b) => re.test(b.textContent ?? ''));
const api = () => ({ project: emptyProject('demo') }) as never;

describe('CodeInspectorView (Code workspace)', () => {
  it('indexes the demo script once and navigates to callers with real lines', async () => {
    const { bundle, doc } = await loadDemo();
    render(<CodeInspectorView doc={doc} assets={bundle} project={emptyProject('demo')} />);
    fireEvent.click(await screen.findByText('symbols'));
    await waitFor(() => expect(buttons(/^ƒbounce\d+ refs$/)).toHaveLength(1)); // CI-15: not duplicated
    fireEvent.click(buttons(/^ƒbounce\d+ refs$/)[0]);
    expect(await screen.findByText('Called by (1)')).toBeTruthy();
    expect(buttons(/^startBounceL23 → bounce$/)).toHaveLength(1); // CI-09: usage line, not definition line
  });

  it('does not crash on a symbol named toString (CI-05)', async () => {
    const { bundle, doc } = await loadDemo();
    doc.timelines.get('root')!.frames[0].events.push({
      kind: 'action', tagType: 'DoActionTag', detail: 'function toString() {\n  return "hero";\n}\nfunction a() { toString(); }',
    } as never);
    render(<CodeInspectorView doc={doc} assets={bundle} project={emptyProject('demo')} />);
    fireEvent.click(await screen.findByText('symbols'));
    await waitFor(() => expect(buttons(/^ƒtoString1 refs$/)).toHaveLength(1));
    // Root frame 1 must keep its own code once external scripts have loaded
    // (it used to be replaced by sprite 10's frame_13 script).
    await new Promise((r) => setTimeout(r, 100));
    expect(buttons(/^ƒtoString1 refs$/)).toHaveLength(1);
    expect(buttons(/^ƒbounce\d+ refs$/)).toHaveLength(1);
  });
});

describe('CodePanel (Inspector › Code)', () => {
  it('never shows stale source when a new folder has a script at the same path (CI-12)', async () => {
    const a = await loadDemo('var marker = "OLD_PROJECT";');
    const b = await loadDemo('var marker = "NEW_PROJECT";');
    const { rerender, container } = render(<CodePanel doc={a.doc} timeline={a.doc.timelines.get('sprite:10')!} selectedId={null} api={api()} assets={a.bundle} />);
    fireEvent.click(screen.getByText('ActionScript'));
    await waitFor(() => expect(container.textContent).toContain('OLD_PROJECT'));
    rerender(<CodePanel doc={b.doc} timeline={b.doc.timelines.get('sprite:10')!} selectedId={null} api={api()} assets={b.bundle} />);
    expect(container.textContent).not.toContain('OLD_PROJECT');
    await waitFor(() => expect(container.textContent).toContain('NEW_PROJECT'));
  });

  it('reports unreadable scripts instead of loading forever (CI-12)', async () => {
    const a = await loadDemo();
    a.bundle.files.find((f) => f.ext === 'as')!.file = { text: () => Promise.reject(new Error('permission denied')) } as never;
    const { container } = render(<CodePanel doc={a.doc} timeline={a.doc.timelines.get('sprite:10')!} selectedId={null} api={api()} assets={a.bundle} />);
    fireEvent.click(screen.getByText('ActionScript'));
    await waitFor(() => expect(container.textContent).toContain('Could not read ActionScript source'));
    expect(container.textContent).toContain('permission denied');
  });

  it('reference chips select the asset by id (CI-17)', async () => {
    const a = await loadDemo();
    const onSelectAsset = vi.fn();
    render(<CodePanel doc={a.doc} timeline={a.doc.timelines.get('sprite:10')!} selectedId={null} api={api()} assets={a.bundle} onSelectAsset={onSelectAsset} />);
    fireEvent.click(buttons(/^Methods/)[0]);
    await waitFor(() => expect(buttons(/spawnStar/).length).toBeGreaterThan(0));
    fireEvent.click(buttons(/spawnStar/)[0]);
    fireEvent.click(buttons(/^shape_3$/)[0]);
    expect(onSelectAsset).toHaveBeenCalledWith(3, 'shape_3');
  });

  it('keeps raw bytecode attributes out of the analyzer (§6)', () => {
    expect(isBytecodeAttr('actionBytes', 'anything')).toBe(true);
    expect(isBytecodeAttr('actions', '96 00 07 00 73 74 6f 70')).toBe(true);
    expect(isBytecodeAttr('actions', 'gotoAndPlay(2);')).toBe(false);
  });
});

describe('CodeInspector (panel)', () => {
  it('distinguishes sources that share a label (CI-16)', () => {
    const analysis = analyzeCode([{ label: 'Frame 1 · DoAction', source: 'var first = 1;' }, { label: 'Frame 1 · DoAction', source: 'var second = 2;' }], []);
    const { container } = render(<CodeInspector analysis={analysis} />);
    fireEvent.click(buttons(/^Source/)[0]);
    const rows = buttons(/Frame 1 · DoAction/);
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[1]);
    expect(container.querySelector('pre')!.textContent).toContain('second');
  });

  it('clears the selected source when the source list changes, keeps it on re-analysis (§6)', () => {
    const a = analyzeCode([{ label: 'A', source: 'var a = 1;' }, { label: 'B', source: 'var b = 2;' }], []);
    const { container, rerender } = render(<CodeInspector analysis={a} />);
    fireEvent.click(buttons(/^Source/)[0]);
    fireEvent.click(buttons(/^B/)[0]);
    expect(container.querySelector('pre')!.textContent).toContain('var b');
    // Same list re-analysed (e.g. a script finished loading): selection kept.
    rerender(<CodeInspector analysis={analyzeCode([{ label: 'A', source: 'var a = 1;' }, { label: 'B', source: 'var b = 3;' }], [])} />);
    expect(container.querySelector('pre')!.textContent).toContain('var b = 3');
    // Different timeline: selection cleared rather than showing "index 1" of the new list.
    rerender(<CodeInspector analysis={analyzeCode([{ label: 'X', source: 'var x = 1;' }, { label: 'Y', source: 'var y = 1;' }], [])} />);
    expect(container.querySelector('pre')).toBeNull();
  });

  it('shows every usage line of a relationship (§6)', () => {
    const analysis = analyzeCode([{ label: 'src', source: 'function f() {\n  hero.play();\n  hero.stop();\n}' }], [{ name: 'hero', assetId: 1 }]);
    render(<CodeInspector analysis={analysis} />);
    fireEvent.click(buttons(/^Code ↔ Assets/)[0]);
    expect(screen.getByText(/identifier · src L2, 3/)).toBeTruthy();
  });
});

describe('ErrorBoundary (§7)', () => {
  const Boom = ({ fail }: { fail: boolean }) => {
    if (fail) throw new Error('kaboom');
    return <span>healthy</span>;
  };

  it('contains a render error and recovers when its reset keys change', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <div><span>sibling</span><ErrorBoundary label="Code Inspector" resetKeys={['doc-1']}><Boom fail /></ErrorBoundary></div>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Code Inspector failed to render');
    expect(screen.getByText('kaboom')).toBeTruthy();
    expect(screen.getByText('sibling')).toBeTruthy(); // rest of the app survives
    rerender(<div><span>sibling</span><ErrorBoundary label="Code Inspector" resetKeys={['doc-2']}><Boom fail={false} /></ErrorBoundary></div>);
    expect(screen.getByText('healthy')).toBeTruthy();
    spy.mockRestore();
  });

  it('"Try again" re-renders the children', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    const Flaky = () => { if (fail) throw new Error('once'); return <span>recovered</span>; };
    render(<ErrorBoundary label="Panel"><Flaky /></ErrorBoundary>);
    fail = false;
    fireEvent.click(screen.getByText('Try again'));
    expect(screen.getByText('recovered')).toBeTruthy();
    spy.mockRestore();
  });
});
