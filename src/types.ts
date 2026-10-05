// ---------------------------------------------------------------------------
// Core data model for the SWF / JPEXS XML workbench
// All internal geometry is kept in TWIPS (1/20 px) exactly like the SWF format,
// and only converted to pixels at the very last moment (render / export).
// ---------------------------------------------------------------------------

export const TWIPS = 20;

export interface Matrix {
  /** scaleX */ a: number;
  /** rotateSkew0 */ b: number;
  /** rotateSkew1 */ c: number;
  /** scaleY */ d: number;
  /** translateX in TWIPS */ tx: number;
  /** translateY in TWIPS */ ty: number;
}

export interface ColorTransform {
  rm: number; gm: number; bm: number; am: number;
  ra: number; ga: number; ba: number; aa: number;
}

export interface Rect {
  /** all values in TWIPS */
  xMin: number; xMax: number; yMin: number; yMax: number;
}

export type CharacterKind =
  | 'shape' | 'morphshape' | 'sprite' | 'button' | 'bitmap'
  | 'font' | 'text' | 'edittext' | 'sound' | 'video' | 'binary' | 'other';

export interface SwfCharacter {
  id: number;
  tagType: string;
  kind: CharacterKind;
  bounds?: Rect;
  className?: string;
  exportName?: string;
  frameCount?: number;
  timelineId?: string;
  /** JPEXS `_externalFile` hint, e.g. "foo_assets/images/DefineBits_5.png" */
  externalFile?: string;
  /** ids of characters this one references (sprite children, button states…) */
  uses: number[];
  attrs: Record<string, string>;
  /** #of frames flagged as containing something other than place/remove */
  specialFrames?: number;
  /** DefineText: glyph runs (positions in TWIPS, relative to textMatrix) */
  textRecords?: TextRecord[];
  textMatrix?: Matrix;
  /** DefineFont*: glyph index → character code */
  codeTable?: number[];
}

export interface TextRecord {
  fontId?: number;
  /** TWIPS */
  height?: number;
  /** #rrggbb */
  color?: string;
  alpha?: number;
  x?: number;
  y?: number;
  glyphs: { index: number; advance: number }[];
}

export type EventKind = 'action' | 'sound' | 'label' | 'other' | 'define' | 'place' | 'remove';

export interface FrameEvent {
  kind: EventKind;
  tagType: string;
  detail: string;
  characterId?: number;
  /** Sprite targeted by a DoInitAction tag. */
  targetSpriteId?: number;
  /** Ordinal among DoInitAction tags in serialized SWF order. */
  tagOrder?: number;
  externalActions?: string;
  /** Fallback paths used by JPEXS script exports when the XML has no hint. */
  externalActionCandidates?: string[];
}

export interface PlaceOp {
  op: 'place' | 'move' | 'remove';
  tagType: string;
  depth: number;
  characterId?: number;
  matrix?: Matrix;
  colorTransform?: ColorTransform;
  ratio?: number;
  name?: string;
  clipDepth?: number;
  blendMode?: string;
  hasFilters?: boolean;
}

export interface DisplayItem {
  depth: number;
  characterId: number;
  matrix: Matrix;
  colorTransform?: ColorTransform;
  ratio: number;
  name?: string;
  clipDepth?: number;
  blendMode?: string;
  hasFilters?: boolean;
  /** frame (in this timeline) at which this instance was created — used to
   *  derive the local playhead of nested sprites deterministically. */
  startFrame: number;
}

export interface Frame {
  index: number;
  label?: string;
  ops: PlaceOp[];
  events: FrameEvent[];
  /** contains a tag that is not PlaceObject2 / RemoveObject2 / ShowFrame */
  special: boolean;
  kinds: EventKind[];
  display: DisplayItem[];
}

export interface Timeline {
  id: string;                 // 'root' | 'sprite:12' | 'button:23'
  kind: 'root' | 'sprite' | 'button';
  characterId?: number;
  name: string;
  frameCount: number;
  frames: Frame[];
}

