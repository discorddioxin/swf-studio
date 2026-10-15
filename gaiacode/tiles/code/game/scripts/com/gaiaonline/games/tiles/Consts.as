package com.gaiaonline.games.tiles
{
   import flash.filters.DropShadowFilter;
   import flash.geom.Rectangle;
   
   public class Consts
   {
      
      public static const VERSION:String = "0.0.2.8";
      
      public static const APP_AREA:Rectangle = new Rectangle(0,0,600,450);
      
      public static const BOARD_ANIMATE_SCORE:Boolean = true;
      
      public static const BOARD_ROWS:uint = 5;
      
      public static const BOARD_COLS:uint = 6;
      
      public static const BOARD_LEFT_MARGIN:Number = 15;
      
      public static const BOARD_TOP_MARGIN:Number = 19;
      
      public static const BOARD_PLAY_AREA:Rectangle = new Rectangle(3,10,486,433);
      
      public static const CARD_WIDTH:Number = 66;
      
      public static const CARD_HEIGHT:Number = 66;
      
      public static const CARD_HORIZONTAL_GAP:Number = 13;
      
      public static const CARD_VERTICAL_GAP:Number = 12;
      
      public static const CARD_HOVER_SCALE:Number = 1.2;
      
      public static const CARD_BORDER_COLOR:uint = 65535;
      
      public static const CARD_BURN_BORDER_COLOR:uint = 16750848;
      
      public static const CARD_ROAST_BORDER_COLOR:uint = 16711680;
      
      public static const CARD_ROAST_INTENSITY:Number = 1;
      
      public static const CARD_ROAST_SPEED:Number = 0.5;
      
      public static const CARD_PULSE_SPEED:Number = 0.5;
      
      public static const CARD_GAME_OVER_BURN_COLOR:uint = 16711680;
      
      public static const CARD_GAME_OVER_DARKEN_COLOR:uint = 16777215;
      
      public static const CARD_GAME_OVER_DARKEN_SPEED:Number = 0.01;
      
      public static const HIGHLIGHT_RING_ENABLED:Boolean = true;
      
      public static const STARBURST_DURATION:Number = 4;
      
      public static const TOTAL_IMMOLATION_DURATION:Number = 3;
      
      public static const SERVER_DIALOG_TICKET_OFFER:String = "offer";
      
      public static const SERVER_DIALOG_TICKETS_GRANTED:String = "ticketsGranted";
      
      public static const DIALOGTEXT_DROPSHADOW:Array = [new DropShadowFilter(1,45,16777215,1,0,0)];
      
      public static var CARD_SUITS:uint = 0;
      
      public static var CARD_SCORE:uint = 0;
      
      public static var CARD_EXTRA_BONUS:uint = 5;
      
      public static var BURN_BONUS_MULTIPLIER:uint = 0;
      
      public static const SHOP_KEY:String = "ndroctlqvprghqqy";
      
      public static var SHOP_URL:String = "http://www.gaiaonline.com/gaia/shopping.php?key=" + SHOP_KEY;
      
      public function Consts(hide:CONSTRUCTOR_HIDER)
      {
         super();
      }
   }
}

class CONSTRUCTOR_HIDER
{
   
   public function CONSTRUCTOR_HIDER()
   {
      super();
   }
}
