package com.gaiaonline.games.tiles
{
   import fl.motion.Color;
   import flash.display.DisplayObject;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.geom.ColorTransform;
   import gs.TweenMax;
   
   public class GameCard extends Sprite
   {
      
      private static var s_tints:Tints;
      
      public static const SPECIAL_NONE:int = 0;
      
      public static const SPECIAL_MYSTERY:int = 1;
      
      public static const SPECIAL_ROCK:int = 2;
      
      public static const SPECIAL_WILDCARD:int = 3;
      
      private static var s_count:uint = 0;
      
      private static const CARDOFFSET:int = -27;
      
      private static const SPECIALOFFSET:int = -33;
      
      private static const SPECIALSCALE:Number = 1.15;
      
      private var _col:uint = 0;
      
      private var _burning:Boolean = false;
      
      private var _roastingTween:TweenMax = null;
      
      private var _special:int;
      
      private var _pulsation:TweenMax = null;
      
      private var _type:uint = 0;
      
      private var id:uint;
      
      private var _originalCT:ColorTransform = null;
      
      private var _row:uint = 0;
      
      private var _suit:uint = 0;
      
      private var _originalBorderCT:ColorTransform = null;
      
      private var _selectable:Boolean = false;
      
      public function GameCard(suit:uint, type:uint, special:int)
      {
         var asset:Sprite = null;
         var scale:Number = NaN;
         id = ++s_count;
         super();
         _suit = suit;
         _type = type;
         _special = special;
         if(special)
         {
            switch(special)
            {
               case SPECIAL_MYSTERY:
                  asset = AssetManager.inst().newGameCardMystery();
                  break;
               case SPECIAL_ROCK:
                  asset = AssetManager.inst().newGameCardRock();
                  break;
               case SPECIAL_WILDCARD:
                  asset = AssetManager.inst().newGameCardWildcard();
            }
            asset.x = SPECIALOFFSET;
            asset.y = SPECIALOFFSET;
            asset.scaleX = SPECIALSCALE;
            asset.scaleY = SPECIALSCALE;
         }
         else if(!AssetManager.inst().deckIsMovieClip)
         {
            addChild(AssetManager.inst().newGameCardBorder());
            asset = AssetManager.inst().newGameCardForegroundType(_type);
            scale = 54.28 / asset.width;
            asset.addChild(AssetManager.inst().newGameCardForegroundSuit(_suit));
            asset.x = CARDOFFSET;
            asset.y = CARDOFFSET;
            asset.scaleX = scale;
            asset.scaleY = scale;
         }
         else
         {
            addChild(AssetManager.inst().newGameCardBorder());
            asset = AssetManager.inst().newGameCardForeground();
            asset.x = CARDOFFSET;
            asset.y = CARDOFFSET;
            MovieClip(asset).gotoAndStop(cardToFrame(_suit,_type));
         }
         addChild(asset);
      }
      
      private static function cardToFrame(suit:uint, type:uint) : uint
      {
         return suit + 2 + type * (Consts.CARD_SUITS + 1);
      }
      
      public function get col() : uint
      {
         return _col;
      }
      
      public function get dimmed() : Boolean
      {
         return _originalCT != null;
      }
      
      public function set pulsating(b:Boolean) : void
      {
         if(b != pulsating)
         {
            if(b)
            {
               this.scaleX = 1;
               this.scaleY = 1;
               _pulsation = TweenMax.from(this,Consts.CARD_PULSE_SPEED,{
                  "scaleX":1.1,
                  "scaleY":1.1,
                  "yoyo":true
               });
            }
            else
            {
               TweenMax.removeTween(_pulsation);
               _pulsation = null;
               this.scaleX = 1;
               this.scaleY = 1;
            }
         }
      }
      
      public function set col(c:uint) : void
      {
         _col = c;
      }
      
      public function set dimmed(d:Boolean) : void
      {
         var tint:Color = null;
         if(dimmed != d)
         {
            if(d)
            {
               _originalCT = this.transform.colorTransform;
               tint = new Color();
               tint.setTint(0,0.5);
               this.transform.colorTransform = tint;
            }
            else
            {
               this.transform.colorTransform = _originalCT;
               _originalCT = null;
            }
         }
      }
      
      public function get pulsating() : Boolean
      {
         return _pulsation != null;
      }
      
      public function get burning() : Boolean
      {
         return _burning;
      }
      
      public function get inPath() : Boolean
      {
         return _originalBorderCT != null;
      }
      
      public function get suit() : uint
      {
         return _suit;
      }
      
      public function set selectable(s:Boolean) : void
      {
         if(s != _selectable)
         {
            if(s)
            {
               Utils.listen(this,MouseEvent.ROLL_OVER,onOver);
               Utils.listen(this,MouseEvent.ROLL_OUT,onOut);
            }
            else
            {
               this.removeEventListener(MouseEvent.ROLL_OVER,onOver);
               this.removeEventListener(MouseEvent.ROLL_OUT,onOut);
            }
            _selectable = s;
         }
      }
      
      private function onOver(e:Event) : void
      {
         if(!pulsating)
         {
            this.scaleX = Consts.CARD_HOVER_SCALE;
            this.scaleY = Consts.CARD_HOVER_SCALE;
         }
         GlobalGameEvents.inst().mouseOverCard();
      }
      
      public function set inPath(b:Boolean) : void
      {
         if(this.inPath != b)
         {
            if(b)
            {
               _originalBorderCT = this.border.transform.colorTransform;
               this.border.transform.colorTransform = special ? tints.inPathSpecial : tints.inPath;
            }
            else
            {
               this.border.transform.colorTransform = _originalBorderCT;
               _originalBorderCT = null;
            }
         }
      }
      
      public function get selectable() : Boolean
      {
         return _selectable;
      }
      
      public function get row() : uint
      {
         return _row;
      }
      
      public function get type() : uint
      {
         return _type;
      }
      
      public function get roasting() : Boolean
      {
         return _roastingTween != null;
      }
      
      private function get tints() : Tints
      {
         if(!s_tints)
         {
            s_tints = new Tints();
         }
         return s_tints;
      }
      
      public function set roasting(r:Boolean) : void
      {
         var args:Object = null;
         if(r != roasting)
         {
            if(r)
            {
               args = {
                  "colorMatrixFilter":{
                     "colorize":Consts.CARD_ROAST_BORDER_COLOR,
                     "amount":Consts.CARD_ROAST_INTENSITY
                  },
                  "yoyo":true
               };
               _roastingTween = TweenMax.from(this.border,Consts.CARD_ROAST_SPEED,args);
            }
            else
            {
               TweenMax.removeTween(_roastingTween);
               _roastingTween = null;
               this.border.filters = [];
            }
         }
      }
      
      private function onOut(e:Event) : void
      {
         this.scaleX = 1;
         this.scaleY = 1;
      }
      
      public function setBurning() : void
      {
         var burn:Sprite = null;
         if(!burning)
         {
            _burning = true;
            burn = special ? AssetManager.inst().newGameCardBurningBorderBottom() : AssetManager.inst().newGameCardBurningBorder();
            this.addChild(burn);
            border.transform.colorTransform = special ? tints.burnSpecial : tints.burn;
         }
      }
      
      private function get border() : DisplayObject
      {
         return this.getChildAt(0);
      }
      
      public function set row(r:uint) : void
      {
         _row = r;
      }
      
      public function get special() : int
      {
         return _special;
      }
   }
}

import fl.motion.Color;

class Tints
{
   
   public var burnSpecial:Color = new Color();
   
   public var inPathSpecial:Color = new Color();
   
   public var inPath:Color = new Color();
   
   public var burn:Color = new Color();
   
   public function Tints()
   {
      super();
      burn.setTint(Consts.CARD_BURN_BORDER_COLOR,1);
      burnSpecial.setTint(Consts.CARD_BURN_BORDER_COLOR,0.3);
      inPath.setTint(Consts.CARD_BORDER_COLOR,0.75);
      inPathSpecial.setTint(Consts.CARD_BORDER_COLOR,0.3);
   }
}
