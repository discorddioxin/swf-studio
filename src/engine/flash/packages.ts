// The AS3 package table: `flash.display` → { MovieClip, Sprite, … }.
// The loader resolves every flash.* / fl.* import (in any spelling) here.

import * as display from './display';
import * as events from './events';
import * as fl from './fl';
import * as geom from './geom';
import * as faces from './interfaces';
import * as media from './media';
import * as misc from './misc';
import * as text from './text';
import * as utils from './utils';
import { runtime } from './context';

const pick = <T extends object>(mod: T, names: (keyof T)[]) =>
  Object.fromEntries(names.map((n) => [n, mod[n]])) as Record<string, unknown>;

export const PACKAGES: Record<string, Record<string, unknown>> = {
  'flash.display': {
    ...pick(display, ['DisplayObject', 'InteractiveObject', 'DisplayObjectContainer', 'Sprite', 'MovieClip', 'Shape',
      'SimpleButton', 'Stage', 'Bitmap', 'BitmapData', 'Graphics', 'FrameLabel', 'Scene', 'LoaderInfo', 'StaticText']),
    ...pick(faces, ['IBitmapDrawable', 'IGraphicsData', 'IGraphicsFill', 'IGraphicsPath', 'IGraphicsStroke']),
    StageAlign: { TOP: 'T', BOTTOM: 'B', LEFT: 'L', RIGHT: 'R', TOP_LEFT: 'TL', TOP_RIGHT: 'TR', BOTTOM_LEFT: 'BL', BOTTOM_RIGHT: 'BR' },
    StageScaleMode: { EXACT_FIT: 'exactFit', NO_BORDER: 'noBorder', NO_SCALE: 'noScale', SHOW_ALL: 'showAll' },
    StageQuality: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', BEST: 'best' },
    StageDisplayState: { NORMAL: 'normal', FULL_SCREEN: 'fullScreen', FULL_SCREEN_INTERACTIVE: 'fullScreenInteractive' },
    BlendMode: { NORMAL: 'normal', ADD: 'add', MULTIPLY: 'multiply', SCREEN: 'screen', LAYER: 'layer', ERASE: 'erase', ALPHA: 'alpha', DARKEN: 'darken', LIGHTEN: 'lighten', DIFFERENCE: 'difference', INVERT: 'invert', OVERLAY: 'overlay', HARDLIGHT: 'hardlight', SUBTRACT: 'subtract' },
    PixelSnapping: { AUTO: 'auto', ALWAYS: 'always', NEVER: 'never' },
    LineScaleMode: { NORMAL: 'normal', NONE: 'none', HORIZONTAL: 'horizontal', VERTICAL: 'vertical' },
    CapsStyle: { NONE: 'none', ROUND: 'round', SQUARE: 'square' },
    JointStyle: { BEVEL: 'bevel', MITER: 'miter', ROUND: 'round' },
    GradientType: { LINEAR: 'linear', RADIAL: 'radial' },
    SpreadMethod: { PAD: 'pad', REFLECT: 'reflect', REPEAT: 'repeat' },
    Loader: class Loader extends display.DisplayObjectContainer {
      readonly contentLoaderInfo = new display.LoaderInfo();
      content: unknown = null;
      load(request: { url?: string } | null) {
        const url = request?.url ?? '';
        if (url) (runtime.player as unknown as { loaderLoad?: (info: unknown, url: string) => void } | null)?.loaderLoad?.(this.contentLoaderInfo, url);
      }
      loadBytes() {}
      unload() {}
      unloadAndStop() {}
      close() {}
    },
  },
  'flash.events': pick(events, ['Event', 'EventDispatcher', 'EventPhase', 'MouseEvent', 'KeyboardEvent', 'TimerEvent',
    'FocusEvent', 'TextEvent', 'ErrorEvent', 'IOErrorEvent', 'SecurityErrorEvent', 'ProgressEvent']),
  'flash.geom': pick(geom, ['Point', 'Rectangle', 'Matrix', 'ColorTransform', 'Transform']),
  'flash.text': pick(text, ['TextField', 'TextFormat', 'StyleSheet', 'TextFieldAutoSize', 'TextFieldType', 'TextFormatAlign', 'AntiAliasType', 'GridFitType', 'Font']),
  'flash.media': pick(media, ['Sound', 'SoundChannel', 'SoundTransform', 'SoundMixer', 'Microphone', 'Camera', 'Video']),
  'flash.utils': pick(utils, ['getTimer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Timer', 'Dictionary',
    'getDefinitionByName', 'getQualifiedClassName', 'getQualifiedSuperclassName', 'describeType', 'ByteArray', 'escapeMultiByte', 'unescapeMultiByte']),
  'flash.ui': pick(misc, ['Keyboard', 'KeyLocation', 'Mouse', 'MouseCursor', 'ContextMenu', 'ContextMenuItem']),
  'flash.net': pick(misc, ['URLRequest', 'URLVariables', 'URLRequestMethod', 'navigateToURL', 'sendToURL', 'SharedObject', 'SharedObjectFlushStatus', 'URLLoader', 'URLLoaderDataFormat', 'Socket']),
  'flash.system': { ...pick(misc, ['Capabilities', 'System', 'Security', 'ApplicationDomain', 'LoaderContext', 'fscommand']) },
  'flash.filters': pick(misc, ['BitmapFilter', 'GlowFilter', 'DropShadowFilter', 'BlurFilter', 'ColorMatrixFilter', 'BevelFilter',
    'GradientGlowFilter', 'GradientBevelFilter', 'ConvolutionFilter', 'DisplacementMapFilter', 'BitmapFilterQuality']),
  'flash.external': pick(misc, ['ExternalInterface']),
  'flash.errors': pick(utils, ['IllegalOperationError', 'IOError', 'EOFError']),
  'fl.transitions': pick(fl, ['Tween', 'TweenEvent']),
  'fl.transitions.easing': pick(fl, ['None', 'Regular', 'Strong', 'Back', 'Elastic', 'Bounce']),
};
Object.assign(PACKAGES['flash.events'], pick(faces, ['IEventDispatcher']));
Object.assign(PACKAGES['flash.utils'], pick(faces, ['IDataInput', 'IDataOutput', 'IExternalizable']));
Object.assign(PACKAGES['flash.net'], pick(faces, ['IDynamicPropertyOutput', 'IDynamicPropertyWriter']));

