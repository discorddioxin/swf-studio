package com.gaiaonline.serializers
{
   import com.gaiaonline.utils.ByteArrayUtils;
   import flash.net.ObjectEncoding;
   import flash.utils.ByteArray;
   
   public class AMF3Base64Serializer
   {
      
      public static const ENCODE_NAME:String = "amf3_base64";
      
      private static var base64Encoder:Base64Encoder = new Base64Encoder();
      
      private static var base64Decoder:Base64Decoder = new Base64Decoder();
      
      private static var ba:ByteArray = new ByteArray();
      
      private static var bytes2Encode:ByteArray = new ByteArray();
      
      public function AMF3Base64Serializer()
      {
         super();
      }
      
      public static function serialize(param1:Object, param2:Boolean = false) : String
      {
         ba.objectEncoding = ObjectEncoding.AMF3;
         ba.writeObject(param1);
         ba.position = 0;
         ba.readBytes(bytes2Encode);
         if(param2)
         {
            bytes2Encode.compress();
         }
         base64Encoder.encodeBytes(bytes2Encode);
         var _loc3_:String = base64Encoder.flush();
         bytes2Encode = ByteArrayUtils.clear(bytes2Encode);
         ba = ByteArrayUtils.clear(ba);
         return _loc3_;
      }
      
      public static function unserialize(param1:String, param2:Boolean = false) : Object
      {
         base64Decoder.decode(param1);
         var _loc3_:ByteArray = base64Decoder.drain();
         base64Decoder.reset();
         if(param2)
         {
            _loc3_.uncompress();
         }
         _loc3_.objectEncoding = ObjectEncoding.AMF3;
         var _loc4_:Object = _loc3_.readObject();
         _loc3_ = ByteArrayUtils.clear(_loc3_);
         return _loc4_;
      }
   }
}

