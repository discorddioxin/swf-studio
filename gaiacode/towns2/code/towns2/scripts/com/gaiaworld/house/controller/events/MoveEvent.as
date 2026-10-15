package com.gaiaworld.house.controller.events
{
   import com.gaiaworld.house.view.items.SwfItem;
   import flash.events.Event;
   
   public class MoveEvent extends Event
   {
      
      public static var MOVE_ITEM:String = "move";
      
      public static var MOVE_WALL_ITEM:String = "moveWallItem";
      
      public var x:Number;
      
      public var z:Number;
      
      public var item:SwfItem;
      
      public function MoveEvent(param1:String, param2:SwfItem, param3:Number, param4:Number, param5:Boolean = false, param6:Boolean = false)
      {
         super(param1,param5,param6);
         this.item = param2;
         this.x = param3;
         this.z = param4;
      }
      
      override public function clone() : Event
      {
         return new MoveEvent(type,this.item,this.x,this.z,bubbles,cancelable);
      }
      
      override public function toString() : String
      {
         return formatToString("MoveEvent","type","item","x","y","bubbles","cancelable","eventPhase");
      }
   }
}

