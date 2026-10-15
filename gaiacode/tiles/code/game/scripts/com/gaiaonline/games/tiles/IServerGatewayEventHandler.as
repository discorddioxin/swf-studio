package com.gaiaonline.games.tiles
{
   public interface IServerGatewayEventHandler
   {
      
      function onClientCmdSetServerVersion(param1:String) : void;
      
      function onClientCmdSetDifficultyScore(param1:uint) : void;
      
      function onClientCmdShowTurnResult(param1:Array, param2:Array, param3:Array) : void;
      
      function onClientCmdShowGameBoard(param1:Array) : void;
      
      function onClientCmdShowTitle() : void;
      
      function onClientCmdSetLevelStats(param1:Object) : void;
      
      function onClientCmdShowEndLevelAnimation() : void;
      
      function onClientCmdShowGameOver(param1:String) : void;
      
      function onClientCmdSetSuits(param1:uint) : void;
      
      function onClientCmdShowDialog(param1:Object) : void;
      
      function onClientCmdShowDeckSelection(param1:Array) : void;
      
      function onConnectionDeath() : void;
      
      function onClientCmdShowCaptcha(param1:String) : void;
      
      function onClientCmdSetBurnBonus(param1:uint) : void;
      
      function onClientCmdShowDifficultyBeaten(param1:String) : void;
   }
}

