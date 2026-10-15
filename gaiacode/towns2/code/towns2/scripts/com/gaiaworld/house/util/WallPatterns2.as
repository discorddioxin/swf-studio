package com.gaiaworld.house.util
{
   import com.gaiaworld.house.controller.DebugController;
   
   public class WallPatterns2
   {
      
      private var debugController:DebugController = new DebugController();
      
      public function WallPatterns2()
      {
         super();
      }
      
      public function getTile(param1:Number, param2:Number, param3:Number, param4:Number) : *
      {
         var _loc5_:Boolean = int(param1 / 2) == param1 / 2 ? true : false;
         var _loc6_:Boolean = int(param2 / 2) == param2 / 2 ? true : false;
         var _loc7_:Number = 0;
         if(param3 == 4)
         {
            switch(param4)
            {
               case 1:
                  if(_loc5_ == true && _loc6_ == false)
                  {
                     _loc7_ = 2;
                  }
                  if(_loc5_ == false && _loc6_ == false)
                  {
                     _loc7_ = 3;
                  }
                  if(_loc5_ == false && _loc6_ == true)
                  {
                     _loc7_ = 1;
                  }
                  if(_loc5_ == true && _loc6_ == true)
                  {
                     _loc7_ = 0;
                  }
                  break;
               case 2:
                  if(_loc5_ == true && _loc6_ == false)
                  {
                     _loc7_ = 0;
                  }
                  if(_loc5_ == false && _loc6_ == false)
                  {
                     _loc7_ = 1;
                  }
                  if(_loc5_ == false && _loc6_ == true)
                  {
                     _loc7_ = 3;
                  }
                  if(_loc5_ == true && _loc6_ == true)
                  {
                     _loc7_ = 2;
                  }
                  break;
               case 3:
                  if(_loc5_ == true && _loc6_ == true)
                  {
                     _loc7_ = 2;
                  }
                  if(_loc5_ == false && _loc6_ == true)
                  {
                     _loc7_ = 1;
                  }
                  if(_loc5_ == false && _loc6_ == false)
                  {
                     _loc7_ = 3;
                  }
                  if(_loc5_ == true && _loc6_ == false)
                  {
                     _loc7_ = 0;
                  }
                  break;
               case 4:
                  if(_loc5_ == true && _loc6_ == true)
                  {
                     _loc7_ = 0;
                  }
                  if(_loc5_ == false && _loc6_ == true)
                  {
                     _loc7_ = 3;
                  }
                  if(_loc5_ == false && _loc6_ == false)
                  {
                     _loc7_ = 1;
                  }
                  if(_loc5_ == true && _loc6_ == false)
                  {
                     _loc7_ = 2;
                  }
                  break;
               case 5:
                  if(_loc5_ == true && _loc6_ == true)
                  {
                     _loc7_ = 0;
                  }
                  if(_loc5_ == false && _loc6_ == true)
                  {
                     _loc7_ = 1;
                  }
                  if(_loc5_ == false && _loc6_ == false)
                  {
                     _loc7_ = 3;
                  }
                  if(_loc5_ == true && _loc6_ == false)
                  {
                     _loc7_ = 2;
                  }
                  break;
               case 6:
                  _loc7_ = int(param2 / 4);
            }
         }
         if(param3 == 2)
         {
            switch(param4)
            {
               case 1:
                  if(_loc5_ == true && _loc6_ == true || _loc5_ == false && _loc6_ == false)
                  {
                     _loc7_ = 1;
                  }
                  break;
               case 2:
                  if(_loc5_ == true && _loc6_ == true || _loc5_ == false && _loc6_ == false)
                  {
                     _loc7_ = 0;
                  }
                  else
                  {
                     _loc7_ = 1;
                  }
                  break;
               case 3:
                  _loc7_ = 0;
                  break;
               case 4:
                  _loc7_ = 1;
                  break;
               case 5:
                  if(_loc5_ == true)
                  {
                     _loc7_ = 1;
                  }
                  break;
               case 6:
                  if(_loc6_ == true)
                  {
                     _loc7_ = 0;
                  }
                  else
                  {
                     _loc7_ = 1;
                  }
            }
         }
         return _loc7_;
      }
      
      public function getFloorTile(param1:Number, param2:Number, param3:Number, param4:Number) : *
      {
         var _loc5_:Number = 0;
         var _loc6_:Boolean = int(param1 / 2) == param1 / 2 ? true : false;
         var _loc7_:Boolean = int(param2 / 2) == param2 / 2 ? true : false;
         if(param3 == 4)
         {
            switch(param4)
            {
               case 1:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 2;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 3;
                  }
                  break;
               case 2:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 3;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 2;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 0;
                  }
                  break;
               case 3:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 2;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 3;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 0;
                  }
                  break;
               case 4:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 3;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 2;
                  }
                  break;
               case 5:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 2;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 3;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 1;
                  }
            }
         }
         if(param3 == 2)
         {
            switch(param4)
            {
               case 1:
                  return 0;
               case 2:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 1;
                  }
                  break;
               case 3:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 0;
                  }
                  break;
               case 4:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 0;
                  }
                  break;
               case 5:
                  if(_loc6_ == true && _loc7_ == false)
                  {
                     _loc5_ = 1;
                  }
                  if(_loc6_ == false && _loc7_ == false)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == false && _loc7_ == true)
                  {
                     _loc5_ = 0;
                  }
                  if(_loc6_ == true && _loc7_ == true)
                  {
                     _loc5_ = 1;
                  }
            }
         }
         return _loc5_;
      }
   }
}

