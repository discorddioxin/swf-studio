package com.gaiaonline.gameFramework.chat
{
   import com.gaiaonline.gameFramework.ui.IGaiaButtonAsset;
   import flash.display.BlendMode;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.text.TextFormatAlign;
   
   public class ChatButtonAsset extends Sprite implements IGaiaButtonAsset
   {
      
      public var bg:SimpleButton = null;
      
      private var _label_txt:TextField = null;
      
      private var ChatButton:Class = ChatButtonAsset_ChatButton;
      
      public function ChatButtonAsset()
      {
         super();
         bg = new ChatButton();
         bg.blendMode = BlendMode.HARDLIGHT;
         addChild(bg);
         _label_txt = new TextField();
         _label_txt.width = 104;
         _label_txt.height = 16.2;
         _label_txt.x = 3;
         _label_txt.y = 2.8;
         _label_txt.multiline = true;
         var _loc1_:TextFormat = new TextFormat("Arial",11,16777215);
         _loc1_.align = TextFormatAlign.CENTER;
         _loc1_.kerning = 0.5;
         _label_txt.defaultTextFormat = _loc1_;
         addChild(_label_txt);
      }
      
      public function get label_txt() : TextField
      {
         return _label_txt;
      }
   }
}

