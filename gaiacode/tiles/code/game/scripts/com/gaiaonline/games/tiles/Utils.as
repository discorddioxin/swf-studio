package com.gaiaonline.games.tiles
{
   import flash.display.DisplayObject;
   import flash.display.DisplayObjectContainer;
   import flash.display.Sprite;
   import flash.events.EventDispatcher;
   import flash.geom.Point;
   import flash.geom.Rectangle;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   import flash.utils.ByteArray;
   import gs.TweenMax;
   
   public class Utils
   {
      
      public function Utils(hide:CONSTRUCTOR_HIDER)
      {
         super();
      }
      
      public static function drawOutline(target:Sprite, color:uint = 16711935) : void
      {
         target.graphics.lineStyle(1,color);
         target.graphics.drawRect(0,0,target.width,target.height);
      }
      
      public static function random(min:uint, numValues:uint) : uint
      {
         return Math.floor(Math.random() * numValues) + min;
      }
      
      public static function clone(source:Object) : *
      {
         var serializer:ByteArray = new ByteArray();
         serializer.writeObject(source);
         serializer.position = 0;
         return serializer.readObject();
      }
      
      public static function serializePath(path:Array) : Array
      {
         var card:GameCard = null;
         var retval:Array = [];
         for each(card in path)
         {
            retval.push({
               "row":card.row,
               "col":card.col,
               "suit":card.suit,
               "type":card.type,
               "burning":card.burning
            });
         }
         return retval;
      }
      
      public static function assert(b:Boolean, msg:String = "") : void
      {
         var fullMsg:String = null;
         if(!b)
         {
            fullMsg = "ASSERTION: " + msg;
            tr(fullMsg);
            throw fullMsg;
         }
      }
      
      public static function listen(source:EventDispatcher, type:String, listener:Function, useCapture:Boolean = false, priority:int = 0, useWeakReference:Boolean = true) : void
      {
         source.addEventListener(type,listener,useCapture,priority,useWeakReference);
      }
      
      public static function addFooterText(parent:DisplayObjectContainer, text:String) : void
      {
         var footer:TextField = new TextField();
         footer.autoSize = TextFieldAutoSize.RIGHT;
         footer.text = text;
         footer.x = Consts.APP_AREA.width - footer.width;
         footer.y = Consts.APP_AREA.height - footer.height;
         parent.addChild(footer);
      }
      
      public static function drawChildOutline(child:DisplayObject, parent:Sprite, color:uint = 16711935) : void
      {
         parent.graphics.lineStyle(1,color);
         parent.graphics.drawRect(child.x,child.y,child.width,child.height);
      }
      
      public static function RGB(red:uint, green:uint, blue:uint) : uint
      {
         return red << 16 | green << 8 | blue;
      }
      
      public static function centerChild(child:DisplayObject, parent:DisplayObject) : void
      {
         child.x = parent.x + (parent.width - child.width) / 2;
         child.y = parent.y + (parent.height - child.height) / 2;
      }
      
      public static function centerChildInRect(child:DisplayObject, rect:Rectangle) : void
      {
         child.x = rect.x + (rect.width - child.width) / 2;
         child.y = rect.y + (rect.height - child.height) / 2;
      }
      
      public static function removeThyself(self:DisplayObject) : void
      {
         self.parent.removeChild(self);
      }
      
      public static function centerChildAtPoint(child:DisplayObject, point:Point) : void
      {
         child.x = point.x - child.width / 2;
         child.y = point.y - child.height / 2;
      }
      
      public static function removeAllChildren(parent:DisplayObjectContainer) : void
      {
         while(parent.numChildren)
         {
            parent.removeChildAt(parent.numChildren - 1);
         }
      }
      
      public static function mapChildrenByName(parent:DisplayObjectContainer, map:Object) : void
      {
         var child:DisplayObject = null;
         var children:uint = uint(parent.numChildren);
         for(var i:uint = 0; i < children; i++)
         {
            child = parent.getChildAt(i);
            if(Boolean(child.name) && child.name.indexOf("instance") == -1)
            {
               map[child.name] = child;
            }
            if(child is DisplayObjectContainer)
            {
               mapChildrenByName(DisplayObjectContainer(child),map);
            }
         }
      }
      
      public static function tr(str:String) : void
      {
         trace("kai:",str);
      }
      
      public static function removeThyselfLater(self:DisplayObject, duration:Number) : void
      {
         TweenMax.delayedCall(duration,removeThyself,[self]);
      }
   }
}

class CONSTRUCTOR_HIDER
{
   
   public function CONSTRUCTOR_HIDER()
   {
      super();
   }
}
