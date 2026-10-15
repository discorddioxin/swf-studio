package
{
   import com.gaiaonline.gameFramework.shell.IGameShell;
   import com.gaiaonline.gameFramework.tracking.ITracking;
   import com.gaiaonline.gameFramework.ui.IShellUi;
   import com.gaiaonline.games.IGaiaGame;
   import com.gaiaonline.games.tiles.AssetManager;
   import com.gaiaonline.games.tiles.Consts;
   import com.gaiaonline.games.tiles.DeckPromptEvent;
   import com.gaiaonline.games.tiles.GlobalGameEvents;
   import com.gaiaonline.games.tiles.IServerGatewayEventHandler;
   import com.gaiaonline.games.tiles.ITransitionManagerEventHandler;
   import com.gaiaonline.games.tiles.ServerGateway;
   import com.gaiaonline.games.tiles.TransitionManager;
   import com.gaiaonline.games.tiles.Utils;
   import flash.display.Sprite;
   import flash.events.Event;
   
   public class tiles extends Sprite implements IGaiaGame, ITransitionManagerEventHandler, IServerGatewayEventHandler
   {
      
      private var _tracking:ITracking;
      
      private var _fakeServer:Boolean = false;
      
      private var _transitionManager:TransitionManager;
      
      private var _assetsReady:Boolean = false;
      
      private var _shell:IShellUi;
      
      private var _loadingDeck:DeckPromptEvent;
      
      private var _serverReady:Boolean = false;
      
      private var _server:ServerGateway;
      
      public function tiles()
      {
         super();
         Utils.tr("constructing tiles class, version " + Consts.VERSION);
         Utils.listen(this,Event.ADDED_TO_STAGE,onAddedToStage);
         Utils.listen(AssetManager.inst(),Event.COMPLETE,onAssetsLoaded);
         _transitionManager = new TransitionManager(this,this);
      }
      
      public function onClientCmdShowDifficultyBeaten(message:String) : void
      {
         _transitionManager.toDifficultyBeaten(message);
         track("victory");
      }
      
      public function onClientCmdSetLevelStats(stats:Object) : void
      {
         _transitionManager.onLevelStats(stats);
      }
      
      public function init(shell:IGameShell) : void
      {
         Utils.tr("IGaiaGame::init(...)");
         Utils.assert(!_server,"gateway already initialized?  Is this the stand-alone mode connecting to the server?");
         GlobalGameEvents.inst().setSoundController(shell.soundController);
         GlobalGameEvents.inst().newBoard();
         _shell = shell.shellUi;
         _tracking = shell.tracking;
         if(_tracking)
         {
            _tracking.appID = "5288";
         }
         _server = new ServerGateway(shell,this,_fakeServer);
         if(!_fakeServer)
         {
            _server.fetchShopURL();
         }
         _serverReady = true;
         startIfReady();
      }
      
      public function onClientCmdShowDialog(args:Object) : void
      {
         _transitionManager.toDialog(args);
         if(args.type == Consts.SERVER_DIALOG_TICKETS_GRANTED)
         {
            track("chicken");
         }
      }
      
      private function onAddedToStage(e:Event) : void
      {
      }
      
      public function onTitleScreenDismissed() : void
      {
         _server.clientEventReady();
      }
      
      public function onClientCmdShowGameBoard(cards:Array) : void
      {
         _transitionManager.toGameBoard(cards);
      }
      
      public function onDifficultyBeatenDone() : void
      {
         _server.clientEventGameBeatenDismissed();
      }
      
      public function onDialogDone(result:Object) : void
      {
         _server.clientEventDialogDone(result);
      }
      
      public function onClientCmdSetSuits(suits:uint) : void
      {
         Consts.CARD_SUITS = suits;
      }
      
      public function onLossDialogDone(quit:Boolean) : void
      {
         _server.clientEventGameOverDismissed(quit);
      }
      
      public function onClientCmdShowEndLevelAnimation() : void
      {
         _transitionManager.animateLevelVictory();
      }
      
      public function onClientCmdSetBurnBonus(m:uint) : void
      {
         Consts.BURN_BONUS_MULTIPLIER = m;
      }
      
      public function onClientCmdSetServerVersion(version:String) : void
      {
         _transitionManager.serverVersion = version;
      }
      
      public function onClientCmdShowTurnResult(destroyCards:Array, aflameCards:Array, newCards:Array) : void
      {
         _transitionManager.destroyCards(destroyCards);
         _transitionManager.addNewCards(newCards);
         _transitionManager.setCardsAflame(aflameCards);
      }
      
      private function track(event:String) : void
      {
         if(_tracking)
         {
            _tracking.track(event);
         }
      }
      
      private function onDeckLoaded(e:Event) : void
      {
         AssetManager.inst().removeEventListener(Event.COMPLETE,onDeckLoaded);
         Utils.assert(_loadingDeck != null,"_loadingDeck out of sync");
         if(_server)
         {
            _server.clientEventDeckSelected(_loadingDeck.index,_loadingDeck._hackDeckXML);
         }
         _loadingDeck = null;
      }
      
      private function startIfReady() : void
      {
         if(_assetsReady && _serverReady)
         {
            _transitionManager.toTitleScreen();
         }
      }
      
      public function onClientCmdShowCaptcha(url:String) : void
      {
         _shell.createDialogueCaptcha();
      }
      
      public function onBusyAnimating() : void
      {
         _server.PauseIncomingCommands();
      }
      
      public function onConnectionDeath() : void
      {
         _transitionManager.abortAll();
         _shell.createStandardDialogue("Server disconnected","Please reload the page to continue",{"permanent":true});
      }
      
      public function onLossAnimationComplete() : void
      {
         _transitionManager.toLossDialog();
      }
      
      public function onDeckSelect(e:DeckPromptEvent) : void
      {
         _loadingDeck = e;
         Utils.listen(AssetManager.inst(),Event.COMPLETE,onDeckLoaded);
         AssetManager.inst().loadDeck(e.url,e.isMovieClip);
         track("deck" + e.index);
      }
      
      public function onDoneAnimating() : void
      {
         _server.ResumeIncomingCommands();
      }
      
      private function onAssetsLoaded(e:Event) : void
      {
         AssetManager.inst().removeEventListener(Event.COMPLETE,onAssetsLoaded);
         _assetsReady = true;
         startIfReady();
      }
      
      public function onClientCmdShowTitle() : void
      {
         _transitionManager.toTitleScreen();
      }
      
      public function onClientCmdShowGameOver(message:String) : void
      {
         _transitionManager.onGameOver(message);
         track("loss");
      }
      
      public function onPlayPath(path:Array) : void
      {
         _server.clientEventPerformTurn(path);
      }
      
      public function onClientCmdShowDeckSelection(decks:Array) : void
      {
         _transitionManager.toDeckSelect(decks);
      }
      
      public function onClientCmdSetDifficultyScore(s:uint) : void
      {
         Consts.CARD_SCORE = s;
      }
   }
}

