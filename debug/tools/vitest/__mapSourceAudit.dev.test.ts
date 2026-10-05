// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';

it('inspects generated map external init modules', async () => {
  const bytes = readFileSync('game-files/fish-full/swfs/bassken_overview.swf');
  const { files, doc } = await parseSwfBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'bassken_overview.swf');
  const srcs: SourceInput[] = files.filter((f) => f.path.endsWith('.as')).map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) }));
  const build = buildAS2Program(srcs);
  console.log('sprites', [...doc.characters.values()].filter((c) => c.kind === 'sprite').map((c) => ({id:c.id, name:c.exportName})));
  console.log('action sources', srcs.filter(s => /DoInitAction/.test(s.path)).map(s=>({path:s.path, head:s.text.slice(0,320)})));
  console.log('timeline modules', Object.keys(build.program?.timelines ?? {}));
  console.log('program classes', Object.keys(build.program?.classes ?? {}));
  console.log('linkage class', typeof (build.program?.classes as any)?.map_engine);
  console.log('errors', build.errors);
  console.log('warnings', build.warnings.slice(0,20));
  console.log('project reports', build.project.report.filter(r=>/map_engine|DoInitAction/.test(r.source)).map(r=>({source:r.source,target:r.target,role:r.role,diag:r.diagnostics})))
});
