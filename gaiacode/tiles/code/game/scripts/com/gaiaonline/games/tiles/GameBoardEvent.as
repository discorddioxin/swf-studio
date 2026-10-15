package com.gaiaonline.games.tiles
{
   import flash.events.Event;
   
   public class GameBoardEvent extends Event
   {
      
      public static const WIN_ANIMATION_COMPLETE:String = "winAnimation";
      
      public static const LOSS_ANIMATION_COMPLETE:String = "lossAnimation";
      
      public static const MOVE_ANIMATION_COMPLETE:String = "moveAnimation";
      
      public static const PATH_SIZE_CHANGE:String = "pathSizeChange";
      
      public static const PLAY_BUTTON_PRESSED:String = "playButtonPressed";
      
      public function GameBoardEvent(type:String)
      {
         super(type,false,false);
      }
   }
}

