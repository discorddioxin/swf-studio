package com.gaiaonline.sgs.events
{
   import com.gaiaonline.sgs.SGSMessage;
   
   public class SGSMessageEvent extends SGSEvent
   {
      
      public static const SGS_MESSAGE:String = SGSEvent.SGS_MESSAGE;
      
      public var message:SGSMessage;
      
      public function SGSMessageEvent(param1:String = "SGSMessage", param2:Boolean = false, param3:Boolean = false, param4:SGSMessage = null)
      {
         super(param1,param2,param3);
         this.message = param4;
      }
   }
}

