package com.gaiaonline.games.tiles
{
   public class ClientEvent
   {
      
      public static const READY:String = "eClientReady";
      
      public static const DECK_SELECTED:String = "eDeckSelected";
      
      public static const PERFORM_TURN:String = "ePerformTurn";
      
      public static const GAME_OVER_DISMISSED:String = "eGameOverDismissed";
      
      public static const DIFFICULTY_BEATEN_DISMISSED:String = "eDifficultyBeatenDismissed";
      
      public static const DIALOG_DONE:String = "eDialogDone";
      
      public function ClientEvent()
      {
         super();
      }
   }
}

