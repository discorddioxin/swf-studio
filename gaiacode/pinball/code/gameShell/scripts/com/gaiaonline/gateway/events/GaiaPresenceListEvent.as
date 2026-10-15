package com.gaiaonline.gateway.events
{
   import com.gaiaonline.gateway.IGaiaChannel;
   
   public class GaiaPresenceListEvent extends GaiaGatewayEvent
   {
      
      public static const PRESENCE_LIST:String = GaiaGatewayEvent.PRESENCE_LIST;
      
      private var _channel:IGaiaChannel;
      
      private var _identities:Array;
      
      public function GaiaPresenceListEvent(param1:String, param2:Array, param3:IGaiaChannel)
      {
         super(param1);
         this._identities = param2;
         this._channel = param3;
      }
      
      public function get channel() : IGaiaChannel
      {
         return this._channel;
      }
      
      public function get identities() : Array
      {
         return this._identities;
      }
   }
}

