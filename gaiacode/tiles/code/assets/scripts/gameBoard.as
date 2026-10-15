package
{
   import flash.display.MovieClip;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol89")]
   public dynamic class gameBoard extends MovieClip
   {
      
      public var chainsNeeded:TextField;
      
      public var tilesNeeded:TextField;
      
      public var gameLevel:TextField;
      
      public var gameScore:TextField;
      
      public var tickets:TextField;
      
      public function gameBoard()
      {
         super();
      }
   }
}

