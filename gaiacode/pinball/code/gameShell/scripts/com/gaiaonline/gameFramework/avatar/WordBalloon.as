package com.gaiaonline.gameFramework.avatar
{
   import flash.display.DisplayObject;
   import flash.display.MovieClip;
   import flash.events.Event;
   import flash.events.TimerEvent;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.utils.Timer;
   
   public class WordBalloon extends MovieClip
   {
      
      public var mcBacking:DisplayObject = null;
      
      public var messageTxt:TextField = null;
      
      private var timer:Timer;
      
      public var WordBalloonBG:Class = WordBalloon_WordBalloonBG;
      
      private const maxBackingHeight:int = 75;
      
      public function WordBalloon()
      {
         super();
         drawUI();
         messageTxt.selectable = false;
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[WordBalloon]" + param1);
      }
      
      public function clearBalloon(param1:Event) : void
      {
         visible = false;
      }
      
      public function setText(param1:String, param2:uint = 0) : void
      {
         var _loc3_:Number = NaN;
         if(!param1 || param1 == "" || messageTxt == null)
         {
            dTrace("messageTxt is Null!!!!");
            return;
         }
         messageTxt.htmlText = "<font color=\'#" + param2.toString(16) + "\'>" + param1 + "</font>";
         _loc3_ = messageTxt.textHeight + 14;
         _loc3_ = Math.min(maxBackingHeight,_loc3_);
         mcBacking.height = _loc3_;
         messageTxt.height = mcBacking.height - 10;
         visible = true;
         if(timer != null)
         {
            timer.removeEventListener(TimerEvent.TIMER,clearBalloon);
         }
         timer = new Timer(10 * 1000,1);
         timer.addEventListener(TimerEvent.TIMER,clearBalloon);
         timer.start();
      }
      
      private function drawUI() : void
      {
         mcBacking = new WordBalloonBG();
         addChild(mcBacking);
         messageTxt = new TextField();
         messageTxt.defaultTextFormat = new TextFormat("Arial",11,0);
         messageTxt.width = 76.5;
         messageTxt.multiline = true;
         messageTxt.wordWrap = true;
         addChild(messageTxt);
      }
   }
}

