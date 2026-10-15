package com.gaiaonline.gateway.sushi
{
   import com.gaiaonline.gateway.GaiaGatewayProtocol;
   import com.gaiaonline.serializers.AMF3Base64Serializer;
   
   public class SushiGaiaProtocol extends GaiaGatewayProtocol
   {
      
      public static const FUNCTION_LOGIN:String = "core.login";
      
      public static const FUNCTION_CHAT:String = "core.chat";
      
      public static const FUNCTION_DISPLAY_CAPTCHA:String = "core.displayCaptcha";
      
      public static const FUNCTION_VERIFY_CAPTCHA:String = "core.verifyCaptcha";
      
      public static const FUNCTION_BLOCK_USER:String = "admin.blockUser";
      
      private static const COMPRESSION:Boolean = false;
      
      public function SushiGaiaProtocol()
      {
         super();
      }
      
      public static function serialize(param1:Object) : String
      {
         return AMF3Base64Serializer.serialize(param1,COMPRESSION);
      }
      
      public static function unserialize(param1:String) : Object
      {
         return AMF3Base64Serializer.unserialize(param1,COMPRESSION);
      }
   }
}

