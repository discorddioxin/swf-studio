import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { transpileProject } from '../../transcom/transpiler/as2';
import { createTypeScriptArchive } from './typescriptExport';

describe('editable TypeScript export', () => {
  it('ships decoded logic, named actors, diagnostics, all runtime sources and a type-check config', async () => {
    const project = transpileProject([
      { path: 'scripts/DefineSprite_5/frame_1/DoAction.as', content: 'avm1Actions("BwA=");' },
    ], { runtime: 'as2-runtime', timelineMetadata: new Map([[5, { name: 'Hero Ball', frameLabels: { 1: 'idle' } }]]) });
    const blob = await createTypeScriptArchive(project);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('game/timelines/hero_ball.ts')!.async('string')).toContain('$t.stop();');
    const actor = await zip.file('game/actors/hero_ball.ts')!.async('string');
    expect(actor).toContain('class HeroBallActor extends TimelineActor');
    expect(actor).toContain('action_idle(): void');
    expect(actor).toContain('"1":"idle"');
    expect(await zip.file('runtime/as2/actor.ts')!.async('string')).toContain('interface GraphicsPort');
    expect(zip.file('runtime/as2/avm1.ts')).not.toBeNull();
    expect(zip.file('runtime/as2/index.ts')).not.toBeNull();
    expect(zip.file('game/as2ts-report.md')).not.toBeNull();
    // every relative import of the shipped runtime resolves inside the archive (runtime/shared/* included)
    const runtimeFiles = Object.keys(zip.files).filter((f) => f.startsWith('runtime/') && f.endsWith('.ts'));
    expect(runtimeFiles).toEqual(expect.arrayContaining(['runtime/shared/hostGuard.ts', 'runtime/shared/filters.ts', 'runtime/shared/filterModel.ts']));
    for (const file of runtimeFiles) {
      const src = await zip.file(file)!.async('string');
      for (const [, spec] of src.matchAll(/^(?:import|export)[^'"\n]*from '(\.{1,2}\/[^']+)'/gm)) {
        const parts = file.split('/').slice(0, -1);
        for (const seg of spec.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
        expect([file, spec, zip.file(`${parts.join('/')}.ts`) != null]).toEqual([file, spec, true]);
      }
    }
    const config = JSON.parse(await zip.file('tsconfig.json')!.async('string'));
    expect(config.compilerOptions.paths['as2-runtime']).toEqual(['./runtime/as2/index.ts']);
    expect(await zip.file('README.md')!.async('string')).toContain('not a self-running game');
  });
});
