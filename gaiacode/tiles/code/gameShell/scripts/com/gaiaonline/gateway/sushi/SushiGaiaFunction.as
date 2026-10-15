package com.gaiaonline.gateway.sushi
{
   import com.gaiaonline.gateway.GaiaFunction;
   import com.gaiaonline.serializers.AMF3Base64Serializer;
   
   public class SushiGaiaFunction extends GaiaFunction
   {
      
      public function SushiGaiaFunction(param1:String = null, ... rest)
      {
         super();
         this._name = param1;
         if(rest)
         {
            this._args = rest.length > 1 ? rest : rest[0];
         }
      }
      
      public function fromString(param1:String) : void
      {
         return this.fromObject(AMF3Base64Serializer.unserialize(param1));
      }
      
      public function toString() : String
      {
         return AMF3Base64Serializer.serialize(this.toObject());
      }
   }
}

