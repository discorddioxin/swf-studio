package com.gaiaonline.games.tiles
{
   import flash.display.Bitmap;
   import flash.display.DisplayObject;
   import flash.display.Loader;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.IOErrorEvent;
   import flash.filters.BevelFilter;
   import flash.net.URLRequest;
   import flash.text.AntiAliasType;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   import flash.text.TextFormat;
   
   public class AssetManager extends EventDispatcher
   {
      
      private static var s_instance:AssetManager;
      
      public static const ASSET_URL:String = "games/tiles/assets/";
      
      private var GameCardRockBlock:Class;
      
      private var DeckDownScrollButton:Class;
      
      private var GenericButtonDown:Class;
      
      private var GameCardBorder:Class;
      
      private var StartButton:Class;
      
      private var _backgroundImageSingleton:Bitmap;
      
      private var DeckSelect:Class;
      
      private var GameCardBurningBorderBottom:Class;
      
      private var _deckAssets:Object = {};
      
      private var GameCardForeground:Class;
      
      private var SimpleCheckButton:Class;
      
      private var GameCardImmolation:Class;
      
      private var GenericButtonOver:Class;
      
      private var GaiaTicket:Class;
      
      private var CaptchaDialog:Class;
      
      private var GenericButtonUp:Class;
      
      private var AnimatedTitle:Class;
      
      private var GenericDialogBG:Class;
      
      private var _loaders:Array = [];
      
      private var _as3_doesnt_use1:Class = AssetManager__as3_doesnt_use1;
      
      private var _as3_doesnt_use2:Class = AssetManager__as3_doesnt_use2;
      
      private var GameCardHighlight:Class;
      
      private var DifficultyCompleteDialog:Class;
      
      private var GameCardBurningBorder:Class;
      
      private var SimpleXButton:Class;
      
      private var PlayButton:Class;
      
      private var BackgroundImage:Class = AssetManager_BackgroundImage;
      
      private var GameCardWildcardBlock:Class;
      
      private var DeckUpScrollButton:Class;
      
      private var Logo:Class;
      
      private var BackgroundBevel:Class;
      
      private var StarBurst:Class;
      
      private var GameBoardContainer:Class;
      
      private var GameOverDialog:Class;
      
      private var GameCardMysteryBlock:Class;
      
      private var _deckIsMovieClip:Boolean;
      
      private var DragHint:Class;
      
      public function AssetManager(hide:CONSTRUCTOR_HIDER)
      {
         super();
         Utils.assert(hide != null,"AssetManager is a singleton, use AssetManager.instance()");
         Utils.tr("AssetManager loading asset swf");
         load(ASSET_URL + "assets.swf",onLoadedAssets,onErrorLoadingAssets);
      }
      
      public static function inst() : AssetManager
      {
         if(!s_instance)
         {
            s_instance = new AssetManager(new CONSTRUCTOR_HIDER());
         }
         return s_instance;
      }
      
      private static function getClass(e:Event, symbol:String) : Class
      {
         return e.target.applicationDomain.getDefinition(symbol) as Class;
      }
      
      public function newGameCardBurningBorder() : Sprite
      {
         return new GameCardBurningBorder();
      }
      
      private function onErrorLoadingAssets(e:IOErrorEvent) : void
      {
         Utils.tr("ERROR loading assets " + e);
      }
      
      public function newBackgroundImage() : Bitmap
      {
         if(!_backgroundImageSingleton)
         {
            _backgroundImageSingleton = new BackgroundImage();
         }
         return _backgroundImageSingleton;
      }
      
      public function get deckIsMovieClip() : Boolean
      {
         return _deckIsMovieClip;
      }
      
      public function newStarBurst() : Sprite
      {
         var sb:Sprite = new StarBurst();
         sb.mouseEnabled = false;
         sb.mouseChildren = false;
         return sb;
      }
      
      public function newEmbeddedFontTextField(fmt:TextFormat, color:uint) : TextField
      {
         var tf:TextField = new TextField();
         tf.selectable = false;
         tf.embedFonts = true;
         tf.textColor = color;
         tf.antiAliasType = AntiAliasType.ADVANCED;
         tf.autoSize = TextFieldAutoSize.LEFT;
         tf.defaultTextFormat = fmt;
         return tf;
      }
      
      public function newBackgroundBevel() : Sprite
      {
         return new BackgroundBevel();
      }
      
      public function newDifficultyCompleteDialog() : MovieClip
      {
         return new DifficultyCompleteDialog();
      }
      
      public function newTilesButton(text:String) : Sprite
      {
         return new TilesButton(text,new GenericButtonUp(),new GenericButtonOver(),new GenericButtonDown());
      }
      
      public function newDeckUpScrollButton() : DisplayObject
      {
         return new DeckUpScrollButton();
      }
      
      private function onLoadedAssets(e:Event) : void
      {
         Utils.tr("AssetManager.onLoadedAssets");
         AnimatedTitle = getClass(e,"animatedTitle");
         BackgroundBevel = getClass(e,"backgroundBevel");
         DeckDownScrollButton = getClass(e,"downScrollButton");
         DeckSelect = getClass(e,"deckSelect");
         DeckUpScrollButton = getClass(e,"upScrollButton");
         DifficultyCompleteDialog = getClass(e,"difficultyCompleteWindow");
         DragHint = getClass(e,"dragHint");
         GaiaTicket = getClass(e,"gaiaTicket");
         GameBoardContainer = getClass(e,"gameBoard");
         GameCardHighlight = getClass(e,"gameCardHighlight");
         GameCardBorder = getClass(e,"borderToColor");
         GameCardBurningBorder = getClass(e,"borderToBurn");
         GameCardBurningBorderBottom = getClass(e,"borderToBurnBottom");
         GameCardImmolation = getClass(e,"fireAnimation");
         GameCardMysteryBlock = getClass(e,"mysteryBlock");
         GameCardRockBlock = getClass(e,"rockBlock");
         GameCardWildcardBlock = getClass(e,"wildcardBlock");
         GameOverDialog = getClass(e,"gameOverDialog");
         GenericButtonDown = getClass(e,"genericButtonDown");
         GenericButtonOver = getClass(e,"genericButtonOver");
         GenericButtonUp = getClass(e,"genericButtonUp");
         GenericDialogBG = getClass(e,"genericDialog");
         Logo = getClass(e,"logo");
         PlayButton = getClass(e,"submitButton");
         SimpleCheckButton = getClass(e,"simpleCheckButton");
         SimpleXButton = getClass(e,"simpleXButton");
         StartButton = getClass(e,"startButton");
         StarBurst = getClass(e,"starBurst");
         dispatchEvent(new Event(Event.COMPLETE));
      }
      
      public function newLogo() : Sprite
      {
         return new Logo();
      }
      
      public function newGameCardRock() : Sprite
      {
         return new GameCardRockBlock();
      }
      
      public function newGameCardForegroundSuit(suit:int) : Sprite
      {
         return getGameCardForegroundAsset("suit" + (suit + 1));
      }
      
      public function newStartButton() : DisplayObject
      {
         return new StartButton();
      }
      
      public function newBoulderThinTextFormat(size:Number) : TextFormat
      {
         var retval:TextFormat = new TextFormat();
         retval.font = "embeddedBoulderThin";
         retval.size = size;
         return retval;
      }
      
      public function newGameCardBurningBorderBottom() : Sprite
      {
         return new GameCardBurningBorderBottom();
      }
      
      public function newBoulderTextFormat(size:Number) : TextFormat
      {
         var retval:TextFormat = new TextFormat();
         retval.font = "embeddedBoulder";
         retval.size = size;
         return retval;
      }
      
      public function newHelpButton() : DisplayObject
      {
         return new PlayButton();
      }
      
      private function onLoadedDeck(e:Event) : void
      {
         _deckAssets.applicationDomain = e.target.applicationDomain;
         _deckAssets.assetLookup = {};
         try
         {
            GameCardForeground = getClass(e,"deck");
         }
         catch(e:Error)
         {
            Utils.assert(!_deckIsMovieClip,"Deck isn\'t marked as the correct type");
         }
         dispatchEvent(new Event(Event.COMPLETE));
      }
      
      public function newGameOverDialog() : MovieClip
      {
         return new GameOverDialog();
      }
      
      public function newSimpleCheckButton() : DisplayObject
      {
         return new SimpleCheckButton();
      }
      
      public function newDragHint() : MovieClip
      {
         return new DragHint();
      }
      
      public function newCaptchaDialog() : MovieClip
      {
         return new CaptchaDialog();
      }
      
      public function newGameBoardContainer() : Sprite
      {
         return new GameBoardContainer();
      }
      
      public function isGameCardHighlight(obj:DisplayObject) : Boolean
      {
         return obj is GameCardHighlight;
      }
      
      public function newGameCardForegroundType(type:int) : Sprite
      {
         return getGameCardForegroundAsset("type" + (type + 1));
      }
      
      public function loadDeck(strURL:String, deckIsMovieClip:Boolean) : void
      {
         load(strURL,onLoadedDeck,onErrorLoadingAssets);
         _deckIsMovieClip = deckIsMovieClip;
      }
      
      public function newAnimatedTitle() : MovieClip
      {
         return new AnimatedTitle();
      }
      
      public function newDeckDownScrollButton() : DisplayObject
      {
         return new DeckDownScrollButton();
      }
      
      private function getGameCardForegroundAsset(name:String) : Sprite
      {
         if(!_deckAssets.assetLookup[name])
         {
            _deckAssets.assetLookup[name] = _deckAssets.applicationDomain.getDefinition(name) as Class;
         }
         var cls:Class = _deckAssets.assetLookup[name];
         return new cls();
      }
      
      public function newGameCardBorder() : Sprite
      {
         return new GameCardBorder();
      }
      
      public function newGenericDialogBG() : Sprite
      {
         var bg:Sprite = new GenericDialogBG();
         bg.filters = [new BevelFilter()];
         return bg;
      }
      
      public function newGameCardForeground() : Sprite
      {
         return new GameCardForeground();
      }
      
      public function newGameCardImmolation() : Sprite
      {
         return new GameCardImmolation();
      }
      
      public function newDeckSelect() : Sprite
      {
         return new DeckSelect();
      }
      
      public function newGaiaTicket() : Sprite
      {
         return new GaiaTicket();
      }
      
      private function load(strURL:String, callback:Function, error:Function) : void
      {
         var loader:Loader = new Loader();
         Utils.listen(loader.contentLoaderInfo,Event.COMPLETE,callback);
         Utils.listen(loader.contentLoaderInfo,IOErrorEvent.IO_ERROR,error);
         loader.load(new URLRequest(strURL));
         _loaders.push(loader);
      }
      
      public function newGameCardWildcard() : Sprite
      {
         return new GameCardWildcardBlock();
      }
      
      public function newGameCardHighlight() : Sprite
      {
         return new GameCardHighlight();
      }
      
      public function newSimpleXButton() : DisplayObject
      {
         return new SimpleXButton();
      }
      
      public function newGameCardMystery() : Sprite
      {
         return new GameCardMysteryBlock();
      }
   }
}

final class CONSTRUCTOR_HIDER
{
   
   public function CONSTRUCTOR_HIDER()
   {
      super();
   }
}
