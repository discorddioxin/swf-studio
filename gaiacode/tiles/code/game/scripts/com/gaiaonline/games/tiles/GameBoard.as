package com.gaiaonline.games.tiles
{
   import fl.motion.Color;
   import flash.display.DisplayObject;
   import flash.display.InteractiveObject;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.geom.Point;
   import gs.TweenMax;
   import gs.easing.Back;
   import gs.easing.Bounce;
   import gs.easing.Circ;
   
   public class GameBoard extends Sprite
   {
      
      private static const MINIBUTTON_SCALE:Number = 0.5;
      
      private static const MINIBUTTON_ALPHA:Number = 0.9;
      
      private static const SCORE_ANIM_DURATION:Number = 2;
      
      private static const s_score:Point = new Point(550,30);
      
      private static const CARD_ANIM_INTERVAL:Number = 0.1;
      
      private static const CARD_ANIM_SCALE:Number = 1.5;
      
      private static const CARD_ANIM_SCALE_FAIL:Number = 0.25;
      
      private static const CARD_SCALE_DURATION:Number = 1;
      
      private static const CARD_ANIM_MOVE_TO:Point = new Point(300,800);
      
      private static const CARD_MOVE_TO_DURATION:Number = 1.6;
      
      private static const CARD_MOVE_TO_DURATION_FAIL:Number = 0.4;
      
      private static const CARD_MOVE_TO_DELAY:Number = 0.3;
      
      private static const CARD_ROTATE_DELAY:Number = 0.5;
      
      private static const COLOR_START:uint = 100;
      
      private static const COLOR_REMAINDER:uint = 255 - COLOR_START;
      
      private static const BIT_SHIFTS:Array = [16,8,0];
      
      private var _path:Array = [];
      
      private var _highlightRing:MovieClip = MovieClip(AssetManager.inst().newGameCardHighlight());
      
      private var _scoreBoard:GameBoardScoreBoard;
      
      private var _miniPlayUI:Sprite;
      
      private var _dragging:Boolean = false;
      
      private var _pathColor:Color = new Color();
      
      private var _dragHint:DisplayObject;
      
      private var _lastLength:int = 0;
      
      private var _clickedOnLastCard:Boolean = false;
      
      private var _lastHighlightRingLength:int = 0;
      
      private var _cards:BoardState = new BoardState();
      
      public function GameBoard(scoreBoard:GameBoardScoreBoard)
      {
         super();
         _scoreBoard = scoreBoard;
         var play:InteractiveObject = InteractiveObject(AssetManager.inst().newSimpleCheckButton());
         var cancel:InteractiveObject = InteractiveObject(AssetManager.inst().newSimpleXButton());
         cancel.y = play.height + 3;
         _miniPlayUI = new Sprite();
         _miniPlayUI.alpha = MINIBUTTON_ALPHA;
         _miniPlayUI.scaleX = MINIBUTTON_SCALE;
         _miniPlayUI.scaleY = MINIBUTTON_SCALE;
         _miniPlayUI.addChild(play);
         _miniPlayUI.addChild(cancel);
         Utils.listen(play,MouseEvent.CLICK,onMiniPlayClick);
         Utils.listen(cancel,MouseEvent.CLICK,onMiniPlayCancel);
      }
      
      public static function attachAndRemoveThyselfLater(animation:DisplayObject, attachee:DisplayObject, duration:Number, offsetX:Number = 0, offsetY:Number = 0) : void
      {
         animation.x = attachee.x + offsetX;
         animation.y = attachee.y + offsetY;
         attachee.parent.addChild(animation);
         Utils.removeThyselfLater(animation,duration);
      }
      
      private static function playFirework(card:DisplayObject, sound:Boolean = true, scale:Number = 1) : void
      {
         var starBurst:DisplayObject = AssetManager.inst().newStarBurst();
         starBurst.scaleX = scale;
         starBurst.scaleY = scale;
         starBurst.rotation = Utils.random(0,360);
         var rgb:uint = Utils.RGB(Utils.random(0,COLOR_START),Utils.random(0,COLOR_START),Utils.random(0,COLOR_START));
         var emphasizedChannel:uint = uint(COLOR_REMAINDER << BIT_SHIFTS[Utils.random(0,BIT_SHIFTS.length)]);
         rgb += emphasizedChannel;
         var color:Color = new Color();
         color.setTint(rgb,0.25);
         starBurst.transform.colorTransform = color;
         attachAndRemoveThyselfLater(starBurst,card,Consts.STARBURST_DURATION,Math.random() * 20 - 10,Math.random() * 20 - 10);
         if(sound)
         {
            GlobalGameEvents.inst().firework();
         }
      }
      
      private static function playImmolation(card:GameCard) : void
      {
         card.visible = false;
         attachAndRemoveThyselfLater(AssetManager.inst().newGameCardImmolation(),card,Consts.TOTAL_IMMOLATION_DURATION);
      }
      
      private static function getCardRotation(card:GameCard) : Number
      {
         var rot:Number = Math.random() * 90 + 260;
         return card.row < 2 ? -rot : rot;
      }
      
      private static function throwAway(obj:DisplayObject, duration:Number = 5) : void
      {
         TweenMax.to(obj,duration,{
            "scaleX":0,
            "scaleY":0,
            "rotation":360,
            "onComplete":Utils.removeThyself,
            "onCompleteParams":[obj]
         });
      }
      
      public function set enabled(b:Boolean) : void
      {
         this.mouseChildren = b;
      }
      
      public function destroyCards(immolatees:Array) : void
      {
         var immolatee:Object = null;
         var droppers:Array = null;
         for each(immolatee in immolatees)
         {
            playImmolation(_cards.getCard(immolatee.row,immolatee.col));
            _cards.setCard(null,immolatee.row,immolatee.col);
         }
         droppers = collapseEmptySlotsAndReturnDroppers();
         animateCollapsingCards(droppers);
         GlobalGameEvents.inst().destroyingCard();
      }
      
      private function hideMiniPlay() : void
      {
         if(_miniPlayUI.parent)
         {
            _miniPlayUI.parent.removeChild(_miniPlayUI);
         }
      }
      
      private function pathSizeChanged() : void
      {
         var card:DisplayObject = null;
         dispatchEvent(new GameBoardEvent(GameBoardEvent.PATH_SIZE_CHANGE));
         this.graphics.clear();
         if(_path.length)
         {
            _pathColor.color = 4194046;
            this.graphics.lineStyle(4,_pathColor.color);
            card = DisplayObject(_path[0]);
            this.graphics.moveTo(card.x,card.y);
            for each(card in _path)
            {
               this.graphics.lineTo(card.x,card.y);
            }
            if(_path.length == _scoreBoard.tilesNeeded && _lastLength < _path.length)
            {
               playFirework(card,false,0.7);
            }
         }
         else
         {
            hideMiniPlay();
         }
         updateCardSelectability();
         updateHighlightRing();
         _lastLength = _path.length;
      }
      
      private function mouseMoveDragHint(e:MouseEvent) : void
      {
         Utils.centerChildAtPoint(_dragHint,this.globalToLocal(new Point(e.stageX,e.stageY)));
      }
      
      private function clearPath() : void
      {
         _path = [];
         updateCardSelectability();
         _scoreBoard.currentTiles = _path.length;
         pathSizeChanged();
      }
      
      private function onMiniPlayClick(e:Event) : void
      {
         dispatchEvent(new GameBoardEvent(GameBoardEvent.PLAY_BUTTON_PRESSED));
      }
      
      private function onCardMouseDown(e:MouseEvent) : void
      {
         Utils.listen(stage,Event.MOUSE_LEAVE,onDoneMouseDragging);
         Utils.listen(stage,MouseEvent.MOUSE_UP,onDoneMouseDragging);
         var card:GameCard = GameCard(e.currentTarget);
         if(_path.length == 1 && _path[0] == card)
         {
            _clickedOnLastCard = true;
         }
         tryToToggleCard(card);
         if(card.selectable)
         {
            showDragHint(this.globalToLocal(new Point(e.stageX,e.stageY)));
         }
         _dragging = true;
         hideMiniPlay();
      }
      
      private function onCardRollOver(e:Event) : void
      {
         var card:GameCard = null;
         if(_dragging)
         {
            _dragHint.alpha = 0.2;
            _clickedOnLastCard = false;
            card = GameCard(e.currentTarget);
            tryToToggleCard(card);
         }
      }
      
      private function onDoneMouseDragging(e:Event) : void
      {
         var card:DisplayObject = null;
         stopDragging();
         if(_clickedOnLastCard)
         {
            _clickedOnLastCard = false;
            trimPath(0);
         }
         if(_path.length)
         {
            card = DisplayObject(_path[_path.length - 1]);
            _miniPlayUI.x = card.x + 10;
            _miniPlayUI.y = card.y - 30;
            addChild(_miniPlayUI);
         }
      }
      
      public function get path() : Array
      {
         return _path;
      }
      
      private function animateCardDrop(card:GameCard) : void
      {
         TweenMax.from(card,1,{
            "y":card.y - 500,
            "delay":card.col * 0.1 - card.row * 0.05 + 0.5,
            "ease":Bounce.easeOut
         });
      }
      
      private function animateScore(score:uint, x:Number, y:Number, scale:Number, color:int) : void
      {
         var scoreField:ShadowTextField = new ShadowTextField(24,color,4,4);
         scoreField.text = String(score);
         scoreField.x = x;
         scoreField.y = y;
         scoreField.scaleX = scale;
         scoreField.scaleY = scale;
         this.addChild(scoreField);
         TweenMax.to(scoreField,SCORE_ANIM_DURATION,{
            "x":s_score.x,
            "y":s_score.y,
            "alpha":0.4,
            "ease":Circ.easeInOut,
            "overwrite":false,
            "onComplete":Utils.removeThyself,
            "onCompleteParams":[scoreField]
         });
      }
      
      private function updateCardSelectability() : void
      {
         var row:uint = 0;
         var card:GameCard = null;
         var selectedCard:GameCard = _path.length ? _path[_path.length - 1] as GameCard : null;
         for(var col:uint = 0; col < Consts.BOARD_COLS; col++)
         {
            for(row = col % 2; row < BoardState.ROW_SLOTS; row += 2)
            {
               card = _cards.getCard(row,col);
               if(card.special == GameCard.SPECIAL_ROCK)
               {
                  card.selectable = false;
                  card.dimmed = _path.length > 0;
               }
               else if(!selectedCard || selectedCard == card)
               {
                  card.selectable = true;
                  card.dimmed = false;
               }
               else if(card.inPath)
               {
                  card.dimmed = false;
               }
               else
               {
                  if(BoardState.isNorthSouthAdjacent(row,col,selectedCard.row,selectedCard.col) || BoardState.isCornerAdjacent(row,col,selectedCard.row,selectedCard.col))
                  {
                     card.selectable = selectedCard.special == GameCard.SPECIAL_WILDCARD || card.special == GameCard.SPECIAL_WILDCARD || card.suit == selectedCard.suit || card.type == selectedCard.type;
                  }
                  else
                  {
                     card.selectable = false;
                  }
                  card.dimmed = !card.selectable;
               }
            }
         }
      }
      
      private function animateCollapsingCards(animatees:Array) : void
      {
         var dropper:Object = null;
         for each(dropper in animatees)
         {
            TweenMax.from(dropper.card,1,{
               "y":dropper.from,
               "delay":dropper.card.col * 0.1 - dropper.card.row * 0.05 + 0.5,
               "ease":Bounce.easeOut
            });
         }
      }
      
      private function pushCardToPath(card:GameCard) : void
      {
         if(_path.length)
         {
            GameCard(_path[_path.length - 1]).pulsating = false;
         }
         _path.push(card);
         card.inPath = true;
         card.pulsating = true;
         _scoreBoard.currentTiles = _path.length;
         GlobalGameEvents.inst().cardSelect(_path.length,true,_scoreBoard.tilesNeeded);
         pathSizeChanged();
      }
      
      private function tryToToggleCard(card:GameCard) : Boolean
      {
         var cardIndex:int = 0;
         if(card.selectable || _path.indexOf(card) >= 0)
         {
            cardIndex = _path.indexOf(card);
            if(cardIndex < 0)
            {
               pushCardToPath(card);
               return true;
            }
            trimPath(cardIndex + 1);
         }
         return false;
      }
      
      private function updateHighlightRing() : void
      {
         var topCard:GameCard = null;
         if(Consts.HIGHLIGHT_RING_ENABLED)
         {
            if(_path.length != _lastHighlightRingLength)
            {
               if(_highlightRing.parent)
               {
                  _highlightRing.parent.removeChild(_highlightRing);
               }
               if(_path.length)
               {
                  topCard = _path[_path.length - 1];
                  _highlightRing.x = topCard.x;
                  _highlightRing.y = topCard.y;
                  _highlightRing.gotoAndPlay(0);
                  this.addChildAt(_highlightRing,0);
               }
               _lastHighlightRingLength = _path.length;
            }
         }
      }
      
      private function hideDragHint() : void
      {
         if(Boolean(_dragHint) && Boolean(_dragHint.parent))
         {
            _dragHint.parent.removeChild(_dragHint);
            stage.removeEventListener(MouseEvent.MOUSE_MOVE,mouseMoveDragHint);
         }
      }
      
      private function exitCardsComplete() : void
      {
         dispatchEvent(new GameBoardEvent(GameBoardEvent.MOVE_ANIMATION_COMPLETE));
      }
      
      private function animateExitingCards(cardsExiting:Array, success:Boolean = false) : void
      {
         var card:GameCard = null;
         var color:uint = 0;
         var score:uint = 0;
         var scale:Number = NaN;
         var tweenDelay:Number = 0;
         var numBurning:uint = 0;
         var numCards:uint = 0;
         var moveDuration:Number = success ? CARD_MOVE_TO_DURATION : CARD_MOVE_TO_DURATION_FAIL;
         for each(card in cardsExiting)
         {
            card.mouseEnabled = false;
            tweenDelay += CARD_ANIM_INTERVAL;
            if(success)
            {
               TweenMax.to(card,moveDuration,{
                  "rotation":getCardRotation(card),
                  "overwrite":false,
                  "delay":tweenDelay + CARD_ROTATE_DELAY,
                  "onComplete":Utils.removeThyself,
                  "onCompleteParams":[card]
               });
               TweenMax.to(card,moveDuration,{
                  "x":CARD_ANIM_MOVE_TO.x,
                  "y":CARD_ANIM_MOVE_TO.y,
                  "ease":Back.easeInOut,
                  "overwrite":false,
                  "delay":tweenDelay + CARD_MOVE_TO_DELAY
               });
               TweenMax.delayedCall(tweenDelay,playFirework,[card]);
               TweenMax.to(card,CARD_SCALE_DURATION,{
                  "scaleX":CARD_ANIM_SCALE,
                  "scaleY":CARD_ANIM_SCALE,
                  "ease":Back.easeInOut,
                  "overwrite":false,
                  "delay":tweenDelay
               });
               color = 16776960;
               score = Consts.CARD_SCORE + Math.max(0,(++numCards - _scoreBoard.tilesNeeded) * Consts.CARD_EXTRA_BONUS);
               if(card.burning)
               {
                  score *= ++numBurning * Consts.BURN_BONUS_MULTIPLIER;
                  color = 16711680;
               }
               else
               {
                  scale = Math.min(2,1 + (score - Consts.CARD_SCORE) / Consts.CARD_SCORE / 10);
               }
               TweenMax.delayedCall(tweenDelay,animateScore,[score,card.x,card.y,scale,color]);
            }
            else
            {
               TweenMax.to(card,CARD_SCALE_DURATION,{
                  "scaleX":CARD_ANIM_SCALE_FAIL,
                  "scaleY":CARD_ANIM_SCALE_FAIL,
                  "ease":Back.easeInOut,
                  "overwrite":false,
                  "delay":tweenDelay
               });
               throwAway(card,1);
            }
         }
         TweenMax.delayedCall(tweenDelay + CARD_ROTATE_DELAY,exitCardsComplete);
      }
      
      public function addCards(cardArray:Array) : void
      {
         var cardDesc:Object = null;
         var card:GameCard = null;
         for each(cardDesc in cardArray)
         {
            card = new GameCard(cardDesc.suit,cardDesc.type,cardDesc.special);
            if(cardDesc.burning)
            {
               card.setBurning();
            }
            addCard(card,cardDesc.row,cardDesc.col);
            animateCardDrop(_cards.getCard(cardDesc.row,cardDesc.col));
         }
         updateRoastingNeighbors();
      }
      
      private function onMiniPlayCancel(e:Event) : void
      {
         trimPath(0);
      }
      
      public function animateGameOverBurnToHell() : void
      {
         var col:uint;
         var row:uint = 0;
         var card:GameCard = null;
         var rowBasedDelay:Number = NaN;
         var maxWait:uint = 0;
         for(col = 0; col < Consts.BOARD_COLS; col++)
         {
            for(row = col % 2; row < BoardState.ROW_SLOTS; row += 2)
            {
               card = _cards.getCard(row,col);
               rowBasedDelay = Math.abs(row / 2 - 6) * 0.25;
               TweenMax.to(card,1,{
                  "tint":Consts.CARD_GAME_OVER_BURN_COLOR,
                  "delay":rowBasedDelay,
                  "overwrite":false,
                  "yoyo":true
               });
               TweenMax.delayedCall(rowBasedDelay,function(c:GameCard):void
               {
                  c.setBurning();
               },[card]);
               rowBasedDelay += 2;
               TweenMax.delayedCall(rowBasedDelay,throwAway,[card]);
               maxWait = Math.max(maxWait,rowBasedDelay);
            }
         }
         TweenMax.delayedCall(maxWait + Consts.TOTAL_IMMOLATION_DURATION,function():void
         {
            dispatchEvent(new GameBoardEvent(GameBoardEvent.LOSS_ANIMATION_COMPLETE));
         });
      }
      
      public function addCard(card:GameCard, row:uint, col:uint) : void
      {
         if(card.special != GameCard.SPECIAL_ROCK)
         {
            card.selectable = true;
         }
         Utils.listen(card,MouseEvent.MOUSE_DOWN,onCardMouseDown);
         Utils.listen(card,MouseEvent.ROLL_OVER,onCardRollOver);
         this.addChild(card);
         _cards.setCard(card,row,col);
      }
      
      public function animateMove() : void
      {
         var exitingCard:GameCard = null;
         var exitingCards:Array = _path;
         clearPath();
         animateExitingCards(exitingCards,Consts.BOARD_ANIMATE_SCORE && exitingCards.length >= _scoreBoard.tilesNeeded);
         for each(exitingCard in exitingCards)
         {
            _cards.setCard(null,exitingCard.row,exitingCard.col);
         }
      }
      
      private function updateRoastingNeighbors() : void
      {
         var row:uint = 0;
         var card:GameCard = null;
         for(var col:uint = 0; col < Consts.BOARD_COLS; col++)
         {
            for(row = 2 + col % 2; row < BoardState.ROW_SLOTS; row += 2)
            {
               card = _cards.getCard(row,col);
               card.roasting = !card.burning && _cards.getCard(row - 2,col).burning;
               if(card.roasting)
               {
                  Utils.tr("roasting card at " + row + ", " + col);
               }
            }
         }
      }
      
      private function trimPath(toLength:int) : void
      {
         var exMember:GameCard = null;
         if(_path.length > toLength)
         {
            while(_path.length > toLength)
            {
               exMember = GameCard(_path.pop());
               exMember.inPath = false;
               exMember.pulsating = false;
            }
            if(_path.length)
            {
               GameCard(_path[_path.length - 1]).pulsating = true;
            }
            else
            {
               stopDragging();
            }
            _scoreBoard.currentTiles = _path.length;
            GlobalGameEvents.inst().cardSelect(_path.length,false);
            pathSizeChanged();
         }
      }
      
      public function animateLevelVictory() : void
      {
         var col:uint;
         var row:uint = 0;
         var card:GameCard = null;
         var delay:Number = NaN;
         var maxWait:uint = 0;
         for(col = 0; col < Consts.BOARD_COLS; col++)
         {
            for(row = col % 2; row < BoardState.ROW_SLOTS; row += 2)
            {
               card = _cards.getCard(row,col);
               if(card)
               {
                  delay = Math.abs((row / 2 - 4) * 0.2) + col * 0.4;
                  TweenMax.to(card,0.8,{
                     "alpha":0,
                     "scaleX":0.1,
                     "scaleY":0.1,
                     "ease":Back.easeInOut,
                     "overwrite":false,
                     "delay":delay,
                     "onComplete":Utils.removeThyself,
                     "onCompleteParams":[card]
                  });
                  if(Math.random() > 0.7)
                  {
                     TweenMax.delayedCall(delay,playFirework,[card]);
                  }
                  maxWait = Math.max(maxWait,delay);
               }
            }
         }
         TweenMax.delayedCall(maxWait + Consts.STARBURST_DURATION,function():void
         {
            dispatchEvent(new GameBoardEvent(GameBoardEvent.WIN_ANIMATION_COMPLETE));
         });
      }
      
      private function stopDragging() : void
      {
         _dragging = false;
         hideDragHint();
      }
      
      public function setCardsAflame(cards:Array) : void
      {
         var card:Object = null;
         for each(card in cards)
         {
            _cards.getCard(card.row,card.col).setBurning();
         }
         updateRoastingNeighbors();
      }
      
      public function get scoreBoard() : GameBoardScoreBoard
      {
         return _scoreBoard;
      }
      
      private function collapseEmptySlotsAndReturnDroppers() : Array
      {
         var emptiesThisCol:uint = 0;
         var row:int = 0;
         var card:GameCard = null;
         var oldY:Number = NaN;
         var droppers:Array = [];
         for(var col:uint = 0; col < Consts.BOARD_COLS; col++)
         {
            emptiesThisCol = 0;
            for(row = BoardState.ROW_SLOTS - 2 + col % 2; row >= 0; row -= 2)
            {
               card = _cards.getCard(row,col);
               if(!card)
               {
                  emptiesThisCol++;
               }
               else if(emptiesThisCol)
               {
                  _cards.setCard(null,card.row,card.col);
                  oldY = card.y;
                  _cards.setCard(card,card.row + emptiesThisCol * 2,col);
                  droppers.push({
                     "card":card,
                     "from":oldY
                  });
               }
            }
         }
         return droppers;
      }
      
      private function showDragHint(point:Point) : void
      {
         if(!_dragHint)
         {
            _dragHint = AssetManager.inst().newDragHint();
            _dragHint.scaleX = 0.25;
            _dragHint.scaleY = 0.25;
            InteractiveObject(_dragHint).mouseEnabled = false;
         }
         _dragHint.alpha = 0.4;
         Utils.centerChildAtPoint(_dragHint,point);
         addChild(_dragHint);
         Utils.listen(stage,MouseEvent.MOUSE_MOVE,mouseMoveDragHint);
      }
   }
}

