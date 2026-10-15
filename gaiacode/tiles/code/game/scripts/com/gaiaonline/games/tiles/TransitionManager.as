package com.gaiaonline.games.tiles
{
   import flash.display.DisplayObject;
   import flash.display.DisplayObjectContainer;
   import flash.display.InteractiveObject;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.MouseEvent;
   import flash.external.ExternalInterface;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   
   public class TransitionManager extends EventDispatcher
   {
      
      private static const DIALOG_CONTAINER_WIDTH:Number = 415;
      
      private var _root:DisplayObjectContainer;
      
      private var _gameBoard:GameBoard;
      
      private var _serverVersion:String = null;
      
      private var _statusScreen:StatusScreen;
      
      private var _deckSelect:DeckPrompt;
      
      private var _controller:ITransitionManagerEventHandler;
      
      private var _btnHelp:InteractiveObject;
      
      public function TransitionManager(root:DisplayObjectContainer, handler:ITransitionManagerEventHandler)
      {
         super();
         _root = root;
         _controller = handler;
      }
      
      private function setStatusScreen(text:String = "") : void
      {
         if(!_statusScreen)
         {
            _statusScreen = new StatusScreen();
         }
         Utils.removeAllChildren(_root);
         _statusScreen.text = text;
         _root.addChild(_statusScreen);
      }
      
      private function gameBoardTextFlyout(text:String, color:uint) : void
      {
         var flyout:TextFlyout = new TextFlyout(color);
         flyout.text = text;
         Utils.centerChildInRect(flyout,Consts.BOARD_PLAY_AREA);
         _gameBoard.parent.addChild(flyout);
         flyout.startTween();
      }
      
      private function toEndLevelDialog(args:Object) : void
      {
         Utils.removeAllChildren(_root);
         _root.addChild(AssetManager.inst().newBackgroundImage());
         var gd:Dialog = new Dialog();
         gd.title = args.title;
         var body:DialogEndLevel = new DialogEndLevel(args.subtext);
         Utils.listen(body,DialogEvent.MORE,onDialogDone);
         Utils.listen(body,DialogEvent.QUIT,onDialogDone);
         gd.body = body;
         var superParent:Sprite = new Sprite();
         var animatedTitle:MovieClip = AssetManager.inst().newAnimatedTitle();
         superParent.addChild(animatedTitle);
         gd.x = (animatedTitle.width - gd.width) / 2;
         gd.y = animatedTitle.height + 5;
         gd.startStarBurstAnimations();
         superParent.addChild(gd);
         Utils.centerChild(superParent,_root);
         _root.addChild(superParent);
         GlobalGameEvents.inst().levelDefeated();
         GlobalGameEvents.inst().gambling();
      }
      
      private function populateScoreBoard(stats:Object) : void
      {
         _gameBoard.scoreBoard.score = stats.score;
         _gameBoard.scoreBoard.tilesNeeded = stats.chainLength;
         _gameBoard.scoreBoard.currentChains = stats.goal - stats.chainsRemaining;
         _gameBoard.scoreBoard.goal = stats.goal;
         _gameBoard.scoreBoard.tickets = stats.tickets;
         _gameBoard.scoreBoard.level = stats.difficultyString + ":" + stats.level;
         if(Boolean(stats.msg) && Boolean(stats.msg.length))
         {
            gameBoardTextFlyout(stats.msg,10085374);
         }
         if(Boolean(stats.warning) && Boolean(stats.warning.length))
         {
            gameBoardTextFlyout(stats.warning,16711680);
         }
      }
      
      public function addNewCards(cards:Array) : void
      {
         Utils.assert(_gameBoard != null);
         _gameBoard.addCards(cards);
         _gameBoard.enabled = true;
      }
      
      public function onLevelStats(stats:Object) : void
      {
         if(_gameBoard)
         {
            populateScoreBoard(stats);
         }
      }
      
      private function onPlay(e:Event) : void
      {
         DisplayObject(e.target).removeEventListener(TitleScreenEvent.PLAY,onPlay);
         _controller.onTitleScreenDismissed();
         GlobalGameEvents.inst().UIClick();
      }
      
      private function onPlayButton(e:Event) : void
      {
         Utils.assert(_gameBoard != null);
         Utils.assert(_btnHelp != null);
         _gameBoard.enabled = false;
         if(_gameBoard.path.length < _gameBoard.scoreBoard.tilesNeeded)
         {
            GlobalGameEvents.inst().warning();
         }
         else
         {
            GlobalGameEvents.inst().UIClick();
         }
         _controller.onPlayPath(_gameBoard.path);
         _gameBoard.animateMove();
         _controller.onBusyAnimating();
      }
      
      private function onAnimationComplete(e:Event) : void
      {
         _controller.onDoneAnimating();
      }
      
      private function onQuit(e:Event) : void
      {
         ExternalInterface.call("window.close");
      }
      
      public function toLoading() : void
      {
         setStatusScreen("Loading");
      }
      
      public function abortAll() : void
      {
         _root.alpha = 0.5;
         _root.mouseChildren = false;
         GlobalGameEvents.inst().abortAll();
      }
      
      private function onHelpButton(e:Event) : void
      {
         _root.addChild(HelpScreen.instance);
      }
      
      private function onDifficultyBeatenPlayAgain(e:Event) : void
      {
         var displayObj:DisplayObjectContainer = DisplayObjectContainer(e.currentTarget);
         displayObj.parent.removeChild(displayObj);
         _controller.onDifficultyBeatenDone();
         GlobalGameEvents.inst().UIClick();
      }
      
      private function toTicketsGrantedDialog(args:Object) : void
      {
         Utils.removeAllChildren(_root);
         _root.addChild(AssetManager.inst().newBackgroundImage());
         var gd:Dialog = new Dialog();
         gd.title = args.title;
         var body:DialogTicketTotal = new DialogTicketTotal(args.subtext,args.tickets);
         gd.body = body;
         Utils.listen(body,DialogEvent.PLAYAGAIN,onDialogDone);
         Utils.listen(body,DialogEvent.CLAIMPRIZES,onNavToShop);
         Utils.listen(body,DialogEvent.QUIT,onQuit);
         gd.startStarBurstAnimations();
         Utils.centerChild(gd,_root);
         _root.addChild(gd);
      }
      
      public function destroyCards(cards:Array) : void
      {
         Utils.assert(_gameBoard != null);
         _gameBoard.destroyCards(cards);
      }
      
      public function toGameBoard(cardArray:Array) : void
      {
         Utils.removeAllChildren(_root);
         _statusScreen = null;
         createGameBoard();
         Utils.assert(_gameBoard != null);
         addNewCards(cardArray);
      }
      
      private function onLossAnimationComplete(e:Event) : void
      {
         _controller.onLossAnimationComplete();
      }
      
      private function onPathSizeChange(e:Event) : void
      {
         Utils.assert(_gameBoard != null && _btnHelp != null);
      }
      
      public function toDeckSelect(decks:Array) : void
      {
         Utils.removeAllChildren(_root);
         _root.addChild(AssetManager.inst().newBackgroundImage());
         if(!_deckSelect)
         {
            _deckSelect = new DeckPrompt(decks);
            Utils.listen(_deckSelect,DeckPromptEvent.SELECT,onDeckSelected);
            if(_serverVersion)
            {
               Utils.addFooterText(_deckSelect,"server: " + _serverVersion);
            }
         }
         _root.addChild(_deckSelect);
      }
      
      private function onLossDialogPlayAgain(e:Event) : void
      {
         _controller.onLossDialogDone(false);
      }
      
      private function onDeckSelected(e:DeckPromptEvent) : void
      {
         _controller.onDeckSelect(e);
         GlobalGameEvents.inst().UIClick();
      }
      
      private function onInstructions(e:Event) : void
      {
         _root.addChild(HelpScreen.instance);
         GlobalGameEvents.inst().UIClick();
      }
      
      public function onGameOver(goldMessage:String) : void
      {
         Utils.assert(_gameBoard != null);
         _gameBoard.enabled = false;
         _gameBoard.animateGameOverBurnToHell();
         GlobalGameEvents.inst().gameOver();
      }
      
      public function toLossDialog() : void
      {
         if(!_gameBoard)
         {
            createGameBoard();
         }
         var dialog:MovieClip = AssetManager.inst().newGameOverDialog();
         dialog.x = 244;
         dialog.y = 220;
         var children:Object = {};
         Utils.mapChildrenByName(dialog,children);
         var btn:DisplayObject = AssetManager.inst().newTilesButton("Play Again");
         var btn2:DisplayObject = AssetManager.inst().newTilesButton("Quit");
         btn2.width = btn.width;
         btn2.x = btn.width + 10;
         var container:DisplayObjectContainer = children.buttonContainer;
         container.addChild(btn);
         container.addChild(btn2);
         container.x += (DIALOG_CONTAINER_WIDTH - container.width) / 2;
         Utils.listen(btn,MouseEvent.CLICK,onLossDialogPlayAgain);
         Utils.listen(btn2,MouseEvent.CLICK,onQuit);
         _root.addChild(dialog);
      }
      
      public function toInitializing() : void
      {
         setStatusScreen("Initializing");
      }
      
      public function toTitleScreen() : void
      {
         Utils.removeAllChildren(_root);
         var title:TitleScreen = new TitleScreen();
         Utils.listen(title,TitleScreenEvent.PLAY,onPlay);
         Utils.listen(title,TitleScreenEvent.INSTRUCTIONS,onInstructions);
         _root.addChild(title);
      }
      
      public function toDifficultyBeaten(message:String) : void
      {
         var dialog:MovieClip = AssetManager.inst().newDifficultyCompleteDialog();
         dialog.x = 250;
         dialog.y = 200;
         var children:Object = {};
         Utils.mapChildrenByName(dialog,children);
         children.winMessage.htmlText = message;
         var btn:DisplayObject = AssetManager.inst().newTilesButton("Play Again");
         var btn2:DisplayObject = AssetManager.inst().newTilesButton("Claim Prizes");
         btn.width = btn2.width;
         btn2.x = btn.width + 10;
         var container:DisplayObjectContainer = children.buttonContainer;
         container.addChild(btn);
         container.addChild(btn2);
         container.x += (DIALOG_CONTAINER_WIDTH - container.width) / 2;
         Utils.listen(btn,MouseEvent.CLICK,onDifficultyBeatenPlayAgain);
         Utils.listen(btn2,MouseEvent.CLICK,onNavToShop);
         _root.addChild(dialog);
      }
      
      public function animateLevelVictory() : void
      {
         _gameBoard.enabled = false;
         _gameBoard.animateLevelVictory();
         _controller.onBusyAnimating();
      }
      
      private function onDialogDone(e:DialogEvent) : void
      {
         _controller.onDialogDone(e.type);
         if(e.type == DialogEvent.MORE)
         {
            GlobalGameEvents.inst().nextLevel();
         }
      }
      
      public function set serverVersion(ver:String) : void
      {
         _serverVersion = ver;
      }
      
      public function toDialog(args:Object) : void
      {
         switch(args.type)
         {
            case Consts.SERVER_DIALOG_TICKET_OFFER:
               toEndLevelDialog(args);
               break;
            case Consts.SERVER_DIALOG_TICKETS_GRANTED:
               toTicketsGrantedDialog(args);
               GlobalGameEvents.inst().grantedTickets();
         }
      }
      
      private function onNavToShop(e:Event) : void
      {
         navigateToURL(new URLRequest(Consts.SHOP_URL),"_blank");
      }
      
      private function createGameBoard() : void
      {
         if(!_btnHelp)
         {
            _btnHelp = InteractiveObject(AssetManager.inst().newHelpButton());
         }
         _btnHelp.x = 495;
         _btnHelp.y = 400;
         _root.addChild(_btnHelp);
         var container:DisplayObjectContainer = AssetManager.inst().newGameBoardContainer();
         _gameBoard = new GameBoard(new GameBoardScoreBoard(container));
         Utils.listen(_gameBoard,GameBoardEvent.LOSS_ANIMATION_COMPLETE,onLossAnimationComplete);
         Utils.listen(_gameBoard,GameBoardEvent.WIN_ANIMATION_COMPLETE,onAnimationComplete);
         Utils.listen(_gameBoard,GameBoardEvent.MOVE_ANIMATION_COMPLETE,onAnimationComplete);
         Utils.listen(_gameBoard,GameBoardEvent.PATH_SIZE_CHANGE,onPathSizeChange);
         Utils.listen(_gameBoard,GameBoardEvent.PLAY_BUTTON_PRESSED,onPlayButton);
         Utils.listen(_btnHelp,MouseEvent.CLICK,onHelpButton);
         container.addChild(_gameBoard);
         _root.addChildAt(container,0);
         GlobalGameEvents.inst().newBoard();
      }
      
      public function setCardsAflame(cards:Array) : void
      {
         Utils.assert(_gameBoard != null);
         _gameBoard.setCardsAflame(cards);
      }
      
      public function toCaptcha(url:String) : void
      {
      }
   }
}

