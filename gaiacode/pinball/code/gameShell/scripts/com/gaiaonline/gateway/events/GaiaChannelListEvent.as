package com.gaiaonline.gateway.events
{
   public class GaiaChannelListEvent extends GaiaGatewayEvent
   {
      
      public static const CHANNEL_LIST:String = GaiaGatewayEvent.CHANNEL_LIST;
      
      private var _channels:Array;
      
      public function GaiaChannelListEvent(param1:String, param2:Array)
      {
         super(param1);
         this._channels = param2;
      }
      
      public function get channels() : Array
      {
         return this._channels;
      }
   }
}

