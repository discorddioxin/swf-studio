package com.gaiaonline.games.flowerJong
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol64")]
   public dynamic class starBurst extends MovieClip
   {
      
      public function starBurst()
      {
         super();
         addFrameScript(129,frame130);
      }
      
      internal function frame130() : *
      {
         stop();
      }
   }
}

