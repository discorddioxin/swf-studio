package
{
   import flash.display.MovieClip;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol68")]
   public dynamic class difficultyCompleteWindow extends MovieClip
   {
      
      public var buttonContainer:MovieClip;
      
      public var winMessage:TextField;
      
      public function difficultyCompleteWindow()
      {
         super();
         addFrameScript(0,frame1,28,frame29,33,frame34);
      }
      
      internal function frame1() : *
      {
         buttonContainer.visible = false;
      }
      
      internal function frame29() : *
      {
         buttonContainer.visible = true;
      }
      
      internal function frame34() : *
      {
         stop();
      }
   }
}

