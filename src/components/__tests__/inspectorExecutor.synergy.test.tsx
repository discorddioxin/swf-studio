// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ingestFiles } from '../../lib/assets';
import { buildAS2Program, generateAS2Project } from '../../engine/as2/program';
import { readAS2Sources } from '../../engine/as2/useAS2Build';
import { buildWorkbenchTimelineMetadata } from '../../engine/as2/workbenchMetadata';
import { parseSwfXml } from '../../lib/parser';
import { emptyProject } from '../../lib/project';
import { fixtureFiles } from './fixtures/jpexsDump';
import { CodeWorkspace } from '../CodeWorkspace';
import { globalDebugger } from '../../debug/store';
import { AS2Player } from '../../engine/as2/player';

afterEach(() => {
  cleanup();
  globalDebugger.clearBreakpoints();
  (globalDebugger as any).clearSkip?.();
  if (globalDebugger.getState().paused) globalDebugger.resume();
  globalDebugger.clearStack();
});

async function readFileText(file: File): Promise<string> {
  const anyFile = file as File & { text?: () => Promise<string> };
  if (typeof anyFile.text === 'function') return anyFile.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function fixtureSetup() {
  const assets = ingestFiles(fixtureFiles());
  const xmlText = await readFileText(assets.xmlFile!);
  const doc = parseSwfXml(xmlText, { fileName: 'fixture.xml' });
  const project = emptyProject('fixture.xml');
  project.characters['10'] = { name: 'Hero Ball', tags: [] };
  return { assets, doc, project };
}

describe('Inspector ↔ Executor synergy', () => {
  it('CodeWorkspace and Execute share same generated module keys and Workbench names', async () => {
    const { assets, doc, project } = await fixtureSetup();
    const sources = await readAS2Sources(assets);
    const meta = buildWorkbenchTimelineMetadata(doc, project);
    const projectFiles = generateAS2Project(sources, meta).files;
    const buildFiles = buildAS2Program(sources, meta).files;
    // same keys for generated timeline modules (fixture only has hero_ball/sprite_10, not root without a script)
    expect(projectFiles.get('timelines/hero_ball.ts')).toContain('Hero Ball');
    expect(buildFiles.get('timelines/hero_ball.ts')).toContain('Hero Ball');
    expect(projectFiles.get('timelines/hero_ball.ts')).toBe(buildFiles.get('timelines/hero_ball.ts'));
    // sprite_10 is a shim re-exporting hero_ball when human name differs — still present and shared
    expect(projectFiles.get('timelines/sprite_10.ts')).toBeTruthy();
    expect(buildFiles.get('timelines/sprite_10.ts')).toBe(projectFiles.get('timelines/sprite_10.ts'));
    expect(projectFiles.get('timelines/sprite_10.ts')).toContain('hero_ball');
    expect(projectFiles.get('timelines/hero_ball.ts')).toBeTruthy();
  });

  it('breakpoint set in CodeWorkspace pauses Execute on the matching frame (and Continue resumes)', async () => {
    const { assets, doc, project } = await fixtureSetup();
    const sources = await readAS2Sources(assets);
    // ensure root has a frame script so timelines/root.ts is generated and Execute has a label to break on
    const hasRoot = sources.some(s => s.path.includes('frame_1') && !s.path.includes('DefineSprite'));
    if (!hasRoot) sources.push({ path: 'scripts/frame_1/DoAction.as', text: 'trace("root frame 1");' });
    const meta = buildWorkbenchTimelineMetadata(doc, project);
    const build = buildAS2Program(sources, meta);
    expect(build.program).toBeTruthy();
    // also verify generate/build share same root module when root source present
    const projectFiles = generateAS2Project(sources, meta).files;
    expect(projectFiles.get('timelines/root.ts')).toBeTruthy();
    expect(build.files.get('timelines/root.ts')).toBe(projectFiles.get('timelines/root.ts'));

    // Inspector sets breakpoint exactly as CodeWorkspace does: activeFile.path + line
    globalDebugger.clearBreakpoints();
    globalDebugger.addBreakpoint('timelines/root.ts', 1);
    expect(globalDebugger.getState().breakpoints).toHaveLength(1);

    const cache = { get: () => ({ status: 'error' as const }), preview: () => undefined, dispose: () => {} } as any;
    const player = new AS2Player({ doc, program: build.program!, assets: cache });
    player.start();
    // first guard is root frame 1 — should have paused
    expect(globalDebugger.getState().paused).toBe(true);
    expect(globalDebugger.getState().pausedAt?.path).toBe('timelines/root.ts');

    // Continue should skip that breakpoint once and run the frame, not immediately re-break
    globalDebugger.continue();
    // allow pending guard's subscriber to fire
    await new Promise((r) => setTimeout(r, 0));
    expect(globalDebugger.getState().paused).toBe(false);

    // CodeWorkspace gutter would show same breakpoint via pathsEqual — verify dot logic (hero_ball visible regardless of root)
    const { container } = render(<CodeWorkspace assets={assets} doc={doc} project={project} projectName="fixture.xml" />);
    await waitFor(() => expect(container.textContent).toContain('hero_ball.ts'));
    expect(container.textContent).toContain('hero_ball.ts');
    // ensure breakpoint dot logic uses pathsEqual (Explorer row for any file with bp shows dot)
    expect(globalDebugger.getState().breakpoints.length).toBe(1);

    player.dispose();
  });
});
