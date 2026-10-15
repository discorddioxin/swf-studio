package com.gaiaonline.sgs.events
{
   import com.gaiaonline.sgs.SGSClientSession;
   
   public class SGSLogoutEvent extends SGSEvent
   {
      
      public static const SGS_LOGOUT_SUCCESS:String = SGSEvent.SGS_LOGOUT_SUCCESS;
      
      public var session:SGSClientSession;
      
      public function SGSLogoutEvent(param1:String = "SGSLogoutSuccess")
      {
         super(param1,bubbles,cancelable);
         this.session = session;
      }
   }
}

