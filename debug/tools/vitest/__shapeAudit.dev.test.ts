// scratch: compare our shape parsing against FFDec's XML ground truth
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';

const CASES = [
  ['bassken_scene', 'game-files/fish-full/external/bassken_scene/bassken_scene.xml'],
  ['bassken_pier', 'game-files/fish-full/external/bassken_pier/bassken_pier.xml'],
];

it('compares shape parsing with the FFDec XML', async () => {
  for (const [name, xmlPath] of CASES) {
    const xml = readFileSync(xmlPath, 'utf8');
    const xmlGrad = (xml.match(/fillStyleType="16"/g) ?? []).length + (xml.match(/fillStyleType="18"/g) ?? []).length;
    const xmlShapes = (xml.match(/type="DefineShapeTag"/g) ?? []).length;
    const buf = readFileSync(`game-files/fish-full/swfs/${name}.swf`);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { files } = await parseSwfBinary(ab, `${name}.swf`);
    const svgs = files.filter((f) => /shapes\/\d+\.svg$/.test(f.path));
    let grad = 0, paths = 0, empty = 0;
    for (const f of svgs) {
      const t = new TextDecoder().decode(f.bytes);
      const g = (t.match(/<linearGradient|<radialGradient/g) ?? []).length;
      grad += g;
      paths += (t.match(/<path /g) ?? []).length;
      if (g === 0 && /fill="none"/.test(t) && (t.match(/<path /g) ?? []).length < 2) empty++;
    }
    console.log(`${name}: xml shapes=${xmlShapes} xmlGradients=${xmlGrad} | ours svg=${svgs.length} gradients=${grad} paths=${paths} nearEmpty=${empty}`);
  }
}, 120000);

it('audits the main movie shapes', async () => {
  const buf = readFileSync('game-files/fish-full/swfs/bassken_game4.21.swf');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { files } = await parseSwfBinary(ab, 'bassken_game4.21.swf');
  const svgs = files.filter((f) => /shapes\/\d+\.svg$/.test(f.path));
  let grad = 0, none = 0, big = 0;
  const gradShapes: string[] = [];
  for (const f of svgs) {
    const t = new TextDecoder().decode(f.bytes);
    const g = (t.match(/<linearGradient|<radialGradient/g) ?? []).length;
    grad += g;
    if (g > 0) gradShapes.push(f.name);
    if (/fill="none"/.test(t) && !/url\(#|fill="#/.test(t)) none++;
    if (t.length > 40000) big++;
  }
  console.log(`main: shapes=${svgs.length} gradientFills=${grad} gradientShapes=${gradShapes.length} allNone=${none} hugeSvg=${big}`);
  console.log('gradient shapes:', gradShapes.slice(0, 12).join(','));
}, 120000);
