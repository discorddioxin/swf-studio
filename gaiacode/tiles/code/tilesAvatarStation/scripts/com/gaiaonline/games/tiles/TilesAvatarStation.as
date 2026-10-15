package com.gaiaonline.games.tiles
{
   import com.gaiaonline.gameFramework.avatar.*;
   import flash.display.*;
   import flash.text.*;
   
   public class TilesAvatarStation extends AvatarStation
   {
      
      public var levelTxt:TextField;
      
      public var bubble:MovieClip;
      
      public var scoreTxt:TextField;
      
      public function TilesAvatarStation()
      {
         addFrameScript(0,frame1,2,frame3,6,frame7);
         super();
         clear();
      }
      
      public function dTrace(param1:String) : void
      {
         var _loc2_:String = null;
         _loc2_ = "[TileMatchAvatarStation]";
         trace(_loc2_ + param1);
      }
      
      override public function clear() : void
      {
         super.clear();
         levelTxt.text = "";
         scoreTxt.text = "";
      }
      
      internal function frame3() : *
      {
         stop();
      }
      
      internal function frame7() : *
      {
         stop();
      }
      
      internal function frame1() : *
      {
         stop();
      }
      
      public function update(param1:Object) : void
      {
         var _loc2_:MovieClip = null;
         if(param1.levelNum)
         {
            levelTxt.text = param1.levelNum;
         }
         scoreTxt.text = param1.score ? param1.score : "0";
         if(param1.animation)
         {
            _loc2_ = bubble.getChildByName(param1.animation) as MovieClip;
            if(_loc2_)
            {
               _loc2_.scaleX = 0.23;
               _loc2_.scaleY = 0.23;
               _loc2_.play();
            }
         }
      }
   }
}

