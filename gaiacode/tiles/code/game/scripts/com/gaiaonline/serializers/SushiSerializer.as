package com.gaiaonline.serializers
{
   public class SushiSerializer
   {
      
      public static const encodeName:String = "sushi";
      
      private static const DELIMITER:String = "\x01";
      
      private static const ARRAY_DELIMITER:String = "\x02";
      
      private static const END:String = "\x04";
      
      private static const SUSHI_TRUE:String = "\x05";
      
      private static const SUSHI_FALSE:String = "\x06";
      
      public function SushiSerializer()
      {
         super();
      }
      
      public static function serialize(queue:Array) : String
      {
         var theMethod:Array = null;
         var theArgs:Array = null;
         var totalArgs:uint = 0;
         var arg:uint = 0;
         var totalMethods:uint = queue.length;
         var encoded:String = "";
         for(var meth:uint = 0; meth < totalMethods; meth++)
         {
            theMethod = queue[meth];
            encoded += theMethod[0];
            theArgs = theMethod[1];
            totalArgs = theArgs ? theArgs.length : 0;
            for(arg = 0; arg < totalArgs; arg++)
            {
               if(theArgs[arg] is Array)
               {
                  encoded += DELIMITER + theArgs[arg].join(ARRAY_DELIMITER);
               }
               else
               {
                  encoded += DELIMITER + String(theArgs[arg]);
               }
            }
            encoded += END;
         }
         return encoded;
      }
      
      public static function unwhitespace(raw:String) : String
      {
         var first:int = 0;
         while(first < raw.length && raw.charCodeAt(first) <= 32)
         {
            first++;
         }
         var last:* = int(raw.length - 1);
         while(last > first && raw.charCodeAt(last) <= 32)
         {
            last--;
         }
         return raw.substring(first,last);
      }
      
      public static function unserialize(raw:String) : Array
      {
         var thisMethod:Array = null;
         var totalElements:uint = 0;
         var element:uint = 0;
         raw = unwhitespace(raw);
         var methods:Array = raw.split(END);
         var totalMethods:uint = methods.length;
         var decoded:Array = new Array();
         for(var I:int = 0; I < totalMethods; I++)
         {
            thisMethod = methods[I].split(DELIMITER);
            totalElements = thisMethod.length;
            decoded[I] = new Array();
            decoded[I][0] = thisMethod[0];
            decoded[I][1] = thisMethod[1] == SUSHI_TRUE ? true : false;
            decoded[I][2] = new Array();
            for(element = 2; element < totalElements; element++)
            {
               if(thisMethod[element].indexOf(ARRAY_DELIMITER) != -1)
               {
                  decoded[I][2].push(thisMethod[element].split(ARRAY_DELIMITER));
               }
               else
               {
                  decoded[I][2].push(thisMethod[element]);
               }
            }
         }
         return decoded;
      }
   }
}