class BoardState
{
   
   public static const ROW_SLOTS:uint = Consts.BOARD_ROWS * 2;
   
   private var _array:Array;
   
   public function BoardState()
   {
      super();
      clear();
   }
   
   public static function isCornerAdjacent(row1:uint, col1:uint, row2:uint, col2:uint) : Boolean
   {
      return (col1 == col2 - 1 || col1 == col2 + 1) && (row1 == row2 - 1 || row1 == row2 + 1);
   }
   
   public static function isNorthSouthAdjacent(row1:uint, col1:uint, row2:uint, col2:uint) : Boolean
   {
      return col1 == col2 && (row1 == row2 - 2 || row1 == row2 + 2);
   }
   
   public function setCard(card:GameCard, row:uint, col:uint) : void
   {
      if(card)
      {
         Utils.assert(_array[row][col] == null,"tried to put a card in a non-empty slot at " + row + ", " + col);
         card.row = row;
         card.col = col;
         card.x = 33 + Consts.BOARD_LEFT_MARGIN + col * (Consts.CARD_WIDTH + Consts.CARD_HORIZONTAL_GAP);
         card.y = 33 + Consts.BOARD_TOP_MARGIN + row * (Consts.CARD_HEIGHT + Consts.CARD_VERTICAL_GAP) / 2;
      }
      _array[row][col] = card;
   }
   
   public function getEmpties() : Array
   {
      var row:uint = 0;
      var retval:Array = [];
      for(var col:uint = 0; col < Consts.BOARD_COLS; col++)
      {
         for(row = col % 2; row < ROW_SLOTS; row += 2)
         {
            if(!_array[row][col])
            {
               retval.push({
                  "row":row,
                  "col":col
               });
            }
         }
      }
      return retval;
   }
   
   public function getCard(row:uint, col:uint) : GameCard
   {
      var card:GameCard = _array[row][col] as GameCard;
      Utils.assert(!card || card.row == row && card.col == col,"card locations found out of sync");
      return card;
   }
   
   public function clear() : void
   {
      var column:Array = null;
      var col:uint = 0;
      _array = [];
      for(var row:uint = 0; row < ROW_SLOTS; row++)
      {
         column = [];
         for(col = 0; col < Consts.BOARD_COLS; col++)
         {
            column.push(null);
         }
         _array.push(column);
      }
   }
}
