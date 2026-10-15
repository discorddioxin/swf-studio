package com.gaiaonline.games.tiles
{
   import flash.display.Sprite;
   
   public class StatusScreen extends Sprite
   {
      
      private var _status:ShadowTextField;
      
      public function StatusScreen()
      {
         super();
         addChild(AssetManager.inst().newBackgroundImage());
         _status = new ShadowTextField(45,16777215,0,4);
         _status.x = 82;
         _status.y = 194;
         addChild(_status);
      }
      
      public function set text(str:String) : void
      {
         _status.text = str;
      }
   }
}

