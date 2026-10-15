package com.gaiaonline.gameFramework.avatar
{
   import flash.display.MovieClip;
   import flash.events.Event;
   import flash.events.TimerEvent;
   import flash.text.TextField;
   import flash.utils.Timer;
   
   public class WordBalloon extends MovieClip
   {
      
      public var mcBacking:MovieClip;
      
      private var timer:Timer;
      
      private var maxBackingHeight:int;
      
      public var messageTxt:TextField;
      
      public function WordBalloon()
      {
         super();
         maxBackingHeight = mcBacking.height;
         messageTxt.selectable = false;
      }
      
      public function clearBalloon(param1:Event) : void
      {
         visible = false;
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[WordBalloon]" + param1);
      }
      
      public function setText(param1:String, param2:uint = 0) : void
      {
         var _loc3_:Number = NaN;
         if(messageTxt == null)
         {
            dTrace("messageTxt is Null!!!!");
            return;
         }
         messageTxt.htmlText = "<font color=\'#" + param2.toString(16) + "\'>" + param1 + "</font>";
         _loc3_ = messageTxt.textHeight + 14;
         _loc3_ = Math.min(maxBackingHeight,_loc3_);
         mcBacking.height = _loc3_;
         visible = true;
         if(timer != null)
         {
            timer.removeEventListener(TimerEvent.TIMER,clearBalloon);
         }
         timer = new Timer(10 * 1000,1);
         timer.addEventListener(TimerEvent.TIMER,clearBalloon);
         timer.start();
      }
   }
}

