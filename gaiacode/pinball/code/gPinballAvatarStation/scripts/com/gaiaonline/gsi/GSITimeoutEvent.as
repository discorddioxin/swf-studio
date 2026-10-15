package com.gaiaonline.gsi
{
   import flash.events.Event;
   
   public class GSITimeoutEvent extends Event
   {
      
      public static const TIMEOUT:String = "timeout";
      
      private var _timeout:uint;
      
      private var _fails:uint;
      
      public function GSITimeoutEvent(param1:String = "timeout", param2:uint = 0, param3:uint = 0)
      {
         super(param1);
         this._timeout = param2;
         this._fails = param3;
      }
      
      public function get timeout() : uint
      {
         return _timeout;
      }
      
      public function get fails() : uint
      {
         return _fails;
      }
   }
}

