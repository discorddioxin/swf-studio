// @vitest-environment node
import { it } from 'vitest';
import { buildAS2Program } from '@/engine/as2/program';
import { readFileSync } from 'node:fs';

it('peek generated UIObject ts', () => {
  const xmlDir = 'game-files/fish-full/external/gsecs2.9/scripts';
  const src = readFileSync(`${xmlDir}/__Packages/mx/core/UIObject.as`, 'utf8');
  const build = buildAS2Program([{ path: '__Packages/mx/core/UIObject.as', text: src }]);
  console.log('keys:', [...build.files.keys()].join(', '));
  console.log('report:', JSON.stringify(build.project.report.map((r) => r.source.split('\n')[0] + ':' + r.diagnostics.length)));
  const first = [...build.files.entries()][0];
  if (first) {
    const text = first[1];
    console.log('=== ', first[0], 'len', text.length);
    const { writeFileSync } = require('node:fs');
    writeFileSync('/tmp/peek_uiobject.ts', text);
    for (const line of text.split('\n')) if (/width|__get__|__set__/.test(line)) console.log('L:', line.slice(0, 160));
  }
});
