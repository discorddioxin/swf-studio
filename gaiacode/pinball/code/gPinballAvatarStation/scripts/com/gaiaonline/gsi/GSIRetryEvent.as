package com.gaiaonline.gsi
{
   import flash.events.Event;
   
   public class GSIRetryEvent extends Event
   {
      
      public static const RETRY:String = "retry";
      
      private var _fails:uint;
      
      public function GSIRetryEvent(param1:String = "retry", param2:uint = 0)
      {
         super(param1);
         this._fails = param2;
      }
      
      public function get fails() : uint
      {
         return _fails;
      }
   }
}

