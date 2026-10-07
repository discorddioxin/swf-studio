// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ingestFiles } from '../../lib/assets';
import { generateAS2Project } from '../../engine/as2/program';
import { readAS2Sources } from '../../engine/as2/useAS2Build';
import { buildWorkbenchTimelineMetadata } from '../../engine/as2/workbenchMetadata';
import { parseSwfXml } from '../../lib/parser';
import { emptyProject } from '../../lib/project';
import { fixtureFiles } from './fixtures/jpexsDump';
import { CodeWorkspace } from '../CodeWorkspace';
import { CodePanel } from '../inspector/CodePanel';

beforeAll(() => {
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

function fixtureBundle() {
  return ingestFiles(fixtureFiles());
}

async function fixtureWorkbench(assets = fixtureBundle()) {
  const doc = parseSwfXml(await assets.xmlFile!.text(), { fileName: 'fixture.xml' });
  const project = emptyProject('fixture.xml');
  project.characters['10'] = { name: 'Hero Ball', tags: [] };
  return { assets, doc, project };
}

describe('CodeWorkspace', () => {
  it('shows the same generated application modules that Execute builds, using Workbench sprite names and frame labels', async () => {
    const { assets, doc, project } = await fixtureWorkbench();
    const { container } = render(<CodeWorkspace assets={assets} doc={doc} project={project} projectName="fixture.xml" />);
    const sources = await readAS2Sources(assets);
    const timelineMetadata = buildWorkbenchTimelineMetadata(doc, project);
    const expected = generateAS2Project(sources, timelineMetadata).files.get('index.ts');

    expect(screen.getByRole('button', { name: 'Show TypeScript Project' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Show Application' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(container.textContent).toContain('generated files'));
    expect(container.textContent).toContain('index.ts');
    expect(expected).toBeTruthy();
    const editor = container.querySelector('[aria-label="index.ts source"]')!;
    expect(editor.textContent).toContain(expected!.split('\n')[0]);
    expect(expected).toContain("import * as timeline_hero_ball from './timelines/hero_ball';");
    expect(expected).toContain('10: timeline_hero_ball, // "Hero Ball"');
    expect(container.textContent).toContain('hero_ball.ts');
    const namedSprite = generateAS2Project(sources, timelineMetadata).files.get('timelines/hero_ball.ts')!;
    expect(namedSprite).toContain('Workbench timeline name: "Hero Ball" (sprite 10)');
    expect(namedSprite).toContain('frameLabels');
    expect(editor.textContent).toContain('export const program');
  });

  it('switches between generated TypeScript, engine sources, and original ActionScript files', async () => {
    const { assets, doc, project } = await fixtureWorkbench();
    const { container } = render(<CodeWorkspace assets={assets} doc={doc} project={project} projectName="fixture.xml" />);
    await waitFor(() => expect(container.textContent).toContain('generated files'));

    fireEvent.click(screen.getByRole('button', { name: 'Show Engine' }));
    expect(screen.getByRole('button', { name: 'Show Engine' }).getAttribute('aria-pressed')).toBe('true');
    const engineFile = await screen.findByTitle('src/engine/as2/player.ts');
    fireEvent.click(engineFile);
    expect(container.textContent).toContain('class AS2Player');

    fireEvent.click(screen.getByRole('button', { name: 'Show ActionScript Project' }));
    expect(screen.getByRole('button', { name: 'Show ActionScript Project' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search project files and source' }), { target: { value: 'this.startBounce();' } });
    const sourceFile = await screen.findByTitle('scripts/DefineSprite_10/frame_13/DoAction.as');
    fireEvent.click(sourceFile);
    expect(container.textContent).toContain('this.startBounce();');
    expect(screen.queryByRole('group', { name: 'TypeScript project view' })).toBeNull();
  });

  it('shows AVM1 bytecode as a readable disassembly and keeps the raw wrapper available', async () => {
    const assets = fixtureBundle();
    const actionBytes = new Uint8Array([
      0x96, 0x07, 0x00, 0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00,
      0x26, 0x00,
    ]);
    const payload = btoa(String.fromCharCode(...actionBytes));
    const rawText = `avm1Actions("${payload}");`;
    assets.files.push({
      path: 'scripts/frame_1/DoAction.as', name: 'DoAction', ext: 'as', category: 'texts',
      file: new File([rawText], 'DoAction.as', { type: 'text/plain' }),
    });
    const { doc, project } = await fixtureWorkbench(assets);
    const { container } = render(<CodeWorkspace assets={assets} doc={doc} project={project} projectName="fixture.xml" />);
    await waitFor(() => expect(container.textContent).toContain('generated files'));
    fireEvent.click(screen.getByRole('button', { name: 'Show ActionScript Project' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search project files and source' }), { target: { value: 'trace("hello")' } });
    fireEvent.click(await screen.findByTitle('scripts/frame_1/DoAction.as'));

    const editor = screen.getByLabelText('scripts/frame_1/DoAction.as source');
    expect(editor.textContent).toContain('trace("hello");');
    expect(editor.textContent).not.toContain(payload);
    expect(screen.getByRole('note').textContent).toContain('best-effort disassembly');

    fireEvent.click(screen.getByRole('button', { name: 'Show raw bytecode' }));
    expect(editor.textContent).toContain(rawText);
    fireEvent.click(screen.getByRole('button', { name: 'Show disassembly' }));
    expect(editor.textContent).toContain('trace("hello");');

    const generated = generateAS2Project(await readAS2Sources(assets), buildWorkbenchTimelineMetadata(doc, project)).files;
    const bytecodeModule = [...generated.entries()].find(([, text]) => text.includes('avm1Actions('));
    expect(bytecodeModule).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search project files and source' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show TypeScript Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Application' }));
    fireEvent.click(await screen.findByTitle(bytecodeModule![0]));
    expect(screen.getByRole('note').textContent).toContain('original AVM1 bytes for faithful execution');
    expect(screen.getByLabelText(`${bytecodeModule![0]} source`).textContent).toContain(payload);
  });

  it('opens the IDE from the Inspector code shortcut', () => {
    const onOpenCode = vi.fn();
    render(<CodePanel assets={fixtureBundle()} onOpenCode={onOpenCode} />);
    fireEvent.click(screen.getByRole('button', { name: /Open Code Editor/ }));
    expect(onOpenCode).toHaveBeenCalledOnce();
  });
});
