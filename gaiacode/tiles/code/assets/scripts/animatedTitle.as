package
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol101")]
   public dynamic class animatedTitle extends MovieClip
   {
      
      public function animatedTitle()
      {
         super();
         addFrameScript(33,frame34);
      }
      
      internal function frame34() : *
      {
         stop();
      }
   }
}

