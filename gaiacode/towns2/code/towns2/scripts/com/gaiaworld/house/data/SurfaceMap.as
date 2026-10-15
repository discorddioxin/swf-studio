package com.gaiaworld.house.data
{
   import com.gaiaworld.house.controller.DebugController;
   import com.gaiaworld.house.controller.HouseController;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   
   public class SurfaceMap extends EventDispatcher
   {
      
      public static const MAP_ERROR:String = "mapError";
      
      public var w:Number;
      
      public var h:Number;
      
      private var mapArray:Array;
      
      private var indexArray:Array;
      
      private var debugController:DebugController;
      
      private var houseController:HouseController;
      
      public var mapName:String;
      
      private var levels:Number = 4;
      
      public function SurfaceMap(param1:Number, param2:Number, param3:String)
      {
         var _loc6_:int = 0;
         this.mapArray = new Array();
         this.indexArray = new Array();
         this.debugController = new DebugController();
         this.houseController = new HouseController();
         super();
         this.mapName = param3;
         this.w = param1;
         this.h = param2;
         var _loc4_:Number = this.h;
         if(param1 > _loc4_)
         {
            _loc4_ = param1;
         }
         var _loc5_:int = 0;
         while(_loc5_ < this.levels)
         {
            this.mapArray[_loc5_] = new Array();
            this.indexArray[_loc5_] = new Array();
            _loc6_ = 0;
            while(_loc6_ < _loc4_)
            {
               this.mapArray[_loc5_][_loc6_] = new Array();
               this.indexArray[_loc5_][_loc6_] = new Array();
               _loc6_++;
            }
            _loc5_++;
         }
         this.houseController.registerMap(this.mapName,this);
         this.clearMap();
      }
      
      public function clearMap() : void
      {
         var _loc3_:int = 0;
         var _loc4_:int = 0;
         var _loc1_:Number = this.h;
         if(this.w > _loc1_)
         {
            _loc1_ = this.w;
         }
         var _loc2_:int = 0;
         while(_loc2_ < this.levels)
         {
            _loc3_ = 0;
            while(_loc3_ < _loc1_)
            {
               _loc4_ = 0;
               while(_loc4_ < _loc1_)
               {
                  this.mapArray[_loc2_][_loc3_][_loc4_] = -1;
                  this.indexArray[_loc2_][_loc3_][_loc4_] = -1;
                  _loc4_++;
               }
               _loc3_++;
            }
            _loc2_++;
         }
      }
      
      public function placeItem(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number, param6:Number = 1, param7:Number = 1, param8:Number = -1) : Boolean
      {
         switch(param6)
         {
            case 1:
            case 3:
               return this.placeItemRot0(param1,param2,param3,param4,param5,param7,param8);
            case 2:
            case 4:
               return this.placeItemRot90(param1,param2,param3,param4,param5,param7,param8);
            default:
               return false;
         }
      }
      
      public function removeItem(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number, param6:Number = 1) : *
      {
         switch(param6)
         {
            case 1:
            case 3:
               this.placeItemRot0(param1,param2,param3,param4,param5,-1);
               break;
            case 2:
            case 4:
               this.placeItemRot90(param1,param2,param3,param4,param5,-1);
         }
      }
      
      private function placeItemRot0(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number, param6:Number = 1, param7:Number = -1) : Boolean
      {
         var x2:Number;
         var y2:Number;
         var i:int;
         var j:int = 0;
         var level:Number = param1;
         var x:Number = param2;
         var y:Number = param3;
         var w:Number = param4;
         var l:Number = param5;
         var val:Number = param6;
         var index:Number = param7;
         if(x < 0)
         {
            x = 0;
         }
         else
         {
            ;
         }
         if(y < 0)
         {
            y = 0;
         }
         else
         {
            ;
         }
         if(w == 1 && l == 1)
         {
            this.mapArray[level][y][x] = val;
            this.indexArray[level][y][x] = index;
            return true;
         }
         x2 = x + w;
         y2 = y + l;
         i = x;
         while(i < x2)
         {
            j = y;
            while(j < y2)
            {
               try
               {
                  this.mapArray[level][j][i] = val;
               }
               catch(e:Error)
               {
                  this.dispatchEvent(new Event(MAP_ERROR,true));
                  return false;
               }
               try
               {
                  this.indexArray[level][j][i] = index;
               }
               catch(e:Error)
               {
               }
               j++;
            }
            i++;
         }
         return true;
      }
      
      private function placeItemRot90(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number, param6:Number = 1, param7:Number = -1) : Boolean
      {
         var len:Number;
         var startX:Number;
         var endX:Number;
         var startY:Number;
         var endY:Number;
         var i:int;
         var j:int = 0;
         var level:Number = param1;
         var x:Number = param2;
         var y:Number = param3;
         var w:Number = param4;
         var l:Number = param5;
         var val:Number = param6;
         var index:Number = param7;
         if(x < 0)
         {
            x = 0;
         }
         else
         {
            ;
         }
         if(y < 0)
         {
            y = 0;
         }
         else
         {
            ;
         }
         if(w == 1 && l == 1)
         {
            this.mapArray[level][y][x] = val;
            this.indexArray[level][y][x] = index;
            return true;
         }
         len = l;
         startX = x;
         endX = x + len;
         startY = y;
         endY = y + w;
         i = startX;
         while(i < endX)
         {
            j = startY;
            while(j < endY)
            {
               try
               {
                  this.mapArray[level][j][i] = val;
               }
               catch(e:Error)
               {
                  this.dispatchEvent(new Event(MAP_ERROR,true));
                  return false;
               }
               try
               {
                  this.indexArray[level][j][i] = index;
               }
               catch(e:Error)
               {
               }
               j++;
            }
            i++;
         }
         return true;
      }
      
      public function isBlocked(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number, param6:Number = 1) : Number
      {
         if(param2 > this.w + 1 || param3 > this.h + 1 || param2 < 0 || param3 < 0)
         {
         }
         switch(param6)
         {
            case 1:
            case 3:
               return this.isBlockedRot0(param1,param2,param3,param4,param5);
            case 2:
            case 4:
               return this.isBlocked90(param1,param2,param3,param4,param5);
            default:
               return -1;
         }
      }
      
      public function isFloorBlocked(param1:Number, param2:Number) : Number
      {
         return this.mapArray[1][param2][param1];
      }
      
      private function isBlockedRot0(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number) : Number
      {
         var _loc9_:int = 0;
         if(param2 < 0)
         {
            param2 = 0;
         }
         else
         {
            param2 = param2;
         }
         if(param3 < 0)
         {
            param3 = 0;
         }
         else
         {
            param3 = param3;
         }
         if(param4 == 1 && param5 == 1)
         {
            return this.mapArray[param1][param3][param2];
         }
         var _loc6_:Number = param2 + param4 + 1;
         var _loc7_:Number = param3 + param5;
         var _loc8_:int = param2;
         while(_loc8_ < _loc6_)
         {
            _loc9_ = param3;
            while(_loc9_ < _loc7_)
            {
               if(_loc9_ < this.w && _loc8_ < this.h)
               {
                  if(this.mapArray[param1][_loc9_][_loc8_] != -1)
                  {
                     if(isNaN(this.mapArray[param1][_loc9_][_loc8_]))
                     {
                        return -1;
                     }
                     return this.mapArray[param1][_loc9_][_loc8_];
                  }
               }
               _loc9_++;
            }
            _loc8_++;
         }
         return -1;
      }
      
      private function isBlocked90(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number) : Number
      {
         var _loc12_:int = 0;
         if(param2 < 0)
         {
            param2 = 0;
         }
         else
         {
            param2 = param2;
         }
         if(param3 < 0)
         {
            param3 = 0;
         }
         else
         {
            param3 = param3;
         }
         if(param4 == 1 && param5 == 1)
         {
            return this.mapArray[param1][param3][param2];
         }
         var _loc6_:Number = param5;
         var _loc7_:Number = param2;
         var _loc8_:Number = param2 + _loc6_;
         var _loc9_:Number = param3;
         var _loc10_:Number = param3 + param4;
         if(_loc9_ + _loc10_ > this.h)
         {
         }
         if(_loc7_ + _loc8_ > this.w)
         {
         }
         var _loc11_:int = _loc7_;
         while(_loc11_ < _loc8_)
         {
            _loc12_ = _loc9_;
            while(_loc12_ < _loc10_)
            {
               if(_loc12_ < this.w - 1 && _loc11_ < this.h - 1)
               {
                  if(this.mapArray[param1][_loc12_][_loc11_] != -1)
                  {
                     return this.mapArray[param1][_loc12_][_loc11_];
                  }
               }
               _loc12_++;
            }
            _loc11_++;
         }
         return -1;
      }
      
      public function getItemIndexOn(param1:Number, param2:Number, param3:Number) : *
      {
         return this.indexArray[param1][param3][param2];
      }
      
      public function clearItemFromMap(param1:Number, param2:Number) : void
      {
         var _loc4_:int = 0;
         var _loc3_:int = 0;
         while(_loc3_ < this.h)
         {
            _loc4_ = 0;
            while(_loc4_ < this.w)
            {
               if(this.indexArray[param1][_loc4_][_loc3_] == param2)
               {
                  this.indexArray[param1][_loc4_][_loc3_] = -1;
                  this.mapArray[param1][_loc4_][_loc3_] = -1;
               }
               _loc4_++;
            }
            _loc3_++;
         }
      }
      
      public function displayMap() : *
      {
         var _loc2_:int = 0;
         var _loc1_:int = 0;
         while(_loc1_ < this.levels)
         {
            _loc2_ = 0;
            while(_loc2_ < this.w)
            {
               _loc2_++;
            }
            _loc1_++;
         }
      }
      
      public function checkOutOfBounds(param1:Number, param2:Number, param3:Number, param4:Number, param5:Number) : Boolean
      {
         var _loc7_:Number = NaN;
         var _loc8_:Number = NaN;
         var _loc6_:Number = param3;
         switch(param5)
         {
            case 1:
            case 3:
               _loc7_ = param1 + param4;
               _loc8_ = param2 + _loc6_;
               break;
            case 2:
            case 4:
               _loc7_ = param1 + _loc6_;
               _loc8_ = param2 + param4;
         }
         if(_loc8_ > this.w || _loc7_ > this.h)
         {
            return true;
         }
         return false;
      }
   }
}

