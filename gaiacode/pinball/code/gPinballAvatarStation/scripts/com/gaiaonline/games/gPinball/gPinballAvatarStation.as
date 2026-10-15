package com.gaiaonline.games.gPinball
{
   import com.gaiaonline.gameFramework.avatar.*;
   import flash.text.*;
   
   public class gPinballAvatarStation extends AvatarStation
   {
      
      public var levelTxt:TextField;
      
      public var scoreTxt:TextField;
      
      public function gPinballAvatarStation()
      {
         addFrameScript(0,frame1,2,frame3,6,frame7);
         super();
      }
      
      public function dTrace(param1:String) : void
      {
         var _loc2_:String = null;
         _loc2_ = "[gPinballAvatarStation]";
         trace(_loc2_ + param1);
      }
      
      override public function clear() : void
      {
         super.clear();
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
         if(param1.score != null)
         {
            scoreTxt.text = param1.score;
         }
      }
   }
}

