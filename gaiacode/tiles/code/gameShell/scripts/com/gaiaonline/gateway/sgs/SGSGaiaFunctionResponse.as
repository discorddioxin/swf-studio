package com.gaiaonline.gateway.sgs
{
   import com.gaiaonline.gateway.GaiaFunctionResponse;
   
   public class SGSGaiaFunctionResponse extends GaiaFunctionResponse
   {
      
      private var _chid:Number = 0;
      
      public function SGSGaiaFunctionResponse(param1:uint, param2:Number = 0, param3:String = null, param4:* = null, param5:int = 0)
      {
         super(param1,param3,param4,param5);
         this._chid = param2;
      }
      
      public function get chid() : Number
      {
         return this._chid;
      }
   }
}

