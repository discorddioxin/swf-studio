package hObjects
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol355")]
   public dynamic class AllImps extends MovieClip
   {
      
      public var imp:MovieClip;
      
      public function AllImps()
      {
         super();
         addFrameScript(0,this.frame1);
      }
      
      internal function frame1() : *
      {
         stop();
      }
   }
}

