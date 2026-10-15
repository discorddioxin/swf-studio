package com.gaiaworld.house.controller.events
{
   import com.gaiaworld.house.view.items.SwfItem;
   import flash.events.Event;
   
   public class ResetEvent extends Event
   {
      
      public static var RESET_ITEM:String = "resetItem";
      
      public var item:SwfItem;
      
      public function ResetEvent(param1:String, param2:SwfItem, param3:Boolean = false, param4:Boolean = false)
      {
         super(param1,param3,param4);
         this.item = param2;
      }
      
      override public function clone() : Event
      {
         return new ResetEvent(type,this.item,bubbles,cancelable);
      }
      
      override public function toString() : String
      {
         return formatToString("ResetEvent","type","item","bubbles","cancelable","eventPhase");
      }
   }
}

