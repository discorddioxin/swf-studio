// @vitest-environment node
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { SAMPLE_SERVICE, sampleSwfPath } from '@/adapters/gaiaFishing/sample';

it('dump compiled List', async () => {
  const bytes = readFileSync(sampleSwfPath(SAMPLE_SERVICE));
  const { files } = await parseSwfBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, `${SAMPLE_SERVICE}.swf`);
  const srcs: SourceInput[] = files.filter((f) => f.name?.endsWith('.as')).map((f) => ({ path: f.path, text: f.text ?? '' }));
  const build = buildAS2Program(srcs);
  const prog: any = (build.program as any);
  console.log('program keys', Object.keys(prog ?? {}));
  console.log('timelines', prog?.timelines ? Object.keys(prog.timelines).length : 'none');
  console.log('classes sample', prog?.classes ? Object.keys(prog.classes).slice(0, 10).join(',') : 'none');
  const cls = prog?.classes?.['mx.controls.List'];
  console.log('class:', typeof cls);
  console.log('src:', cls ? Function.prototype.toString.call(cls).slice(0, 700) : 'none');
  const SSL = (build.program as any)?.classes?.['mx.controls.listclasses.ScrollSelectList'];
  console.log('SSL src:', SSL ? Function.prototype.toString.call(SSL).slice(0, 500) : 'none');
  console.log('List proto createChildren:', cls ? String(Function.prototype.toString.call(cls.prototype.createChildren)).slice(0, 300) : '');
});
