package com.gaiaonline.utils
{
   import flash.utils.ByteArray;
   
   public class ByteArrayUtils
   {
      
      public function ByteArrayUtils()
      {
         super();
         throw "you can\'t create me";
      }
      
      public static function clear(param1:ByteArray) : ByteArray
      {
         var ba:ByteArray = param1;
         return new ByteArray();
      }
   }
}

