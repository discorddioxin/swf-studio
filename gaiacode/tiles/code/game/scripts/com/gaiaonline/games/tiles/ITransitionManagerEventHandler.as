package com.gaiaonline.games.tiles
{
   public interface ITransitionManagerEventHandler
   {
      
      function onDifficultyBeatenDone() : void;
      
      function onTitleScreenDismissed() : void;
      
      function onDeckSelect(param1:DeckPromptEvent) : void;
      
      function onBusyAnimating() : void;
      
      function onPlayPath(param1:Array) : void;
      
      function onDialogDone(param1:Object) : void;
      
      function onLossAnimationComplete() : void;
      
      function onLossDialogDone(param1:Boolean) : void;
      
      function onDoneAnimating() : void;
   }
}