export interface SwfHeader {
  version?: string;
  frameRate: number;
  frameCount: number;
  stage: Rect;
  compression?: string;
  fileName: string;
  /** SetBackgroundColor, 0xRRGGBB */
  backgroundColor?: number;
}

export interface SwfDocument {
  header: SwfHeader;
  characters: Map<number, SwfCharacter>;
  timelines: Map<string, Timeline>;
  root: Timeline;
  /** SymbolClass table: character id → AS3 class name (id 0 = document class). */
  symbolClasses?: Map<number, string>;
  warnings: string[];
  stats: { tags: number; unknownTags: Record<string, number> };
}

// --------------------------- asset side ------------------------------------

export type AssetCategory =
  | 'shapes' | 'morphshapes' | 'images' | 'sounds' | 'texts' | 'fonts' | 'buttons' | 'other';

export interface AssetFile {
  path: string;        // relative to selected root
  name: string;        // base name w/o extension
  ext: string;
  category: AssetCategory;
  file: File;
  /** Serialized SWF tag index / DoInitAction target copied from the owning tag. */
  tagOrder?: number;
  targetSpriteId?: number;
  /** id guessed from the file / folder name */
  guessedId?: number;
}

export interface AssetBundle {
  rootName: string;
  xmlFile?: File;
  xmlName: string;
  files: AssetFile[];
  byId: Map<number, AssetFile[]>;
  /** lookup by relative path, by "dir/file.ext" tail and by bare file name */
  byPath: Map<string, AssetFile>;
}

// --------------------------- user annotations ------------------------------

export interface CharLabel {
  name?: string;
  category?: string;
  tags: string[];
  notes?: string;
  ignore?: boolean;
}

export interface Clip {
  id: string;
  timelineId: string;
  name: string;
  start: number;
  end: number;
  loop: boolean;
  fps?: number;
  tags: string[];
  notes?: string;
  /** Immutable-at-creation snapshot used by actors and the JSON export. */
  frames?: FrameActionDetail[];
}

export type MarkerType = 'sound' | 'action' | 'hitbox' | 'spawn' | 'marker' | 'custom';

export interface FrameMarker {
  id: string;
  timelineId: string;
  frame: number;
  type: MarkerType;
  name: string;
  payload?: string;
  tags: string[];
}

export interface FrameActionDetail {
  index: number;              // 0-based index within this container
  absoluteFrame: number;      // 0-based frame index on original timeline
  label?: string;             // frame label if any
  opsCount: number;           // number of PlaceObject/RemoveObject tags on this frame
  events: {
    kind: string;
    tagType: string;
    detail: string;
    characterId?: number;
    externalActions?: string;
  }[]; // actions, sounds, labels
  instances: { characterId: number; name?: string; depth: number }[]; // active display list elements
  /** Raw placement changes are preserved so an actor clip is self-contained. */
  ops?: PlaceOp[];
  special?: boolean;
  kinds?: EventKind[];
}

export interface Actor {
  id: string;
  name: string;
  clipIds: string[];
  tags: string[];
  notes?: string;
  capabilities?: ActorCapabilities;
  classifications?: ActorClassification[];
  actions?: ActorAction[];
  sequences?: ActorSequence[];
  /** Normalized keyboard key -> ActorAction id, e.g. "space" -> "throw". */
  keyBindings?: Record<string, string>;
  /** Compositing layer for runtime scenes. HUD is always above World. */
  layer?: ActorLayer;
  /** Stable draw order within the selected layer. Higher values draw later. */
  depth?: number;
}

export type ActorLayer = 'Background' | 'World' | 'Foreground' | 'HUD';

/** A runtime actor instance placed on the orchestrator stage. It plays a clip
 *  (a frame range of a sprite timeline) as a shell, advancing at the frame rate
 *  and dispatching its sprite's frame events as it "executes". */
export interface RunActor {
  id: string;
  characterId: number;
  name: string;
  /** Position/orientation taken from the SWF PlaceObject matrix (twips). */
  matrix: Matrix;
  /** SWF display depth — higher depth renders in front. */
  depth: number;
  clipStart: number;
  clipEnd: number;
  loop: boolean;
  playing: boolean;
  localFrame: number;
  elapsedTicks: number;
}

