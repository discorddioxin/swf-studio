package com.gaiaonline.gateway
{
   public class GaiaChatMessage implements IGaiaObject
   {
      
      public var color:uint = 0;
      
      private var _channel:IGaiaChannel;
      
      private var _sender:GaiaIdentity = null;
      
      public var message:String = "";
      
      public var recipients:Array = null;
      
      public function GaiaChatMessage(param1:Object = null, param2:IGaiaChannel = null, param3:GaiaIdentity = null)
      {
         super();
         if(param1)
         {
            this.fromObject(param1);
         }
         this._channel = param2;
         this._sender = param3;
      }
      
      public static function create(param1:Object) : GaiaChatMessage
      {
         return new GaiaChatMessage(param1);
      }
      
      public static function create2(param1:String, param2:uint = 0) : GaiaChatMessage
      {
         return new GaiaChatMessage({
            "message":param1,
            "color":param2
         });
      }
      
      public function toObject() : Object
      {
         var _loc1_:Object = null;
         _loc1_ = new Object();
         if(this._channel)
         {
            _loc1_.channelName = this._channel.name;
            _loc1_.channelID = this._channel.id;
         }
         _loc1_.message = this.message;
         _loc1_.color = this.color;
         if(this.recipients)
         {
            _loc1_.recipients = this.recipients;
         }
         return _loc1_;
      }
      
      public function get channel() : IGaiaChannel
      {
         return this._channel;
      }
      
      public function fromObject(param1:Object) : void
      {
         this.message = param1.message;
         this.color = param1.color;
         this.recipients = param1.recipients;
      }
      
      public function get sender() : GaiaIdentity
      {
         return this._sender;
      }
   }
}

