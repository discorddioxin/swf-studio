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
         var result:String = drain();
         _count = 0;
         _line = 0;
         _work[0] = 0;
         _work[1] = 0;
         _work[2] = 0;
         return result;
      }
      
      public function encodeBytes(data:ByteArray, offset:uint = 0, length:uint = 0) : void
      {
         if(length == 0)
         {
            length = data.length;
         }
         var oldPosition:uint = data.position;
         data.position = offset;
         var plainIndex:uint = offset;
         while(plainIndex < length)
         {
            _work[_count] = data[plainIndex];
            ++_count;
            if(_count == _work.length || offset + length - plainIndex == 1)
            {
               encodeBlock();
               _count = 0;
               _work[0] = 0;
               _work[1] = 0;
               _work[2] = 0;
            }
            plainIndex++;
         }
         data.position = oldPosition;
      }
      
      public function encode(data:String, offset:uint = 0, length:uint = 0) : void
      {
         if(length == 0)
         {
            length = uint(data.length);
         }
         var plainIndex:uint = offset;
         while(plainIndex < offset + length)
         {
            _work[_count] = data.charCodeAt(plainIndex);
            ++_count;
            if(_count == _work.length || offset + length - plainIndex == 1)
            {
               encodeBlock();
               _count = 0;
               _work[0] = 0;
               _work[1] = 0;
               _work[2] = 0;
            }
            plainIndex++;
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
         var result:String = _output.toString();
         _output = "";
         return result;
      }
   }
}

