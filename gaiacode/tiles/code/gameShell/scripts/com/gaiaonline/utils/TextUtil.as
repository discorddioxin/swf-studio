package com.gaiaonline.utils
{
   import flash.utils.ByteArray;
   
   public class TextUtil
   {
      
      public function TextUtil()
      {
         super();
      }
      
      public static function toHex(param1:int) : String
      {
         return param1.toString(16);
      }
      
      public static function traceByteArray(param1:ByteArray, param2:String = "  ") : String
      {
         var _loc3_:String = byteArrayToString(param1,param2);
         trace(_loc3_);
         return _loc3_;
      }
      
      public static function dump(param1:Object, param2:uint = 0, param3:String = "") : void
      {
         var _loc6_:String = null;
         var _loc4_:String = "*";
         var _loc5_:uint = 0;
         while(_loc5_ < param2)
         {
            _loc4_ += "   ";
            _loc5_++;
         }
         for(_loc6_ in param1)
         {
            if(typeof param1[_loc6_] != "object")
            {
               trace(_loc4_ + " " + _loc6_ + " = " + param1[_loc6_]);
            }
            else
            {
               trace(_loc4_ + " " + _loc6_ + " = OBJECT: ");
               dump(param1[_loc6_],param2 + 1,param3 + _loc6_);
            }
         }
      }
      
      public static function fromDec(param1:int, param2:Number) : String
      {
         return param1.toString(param2);
      }
      
      public static function parseKeyValuePairs(param1:String) : Object
      {
         var _loc5_:String = null;
         var _loc6_:String = null;
         if(!param1)
         {
            return new Object();
         }
         var _loc2_:Array = param1.split("&");
         var _loc3_:Object = new Object();
         var _loc4_:int = int(_loc2_.length);
         var _loc7_:int = 0;
         while(_loc7_ < _loc4_)
         {
            _loc5_ = _loc2_[_loc7_].split("=")[0];
            _loc6_ = _loc2_[_loc7_].split("=")[1];
            _loc3_[_loc5_] = _loc6_;
            _loc7_++;
         }
         return _loc3_;
      }
      
      public static function toBin(param1:int) : String
      {
         return param1.toString(2);
      }
      
      public static function byteArrayToString(param1:ByteArray, param2:String = "  ") : String
      {
         var _loc3_:String = "";
         var _loc4_:int = int(param1.length);
         var _loc5_:int = 0;
         while(_loc5_ < param1.length)
         {
            _loc3_ += toHex(param1[_loc5_]).toUpperCase() + param2;
            _loc5_++;
         }
         return _loc3_;
      }
   }
}

