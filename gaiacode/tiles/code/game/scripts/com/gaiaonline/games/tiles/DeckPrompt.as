package com.gaiaonline.games.tiles
{
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.geom.Point;
   import flash.text.TextField;
   import flash.text.TextFieldType;
   
   public class DeckPrompt extends Sprite
   {
      
      private static const TOP_LEFT:Point = new Point(70,110);
      
      private static const GRID_SIZE:Number = 140;
      
      private static const COLUMNS:int = 3;
      
      private static const ROWS:int = 2;
      
      private var _currentRow:int = 0;
      
      private var _decks:Array;
      
      private var _hackXML:XML;
      
      private var _thumbs:Array;
      
      private var _scrollParent:Sprite = new Sprite();
      
      public function DeckPrompt(decks:Array)
      {
         super();
         var promptText:ShadowTextField = new ShadowTextField(37,16608256,1,1);
         promptText.text = "Select A Deck to Play with";
         promptText.x = 64;
         promptText.y = 21.3;
         addChild(promptText);
         var deckSelectParent:Sprite = AssetManager.inst().newDeckSelect();
         addChild(deckSelectParent);
         var upBut:DisplayObject = AssetManager.inst().newDeckUpScrollButton();
         upBut.x = 510;
         upBut.y = 150;
         var downBut:DisplayObject = AssetManager.inst().newDeckDownScrollButton();
         downBut.x = upBut.x;
         downBut.y = 360;
         addChild(downBut);
         addChild(upBut);
         Utils.listen(upBut,MouseEvent.CLICK,onUp);
         Utils.listen(downBut,MouseEvent.CLICK,onDn);
         createThumbs(decks);
         addChild(_scrollParent);
         scrollTo(0);
      }
      
      private function scrollTo(row:int) : void
      {
         var numRows:int = 0;
         var iThumb:uint = 0;
         var max:uint = 0;
         var iPos:uint = 0;
         var thumb:DisplayObject = null;
         Utils.assert(_decks.length == _thumbs.length,"problem in deckprompt");
         numRows = 1 + (_thumbs.length - 1) / COLUMNS;
         var maxRow:int = numRows - ROWS;
         if(row >= 0 && row <= maxRow)
         {
            Utils.removeAllChildren(_scrollParent);
            _currentRow = row;
            iThumb = _currentRow * COLUMNS;
            max = Math.min(iThumb + ROWS * COLUMNS,_thumbs.length);
            for(iPos = 0; iThumb < max; iThumb++)
            {
               thumb = _thumbs[iThumb];
               thumb.x = TOP_LEFT.x + iPos % COLUMNS * GRID_SIZE;
               thumb.y = uint(iPos / COLUMNS) * GRID_SIZE + TOP_LEFT.y;
               _scrollParent.addChild(thumb);
               iPos++;
            }
         }
      }
      
      private function onDn(e:Event) : void
      {
         scrollTo(_currentRow + 1);
      }
      
      private function onHackDeckXML(e:MouseEvent) : void
      {
         var textfield:TextField = null;
         if(e.ctrlKey && e.shiftKey)
         {
            textfield = TextField(e.target);
            try
            {
               _hackXML = textfield.text.length ? new XML(textfield.text) : null;
               textfield.parent.removeChild(textfield);
            }
            catch(e:Error)
            {
               textfield.text = "bad XML, try again";
               textfield.setSelection(0,textfield.text.length);
            }
         }
      }
      
      private function createThumbs(decks:Array) : void
      {
         var deck:Object = null;
         var thumb:DeckPromptThumb = null;
         _decks = decks;
         _thumbs = [];
         for(var i:uint = 0; i < decks.length; i++)
         {
            deck = decks[i];
            thumb = new DeckPromptThumb(i,deck.thumb,deck.name,deck.isMovieClip);
            Utils.listen(thumb,MouseEvent.CLICK,onThumbChoice);
            _thumbs.push(thumb);
         }
      }
      
      private function onUp(e:Event) : void
      {
         scrollTo(_currentRow - 1);
      }
      
      private function onThumbChoice(e:MouseEvent) : void
      {
         var hack:TextField = null;
         var index:int = 0;
         var evt:DeckPromptEvent = null;
         if(e.ctrlKey && e.shiftKey)
         {
            hack = new TextField();
            hack.type = TextFieldType.INPUT;
            hack.multiline = true;
            hack.width = width;
            hack.height = height;
            hack.background = true;
            hack.text = "Paste the deck XML here, then CTRL + SHIFT + click to apply it";
            stage.focus = hack;
            hack.setSelection(0,hack.text.length);
            Utils.listen(hack,MouseEvent.CLICK,onHackDeckXML);
            addChild(hack);
         }
         else
         {
            index = DeckPromptThumb(e.currentTarget).value;
            evt = new DeckPromptEvent(index,_decks[index].path,_decks[index].isMovieClip);
            evt._hackDeckXML = _hackXML;
            dispatchEvent(evt);
         }
      }
   }
}

