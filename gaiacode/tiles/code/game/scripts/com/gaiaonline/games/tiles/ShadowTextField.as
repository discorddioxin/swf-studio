package com.gaiaonline.games.tiles
{
   import flash.display.Sprite;
   import flash.text.TextField;
   import flash.text.TextFormat;
   
   public class ShadowTextField extends Sprite
   {
      
      private var _main:TextField;
      
      private var _shadow:TextField;
      
      public function ShadowTextField(fontSize:Number, color:uint, xDistance:uint, yDistance:uint)
      {
         super();
         var fmt:TextFormat = AssetManager.inst().newBoulderTextFormat(fontSize);
         _main = AssetManager.inst().newEmbeddedFontTextField(fmt,color);
         _shadow = AssetManager.inst().newEmbeddedFontTextField(fmt,0);
         _shadow.x = xDistance;
         _shadow.y = yDistance;
         this.addChild(_shadow);
         this.addChild(_main);
      }
      
      public function set text(str:String) : void
      {
         _shadow.text = str;
         _main.text = str;
      }
   }
}

