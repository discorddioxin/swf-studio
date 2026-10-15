package com.gaiaonline.games.tiles
{
   import flash.display.Loader;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.events.MouseEvent;
   import flash.net.URLRequest;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   
   public class DeckPromptThumb extends Sprite
   {
      
      private static var s_colors:Colors;
      
      private var _loader:Loader = new Loader();
      
      private var _label:TextField;
      
      private var _isMovieClip:Boolean;
      
      private var _value:int;
      
      private var _loadedLabelText:String;
      
      public function DeckPromptThumb(value:int, thumbURL:String, title:String, isMovieClip:Boolean)
      {
         super();
         _value = value;
         Utils.listen(_loader.contentLoaderInfo,Event.COMPLETE,completeHandler);
         Utils.listen(_loader.contentLoaderInfo,IOErrorEvent.IO_ERROR,ioErrorHandler);
         _loader.load(new URLRequest(thumbURL));
         _label = AssetManager.inst().newEmbeddedFontTextField(AssetManager.inst().newBoulderTextFormat(15),16608256);
         _label.autoSize = TextFieldAutoSize.CENTER;
         _label.width = 20;
         _label.text = "Loading";
         _label.y = 110;
         _loadedLabelText = title;
         _isMovieClip = isMovieClip;
         this.addChild(_label);
         if(!s_colors)
         {
            s_colors = new Colors();
         }
      }
      
      private function mOver(e:Event) : void
      {
         this.transform.colorTransform = s_colors.over;
      }
      
      private function ioErrorHandler(e:Event) : void
      {
      }
      
      private function mOut(e:Event) : void
      {
         this.transform.colorTransform = s_colors.up;
      }
      
      public function get value() : int
      {
         return _value;
      }
      
      public function get isMovieClip() : Boolean
      {
         return _isMovieClip;
      }
      
      private function completeHandler(e:Event) : void
      {
         _label.text = _loadedLabelText;
         this.addChild(_loader.content);
         this.transform.colorTransform = s_colors.up;
         Utils.listen(this,MouseEvent.MOUSE_OVER,mOver);
         Utils.listen(this,MouseEvent.MOUSE_OUT,mOut);
      }
   }
}

import fl.motion.Color;

class Colors
{
   
   public var up:Color = new Color();
   
   public var over:Color = new Color();
   
   public function Colors()
   {
      super();
      over.setTint(0,0);
      up.setTint(0,0.1);
   }
}
