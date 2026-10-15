package com.gaiaonline.games.tiles
{
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.filters.DropShadowFilter;
   import flash.geom.Point;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   import flash.text.TextFormat;
   import flash.text.TextFormatAlign;
   
   public class TilesButton extends Sprite
   {
      
      private static const s_dropShadow:Array = [new DropShadowFilter(1,45,0,1,0,0)];
      
      private static const TEXTOFFSET:Point = new Point(8,9);
      
      private var _down:Sprite;
      
      private var _mouseOver:Boolean = false;
      
      private var _mouseDown:Boolean = false;
      
      private var _over:Sprite;
      
      private var _up:Sprite;
      
      private var _text:TextField;
      
      public function TilesButton(label:String, up:Sprite, over:Sprite, down:Sprite)
      {
         super();
         this.mouseChildren = false;
         this.buttonMode = true;
         this.useHandCursor = true;
         Utils.listen(this,MouseEvent.ROLL_OUT,onRollOut);
         Utils.listen(this,MouseEvent.ROLL_OVER,onRollOver);
         Utils.listen(this,MouseEvent.MOUSE_DOWN,onMouseDown);
         _up = up;
         _over = over;
         _down = down;
         var tf:TextFormat = AssetManager.inst().newBoulderTextFormat(18);
         tf.align = TextFormatAlign.CENTER;
         _text = AssetManager.inst().newEmbeddedFontTextField(tf,16777215);
         _text.height = 18;
         _text.text = label;
         _text.x = TEXTOFFSET.x;
         _text.y = TEXTOFFSET.y;
         _text.autoSize = TextFieldAutoSize.NONE;
         _text.filters = s_dropShadow;
         this.width = _text.width + 2 * TEXTOFFSET.x;
         addChild(_up);
         addChild(_text);
      }
      
      public function set label(text:String) : void
      {
         _text.text = text;
      }
      
      private function onRollOut(e:Event) : void
      {
         _mouseOver = false;
         setFace(_up);
      }
      
      override public function set width(value:Number) : void
      {
         _up.width = value;
         _down.width = value;
         _over.width = value;
         _text.width = value - 2 * TEXTOFFSET.x;
      }
      
      override public function set height(value:Number) : void
      {
         _up.height = value;
         _down.height = value;
         _over.height = value;
      }
      
      private function onRollOver(e:Event) : void
      {
         _mouseOver = true;
         setFace(_mouseDown ? _down : _over);
      }
      
      private function onClick(e:Event) : void
      {
         GlobalGameEvents.inst().UIClick();
      }
      
      private function onMouseDown(e:Event) : void
      {
         _mouseDown = true;
         setFace(_down);
         Utils.listen(stage,MouseEvent.MOUSE_UP,onMouseUp);
         Utils.listen(stage,Event.MOUSE_LEAVE,onMouseUp);
         Utils.listen(this,MouseEvent.CLICK,onClick);
      }
      
      private function onMouseUp(e:Event) : void
      {
         _mouseDown = false;
         setFace(_mouseOver ? _over : _up);
      }
      
      private function setFace(sprite:Sprite) : void
      {
         removeChildAt(0);
         addChildAt(sprite,0);
      }
   }
}

