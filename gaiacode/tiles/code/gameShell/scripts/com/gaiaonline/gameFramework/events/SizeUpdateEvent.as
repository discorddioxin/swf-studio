package com.gaiaonline.gameFramework.events
{
   import flash.events.Event;
   
   public class SizeUpdateEvent extends Event
   {
      
      public static const SIZE_UPDATE:String = "sizeupdate";
      
      public var width:Number = 0;
      
      public var height:Number = 0;
      
      public function SizeUpdateEvent(param1:String, param2:Number, param3:Number, param4:Boolean = false, param5:Boolean = false)
      {
         super(param1,param4,param5);
         this.width = param2;
         this.height = param3;
      }
   }
}

