package com.gaiaworld.house.controller.events
{
   import com.gaiaworld.house.view.items.SwfItem;
   import flash.events.Event;
   
   public class EditEvent extends Event
   {
      
      public static const EDIT:String = "edit";
      
      public static const REFRESH:String = "refresh";
      
      public var item:SwfItem;
      
      public function EditEvent(param1:String, param2:SwfItem, param3:Boolean = false, param4:Boolean = false)
      {
         super(param1,param3,param4);
         this.item = param2;
      }
      
      override public function clone() : Event
      {
         return new EditEvent(type,this.item,bubbles,cancelable);
      }
      
      override public function toString() : String
      {
         return formatToString("EditEvent","item","type","bubbles","cancelable","eventPhase");
      }
   }
}

