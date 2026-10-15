package com.gaiaonline.utils.signin
{
   import com.gaiaonline.gsi.GSIEvent;
   import com.gaiaonline.gsi.GSIGateway;
   import flash.events.EventDispatcher;
   import flash.events.TimerEvent;
   import flash.utils.Timer;
   
   public class SessionKeeper extends EventDispatcher
   {
      
      private static const GSI_CALL:int = 100;
      
      private static const DEFALUT_DELAY:int = 60000 * 3;
      
      private var _delay:int;
      
      private var _timer:Timer;
      
      private var _session:String;
      
      private var _appId:Number = 0;
      
      private var _gsi:GSIGateway;
      
      public function SessionKeeper(param1:String = "www", param2:String = null, param3:Number = 0)
      {
         super();
         _session = param2;
         _gsi = new GSIGateway(param1);
         _gsi.addEventListener(GSIEvent.ERROR,this.onGSIError);
         _gsi.addEventListener(GSIEvent.LOADED,this.onGSILoadded);
         _appId = param3;
         _timer = new Timer(DEFALUT_DELAY);
         _timer.addEventListener(TimerEvent.TIMER,this.onTimerComplete);
      }
      
      private function onGSILoadded(param1:GSIEvent) : void
      {
      }
      
      public function start(param1:int = 180000) : void
      {
         _timer.start();
      }
      
      public function get appID() : Number
      {
         return _appId;
      }
      
      public function stop() : void
      {
         if(_timer.running)
         {
            _timer.reset();
         }
      }
      
      private function onGSIError(param1:GSIEvent) : void
      {
         if(param1.gsiMethod == GSI_CALL && String(param1.gsiData).indexOf("expired") >= 0)
         {
            dispatchEvent(param1);
         }
      }
      
      public function set session(param1:String) : void
      {
         _session = param1;
      }
      
      public function get session() : String
      {
         return _session;
      }
      
      public function set appID(param1:Number) : void
      {
         _appId = param1;
      }
      
      protected function onTimerComplete(param1:TimerEvent) : void
      {
         trace("game event session keeper onTimerComplete");
         _gsi.invoke(GSI_CALL,_session,_appId);
      }
   }
}

