package com.gaiaonline.sgs.events
{
   import flash.events.Event;
   
   public class SGSEvent extends Event
   {
      
      public static const SGS_MESSAGE:String = "SGSMessage";
      
      public static const SGS_LOGIN_SUCCESS:String = "SGSLoginSuccess";
      
      public static const SGS_LOGIN_FAIL:String = "SGSLoginFail";
      
      public static const SGS_LOGOUT_SUCCESS:String = "SGSLogoutSuccess";
      
      public static const SGS_CHANNEL_JOIN:String = "SGSChannelJoin";
      
      public static const SGS_CHANNEL_LEAVE:String = "SGSChannelLeave";
      
      public static const SGS_CHANNEL_MESSAGE:String = "SGSChannelMessage";
      
      public function SGSEvent(param1:String, param2:Boolean = false, param3:Boolean = false)
      {
         super(param1,param2,param3);
      }
   }
}

