package com.gaiaworld.room.vo
{
   public class LocationVo
   {
      
      public var roomName:String;
      
      public var direction:Number;
      
      public function LocationVo(param1:String, param2:Number)
      {
         super();
         this.roomName = param1;
         this.direction = param2;
      }
   }
}

