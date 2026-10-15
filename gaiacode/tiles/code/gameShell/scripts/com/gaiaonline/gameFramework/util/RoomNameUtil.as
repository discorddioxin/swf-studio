package com.gaiaonline.gameFramework.util
{
   public class RoomNameUtil
   {
      
      public static const SOLO_ROOM_PREFIX:String = "S";
      
      public static const PASSWORD_PROTECTED_PREFIX:String = "PW";
      
      public static const USER_CREATED_PREFIX:String = "U";
      
      public function RoomNameUtil()
      {
         super();
      }
      
      public static function getPrefix(param1:String) : String
      {
         return param1.split("_")[0];
      }
      
      public static function clean(param1:String) : String
      {
         var _loc4_:int = 0;
         var _loc2_:* = param1.split("_");
         var _loc3_:String = param1;
         if(_loc2_[0] == SOLO_ROOM_PREFIX || _loc2_[0] == PASSWORD_PROTECTED_PREFIX || _loc2_[0] == USER_CREATED_PREFIX)
         {
            _loc3_ = "";
            _loc4_ = 1;
            while(_loc4_ < _loc2_.length)
            {
               _loc3_ += _loc2_[_loc4_];
               if(_loc4_ < _loc2_.length - 1)
               {
                  _loc3_ += "_";
               }
               _loc4_++;
            }
         }
         return _loc3_;
      }
   }
}

