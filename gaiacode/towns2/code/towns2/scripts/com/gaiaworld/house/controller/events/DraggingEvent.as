package com.gaiaworld.house.controller.events
{
   import com.gaiaworld.house.view.items.SwfItem;
   import flash.events.Event;
   
   public class DraggingEvent extends Event
   {
      
      public static const DRAGGING:String = "dragging";
      
      public static const RELEASED:String = "released";
      
      public static const INIT:String = "init";
      
      public var item:SwfItem;
      
      public function DraggingEvent(param1:String, param2:SwfItem, param3:Boolean = false, param4:Boolean = false)
      {
         super(param1,param3,param4);
         this.item = param2;
      }
      
      override public function clone() : Event
      {
         return new DraggingEvent(type,this.item,bubbles,cancelable);
      }
      
      override public function toString() : String
      {
         return formatToString("DraggingEvent","type","bubbles","cancelable","eventPhase");
      }
   }
}

