package
{
   import flash.display.MovieClip;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol100")]
   public dynamic class gameOverDialog extends MovieClip
   {
      
      public var lossMessage:TextField;
      
      public var buttonContainer:MovieClip;
      
      public var container:MovieClip;
      
      public function gameOverDialog()
      {
         super();
         addFrameScript(0,frame1,15,frame16,33,frame34);
      }
      
      internal function frame16() : *
      {
         buttonContainer.visible = true;
      }
      
      internal function frame1() : *
      {
         buttonContainer.visible = false;
      }
      
      internal function frame34() : *
      {
         stop();
      }
   }
}

