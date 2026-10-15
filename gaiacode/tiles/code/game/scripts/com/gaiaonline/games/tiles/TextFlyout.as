package com.gaiaonline.games.tiles
{
   import gs.TweenLite;
   import gs.easing.Elastic;
   
   public class TextFlyout extends ShadowTextField
   {
      
      public function TextFlyout(color:uint = 10085374)
      {
         super(37,color,2,2);
         this.mouseEnabled = false;
      }
      
      public function startTween(wait:Number = 3) : void
      {
         TweenLite.from(this,1,{
            "scaleX":0.5,
            "scaleY":0.5,
            "alpha":0,
            "ease":Elastic.easeInOut,
            "overwrite":false
         });
         TweenLite.to(this,1,{
            "scaleX":2,
            "scaleY":2,
            "alpha":0,
            "ease":Elastic.easeInOut,
            "delay":wait,
            "overwrite":false,
            "onComplete":removeMyself
         });
      }
      
      private function removeMyself() : void
      {
         this.parent.removeChild(this);
      }
   }
}

