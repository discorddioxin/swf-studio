package com.gaiaonline.sgs.events
{
   import com.gaiaonline.sgs.SGSChannel;
   
   public class SGSChannelLeaveEvent extends SGSEvent
   {
      
      public static const SGS_CHANNEL_LEAVE:String = SGSEvent.SGS_CHANNEL_LEAVE;
      
      public var channel:SGSChannel;
      
      public var channelIndex:uint = 0;
      
      public function SGSChannelLeaveEvent(param1:String = "SGSChannelLeave", param2:Boolean = false, param3:Boolean = false, param4:SGSChannel = null)
      {
         super(param1,param2,param3);
         this.channel = param4;
      }
   }
}

