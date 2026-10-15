package com.gaiaonline.sgs.events
{
   import com.gaiaonline.sgs.SGSClientSession;
   
   public class SGSLoginEvent extends SGSEvent
   {
      
      public static const SGS_LOGIN_SUCCESS:String = SGSEvent.SGS_LOGIN_SUCCESS;
      
      public static const SGS_LOGIN_FAIL:String = SGSEvent.SGS_LOGIN_FAIL;
      
      public var status:int = 0;
      
      public var session:SGSClientSession;
      
      public var data:String;
      
      public function SGSLoginEvent(param1:String = "SGSLoginSuccess", param2:SGSClientSession = null, param3:String = "")
      {
         super(param1,bubbles,cancelable);
         this.session = param2;
         this.data = param3;
      }
   }
}

