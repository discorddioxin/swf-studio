package com.gaiaworld.house.vo
{
   public class SwfVo
   {
      
      public var itemID:Number;
      
      public var height:Number;
      
      public var width:Number;
      
      public var length:Number;
      
      public var canStackOn:Boolean;
      
      public var isStackable:Boolean;
      
      public function SwfVo(param1:Number, param2:Number, param3:Number, param4:Number, param5:Boolean, param6:Boolean)
      {
         super();
         this.itemID = param1;
         this.height = param2;
         this.width = param3;
         this.length = param4;
         this.canStackOn = param5;
         this.isStackable = param6;
      }
   }
}

