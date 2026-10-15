package com.gaiaonline.gateway.sgs
{
   import com.gaiaonline.gateway.GaiaGatewayProtocol;
   
   public class SGSGaiaProtocol extends GaiaGatewayProtocol
   {
      
      public static const FUNCTION_WELCOME:String = "core.welcome";
      
      public static const FUNCTION_CHAT:String = "core.chat";
      
      public static const FUNCTION_JOIN_CHANNEL:String = "core.joinChannel";
      
      public static const FUNCTION_LEAVE_CHANNEL:String = "core.leaveChannel";
      
      public static const FUNCTION_CREATE_CHANNEL:String = "core.createChannel";
      
      public static const FUNCTION_PRESENCE_LIST:String = "core.presenceList";
      
      public static const FUNCTION_PRESENCE_IN:String = "core.presenceIn";
      
      public static const FUNCTION_PRESENCE_OUT:String = "core.presenceOut";
      
      public static const FUNCTION_PRESENCE_UPDATE:String = "core.presenceUpdate";
      
      public static const FUNCTION_WALK:String = "core.walk";
      
      public static const FUNCTION_GET_ALL_CHANNELS:String = "core.getAllChannels";
      
      public static const FUNCTION_SET_SYS_INFO:String = "core.setSysInfo";
      
      public function SGSGaiaProtocol()
      {
         super();
      }
   }
}

