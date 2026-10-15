package com.gaiaonline.sgs.events
{
   import com.gaiaonline.sgs.SGSMessage;
   
   public class SGSChannelMessageEvent extends SGSMessageEvent
   {
      
      public static const SGS_CHANNEL_MESSAGE:String = SGSEvent.SGS_CHANNEL_MESSAGE;
      
      public function SGSChannelMessageEvent(param1:String = "SGSChannelMessage", param2:Boolean = false, param3:Boolean = false, param4:SGSMessage = null)
      {
         super(param1,param2,param3,param4);
      }
   }
}

