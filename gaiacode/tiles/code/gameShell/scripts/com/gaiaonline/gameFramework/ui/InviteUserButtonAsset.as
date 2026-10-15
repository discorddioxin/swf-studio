package com.gaiaonline.gameFramework.ui
{
   import flash.display.BlendMode;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.text.TextFormatAlign;
   
   public class InviteUserButtonAsset extends Sprite implements IGaiaButtonAsset
   {
      
      public var bg:SimpleButton = null;
      
      private var _label_txt:TextField = null;
      
      private var InviteFriendButtonBG:Class = InviteUserButtonAsset_InviteFriendButtonBG;
      
      public function InviteUserButtonAsset()
      {
         super();
         drawUI();
      }
      
      public function get label_txt() : TextField
      {
         return _label_txt;
      }
      
      private function drawUI() : void
      {
         bg = new InviteFriendButtonBG();
         bg.blendMode = BlendMode.HARDLIGHT;
         addChild(bg);
         _label_txt = new TextField();
         var _loc1_:TextFormat = new TextFormat("Arial",11,0);
         _loc1_.align = TextFormatAlign.CENTER;
         _label_txt.multiline = true;
         _label_txt.wordWrap = true;
         _label_txt.defaultTextFormat = _loc1_;
         _label_txt.width = 51.8;
         _label_txt.height = 49.5;
         _label_txt.x = 4;
         _label_txt.y = 0;
         addChild(_label_txt);
      }
   }
}

