package com.gaiaonline.gateway.sgs
{
   import com.gaiaonline.gateway.GaiaChatMessage;
   import com.gaiaonline.gateway.GaiaFunctionResponse;
   import com.gaiaonline.gateway.GaiaGatewayProtocol;
   import com.gaiaonline.gateway.GaiaIdentity;
   import com.gaiaonline.gateway.IGaiaChannel;
   import com.gaiaonline.gateway.IGaiaGateway;
   import com.gaiaonline.gateway.events.GaiaChannelEvent;
   import com.gaiaonline.gateway.events.GaiaChannelListEvent;
   import com.gaiaonline.gateway.events.GaiaChatEvent;
   import com.gaiaonline.gateway.events.GaiaFunctionEvent;
   import com.gaiaonline.gateway.events.GaiaFunctionResponseEvent;
   import com.gaiaonline.gateway.events.GaiaLoginEvent;
   import com.gaiaonline.gateway.events.GaiaPresenceEvent;
   import com.gaiaonline.gateway.events.GaiaPresenceListEvent;
   import com.gaiaonline.sgs.*;
   import flash.events.Event;
   import flash.system.Capabilities;
   
   public class SGSGaiaGateway extends SGSSocket implements IGaiaGateway
   {
      
      public static const VERSION:String = "1.0.0";
      
      private var _channelClass:Class = SGSGaiaChannel;
      
      private var callbackMap:Object;
      
      private var _identityClass:Class = GaiaIdentity;
      
      public function SGSGaiaGateway(param1:String = null, param2:uint = 0, ... rest)
      {
         super(param1,param2);
      }
      
      final override protected function onChannelLeave(param1:Number) : SGSChannel
      {
         var _loc2_:SGSGaiaChannel = SGSGaiaChannel(this.channelManager.removeChannel(param1));
         var _loc3_:GaiaChannelEvent = new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_LEAVE,_loc2_);
         this.dispatchEvent(_loc3_);
         return _loc2_;
      }
      
      private function addCallback(param1:uint, param2:Function) : void
      {
         this.callbackMap[param1] = param2;
      }
      
      public function registerChannelClass(param1:Class) : Boolean
      {
         var theClass:Class = param1;
         try
         {
            SGSGaiaChannel(new theClass());
         }
         catch(error:Error)
         {
            trace("*** SushiGaiaGateway::registerChannelClass() | " + error.getStackTrace());
            return false;
         }
         this._channelClass = theClass;
         return true;
      }
      
      final override protected function onLoginFail(param1:String) : void
      {
         super.onLoginFail(param1);
         var _loc2_:GaiaLoginEvent = new GaiaLoginEvent(GaiaLoginEvent.LOGIN_FAIL);
         this.dispatchEvent(_loc2_);
      }
      
      final override protected function onConnect(param1:Event) : void
      {
         super.onConnect(param1);
         this.callbackMap = new Object();
      }
      
      private function onCoreFunctionResponse(param1:SGSGaiaFunctionResponse) : void
      {
         var _loc2_:SGSGaiaChannel = null;
         var _loc3_:Array = null;
         var _loc4_:Array = null;
         var _loc5_:uint = 0;
         var _loc6_:uint = 0;
         var _loc7_:String = null;
         trace("*** SGSGaiaGateway::onCoreFunctionResponse(",param1.name,")");
         switch(param1.name)
         {
            case SGSGaiaProtocol.FUNCTION_PRESENCE_LIST:
               _loc2_ = this.getChannelByID(param1.result.id) as SGSGaiaChannel;
               _loc2_.setPresences(param1.result.presences);
               this.dispatchEvent(new GaiaPresenceListEvent(GaiaPresenceListEvent.PRESENCE_LIST,param1.result.presences,_loc2_));
               break;
            case SGSGaiaProtocol.FUNCTION_GET_ALL_CHANNELS:
               _loc3_ = new Array();
               _loc4_ = param1.result;
               _loc5_ = _loc4_.length;
               _loc6_ = 0;
               while(_loc6_ < _loc5_)
               {
                  _loc7_ = _loc4_[_loc6_].name;
                  _loc2_ = createNewChannel(_loc4_[_loc6_].id,_loc7_,_loc4_[_loc6_].occupancy,_loc4_[_loc6_].limit,_loc4_[_loc6_].data);
                  _loc3_.push(_loc2_);
                  _loc6_++;
               }
               this.dispatchEvent(new GaiaChannelListEvent(GaiaChannelListEvent.CHANNEL_LIST,_loc3_));
               break;
            case SGSGaiaProtocol.FUNCTION_CREATE_CHANNEL:
               if(param1.result.error)
               {
                  this.dispatchEvent(new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_CREATE_ERROR,null,param1.result.error));
               }
               else
               {
                  this.dispatchEvent(new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_CREATE,createNewChannel(param1.result.id,param1.result.name)));
               }
               break;
            case SGSGaiaProtocol.FUNCTION_JOIN_CHANNEL:
               if(param1.result.error)
               {
                  this.dispatchEvent(new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_JOIN_ERROR,createNewChannel(param1.result.id),param1.result.error));
               }
         }
      }
      
      private function onCoreFunctionCall(param1:SGSGaiaFunction, param2:Number = 0) : void
      {
         var _loc3_:GaiaLoginEvent = null;
         var _loc4_:SGSGaiaChannel = null;
         var _loc5_:GaiaIdentity = null;
         var _loc6_:GaiaChatMessage = null;
         var _loc7_:GaiaChatEvent = null;
         trace("*** SGSGaiaGateway::onCoreFunctionCall(",param1.name,")");
         switch(param1.name)
         {
            case SGSGaiaProtocol.FUNCTION_WELCOME:
               _loc3_ = new GaiaLoginEvent(GaiaLoginEvent.LOGIN_SUCCESS,this.createIdentity(param1.args));
               this.dispatchEvent(_loc3_);
               break;
            case SGSGaiaProtocol.FUNCTION_PRESENCE_LIST:
               _loc4_ = this.getChannelByID(param1.args.id) as SGSGaiaChannel;
               _loc4_.setPresences(param1.args.presences,this.createIdentity);
               this.dispatchEvent(new GaiaPresenceListEvent(GaiaPresenceListEvent.PRESENCE_LIST,param1.args.presences,_loc4_));
               break;
            case SGSGaiaProtocol.FUNCTION_PRESENCE_IN:
               _loc4_ = this.getChannelByID(param2) as SGSGaiaChannel;
               _loc5_ = this.createIdentity(param1.args.identity);
               _loc4_.addPresence(_loc5_);
               this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_IN,_loc5_,_loc4_));
               break;
            case SGSGaiaProtocol.FUNCTION_PRESENCE_OUT:
               _loc4_ = this.getChannelByID(param2) as SGSGaiaChannel;
               _loc5_ = this.createIdentity(param1.args.identity);
               _loc4_.removePresence(_loc5_);
               this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_OUT,_loc5_,_loc4_));
               break;
            case SGSGaiaProtocol.FUNCTION_PRESENCE_UPDATE:
               _loc4_ = this.getChannelByID(param2) as SGSGaiaChannel;
               _loc5_ = this.createIdentity(param1.args);
               _loc4_.addPresence(_loc5_);
               this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_UPDATE,_loc5_,_loc4_));
               break;
            case SGSGaiaProtocol.FUNCTION_CHAT:
               _loc4_ = this.getChannelByID(param2) as SGSGaiaChannel;
               _loc5_ = _loc4_.getIdentity(param1.args.gid);
               if(!_loc5_)
               {
                  _loc5_ = this.createIdentity({
                     "userName":param1.args.sender,
                     "gid":param1.args.gid
                  });
               }
               _loc6_ = new GaiaChatMessage(param1.args,_loc5_);
               _loc7_ = new GaiaChatEvent(GaiaChatEvent.CHAT,_loc6_,this.getChannelByID(param2));
               this.dispatchEvent(_loc7_);
         }
      }
      
      public function getChannelByID(param1:*) : IGaiaChannel
      {
         return IGaiaChannel(this.channelManager.getChannelByID(Number(param1)));
      }
      
      public function callWithCallback(param1:Function, param2:String, ... rest) : uint
      {
         if(!this.connected)
         {
            return 0;
         }
         var _loc4_:* = null;
         if(rest)
         {
            _loc4_ = rest.length > 1 ? rest : rest[0];
         }
         var _loc5_:SGSGaiaFunction = new SGSGaiaFunction(0,param2,_loc4_);
         this.sendObject(_loc5_.toObject());
         this.addCallback(_loc5_.cid,param1);
         return _loc5_.cid;
      }
      
      public function getChannelByName(param1:String) : IGaiaChannel
      {
         return IGaiaChannel(this.channelManager.getChannelByName(param1));
      }
      
      private function onFunctionResponse(param1:SGSGaiaFunctionResponse) : void
      {
         trace("*** SGSGaiaGateway::onFunctionResponse(...)");
         if(GaiaGatewayProtocol.isCoreFunction(param1.name))
         {
            this.onCoreFunctionResponse(param1);
         }
         var _loc2_:GaiaFunctionResponseEvent = new GaiaFunctionResponseEvent(GaiaFunctionResponseEvent.FUNCTION_RESPONSE,param1,createNewChannel(param1.chid));
         this.dispatchEvent(_loc2_);
         if(this.hasCallback(param1.cid))
         {
            this.runCallback(param1);
         }
      }
      
      public function getPresenceList(param1:*) : void
      {
         this.call(SGSGaiaProtocol.FUNCTION_PRESENCE_LIST,param1 as Number);
      }
      
      final override protected function onChannelMessage(param1:SGSMessage) : void
      {
         var _loc3_:SGSGaiaFunction = null;
         super.onChannelMessage(param1);
         var _loc2_:Object = param1.toObject(this.objectEncoding);
         if(_loc2_.type)
         {
            if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION)
            {
               _loc3_ = new SGSGaiaFunction(_loc2_.chid != undefined ? Number(_loc2_.chid) : 0,_loc2_.name,_loc2_.args);
               this.onFunctionCall(_loc3_,param1.channelID);
            }
         }
      }
      
      internal function callChannel(param1:Number, param2:String, ... rest) : uint
      {
         if(!this.connected)
         {
            return 0;
         }
         var _loc4_:* = null;
         if(rest)
         {
            _loc4_ = rest.length > 1 ? rest : rest[0];
         }
         var _loc5_:SGSGaiaFunction = new SGSGaiaFunction(param1,param2,_loc4_);
         this.sendObject(_loc5_.toObject());
         return _loc5_.cid;
      }
      
      public function leaveChannel(param1:*) : void
      {
         this.call(SGSGaiaProtocol.FUNCTION_LEAVE_CHANNEL,param1 as Number);
      }
      
      public function get channels() : Array
      {
         return this.channelManager.channels;
      }
      
      private function onFunctionCall(param1:SGSGaiaFunction, param2:Number = 0) : void
      {
         var _loc3_:GaiaFunctionEvent = null;
         trace("*** SGSGaiaGateway::onFunctionCall(",param1.name,")");
         if(GaiaGatewayProtocol.isCoreFunction(param1.name))
         {
            this.onCoreFunctionCall(param1,param2);
            return;
         }
         if(param2 > 0)
         {
            _loc3_ = new GaiaFunctionEvent(GaiaFunctionEvent.FUNCTION_CALL,param1,this.getChannelByID(param2));
         }
         else
         {
            _loc3_ = new GaiaFunctionEvent(GaiaFunctionEvent.FUNCTION_CALL,param1);
         }
         this.dispatchEvent(_loc3_);
      }
      
      public function chat(param1:GaiaChatMessage) : void
      {
         this.call(SGSGaiaProtocol.FUNCTION_CHAT,param1.toObject());
      }
      
      final override protected function onClose(param1:Event) : void
      {
         super.onClose(param1);
         this.callbackMap = null;
      }
      
      private function createNewChannel(param1:uint, param2:String = "", param3:uint = 0, param4:uint = 0, param5:Object = null) : SGSGaiaChannel
      {
         return new this._channelClass(this,param1,param2,param3,param4,param5);
      }
      
      final override protected function onLoginSuccess(param1:Number, param2:Number) : void
      {
         super.onLoginSuccess(param1,param2);
         this.call(SGSGaiaProtocol.FUNCTION_SET_SYS_INFO,Capabilities.serverString);
      }
      
      internal function createIdentity(param1:Object) : GaiaIdentity
      {
         var _loc2_:GaiaIdentity = new this._identityClass();
         _loc2_.fromObject(param1);
         return _loc2_;
      }
      
      public function call(param1:String, ... rest) : uint
      {
         if(!this.connected)
         {
            return 0;
         }
         var _loc3_:* = null;
         if(rest)
         {
            _loc3_ = rest.length > 1 ? rest : rest[0];
         }
         var _loc4_:SGSGaiaFunction = new SGSGaiaFunction(0,param1,_loc3_);
         this.sendObject(_loc4_.toObject());
         return _loc4_.cid;
      }
      
      public function getChannelIndexByID(param1:Number) : Number
      {
         return this.channelManager.getIndexByID(param1);
      }
      
      public function createChannel(param1:String, param2:Object = null, param3:String = "") : void
      {
         this.call(SGSGaiaProtocol.FUNCTION_CREATE_CHANNEL,param1,param2,param3);
      }
      
      private function runCallback(param1:GaiaFunctionResponse) : Boolean
      {
         var _loc2_:Function = this.callbackMap[param1.cid];
         if(_loc2_ == null)
         {
            return false;
         }
         _loc2_(param1);
         delete this.callbackMap[param1.cid];
         return true;
      }
      
      private function onFunctionError(param1:SGSGaiaFunctionResponse) : void
      {
         trace("*** SGSGaiaGateway::onFunctionError(...) | error = ",param1.error);
         var _loc2_:GaiaFunctionResponseEvent = new GaiaFunctionResponseEvent(GaiaFunctionResponseEvent.FUNCTION_ERROR,param1,createNewChannel(param1.chid));
         this.dispatchEvent(_loc2_);
         if(this.hasCallback(param1.cid))
         {
            this.runCallback(param1);
         }
      }
      
      public function getAllChannels() : void
      {
         this.call(SGSGaiaProtocol.FUNCTION_GET_ALL_CHANNELS);
      }
      
      final override protected function onChannelJoin(param1:Number, param2:String) : SGSChannel
      {
         var _loc3_:SGSGaiaChannel = this.createNewChannel(param1,param2);
         this.channelManager.addChannel(_loc3_);
         var _loc4_:GaiaChannelEvent = new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_JOIN,_loc3_);
         this.dispatchEvent(_loc4_);
         return _loc3_;
      }
      
      public function registerIdentityClass(param1:Class) : Boolean
      {
         var theClass:Class = param1;
         try
         {
            GaiaIdentity(new theClass());
         }
         catch(error:Error)
         {
            trace("*** SushiGaiaGateway::registerIdentityClass() | " + error.getStackTrace());
            return false;
         }
         this._identityClass = theClass;
         return true;
      }
      
      public function joinChannel(param1:*, param2:String = "") : void
      {
         this.call(SGSGaiaProtocol.FUNCTION_JOIN_CHANNEL,param1 as Number,param2);
      }
      
      public function leaveAllChannels() : void
      {
         var _loc3_:SGSChannel = null;
         var _loc1_:uint = this.channelManager.length;
         var _loc2_:uint = 0;
         while(_loc2_ < _loc1_)
         {
            _loc3_ = this.channelManager.channels[_loc2_];
            this.leaveChannel(_loc3_.id);
            _loc2_++;
         }
      }
      
      final override protected function onSessionMessage(param1:SGSMessage) : void
      {
         var _loc3_:SGSGaiaFunction = null;
         var _loc4_:Number = NaN;
         var _loc5_:SGSGaiaFunctionResponse = null;
         var _loc2_:Object = param1.toObject(this.objectEncoding);
         if(_loc2_.type)
         {
            if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION)
            {
               _loc3_ = new SGSGaiaFunction(_loc2_.chid != undefined ? Number(_loc2_.chid) : 0,_loc2_.name,_loc2_.args);
               this.onFunctionCall(_loc3_,param1.channelID);
            }
            else if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION_RESPONSE)
            {
               _loc4_ = _loc2_.cid != undefined ? Number(_loc2_.cid) : 0;
               _loc5_ = new SGSGaiaFunctionResponse(_loc2_.cid,_loc4_,_loc2_.name,_loc2_.result);
               this.onFunctionResponse(_loc5_);
            }
            else if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION_ERROR)
            {
               _loc4_ = _loc2_.cid != undefined ? Number(_loc2_.cid) : 0;
               _loc5_ = new SGSGaiaFunctionResponse(_loc2_.cid,_loc4_,_loc2_.name,null,_loc2_.error);
               this.onFunctionError(_loc5_);
            }
         }
      }
      
      private function hasCallback(param1:uint) : Boolean
      {
         return this.callbackMap[param1] != undefined;
      }
   }
}

