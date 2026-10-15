package com.gaiaonline.games.tiles
{
   import flash.events.Event;
   
   public class TitleScreenEvent extends Event
   {
      
      public static const PLAY:String = "titleScreen.PLAY";
      
      public static const INSTRUCTIONS:String = "titleScreen.INSTRUCTIONS";
      
      public function TitleScreenEvent(type:String)
      {
         super(type);
      }
   }
}