export type ActorClassification = 'Monster' | 'Item' | 'Item Scene' | 'Item Inventory' | 'Scenery' | 'NPC' | 'Player' | 'Prop' | 'Effect' | 'Other';

export interface ActorAction {
  id: string;
  name: string;
  clipId?: string;
  sequenceId?: string;
}

export interface ActorSequenceStep {
  clipId: string;
}

export interface ActorSequence {
  id: string;
  name: string;
  steps: ActorSequenceStep[];
  loop?: boolean;
}

export type ActorCombatMode = 'none' | 'combat' | 'canAttack' | 'canBeAttacked';

export type ActorMovementSlot =
  | 'idle'
  | 'moveLeft'
  | 'moveRight'
  | 'moveUp'
  | 'moveDown'
  | 'moveLeftUp'
  | 'moveRightUp'
  | 'moveLeftDown'
  | 'moveRightDown';

export type ActorFacing = 'front-left' | 'front-right' | 'back-left' | 'back-right';
export type ActorMirrorSide = 'none' | 'left' | 'right';

export interface ActorCapabilities {
  /** combat means both attack and defense; the other modes enable one side. */
  combat: ActorCombatMode;
  canMove: boolean;
  canWalk?: boolean;
  /** Permit left-facing source clips to render mirrored for right-facing use. */
  useFlippedAnimations?: boolean;
  /** Which facing side is generated by mirroring the opposite side. */
  mirrorSide?: ActorMirrorSide;
  movementClips: Partial<Record<ActorMovementSlot, string>>;
  /** Optional directional idle clips. */
  idleAnimations?: Partial<Record<ActorFacing, string>>;
  /** Explicit directional walking clips used while WASD is held. */
  walkingClips?: Partial<Record<'left' | 'right' | 'up' | 'down', string>>;
  attackClipIds: string[];
  defenseClipId?: string;
}

export function defaultActorCapabilities(): ActorCapabilities {
  return {
    combat: 'none',
    canMove: false,
    canWalk: false,
    useFlippedAnimations: false,
    mirrorSide: 'none',
    movementClips: {},
    idleAnimations: {},
    walkingClips: {},
    attackClipIds: [],
  };
}

export interface FlattenedFrame {
  id: string;
  frame: number;
  width: number;
  height: number;
  path: string;
  blob: Blob;
  url: string;
}

export interface FlattenedSprite {
  id: string;
  characterId: number;
  timelineId: string;
  name: string;
  frameCount: number;
  frames: FlattenedFrame[];
}

export interface AnimationContainer {
  id: string;
  timelineId: string;
  name: string;
  startFrame: number;
  endFrame: number;
  frameCount: number;
  notes?: string;
  tags: string[];
  frames: FrameActionDetail[];
}

export interface Project {
  swfName: string;
  updatedAt: number;
  characters: Record<string, CharLabel>;
  clips: Clip[];
  markers: FrameMarker[];
  containers?: AnimationContainer[];
  actors?: Actor[];
  vocab: string[];
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

export function mul(m1: Matrix, m2: Matrix): Matrix {
  // m1 = parent, m2 = child.  point -> m1 * (m2 * p)
  return {
    a: m2.a * m1.a + m2.b * m1.c,
    b: m2.a * m1.b + m2.b * m1.d,
    c: m2.c * m1.a + m2.d * m1.c,
    d: m2.c * m1.b + m2.d * m1.d,
    tx: m2.tx * m1.a + m2.ty * m1.c + m1.tx,
    ty: m2.tx * m1.b + m2.ty * m1.d + m1.ty,
  };
}

export function mulColor(p: ColorTransform | undefined, c: ColorTransform | undefined) {
  if (!p) return c;
  if (!c) return p;
  return {
    rm: p.rm * c.rm, gm: p.gm * c.gm, bm: p.bm * c.bm, am: p.am * c.am,
    ra: p.ra + c.ra * p.rm, ga: p.ga + c.ga * p.gm,
    ba: p.ba + c.ba * p.bm, aa: p.aa + c.aa * p.am,
  };
}
