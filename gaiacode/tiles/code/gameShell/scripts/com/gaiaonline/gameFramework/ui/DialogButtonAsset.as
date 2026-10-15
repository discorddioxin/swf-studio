package com.gaiaonline.gameFramework.ui
{
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.text.TextFormatAlign;
   
   public class DialogButtonAsset extends Sprite implements IGaiaButtonAsset
   {
      
      protected var BtnBG:Class = DialogButtonAsset_BtnBG;
      
      public var bg:SimpleButton = null;
      
      private var _label_txt:TextField = null;
      
      public function DialogButtonAsset()
      {
         super();
         bg = new BtnBG();
         addChild(bg);
         _label_txt = new TextField();
         var _loc1_:TextFormat = new TextFormat(null,15,0);
         _loc1_.align = TextFormatAlign.CENTER;
         _label_txt.defaultTextFormat = _loc1_;
         _label_txt.width = bg.width;
         _label_txt.y = 5;
         addChild(_label_txt);
      }
      
      public function get label_txt() : TextField
      {
         return _label_txt;
      }
      
      override public function set width(param1:Number) : void
      {
         super.width = param1;
         bg.width = param1;
         _label_txt.width = param1;
      }
   }
}

