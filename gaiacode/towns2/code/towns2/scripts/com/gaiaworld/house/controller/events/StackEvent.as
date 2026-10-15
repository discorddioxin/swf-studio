package com.gaiaworld.house.controller.events
{
   import com.gaiaworld.house.vo.SwfVo;
   import flash.events.Event;
   
   public class StackEvent extends Event
   {
      
      public static const STACK_ON_TOP:String = "stackOnTop";
      
      public static const MOVE_TO_WALL:String = "moveToWall";
      
      public var bottomIndex:Number;
      
      public var topIndex:Number;
      
      public var bottomSwf:SwfVo;
      
      public function StackEvent(param1:String, param2:Number, param3:Number, param4:SwfVo, param5:Boolean = false, param6:Boolean = false)
      {
         super(param1,param5,param6);
         this.topIndex = param2;
         this.bottomIndex = param3;
         this.bottomSwf = param4;
      }
      
      override public function clone() : Event
      {
         return new StackEvent(type,this.topIndex,this.bottomIndex,this.bottomSwf,bubbles,cancelable);
      }
      
      override public function toString() : String
      {
         return formatToString("StackEvent","item","swfVo","type","bubbles","cancelable","eventPhase");
      }
   }
}

