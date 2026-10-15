package com.gaiaonline.gateway.events
{
   import com.gaiaonline.gateway.GaiaChatMessage;
   import com.gaiaonline.gateway.IGaiaChannel;
   
   public class GaiaChatEvent extends GaiaGatewayEvent
   {
      
      public static const CHAT:String = GaiaGatewayEvent.CHAT;
      
      private var _channel:IGaiaChannel;
      
      private var _data:GaiaChatMessage;
      
      public function GaiaChatEvent(param1:String = "chat", param2:GaiaChatMessage = null, param3:IGaiaChannel = null)
      {
         super(param1);
         this._data = param2;
         this._channel = param3;
      }
      
      public function get data() : GaiaChatMessage
      {
         return this._data;
      }
      
      public function get channel() : IGaiaChannel
      {
         return this._channel;
      }
   }
}

