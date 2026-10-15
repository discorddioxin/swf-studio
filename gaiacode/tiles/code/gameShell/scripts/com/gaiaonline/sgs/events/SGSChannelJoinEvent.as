package com.gaiaonline.sgs.events
{
   import com.gaiaonline.sgs.SGSChannel;
   
   public class SGSChannelJoinEvent extends SGSEvent
   {
      
      public static const SGS_CHANNEL_JOIN:String = SGSEvent.SGS_CHANNEL_JOIN;
      
      public var channel:SGSChannel;
      
      public function SGSChannelJoinEvent(param1:String = "SGSChannelJoin", param2:Boolean = false, param3:Boolean = false, param4:SGSChannel = null)
      {
         super(param1,param2,param3);
         this.channel = param4;
      }
   }
}

