package com.gaiaworld.house.util
{
   public class StringFunctions
   {
      
      public function StringFunctions()
      {
         super();
      }
      
      public static function unwhitespace(param1:String) : String
      {
         param1 = findReplace("  ",param1,"");
         return trim(param1);
      }
      
      public static function findReplace(param1:String, param2:String, param3:String) : *
      {
         var _loc4_:Array = param2.split(param1);
         return _loc4_.join(param3);
      }
      
      public static function ltrim(param1:*) : *
      {
         var _loc2_:Number = NaN;
         if(param1.length > 1 || param1.length == 1 && param1.charCodeAt(0) > 32 && param1.charCodeAt(0) < 255)
         {
            _loc2_ = 0;
            while(_loc2_ < param1.length && (param1.charCodeAt(_loc2_) <= 32 || param1.charCodeAt(_loc2_) >= 255))
            {
               _loc2_++;
            }
            param1 = param1.substring(_loc2_);
         }
         else
         {
            param1 = "";
         }
         return param1;
      }
      
      public static function rtrim(param1:*) : *
      {
         var _loc2_:Number = 0;
         if(param1.length > 1 || param1.length == 1 && param1.charCodeAt(0) > 32 && param1.charCodeAt(0) < 255)
         {
            _loc2_ = param1.length - 1;
            while(_loc2_ >= 0 && (param1.charCodeAt(_loc2_) <= 32 || param1.charCodeAt(_loc2_) >= 255))
            {
               _loc2_--;
            }
            param1 = param1.substring(0,_loc2_ + 1);
         }
         else
         {
            param1 = "";
         }
         return param1;
      }
      
      public static function trim(param1:*) : *
      {
         return ltrim(rtrim(param1));
      }
   }
}

