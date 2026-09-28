// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSwfXml } from './parser';

const swf = (tags: string) =>
  `<swf frameRate="24"><displayRect Xmin="0" Xmax="2000" Ymin="0" Ymax="2000"/><tags>${tags}<item type="ShowFrameTag"/></tags></swf>`;

describe('parser: data the AS3 engine relies on', () => {
  it('keeps the full SymbolClass table, including the document class (id 0)', () => {
    const doc = parseSwfXml(swf(`<item type="SymbolClassTag"><tags><item>0</item><item>5</item></tags><names><item>com.game.Main</item><item>Coin</item></names></item>`), { fileName: 'x' });
    expect([...doc.symbolClasses!]).toEqual([[0, 'com.game.Main'], [5, 'Coin']]);
  });

  it('reads SetBackgroundColor', () => {
    const doc = parseSwfXml(swf(`<item type="SetBackgroundColorTag"><backgroundColor type="RGB" red="255" green="128" blue="0"/></item>`), { fileName: 'x' });
    expect(doc.header.backgroundColor).toBe(0xff8000);
  });

  it('decodes push-doubles with SWF word order (EX-19)', () => {
    const doc = parseSwfXml(swf(`<item type="DoActionTag" actionBytes="960900060000f83f0000000000"/>`), { fileName: 'x' });
    expect(doc.root.frames[0].events[0].detail).toContain('Push 1.5 ;');
  });
});
