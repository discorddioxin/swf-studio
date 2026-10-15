package com.gaiaonline.gameFramework.ui
{
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.text.TextFormatAlign;
   
   public class GaiaButtonAsset extends Sprite implements IGaiaButtonAsset
   {
      
      private var BaseButton:Class = GaiaButtonAsset_BaseButton;
      
      public var bg:SimpleButton = null;
      
      private var _label_txt:TextField = null;
      
      public function GaiaButtonAsset()
      {
         super();
         bg = new BaseButton();
         addChild(bg);
         _label_txt = new TextField();
         var _loc1_:TextFormat = new TextFormat(null,12,10053120,true);
         _loc1_.align = TextFormatAlign.CENTER;
         _label_txt.defaultTextFormat = _loc1_;
         _label_txt.width = bg.width;
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

