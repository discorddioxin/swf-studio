package com.gaiaonline.gateway.events
{
   import com.gaiaonline.gateway.GaiaIdentity;
   
   public class GaiaLoginEvent extends GaiaGatewayEvent
   {
      
      public static const LOGIN_SUCCESS:String = GaiaGatewayEvent.LOGIN_SUCCESS;
      
      public static const LOGIN_FAIL:String = GaiaGatewayEvent.LOGIN_FAIL;
      
      private var _errorMsg:String = "";
      
      private var _error:int = 0;
      
      private var _identity:GaiaIdentity;
      
      public function GaiaLoginEvent(param1:String = "loginSuccess", param2:GaiaIdentity = null, param3:int = 0)
      {
         super(param1);
         this._identity = param2;
         this._error = param3;
      }
      
      public function get errorMsg() : String
      {
         return this._errorMsg;
      }
      
      public function setError(param1:int = 0, param2:String = "") : void
      {
         this._error = param1;
         this._errorMsg = param2;
      }
      
      public function get identity() : GaiaIdentity
      {
         return this._identity;
      }
      
      public function get error() : int
      {
         return this._error;
      }
   }
}

