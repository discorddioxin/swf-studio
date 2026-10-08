import JSZip from 'jszip';
import type { ProjectResult } from '../../transpiler/as2/project';

const runtime = import.meta.glob<string>('../runtime/as2/*.ts', { eager: true, query: '?raw', import: 'default' });

/** An editable source project, not a standalone replacement for the SWF renderer. */
export async function createTypeScriptArchive(project: ProjectResult): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, source] of project.files) zip.file(`game/${path}`, source);
  for (const [path, source] of Object.entries(runtime)) zip.file(`runtime/as2/${path.split('/').pop()}`, source);
  zip.file('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: true,
      skipLibCheck: true, noEmit: true, lib: ['ES2020', 'DOM'], baseUrl: '.',
      paths: { 'as2-runtime': ['./runtime/as2/index.ts'] },
    },
    include: ['game', 'runtime'],
  }, null, 2));
  zip.file('package.json', JSON.stringify({
    name: 'swf-typescript-migration', private: true, type: 'module',
    scripts: { check: 'tsc --noEmit' }, devDependencies: { typescript: '^5.9.3' },
  }, null, 2));
  zip.file('README.md', `# Editable TypeScript migration project

Run \`npm install\` and \`npm run check\`. Review \`game/as2ts-report.md\` for
fallbacks and untranslated sources. Some legacy dynamic code needs manual typing.

- \`game/timelines/\`: executable, decoded imperative logic. Edit these files.
- \`game/actors/\`: named actor classes and behavior entry points for migration.
- \`runtime/as2/actor.ts\`: sprite, animation and graphics ports; replace the
  Flash adapter with a renderer adapter as you move logic into actor methods.
- \`game/index.ts\`: original timeline wiring for compatibility with SWF Studio.

This is a **source export**, not a self-running game. Assets, the display-list
renderer, input, networking and the AS2Host are not bundled. Use SWF Studio's asset
export and existing host, or implement those services in your destination engine.
The \`as2-runtime\` alias is configured in tsconfig; your bundler must honor it.

Supported AVM1 blocks are real TypeScript, not Base64 or opcode listings.
Unsupported blocks retain the ENTIRE original interpreter call with a byte-offset
diagnostic. Do not delete those calls until you have ported their behavior.

Actors are opt-in migration entry points: construction never executes frame
scripts. Do not dispatch \`action_*\` methods alongside the legacy frame scheduler,
which already runs those callbacks. \`update(deltaSeconds)\` is your game-loop hook.
Animation timing remains owned by the host. Scale and opacity use 0..1 units,
positions use pixels and rotation uses degrees.
`);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
