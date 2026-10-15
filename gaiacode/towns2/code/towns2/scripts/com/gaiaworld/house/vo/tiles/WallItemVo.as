package com.gaiaworld.house.vo.tiles
{
   import com.gaiaworld.house.view.tiles.WallMapTile;
   
   public class WallItemVo
   {
      
      public var x:Number;
      
      public var y:Number;
      
      public var z:Number;
      
      public var depth:Number;
      
      public var clip:WallMapTile;
      
      public var isObject:Boolean = false;
      
      public function WallItemVo(param1:Number, param2:Number, param3:Number, param4:Number, param5:WallMapTile, param6:Boolean = false)
      {
         super();
         this.x = param1;
         this.y = param2;
         this.z = param3;
         this.depth = this.depth;
         this.clip = param5;
         this.isObject = param6;
      }
   }
}

