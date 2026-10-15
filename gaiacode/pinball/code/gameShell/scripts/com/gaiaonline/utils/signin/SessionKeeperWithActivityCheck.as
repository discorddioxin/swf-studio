package com.gaiaonline.utils.signin
{
   import flash.display.InteractiveObject;
   import flash.events.Event;
   import flash.events.KeyboardEvent;
   import flash.events.MouseEvent;
   import flash.events.TimerEvent;
   
   public class SessionKeeperWithActivityCheck extends SessionKeeper
   {
      
      private var _eventConstants:Array = null;
      
      private var _gameEventHappened:Boolean = false;
      
      private var _activityDetector:InteractiveObject = null;
      
      public function SessionKeeperWithActivityCheck(param1:InteractiveObject, param2:String = "www", param3:String = null, param4:Number = 0)
      {
         super(param2,param3,param4);
         _activityDetector = param1;
         _eventConstants = [MouseEvent.CLICK,MouseEvent.MOUSE_MOVE,KeyboardEvent.KEY_DOWN,MouseEvent.MOUSE_DOWN];
         toggleGameEventListeners();
      }
      
      private function resetGameEvents() : void
      {
         _gameEventHappened = false;
         toggleGameEventListeners();
      }
      
      override protected function onTimerComplete(param1:TimerEvent) : void
      {
         trace("game event timer fired");
         if(_gameEventHappened)
         {
            trace("game event happened in time allotted");
            resetGameEvents();
            super.onTimerComplete(param1);
         }
         else
         {
            trace("no game event happened in time allotted");
         }
      }
      
      private function onGameEvent(param1:Event = null) : void
      {
         if(Boolean(param1) && Boolean(param1.type))
         {
            trace("game event: " + param1.type);
         }
         _gameEventHappened = true;
         toggleGameEventListeners(false);
      }
      
      public function overrideGameEventHappened() : void
      {
         onGameEvent();
      }
      
      private function toggleGameEventListeners(param1:Boolean = true) : void
      {
         var _loc2_:Function = null;
         var _loc3_:uint = 0;
         var _loc4_:uint = 0;
         if(_activityDetector)
         {
            if(param1)
            {
               trace("game event: adding listeners");
            }
            else
            {
               trace("game event: removing listeners");
            }
            _loc2_ = param1 ? _activityDetector.addEventListener : _activityDetector.removeEventListener;
            _loc3_ = _eventConstants.length;
            _loc4_ = 0;
            while(_loc4_ < _loc3_)
            {
               _loc2_(_eventConstants[_loc4_],onGameEvent);
               _loc4_++;
            }
         }
         else
         {
            trace("game event weird");
         }
      }
   }
}

