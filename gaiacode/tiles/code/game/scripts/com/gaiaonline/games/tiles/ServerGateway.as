package com.gaiaonline.games.tiles
{
   import com.gaiaonline.gameFramework.shell.IGameShell;
   import com.gaiaonline.gameFramework.util.UrlUtil;
   import com.gaiaonline.gateway.IGaiaGateway;
   import com.gaiaonline.gateway.events.GaiaFunctionEvent;
   import com.gaiaonline.gsi.GSIEvent;
   import com.gaiaonline.gsi.GSIGateway;
   import com.gaiaonline.serializers.PHPSerializer;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.IOErrorEvent;
   
   public class ServerGateway extends EventDispatcher
   {
      
      private var _gateway:IGaiaGateway;
      
      private var _pauseRefCount:uint = 0;
      
      private var _embeddedServerArg:Boolean;
      
      private var _client:IServerGatewayEventHandler;
      
      private var _queuedCommands:Array = [];
      
      private var _gsi:GSIGateway;
      
      public function ServerGateway(shell:IGameShell, handler:IServerGatewayEventHandler, embeddedServerArg:Boolean)
      {
         super();
         Utils.tr("ServerGateway constructor");
         _gateway = shell.serverGateway;
         _client = handler;
         _embeddedServerArg = embeddedServerArg;
         _gateway.addEventListener(Event.CLOSE,onServerClose);
         _gateway.addEventListener("timeout",onServerClose);
         _gateway.addEventListener(GaiaFunctionEvent.FUNCTION_CALL,onClientCommand);
      }
      
      private function onShopURL(e:GSIEvent) : void
      {
         var pair:String = null;
         var values:Array = null;
         var urlComponents:Array = null;
         for each(pair in e.gsiData)
         {
            values = pair.split("|");
            if(values[0] == "shop_backalleybargains")
            {
               urlComponents = values[1].split("?key=");
               Consts.SHOP_URL = urlComponents[0] + "?key=" + Consts.SHOP_KEY;
               break;
            }
         }
         _gsi = null;
      }
      
      public function PauseIncomingCommands() : void
      {
         Utils.tr("Pausing client commands: " + ++_pauseRefCount);
      }
      
      private function onShopURLIOError(e:IOErrorEvent) : void
      {
         trace("shop URL error:",e);
         _gsi = null;
      }
      
      private function executeClientCommand(data:Object) : void
      {
         var args:* = _embeddedServerArg ? data.args[0] : data.args;
         Utils.tr("onClientCommand:" + data.name + " args:" + args);
         switch(data.name)
         {
            case ClientCommand.SET_SERVER_VERSION:
               _client.onClientCmdSetServerVersion(args);
               break;
            case ClientCommand.SHOW_TITLE:
               _client.onClientCmdShowTitle();
               break;
            case ClientCommand.SHOW_DECK_SELECTION:
               _client.onClientCmdShowDeckSelection(args);
               break;
            case ClientCommand.SHOW_GAME_BOARD:
               _client.onClientCmdSetSuits(args[ClientCommand.SET_NUM_SUITS]);
               _client.onClientCmdShowGameBoard(args[ClientCommand.ADD_NEW_CARDS]);
               _client.onClientCmdSetBurnBonus(args[ClientCommand.SET_BURN_BONUS]);
               _client.onClientCmdSetDifficultyScore(args[ClientCommand.SET_CARD_SCORE]);
               break;
            case ClientCommand.SET_LEVEL_STATS:
               _client.onClientCmdSetLevelStats(args);
               break;
            case ClientCommand.SHOW_TURN_RESULT:
               _client.onClientCmdShowTurnResult(args.cDestroyCards,args.cSetCardsAflame,args.cAddNewCards);
               break;
            case ClientCommand.SHOW_GAME_OVER:
               _client.onClientCmdShowGameOver(args);
               break;
            case ClientCommand.SHOW_DIFFICULTY_BEATEN:
               _client.onClientCmdShowDifficultyBeaten(args);
               break;
            case ClientCommand.SHOW_CAPTCHA:
               _client.onClientCmdShowCaptcha(args);
               break;
            case ClientCommand.SHOW_END_LEVEL_ANIMATION:
               _client.onClientCmdShowEndLevelAnimation();
               break;
            case ClientCommand.SHOW_DIALOG:
               _client.onClientCmdShowDialog(args);
               break;
            case "updateGameStatus":
               break;
            default:
               Utils.tr("UNHANDLED " + data.name);
         }
      }
      
      private function onServerClose(e:Event) : void
      {
         Utils.tr("onServerClose");
         _client.onConnectionDeath();
      }
      
      public function clientEventDialogDone(result:Object) : void
      {
         _gateway.call(ClientEvent.DIALOG_DONE,result);
      }
      
      public function clientEventDeckSelected(deckIndex:uint, hackXML:Object) : void
      {
         _gateway.call(ClientEvent.DECK_SELECTED,deckIndex,hackXML);
      }
      
      public function clientEventReady() : void
      {
         _gateway.call(ClientEvent.READY);
      }
      
      private function onClientCommand(e:GaiaFunctionEvent) : void
      {
         if(_pauseRefCount)
         {
            _queuedCommands.push(e.data);
         }
         else
         {
            executeClientCommand(e.data);
         }
      }
      
      public function clientEventGameOverDismissed(quit:Boolean) : void
      {
         _gateway.call(ClientEvent.GAME_OVER_DISMISSED,quit);
      }
      
      public function clientEventGameBeatenDismissed() : void
      {
         _gateway.call(ClientEvent.DIFFICULTY_BEATEN_DISMISSED);
      }
      
      private function onShopURLError(e:GSIEvent) : void
      {
         trace("shop URL error:",e);
         _gsi = null;
      }
      
      public function clientEventPerformTurn(path:Array) : void
      {
         _gateway.call(ClientEvent.PERFORM_TURN,Utils.serializePath(path));
      }
      
      public function ResumeIncomingCommands() : void
      {
         Utils.assert(_pauseRefCount > 0,"ServerGateway command queue borked");
         Utils.tr("Resuming client commands on 0: " + --_pauseRefCount);
         while(!_pauseRefCount && Boolean(_queuedCommands.length))
         {
            executeClientCommand(_queuedCommands.shift());
         }
      }
      
      public function fetchShopURL() : void
      {
         _gsi = new GSIGateway(UrlUtil.getGsiServerSubdomain());
         _gsi.serializerClass = PHPSerializer;
         Utils.listen(_gsi,GSIEvent.LOADED,onShopURL);
         Utils.listen(_gsi,GSIEvent.ERROR,onShopURLError);
         Utils.listen(_gsi,IOErrorEvent.IO_ERROR,onShopURLIOError);
         _gsi.invoke(7012);
      }
   }
}