/** AS3 top-level names made available to every module without an import. */
export const TOP_LEVEL: Record<string, unknown> = {
  trace: utils.trace,
  int: utils.int,
  uint: utils.uint,
  Vector: utils.Vector,
  ArgumentError: utils.ArgumentError,
  // AVM2's class-of-classes, and the casts built on it (`x as Class`, `Class(x)`).
  Class: utils.Class,
  // Interfaces are runtime values in AVM2, so the emitted modules build them.
  __interface: utils.__interface,
  __implements: utils.__implements,
  // `obj.method` read as a value: a closure bound to `obj`.
  __method: utils.__method,
  __slots: utils.__slots,
  // Name lookups inside `with` scopes and E4X filter predicates.
  __withScope: utils.__withScope,
  DefinitionError: utils.DefinitionError,
  SecurityError: utils.SecurityError,
  VerifyError: utils.VerifyError,
  // Helpers a transpiled ABC module calls directly (see `engine/flash/utils.ts`).
  __applyType: utils.__applyType,
  __coerceObject: utils.__coerceObject,
  __iterAdvance: utils.__iterAdvance,
  __iterValue: utils.__iterValue,
};

/** Every class/function in the table by simple and qualified name. */
export const FLASH_DEFINITIONS = new Map<string, unknown>();
for (const [pkg, members] of Object.entries(PACKAGES)) {
  for (const [name, value] of Object.entries(members)) {
    FLASH_DEFINITIONS.set(`${pkg}.${name}`, value);
    FLASH_DEFINITIONS.set(`${pkg}::${name}`, value);
    if (!FLASH_DEFINITIONS.has(name)) FLASH_DEFINITIONS.set(name, value);
  }
}
for (const [name, value] of Object.entries(TOP_LEVEL)) FLASH_DEFINITIONS.set(name, value);
