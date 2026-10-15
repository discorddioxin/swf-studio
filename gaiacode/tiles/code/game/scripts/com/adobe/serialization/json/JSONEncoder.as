package com.adobe.serialization.json
{
   import flash.utils.describeType;
   
   public class JSONEncoder
   {
      
      private var jsonString:String;
      
      public function JSONEncoder(value:*)
      {
         super();
         jsonString = convertToString(value);
      }
      
      private function escapeString(str:String) : String
      {
         var ch:String = null;
         var hexCode:String = null;
         var zeroPad:String = null;
         var s:String = "";
         var len:Number = str.length;
         for(var i:int = 0; i < len; i++)
         {
            ch = str.charAt(i);
            switch(ch)
            {
               case "\"":
                  s += "\\\"";
                  break;
               case "\\":
                  s += "\\\\";
                  break;
               case "\b":
                  s += "\\b";
                  break;
               case "\f":
                  s += "\\f";
                  break;
               case "\n":
                  s += "\\n";
                  break;
               case "\r":
                  s += "\\r";
                  break;
               case "\t":
                  s += "\\t";
                  break;
               default:
                  if(ch < " ")
                  {
                     hexCode = ch.charCodeAt(0).toString(16);
                     zeroPad = hexCode.length == 2 ? "00" : "000";
                     s += "\\u" + zeroPad + hexCode;
                  }
                  else
                  {
                     s += ch;
                  }
            }
         }
         return "\"" + s + "\"";
      }
      
      private function arrayToString(a:Array) : String
      {
         var counter:int = 0;
         var temp:String = null;
         if(a.length == 0)
         {
            counter = 0;
            var _loc6_:int = 0;
            var _loc7_:* = a;
            for(temp in _loc7_)
            {
               counter++;
            }
            if(counter > 0)
            {
               return objectToString(a);
            }
         }
         var s:String = "";
         for(var i:int = 0; i < a.length; i++)
         {
            if(s.length > 0)
            {
               s += ",";
            }
            s += convertToString(a[i]);
         }
         return "[" + s + "]";
      }
      
      public function getString() : String
      {
         return jsonString;
      }
      
      private function objectToString(o:Object) : String
      {
         var value:Object = null;
         var key:String = null;
         var v:XML = null;
         var s:String = "";
         var classInfo:XML = describeType(o);
         if(classInfo.@name.toString() == "Object" || classInfo.@name.toString() == "Array")
         {
            for(key in o)
            {
               value = o[key];
               if(!(value is Function))
               {
                  if(s.length > 0)
                  {
                     s += ",";
                  }
                  s += escapeString(key) + ":" + convertToString(value);
               }
            }
         }
         else
         {
            for each(v in classInfo..*.(name() == "variable" || name() == "accessor"))
            {
               if(s.length > 0)
               {
                  s += ",";
               }
               s += escapeString(v.@name.toString()) + ":" + convertToString(o[v.@name]);
            }
         }
         return "{" + s + "}";
      }
      
      private function convertToString(value:*) : String
      {
         if(value is String)
         {
            return escapeString(value as String);
         }
         if(value is Number)
         {
            return isFinite(value as Number) ? value.toString() : "null";
         }
         if(value is Boolean)
         {
            return value ? "true" : "false";
         }
         if(value is Array)
         {
            return arrayToString(value as Array);
         }
         if(value is Object && value != null)
         {
            return objectToString(value);
         }
         return "null";
      }
   }
}

