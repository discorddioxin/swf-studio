package com.gaiaonline.games.tiles
{
   import flash.events.Event;
   
   public class DialogEvent extends Event
   {
      
      public static const QUIT:String = "DialogEvent.quit";
      
      public static const MORE:String = "DialogEvent.more";
      
      public static const PLAYAGAIN:String = "DialogEvent.playAgain";
      
      public static const CLAIMPRIZES:String = "DialogEvent.claimPrizes";
      
      public function DialogEvent(type:String)
      {
         super(type,false,false);
      }
   }
}

