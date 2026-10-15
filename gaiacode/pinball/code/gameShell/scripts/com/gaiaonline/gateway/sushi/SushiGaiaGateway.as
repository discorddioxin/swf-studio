package com.gaiaonline.gateway.sushi
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
   import com.gaiaonline.gateway.events.GaiaGatewayEvent;
   import com.gaiaonline.gateway.events.GaiaLoginEvent;
   import com.gaiaonline.gateway.events.GaiaPresenceEvent;
   import com.gaiaonline.gateway.events.GaiaPresenceListEvent;
   import com.gaiaonline.utils.wordfilter.WordFilter;
   import com.rawfishsoftware.sushi.CustomEvent;
   import com.rawfishsoftware.sushi.SushiAPI;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.IOErrorEvent;
   import flash.events.SecurityErrorEvent;
   import flash.net.XMLSocket;
   import flash.system.Capabilities;
   
   public class SushiGaiaGateway extends EventDispatcher implements IGaiaGateway
   {
      
      public static const VERSION:String = "1.0.0";
      
      private var sushi:SushiAPI;
      
      private var _channelClass:Class = SushiGaiaChannel;
      
      private var _identity:GaiaIdentity;
      
      private var _plugin:String = "DefaultGaiaSushiPlugin";
      
      private var currentSocket:XMLSocket;
      
      private var _port:uint = 8080;
      
      private var _identityClass:Class = GaiaIdentity;
      
      private var _teamID:Number = 1;
      
      private var _userData:Array = new Array(10);
      
      private var _host:String;
      
      private var _connected:Boolean = false;
      
      private var _sessionID:Number = 1;
      
      private var callbackMap:Object;
      
      public function SushiGaiaGateway(param1:String = null, param2:uint = 0, param3:String = "", param4:Number = 1)
      {
         super();
         this.sushi = new SushiAPI();
         WordFilter.init();
         if(param3)
         {
            this._plugin = param3;
         }
         this.sessionID = param4;
         if(Boolean(param1) && Boolean(param2))
         {
            this.connect(param1,param2);
         }
      }
      
      public function set port(param1:uint) : void
      {
         this._port = param1;
      }
      
      private function addCallback(param1:uint, param2:Function) : void
      {
         this.callbackMap[param1] = param2;
      }
      
      public function close() : void
      {
         this.currentSocket.close();
         this.onSocketClose(null);
      }
      
      private function onLoginFail(param1:int) : void
      {
         trace("*** SushiGaiaGateway::onLoginFail(",param1,")");
         this.dispatchEvent(new GaiaLoginEvent(GaiaLoginEvent.LOGIN_FAIL,null,param1));
         this.close();
      }
      
      public function get connected() : Boolean
      {
         return this._connected;
      }
      
      private function onJoinChannel(param1:Number) : void
      {
         var _loc2_:int = 0;
         trace("*** SushiGaiaGateway::onJoinChannel(",param1,")");
         if(param1 == 0)
         {
            this.dispatchEvent(new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_JOIN,this.getChannelByName(this.sushi.room.getName(this.sushi.me.room))));
            this.getPresenceList(this.sushi.me.room);
         }
         else
         {
            switch(param1)
            {
               case 1:
                  _loc2_ = GaiaGatewayProtocol.ERROR_CHANNEL_LIMIT_EXCEEDED;
                  break;
               case 2:
                  _loc2_ = GaiaGatewayProtocol.ERROR_CHANNEL_RESTRICTED;
                  break;
               case 3:
                  _loc2_ = GaiaGatewayProtocol.ERROR_CHANNEL_NOT_FOUND;
                  break;
               default:
                  _loc2_ = GaiaGatewayProtocol.ERROR_CHANNEL_UNKNOWN;
            }
            this.dispatchEvent(new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_JOIN_ERROR,null,_loc2_));
         }
      }
      
      public function getChannelByID(param1:*) : IGaiaChannel
      {
         return this.createNewChannel(param1,this.sushi.room.getName(param1),this.sushi.room.getNumberOfMembers(param1),this.sushi.room.getLimit(param1));
      }
      
      private function onMemberChangesRoom(param1:Number, param2:Number, param3:Number, param4:Array) : void
      {
         trace("*** SushiGaiaGateway::onMemberChangesRoom(...)");
         var _loc5_:Object = this.getMemberData(param1);
         if((Boolean(_loc5_)) && Boolean(_loc5_.gid))
         {
            if(param2 == this.sushi.me.room)
            {
               this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_IN,this.createIdentity(_loc5_),this.getChannelByID(param2)));
            }
            else if(param3 == this.sushi.me.room)
            {
               this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_OUT,this.createIdentity(_loc5_),this.getChannelByID(param3)));
            }
         }
      }
      
      private function onAdminFunctionCall(param1:SushiGaiaFunction) : void
      {
         trace("*** SushiGaiaGateway::onAdminFunctionCall(",param1.name,")");
         if(param1.name == SushiGaiaProtocol.FUNCTION_BLOCK_USER)
         {
            this.close();
         }
      }
      
      public function get sessionID() : Number
      {
         return this._sessionID;
      }
      
      private function onFunctionResponse(param1:SushiGaiaFunctionResponse) : void
      {
         var _loc2_:Object = null;
         var _loc4_:GaiaIdentity = null;
         trace("*** SushiGaiaGateway::onFunctionResponse(",param1.name,")");
         if(param1.name == SushiGaiaProtocol.FUNCTION_LOGIN)
         {
            _loc2_ = param1.result;
            if(Number(_loc2_) < 0)
            {
               this.onLoginFail(Number(_loc2_));
            }
            else
            {
               _loc4_ = new GaiaIdentity(_loc2_.name);
               _loc4_.fromObject(_loc2_);
               this.onLoginSuccess(_loc4_);
            }
            return;
         }
         var _loc3_:GaiaFunctionResponseEvent = new GaiaFunctionResponseEvent(GaiaFunctionResponseEvent.FUNCTION_RESPONSE,param1);
         this.dispatchEvent(_loc3_);
         if(this.hasCallback(param1.cid))
         {
            this.runCallback(param1);
         }
      }
      
      private function onNewMember(param1:Number, param2:Number, param3:Number, param4:String, param5:Object) : void
      {
         var _loc6_:SushiGaiaChannel = null;
         trace("*** SushiGaiaGateway::onNewMember(...)");
         if(this.sushi.me.room != param3)
         {
            return;
         }
         param5 = this.getMemberData(param1);
         if((Boolean(param5)) && Boolean(param5.gid))
         {
            _loc6_ = this.getChannelByID(param3) as SushiGaiaChannel;
            this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_IN,this.createIdentity(param5),_loc6_));
         }
      }
      
      public function get plugin() : String
      {
         return this._plugin;
      }
      
      private function onUpdateMember(param1:Number, param2:Array) : void
      {
         var channel:IGaiaChannel;
         var isNew:Boolean;
         var roomID:Number;
         var identity:GaiaIdentity;
         var memberData:Object = null;
         var memberID:Number = param1;
         var data:Array = param2;
         trace("*** SushiGaiaGateway::onUpdateMember(...) |",String(data[0]).length * 2,"bytes:",data[0]);
         try
         {
            memberData = SushiGaiaProtocol.unserialize(data[0]);
         }
         catch(error:Error)
         {
            this.onRemoveMember(memberID,-1,this.sushi.me.room);
            return;
         }
         isNew = memberData.isNew != undefined && memberData.isNew != null && memberData.isNew == 1 ? true : false;
         roomID = this.sushi.member.getRoom(memberID);
         channel = this.getChannelByID(roomID);
         identity = this.createIdentity(memberData);
         if(isNew)
         {
            this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_IN,identity,channel,memberID));
         }
         else
         {
            this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_UPDATE,identity,channel,memberID));
         }
      }
      
      public function set host(param1:String) : void
      {
         this._host = param1;
      }
      
      private function onJoinServer(param1:Number) : void
      {
         trace("*** SushiGaiaGateway::onJoinServer(",param1,")");
         if(param1 == 0)
         {
            this._connected = true;
            this.dispatchEvent(new Event(Event.CONNECT));
         }
         else
         {
            this.close();
         }
      }
      
      public function reconnect() : Boolean
      {
         if(this._connected || !this._host || !this._port)
         {
            return false;
         }
         this.connect(this._host,this._port);
         return true;
      }
      
      private function onSocketConnect(param1:Event) : void
      {
         trace("*** SushiGaiaGateway::onSocketConnect()");
         this.callbackMap = new Object();
      }
      
      private function getMemberData(param1:Number) : Object
      {
         var memberID:Number = param1;
         var data:Array = this.sushi.member.getData(memberID);
         var obj:Object = null;
         try
         {
            obj = SushiGaiaProtocol.unserialize(data[0]);
         }
         catch(error:Error)
         {
            obj = {
               "userName":this.sushi.member.getName(memberID),
               "gid":0,
               "avatar":""
            };
         }
         return obj;
      }
      
      public function chat(param1:GaiaChatMessage) : void
      {
         this.call(SushiGaiaProtocol.FUNCTION_CHAT,param1.toObject());
      }
      
      public function get timeout() : uint
      {
         return 0;
      }
      
      private function onServerResponse(... rest) : void
      {
         var _loc3_:SushiGaiaFunction = null;
         var _loc4_:SushiGaiaFunctionResponse = null;
         if(rest.length == 0)
         {
            return;
         }
         var _loc2_:Object = SushiGaiaProtocol.unserialize(rest[0]);
         if(_loc2_.type)
         {
            if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION)
            {
               _loc3_ = new SushiGaiaFunction(_loc2_.name,_loc2_.args);
               this.onFunctionCall(_loc3_);
            }
            else if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION_RESPONSE)
            {
               _loc4_ = new SushiGaiaFunctionResponse(_loc2_.cid,_loc2_.name,_loc2_.result);
               this.onFunctionResponse(_loc4_);
            }
            else if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION_ERROR)
            {
               _loc4_ = new SushiGaiaFunctionResponse(_loc2_.cid,_loc2_.name,null,_loc2_.error);
               this.onFunctionError(_loc4_);
            }
         }
      }
      
      public function leaveChannel(param1:*) : void
      {
         this.sushi.me.leaveSession();
      }
      
      public function call(param1:String, ... rest) : uint
      {
         if(!this._connected)
         {
            return 0;
         }
         var _loc3_:* = null;
         if(rest)
         {
            _loc3_ = rest.length > 1 ? rest : rest[0];
         }
         var _loc4_:SushiGaiaFunction = new SushiGaiaFunction(param1,_loc3_);
         this.sushi.callPlugin(this._plugin,[_loc4_.toString()],this.onServerResponse,this);
         return _loc4_.cid;
      }
      
      public function createChannel(param1:String, param2:Object = null, param3:String = "") : void
      {
         if(!param3)
         {
            this.sushi.me.createRoom(param1,"Default",this.onCreateChannel,this);
         }
         else
         {
            this.sushi.me.createRoomPassword(param1,param3,"Default",this.onCreateChannel,this);
         }
      }
      
      public function login(param1:String, param2:String) : void
      {
         var _loc3_:Number = 1;
         this.sushi.me.joinSession(param1,this._sessionID,this._teamID,_loc3_,this._userData,this.onJoinChannel,this);
         this.call(SushiGaiaProtocol.FUNCTION_LOGIN,param1,param2,Capabilities.serverString);
      }
      
      public function getAllChannels() : void
      {
         var _loc5_:String = null;
         var _loc6_:uint = 0;
         var _loc7_:uint = 0;
         var _loc8_:SushiGaiaChannel = null;
         var _loc1_:Array = this.sushi.session.getRoomIDs();
         var _loc2_:uint = _loc1_.length;
         var _loc3_:Array = new Array();
         var _loc4_:uint = 0;
         while(_loc4_ < _loc2_)
         {
            _loc5_ = this.sushi.room.getName(_loc1_[_loc4_]);
            _loc6_ = this.sushi.room.getNumberOfMembers(_loc1_[_loc4_]);
            _loc7_ = this.sushi.room.getLimit(_loc1_[_loc4_]);
            _loc8_ = this.createNewChannel(_loc1_[_loc4_],_loc5_,_loc6_,_loc7_);
            _loc3_.push(_loc8_);
            _loc4_++;
         }
         this.dispatchEvent(new GaiaChannelListEvent(GaiaChannelListEvent.CHANNEL_LIST,_loc3_));
      }
      
      public function set plugin(param1:String) : void
      {
         this._plugin = param1;
      }
      
      private function createNewChannel(param1:uint, param2:String, param3:uint = 0, param4:uint = 0, param5:Object = null) : SushiGaiaChannel
      {
         return new this._channelClass(this,param1,param2,param3,param4,param5);
      }
      
      public function set sessionID(param1:Number) : void
      {
         this._sessionID = param1;
      }
      
      public function leaveAllChannels() : void
      {
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
      
      public function registerChannelClass(param1:Class) : Boolean
      {
         var theClass:Class = param1;
         try
         {
            SushiGaiaChannel(new theClass());
         }
         catch(error:Error)
         {
            trace("*** SushiGaiaGateway::registerChannelClass() | " + error.getStackTrace());
            return false;
         }
         this._channelClass = theClass;
         return true;
      }
      
      public function joinChannel(param1:*, param2:String = "") : void
      {
         if(!param2)
         {
            this.sushi.me.changeRoom(Number(param1),this._userData,this.onJoinChannel,this);
         }
         else
         {
            this.sushi.me.changeRoomPassword(Number(param1),param2,this._userData,this.onJoinChannel,this);
         }
      }
      
      public function get port() : uint
      {
         return this._port;
      }
      
      public function getChannelIndexByID(param1:*) : Number
      {
         var _loc2_:Array = this.sushi.session.getRoomIDs();
         var _loc3_:uint = _loc2_.length;
         var _loc4_:int = 0;
         while(_loc4_ < _loc3_)
         {
            if(_loc2_[_loc4_] == param1)
            {
               return _loc4_;
            }
            _loc4_++;
         }
         return -1;
      }
      
      private function onFunctionError(param1:SushiGaiaFunctionResponse) : void
      {
         trace("*** SushiGaiaGateway::onFunctionError(",param1.name,") | ",param1.error);
         var _loc2_:GaiaFunctionResponseEvent = new GaiaFunctionResponseEvent(GaiaFunctionResponseEvent.FUNCTION_ERROR,param1);
         this.dispatchEvent(_loc2_);
         if(this.hasCallback(param1.cid))
         {
            this.runCallback(param1);
         }
      }
      
      public function logout() : void
      {
         this.close();
      }
      
      private function onCoreFunctionCall(param1:SushiGaiaFunction) : void
      {
         var _loc2_:GaiaChatMessage = null;
         trace("*** SushiGaiaGateway::onCoreFunctionCall(",param1.name,")");
         if(param1.name == SushiGaiaProtocol.FUNCTION_CHAT)
         {
            _loc2_ = new GaiaChatMessage(param1.args,this.createIdentity(this.getMemberData(param1.args.sender)));
            if(this._identity.filterLevel != 4294967295)
            {
               _loc2_.message = WordFilter.clean(_loc2_.message,this._identity.filterLevel);
            }
            this.dispatchEvent(new GaiaChatEvent(GaiaChatEvent.CHAT,_loc2_));
         }
         else if(param1.name == SushiGaiaProtocol.FUNCTION_DISPLAY_CAPTCHA)
         {
            this.dispatchEvent(new GaiaGatewayEvent(GaiaGatewayEvent.DISPLAY_CAPTCHA));
         }
      }
      
      public function get host() : String
      {
         return this._host;
      }
      
      public function callWithCallback(param1:Function, param2:String, ... rest) : uint
      {
         if(!this._connected)
         {
            return 0;
         }
         var _loc4_:* = null;
         if(rest)
         {
            _loc4_ = rest.length > 1 ? rest : rest[0];
         }
         var _loc5_:SushiGaiaFunction = new SushiGaiaFunction(param2,_loc4_);
         this.sushi.callPlugin(this._plugin,[_loc5_.toString()],this.onServerResponse,this);
         this.addCallback(_loc5_.cid,param1);
         return _loc5_.cid;
      }
      
      public function get sushiID() : Number
      {
         return this.sushi.me.id;
      }
      
      public function getPresenceList(param1:*) : void
      {
         var _loc7_:Object = null;
         var _loc2_:Array = this.sushi.room.getMemberIDs(Number(param1));
         var _loc3_:int = int(_loc2_.length);
         var _loc4_:Array = new Array();
         var _loc5_:int = 0;
         while(_loc5_ < _loc3_)
         {
            _loc7_ = this.getMemberData(_loc2_[_loc5_]);
            if(_loc7_.gid)
            {
               _loc4_.push(this.createIdentity(_loc7_));
            }
            _loc5_++;
         }
         var _loc6_:SushiGaiaChannel = this.getChannelByID(Number(param1)) as SushiGaiaChannel;
         this.dispatchEvent(new GaiaPresenceListEvent(GaiaPresenceListEvent.PRESENCE_LIST,_loc4_,_loc6_));
      }
      
      private function onCustomMessage(param1:CustomEvent) : void
      {
         var _loc3_:SushiGaiaFunction = null;
         trace("*** SushiGaiaGateway::onCustomMessage(",param1.data.length,")");
         var _loc2_:Object = SushiGaiaProtocol.unserialize(param1.data);
         if(!_loc2_)
         {
            return;
         }
         if(_loc2_.type)
         {
            if(_loc2_.type == GaiaGatewayProtocol.TYPE_FUNCTION)
            {
               _loc3_ = new SushiGaiaFunction(_loc2_.name,_loc2_.args);
               this.onFunctionCall(_loc3_);
            }
         }
      }
      
      public function getChannelByName(param1:String) : IGaiaChannel
      {
         var _loc5_:Object = null;
         var _loc2_:Array = sushi.session.getRoomIDs();
         var _loc3_:uint = _loc2_.length;
         var _loc4_:int = 0;
         while(_loc4_ < _loc3_)
         {
            if(this.sushi.room.getName(_loc2_[_loc4_]) == param1)
            {
               _loc5_ = this.sushi.room.getObject(_loc2_[_loc4_]);
               return this.createNewChannel(_loc2_[_loc4_],param1,this.sushi.room.getNumberOfMembers(_loc2_[_loc4_]),this.sushi.room.getLimit(_loc2_[_loc4_]));
            }
            _loc4_++;
         }
         return null;
      }
      
      private function onRemoveMember(param1:Number, param2:Number, param3:Number) : void
      {
         if(this.sushi.me.room != param3)
         {
            return;
         }
         trace("*** SushiGaiaGateway::onRemoveMember(...)");
         this.dispatchEvent(new GaiaPresenceEvent(GaiaPresenceEvent.PRESENCE_OUT,this.createIdentity(this.getMemberData(param1)),this.getChannelByID(param3)));
      }
      
      private function onCreateChannel(param1:Number, param2:Number = -1) : void
      {
         trace("*** SushiGaiaGateway::onCreateChannel(",param1,", ",param2,")");
         if(param1 == 0)
         {
            this.dispatchEvent(new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_CREATE,this.getChannelByID(param2)));
         }
         else
         {
            this.dispatchEvent(new GaiaChannelEvent(GaiaChannelEvent.CHANNEL_CREATE_ERROR,null,param1));
         }
      }
      
      public function set timeout(param1:uint) : void
      {
      }
      
      private function onFunctionCall(param1:SushiGaiaFunction) : void
      {
         var _loc2_:GaiaFunctionEvent = null;
         trace("*** SushiGaiaGateway::onFunctionCall(",param1.name,")");
         if(GaiaGatewayProtocol.isCoreFunction(param1.name))
         {
            this.onCoreFunctionCall(param1);
         }
         else if(GaiaGatewayProtocol.isAdminFunction(param1.name))
         {
            this.onAdminFunctionCall(param1);
         }
         else
         {
            _loc2_ = new GaiaFunctionEvent(GaiaFunctionEvent.FUNCTION_CALL,param1);
            this.dispatchEvent(_loc2_);
         }
      }
      
      public function get channels() : Array
      {
         return [this.getChannelByID(this.sushi.me.room)];
      }
      
      private function onLoginSuccess(param1:GaiaIdentity) : void
      {
         trace("*** SushiGaiaGateway::onLoginSuccess() | " + param1.gsid);
         this._identity = param1;
         this.sushi.me.name = param1.userName;
         this.dispatchEvent(new GaiaLoginEvent(GaiaLoginEvent.LOGIN_SUCCESS,param1));
      }
      
      private function createIdentity(param1:Object) : GaiaIdentity
      {
         var _loc2_:GaiaIdentity = new this._identityClass();
         _loc2_.fromObject(param1);
         return _loc2_;
      }
      
      private function onSocketClose(param1:Event) : void
      {
         trace("*** SushiGaiaGateway::onSocketClose()");
         this._connected = false;
         this.dispatchEvent(new Event(Event.CLOSE));
         this.callbackMap = null;
      }
      
      public function connect(param1:String, param2:int) : void
      {
         if(this._connected)
         {
            return;
         }
         this._host = param1;
         this._port = param2;
         if(Boolean(this.currentSocket) && this.currentSocket.connected)
         {
            this.currentSocket.close();
         }
         this.sushi.event.onRemoveMember.setCallback(this.onRemoveMember,this);
         this.sushi.event.onNewMember.setCallback(this.onNewMember,this);
         this.sushi.event.onUpdateMember.setCallback(this.onUpdateMember,this);
         this.sushi.event.onMemberChangesRoom.setCallback(this.onMemberChangesRoom,this);
         this.sushi.addEventListener(CustomEvent.CUSTOM_MESSAGE,this.onCustomMessage);
         this.currentSocket = sushi.connectToServer("SOCKET",param1,param2,"",this.onJoinServer,this);
         this.currentSocket.addEventListener(IOErrorEvent.IO_ERROR,this.onSocketError);
         this.currentSocket.addEventListener(SecurityErrorEvent.SECURITY_ERROR,this.onSocketError);
         this.currentSocket.addEventListener("timeout",this.onSocketError);
         this.currentSocket.addEventListener(Event.CLOSE,this.onSocketClose);
         this.currentSocket.addEventListener(Event.CONNECT,this.onSocketConnect);
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
      
      private function onSocketError(param1:Event) : void
      {
         trace("*** SushiGaiaGateway::onSocketError()");
         this.dispatchEvent(param1);
      }
      
      private function hasCallback(param1:uint) : Boolean
      {
         return this.callbackMap[param1] != undefined;
      }
   }
}

