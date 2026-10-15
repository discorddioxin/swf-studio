package mx.utils
{
   import flash.utils.ByteArray;
   
   public class Base64Encoder
   {
      
      public static var newLine:String = "\n";
      
      private static const ALPHABET:Array = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","0","1","2","3","4","5","6","7","8","9","+","/"];
      
      private var _output:String = "";
      
      private var _count:uint = 0;
      
      private var _line:uint = 0;
      
      public var insertNewLines:Boolean = true;
      
      private var _work:Array = [0,0,0];
      
      public function Base64Encoder()
      {
         super();
      }
      
      public function flush() : String
      {
         if(_count > 0)
         {
            encodeBlock();
         }
         var _loc1_:String = drain();
         _count = 0;
         _line = 0;
         _work[0] = 0;
         _work[1] = 0;
         _work[2] = 0;
         return _loc1_;
      }
      
      public function encodeBytes(param1:ByteArray, param2:uint = 0, param3:uint = 0) : void
      {
         if(param3 == 0)
         {
            param3 = param1.length;
         }
         var _loc4_:uint = param1.position;
         param1.position = param2;
         var _loc5_:uint = param2;
         while(_loc5_ < param3)
         {
            _work[_count] = param1[_loc5_];
            ++_count;
            if(_count == _work.length || param2 + param3 - _loc5_ == 1)
            {
               encodeBlock();
               _count = 0;
               _work[0] = 0;
               _work[1] = 0;
               _work[2] = 0;
            }
            _loc5_++;
         }
         param1.position = _loc4_;
      }
      
      public function encode(param1:String, param2:uint = 0, param3:uint = 0) : void
      {
         if(param3 == 0)
         {
            param3 = uint(param1.length);
         }
         var _loc4_:uint = param2;
         while(_loc4_ < param2 + param3)
         {
            _work[_count] = param1.charCodeAt(_loc4_);
            ++_count;
            if(_count == _work.length || param2 + param3 - _loc4_ == 1)
            {
               encodeBlock();
               _count = 0;
               _work[0] = 0;
               _work[1] = 0;
               _work[2] = 0;
            }
            _loc4_++;
         }
      }
      
      private function encodeBlock() : void
      {
         _output += ALPHABET[(_work[0] & 0xFF) >> 2];
         _output += ALPHABET[(_work[0] & 3) << 4 | (_work[1] & 0xF0) >> 4];
         if(_count > 1)
         {
            _output += ALPHABET[(_work[1] & 0x0F) << 2 | (_work[2] & 0xC0) >> 6];
         }
         else
         {
            _output += "=";
         }
         if(_count > 2)
         {
            _output += ALPHABET[_work[2] & 0x3F];
         }
         else
         {
            _output += "=";
         }
         if(insertNewLines)
         {
            if((_line = _line + 4) == 76)
            {
               _output += newLine;
               _line = 0;
            }
         }
      }
      
      public function drain() : String
      {
         var _loc1_:String = _output.toString();
         _output = "";
         return _loc1_;
      }
   }
}

