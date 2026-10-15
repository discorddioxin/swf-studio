package com.gaiaworld.hangouts.controller.events
{
   import flash.events.Event;
   
   public class RoomEvent extends Event
   {
      
      public static const CHOOSE_ROOM:String = "chooseRoom";
      
      public var roomIndex:Number;
      
      public function RoomEvent(param1:String, param2:Number, param3:Boolean = false, param4:Boolean = false)
      {
         super(param1,param3,param4);
         this.roomIndex = param2;
      }
      
      override public function clone() : Event
      {
         return new RoomEvent(type,this.roomIndex,bubbles,cancelable);
      }
      
      override public function toString() : String
      {
         return formatToString("RoomEvent","type","roomIndex","bubbles","cancelable","eventPhase");
      }
   }
}

