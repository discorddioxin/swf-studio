// The Flash Player's own interfaces, as runtime values.
//
// In AVM2 an interface is an object: `x is IEventDispatcher` answers, and a movie's
// interface can extend one of the player's (`IGaiaGame extends IEventDispatcher`).
// The emitted modules build theirs with `__interface`; these are the player's, and
// the engine classes that implement them say so, so `instanceof` agrees with Flash.
import { BitmapData, DisplayObject } from './display';
import { EventDispatcher } from './events';
import { Socket } from './misc';
import { __implements, __interface, ByteArray } from './utils';

export const IEventDispatcher = __interface('flash.events.IEventDispatcher');
export const IBitmapDrawable = __interface('flash.display.IBitmapDrawable');
export const IGraphicsData = __interface('flash.display.IGraphicsData');
export const IGraphicsFill = __interface('flash.display.IGraphicsFill');
export const IGraphicsPath = __interface('flash.display.IGraphicsPath');
export const IGraphicsStroke = __interface('flash.display.IGraphicsStroke');
export const IDataInput = __interface('flash.utils.IDataInput');
export const IDataOutput = __interface('flash.utils.IDataOutput');
export const IExternalizable = __interface('flash.utils.IExternalizable');
export const IDynamicPropertyOutput = __interface('flash.net.IDynamicPropertyOutput');
export const IDynamicPropertyWriter = __interface('flash.net.IDynamicPropertyWriter');

__implements(EventDispatcher, IEventDispatcher);
__implements(DisplayObject, IBitmapDrawable);
__implements(BitmapData, IBitmapDrawable);
__implements(ByteArray, IDataInput, IDataOutput);
__implements(Socket, IDataInput, IDataOutput);
