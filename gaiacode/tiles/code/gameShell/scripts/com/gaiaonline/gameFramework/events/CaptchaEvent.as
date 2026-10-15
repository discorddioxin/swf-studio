package com.gaiaonline.gameFramework.events
{
   import flash.events.Event;
   
   public class CaptchaEvent extends Event
   {
      
      public static const SUBMIT:String = "captcha.submit";
      
      public static const ERROR:String = "captcha.error";
      
      private var _data:String;
      
      public function CaptchaEvent(param1:String, param2:String = "")
      {
         super(param1);
         _data = param2;
      }
      
      public function get data() : String
      {
         return _data;
      }
   }
}

