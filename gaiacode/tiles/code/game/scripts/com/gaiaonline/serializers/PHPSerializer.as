package com.gaiaonline.serializers
{
   import mx.core.*;
   
   use namespace mx_internal;
   
   public class PHPSerializer
   {
      
      mx_internal static var c:uint;
      
      public static const version:String = "3.0.0";
      
      public static const encodeName:String = "phpobject";
      
      mx_internal static var pattern:RegExp = /[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+|\-\d{4}/g;
      
      public function PHPSerializer()
      {
         super();
      }
      
      public static function serialize(data:*) : String
      {
         var s:String = null;
         var key:String = null;
         var tmp:Array = new Array();
         var i:int = 0;
         if(data is Boolean)
         {
            s = "b:" + uint(data) + ";";
         }
         else if(data is int)
         {
            s = "i:" + data.toString() + ";";
         }
         else if(data is Number)
         {
            s = "d:" + data.toString() + ";";
         }
         else if(data is String)
         {
            s = "s:" + PHPSerializer.stringLength(data) + ":\"" + data + "\";";
         }
         else if(data is Date)
         {
            s = "s:" + data.toString().length + ":\"" + data + "\";";
         }
         else if(data is Array)
         {
            for(key in data)
            {
               tmp.push(PHPSerializer.serialize(i));
               tmp.push(PHPSerializer.serialize(data[key]));
               i += 1;
            }
            s = "a:" + i + ":{" + tmp.join("") + "}";
         }
         else if(data is Object)
         {
            for(key in data)
            {
               tmp.push(PHPSerializer.serialize(key));
               tmp.push(PHPSerializer.serialize(data[key]));
               i += 1;
            }
            s = "O:8:\"stdClass\":" + i + ":{" + tmp.join("") + "}";
         }
         else if(data == null || data == undefined)
         {
            s = "N;";
         }
         else
         {
            s = "i:0;";
         }
         return s;
      }
      
      public static function unserialize(data:String) : *
      {
         PHPSerializer.c = 0;
         return PHPSerializer.unserialize_internal(data);
      }
      
      mx_internal static function unserialize_internal(data:String) : *
      {
         var result:* = undefined;
         var tmpvar:* = undefined;
         var i:uint = 0;
         var tmps:* = undefined;
         var lenc:uint = 0;
         var key:uint = 0;
         var tmp:Array = new Array();
         var type:String = data.charAt(PHPSerializer.c);
         var pos:uint = 0;
         var islist:Boolean = true;
         switch(type)
         {
            case "N":
               PHPSerializer.c += 2;
               break;
            case "b":
               result = data.substr(PHPSerializer.c + 2,1) == "1";
               PHPSerializer.c += 4;
               break;
            case "i":
               tmp.push(data.indexOf(";",PHPSerializer.c));
               pos = PHPSerializer.c + 2;
               PHPSerializer.c = tmp[0] + 1;
               result = Number(data.substring(pos,tmp[0]));
               break;
            case "d":
               tmp.push(data.indexOf(";",PHPSerializer.c));
               pos = PHPSerializer.c + 2;
               PHPSerializer.c = tmp[0] + 1;
               result = Number(data.substring(pos,tmp[0]));
               break;
            case "s":
               tmp.push(int(data.indexOf(":",PHPSerializer.c + 2)));
               tmp.push(tmp[0] + 2);
               pos = PHPSerializer.c + 2;
               tmp.push(0);
               tmp.push(int(data.substring(pos,tmp[0])));
               if(tmp[3] == 0)
               {
                  result = "";
                  PHPSerializer.c = pos + 5;
               }
               else
               {
                  lenc = uint(PHPSerializer.stringCLenght(data,PHPSerializer.c,tmp[3]));
                  if(lenc != tmp[3])
                  {
                     result = data.substr(tmp[0] + 2,lenc);
                     PHPSerializer.c = tmp[0] + 4 + lenc;
                  }
                  else
                  {
                     result = data.substr(tmp[0] + 2,tmp[3]);
                     PHPSerializer.c = tmp[0] + 4 + tmp[3];
                  }
                  result = result.split("+").join(" ");
               }
               if(PHPSerializer.pattern.test(result))
               {
               }
               break;
            case "a":
               pos = PHPSerializer.c + 2;
               tmp.push(int(data.indexOf(":",pos)));
               tmp.push(int(data.substring(pos,tmp[0])));
               PHPSerializer.c = tmp[0] + 2;
               result = [];
               for(i = 0; i < tmp[1]; i++)
               {
                  tmpvar = PHPSerializer.unserialize_internal(data);
                  result[tmpvar] = PHPSerializer.unserialize_internal(data);
                  if(!(tmpvar is int) || tmpvar < 0)
                  {
                     islist = false;
                  }
               }
               if(islist)
               {
                  tmp.push([]);
                  for(key = 0; key < result.length; key++)
                  {
                     pos = uint(tmp[2].length);
                     while(key > pos)
                     {
                        tmp[2].push(null);
                        pos += 1;
                     }
                     tmp[2].push(result[key]);
                  }
                  result = tmp[2];
               }
               PHPSerializer.c += 1;
               break;
            case "O":
               pos = data.indexOf("\"",PHPSerializer.c) + 1;
               PHPSerializer.c = data.indexOf("\"",pos);
               tmp.push(data.substring(pos,PHPSerializer.c));
               PHPSerializer.c += 2;
               i = PHPSerializer.c;
               PHPSerializer.c = data.indexOf(":",i);
               i = uint(int(data.substring(i,PHPSerializer.c)));
               PHPSerializer.c += 2;
               result = {};
               while(i > 0)
               {
                  tmps = PHPSerializer.unserialize_internal(data);
                  result[tmps] = PHPSerializer.unserialize_internal(data);
                  i--;
               }
         }
         return result;
      }
      
      mx_internal static function stringLength(data:String) : uint
      {
         var code:int = 0;
         var result:int = 0;
         var slen:int = data.length;
         while(slen)
         {
            slen--;
            try
            {
               code = data.charCodeAt(slen);
            }
            catch(e:Error)
            {
               code = 65536;
            }
            if(code < 128)
            {
               result += 1;
            }
            else if(code < 2048)
            {
               result += 2;
            }
            else if(code < 65536)
            {
               result += 3;
            }
            else
            {
               result += 4;
            }
         }
         return result;
      }
      
      mx_internal static function stringCLenght(data:String, from:uint = 0, len:uint = 0) : int
      {
         var i:uint = 0;
         var j:uint = len;
         var startIndex:uint = from + 4 + len.toString().length;
         for(i = 0; i < j; i++)
         {
            if(data.charCodeAt(i + startIndex) > 128)
            {
               j--;
            }
         }
         return j;
      }
   }
}

