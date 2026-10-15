package com.gaiaworld.house.vo.items
{
   import com.gaiaworld.house.view.items.SwfItem;
   
   public class StackedItemVo
   {
      
      public var item:SwfItem;
      
      public var xDif:Number;
      
      public var yDif:Number;
      
      public function StackedItemVo(param1:SwfItem, param2:Number, param3:Number)
      {
         super();
         this.item = param1;
         this.xDif = param2;
         this.yDif = param3;
      }
   }
}

