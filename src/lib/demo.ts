// A small synthetic JPEXS-style XML dump + matching SVG assets, so the tool can
// be tried (and the parser sanity-checked) without a real export at hand.

function mkFile(path: string, content: string, type: string): File {
  const f = new File([content], path.split('/').pop()!, { type });
  Object.defineProperty(f, 'webkitRelativePath', { value: 'demo_assets/' + path, configurable: true });
  return f;
}

const circle = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="-60 -60 120 120">
  <circle cx="0" cy="0" r="58" fill="#f43f5e" stroke="#fff" stroke-width="3"/>
  <circle cx="-18" cy="-16" r="9" fill="#fff"/><circle cx="18" cy="-16" r="9" fill="#fff"/>
  <path d="M-22 18 Q0 36 22 18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
</svg>`;

const bar = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="24" viewBox="0 0 200 24">
  <rect x="0" y="0" width="200" height="24" rx="6" fill="#38bdf8"/>
  <rect x="4" y="4" width="192" height="8" rx="4" fill="#7dd3fc"/>
</svg>`;

const star = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="-40 -40 80 80">
  <path d="M0-38 11-12 38-12 16 5 24 32 0 16-24 32-16 5-38-12-11-12Z" fill="#fbbf24"/>
</svg>`;

const M = (a: number, b: number, c: number, d: number, tx: number, ty: number) =>
  `<matrix type="MATRIX" hasRotate="true" hasScale="true" rotateSkew0="${Math.round(b * 65536)}" rotateSkew1="${Math.round(c * 65536)}" scaleX="${Math.round(a * 65536)}" scaleY="${Math.round(d * 65536)}" translateX="${Math.round(tx)}" translateY="${Math.round(ty)}"/>`;

// Real decompiled ActionScript for sprite 10, frame 13 (0-based index 12), so
// the Code Inspector has real methods, members, and code→asset relationships to
// index. Lives at the exact path JPEXS emits for a frame-scoped script.
const DEMO_ACTION_SCRIPT = `// Decompiled from SWF p-code (frame 13) — class HeroBall
var heroBall = this;
this.velocity = 0;
this.bouncePower = 0.5;
this.star = null;

this.bounce = function() {
    this._y -= this.velocity;
    this.velocity += this.bouncePower;
    return this._y;
};

this.spawnStar = function(layer) {
    var star = getMovieClip(_root, "shape_3");
    star.attachMovie("HeroBall", layer, 0);
    this.star = star;
    return star;
};

this.startBounce = function() {
    var pickup = getMovieClip(_root, "shape_1");
    pickup.attachMovie("HeroBall", 1, 0);
    this.bounce();
    start();
};

this.startBounce();
stop();
`;

function spriteBounce() {
  let out = '';
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const y = Math.round(-Math.abs(Math.sin(t * Math.PI * 2)) * 1400);
    const s = 1 + Math.sin(t * Math.PI * 2) * 0.12;
    const rot = t * Math.PI * 2;
    const first = i === 0;
    out += `<item type="PlaceObject2Tag" depth="1" ${first ? 'characterId="1" placeFlagHasCharacter="true" name="ball"' : 'placeFlagMove="true"'} placeFlagHasMatrix="true">
      ${M(Math.cos(rot) * s, Math.sin(rot) * s, -Math.sin(rot) * s, Math.cos(rot) * s, 0, y)}
    </item>`;
    if (i === 0) out += `<item type="FrameLabelTag" name="bounce_start"/>`;
    if (i === 8) out += `<item type="StartSoundTag" soundId="30"><soundInfo type="SOUNDINFO" loopCount="1" syncStop="false"/></item>`;
    if (i === 12) out += `<item type="DoActionTag" actionBytes="9600070073746f7028290000"/>`;
    out += '<item type="ShowFrameTag"/>';
  }
  return out;
}

function rootFrames() {
  let out = '';
  for (let i = 0; i < 48; i++) {
    const x = 1000 + i * 180;
    const first = i === 0;
    out += `<item type="PlaceObject2Tag" depth="10" ${first ? 'characterId="10" placeFlagHasCharacter="true" name="hero"' : 'placeFlagMove="true"'} placeFlagHasMatrix="true">
      ${M(1, 0, 0, 1, x, 5200)}
    </item>`;
    if (first) {
      out += `<item type="PlaceObject2Tag" depth="1" characterId="2" placeFlagHasCharacter="true" name="ground" placeFlagHasMatrix="true">${M(2.6, 0, 0, 1, 200, 6400)}</item>`;
      out += `<item type="PlaceObject2Tag" depth="20" characterId="3" placeFlagHasCharacter="true" name="pickup" placeFlagHasMatrix="true">${M(1, 0, 0, 1, 8200, 2400)}</item>`;
      out += `<item type="FrameLabelTag" name="level_intro"/>`;
    }
    if (i === 16) out += `<item type="FrameLabelTag" name="run"/>`;
    if (i === 24) out += `<item type="DoActionTag" actionBytes="8b0400746573749600020030"/>`;
    if (i === 32) out += `<item type="PlaceObject3Tag" depth="20" placeFlagMove="true" blendMode="Add" placeFlagHasMatrix="true">${M(1.4, 0, 0, 1.4, 8200, 2400)}</item>`;
    if (i === 40) out += `<item type="RemoveObject2Tag" depth="20"/>`;
    out += '<item type="ShowFrameTag"/>';
  }
  return out;
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<swf type="SWF" _xmlExportMajor="2" _xmlExportMinor="2" _generator="Demo" version="10" frameRate="24" frameCount="48">
  <displayRect type="RECT" Xmax="11000" Xmin="0" Ymax="8000" Ymin="0"/>
  <tags>
    <item type="DefineShapeTag" shapeId="1">
      <shapeBounds type="RECT" Xmax="1200" Xmin="-1200" Ymax="1200" Ymin="-1200"/>
    </item>
    <item type="DefineShapeTag" shapeId="2">
      <shapeBounds type="RECT" Xmax="4000" Xmin="0" Ymax="480" Ymin="0"/>
    </item>
    <item type="DefineShapeTag" shapeId="3">
      <shapeBounds type="RECT" Xmax="800" Xmin="-800" Ymax="800" Ymin="-800"/>
    </item>
    <item type="DefineSoundTag" soundId="30" soundFormat="MP3" soundRate="44kHz" soundSampleCount="12000"/>
    <item type="DefineSpriteTag" spriteId="10" frameCount="16">
      <subTags>
        ${spriteBounce()}
        <item type="EndTag"/>
      </subTags>
    </item>
    <item type="SymbolClassTag">
      <tags><item>10</item></tags>
      <names><item>HeroBall</item></names>
    </item>
    ${rootFrames()}
    <item type="EndTag"/>
  </tags>
</swf>`;

export function demoFiles(): File[] {
  return [
    mkFile('demo.xml', XML, 'text/xml'),
    mkFile('shapes/1.svg', circle, 'image/svg+xml'),
    mkFile('shapes/2.svg', bar, 'image/svg+xml'),
    mkFile('shapes/3.svg', star, 'image/svg+xml'),
    mkFile('scripts/DefineSprite_10/frame_13/DoAction.as', DEMO_ACTION_SCRIPT, 'text/plain'),
  ];
}
