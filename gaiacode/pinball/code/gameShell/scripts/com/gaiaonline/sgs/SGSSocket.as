package com.gaiaonline.sgs
{
   import com.gaiaonline.net.GaiaSocket;
   import com.gaiaonline.sgs.events.*;
   import com.gaiaonline.utils.TextUtil;
   import flash.events.Event;
   import flash.events.ProgressEvent;
   import flash.net.ObjectEncoding;
   import flash.utils.ByteArray;
   
   public class SGSSocket extends GaiaSocket
   {
      
      private var _bytesOut:uint = 0;
      
      private var _channelManager:ChannelManager;
      
      private var _autoFlush:Boolean = true;
      
      private var _charSet:String = "utf-8";
      
      private var _bytesIn:uint = 0;
      
      private var pendingSize:uint = 0;
      
      public function SGSSocket(param1:String = null, param2:int = 0)
      {
         super(param1,param2);
         this.objectEncoding = ObjectEncoding.AMF3;
         this._channelManager = new ChannelManager();
         this.addEventListener(ProgressEvent.SOCKET_DATA,this.onData);
      }
      
      public function sendString(param1:String) : void
      {
         trace("*** SGSSocket::sendStringMessage(" + param1 + ")");
         this.sendMessage(SGSProtocol.encodeString(param1,this.charSet,false));
      }
      
      protected function onData(param1:ProgressEvent) : void
      {
         var _loc4_:uint = 0;
         var _loc5_:ByteArray = null;
         trace("*** SGSSocket::onData() | " + param1.bytesLoaded);
         this.bytesIn += param1.bytesLoaded;
         var _loc2_:uint = this.bytesAvailable;
         var _loc3_:uint = 0;
         while(_loc3_ < _loc2_)
         {
            if(this.pendingSize > 0)
            {
               _loc4_ = this.pendingSize;
               this.pendingSize = 0;
            }
            else
            {
               if(_loc3_ + 4 > _loc2_)
               {
                  return;
               }
               _loc4_ = uint(this.readInt());
               _loc3_ += 4;
            }
            if(_loc3_ + _loc4_ > _loc2_)
            {
               this.pendingSize = _loc4_;
               return;
            }
            _loc5_ = new ByteArray();
            this.readBytes(_loc5_,0,_loc4_);
            _loc3_ += _loc5_.length;
            this.runOperation(_loc5_);
         }
      }
      
      protected function onChannelMessage(param1:SGSMessage) : void
      {
         var _loc2_:SGSChannelMessageEvent = new SGSChannelMessageEvent();
         _loc2_.message = param1;
         this.dispatchEvent(_loc2_);
      }
      
      public function set bytesOut(param1:uint) : void
      {
         this._bytesOut = param1;
         this.dispatchEvent(new Event("changeBytesOut"));
      }
      
      private function send(param1:ByteArray) : void
      {
         if(!this.connected)
         {
            return;
         }
         this.writeBytes(SGSProtocol.createPacket(param1));
         if(this._autoFlush)
         {
            this.flush();
         }
         this.bytesOut += param1.length;
      }
      
      public function logout() : void
      {
         if(!this.connected)
         {
            return;
         }
         var _loc1_:ByteArray = SGSProtocol.createHeader(SGSProtocol.LOGOUT_REQUEST);
         this.send(_loc1_);
      }
      
      public function sendChannelMessage(param1:ByteArray, param2:Number, param3:Array = null) : void
      {
         var _loc5_:uint = 0;
         var _loc6_:uint = 0;
         var _loc4_:ByteArray = SGSProtocol.createHeader(SGSProtocol.CHANNEL_SEND_REQUEST,param2);
         if(!param3)
         {
            _loc4_.writeShort(0);
         }
         else
         {
            _loc5_ = param3.length;
            _loc4_.writeShort(_loc5_);
            _loc6_ = 0;
            while(_loc6_ < _loc5_)
            {
               _loc4_.writeBytes(ByteArray(param3[_loc6_]));
               _loc6_++;
            }
         }
         _loc4_.writeShort(param1.length);
         _loc4_.writeBytes(param1);
         this.send(_loc4_);
      }
      
      protected function onLoginFail(param1:String) : void
      {
         trace("*** SGSSocket::onLoginFail(",param1,")");
         var _loc2_:SGSLoginEvent = new SGSLoginEvent(SGSEvent.SGS_LOGIN_FAIL);
         _loc2_.status = 0;
         _loc2_.data = param1;
         this.dispatchEvent(_loc2_);
      }
      
      protected function onSessionMessage(param1:SGSMessage) : void
      {
         var _loc2_:SGSMessageEvent = new SGSMessageEvent();
         _loc2_.message = param1;
         this.dispatchEvent(_loc2_);
      }
      
      public function get autoFlush() : Boolean
      {
         return this._autoFlush;
      }
      
      public function set charSet(param1:String) : void
      {
         this._charSet = param1;
      }
      
      protected function onLoginSuccess(param1:Number, param2:Number) : void
      {
         trace("*** SGSSocket::onLoginSuccess(",param1,",",param2,")");
         var _loc3_:SGSLoginEvent = new SGSLoginEvent();
         _loc3_.status = 1;
         _loc3_.session = new SGSClientSession(param1,param2);
         this.dispatchEvent(_loc3_);
      }
      
      private function runOperation(param1:ByteArray) : void
      {
         var _loc5_:ByteArray = null;
         var _loc6_:ByteArray = null;
         var _loc7_:Number = NaN;
         var _loc8_:Number = NaN;
         var _loc9_:String = null;
         var _loc10_:uint = 0;
         var _loc11_:String = null;
         var _loc12_:Number = NaN;
         var _loc13_:SGSMessage = null;
         var _loc14_:SGSMessage = null;
         trace("*** SGSSocket::runOperation( " + TextUtil.byteArrayToString(param1) + " )");
         var _loc2_:uint = param1.readUnsignedByte();
         var _loc3_:uint = param1.readUnsignedByte();
         var _loc4_:uint = param1.readUnsignedByte();
         _loc5_ = this.getBytesFrom(param1);
         switch(_loc4_)
         {
            case SGSProtocol.LOGIN_SUCCESS:
               _loc6_ = this.getBytesFrom(_loc5_);
               _loc7_ = SGSProtocol.decodeCompactID(_loc6_);
               _loc8_ = _loc6_.position < _loc6_.length - 1 ? SGSProtocol.decodeCompactID(_loc6_) : 0;
               this.onLoginSuccess(_loc7_,_loc8_);
               break;
            case SGSProtocol.LOGIN_FAILURE:
               _loc9_ = _loc5_.readUTFBytes(_loc5_.readUnsignedShort());
               this.onLoginFail(_loc9_);
               break;
            case SGSProtocol.LOGOUT_SUCCESS:
               this.dispatchEvent(new SGSLogoutEvent());
               break;
            case SGSProtocol.CHANNEL_JOIN:
               _loc10_ = _loc5_.readUnsignedShort();
               _loc11_ = _loc5_.readUTFBytes(_loc10_);
               _loc12_ = _loc5_.readUnsignedShort();
               this.onChannelJoin(_loc12_,_loc11_);
               break;
            case SGSProtocol.CHANNEL_LEAVE:
               _loc12_ = _loc5_.readUnsignedShort();
               this.onChannelLeave(_loc12_);
               break;
            case SGSProtocol.SESSION_MESSAGE:
               _loc13_ = SGSMessage.fromByteArray(_loc5_,false);
               this.onSessionMessage(_loc13_);
               break;
            case SGSProtocol.CHANNEL_MESSAGE:
               _loc14_ = SGSMessage.fromByteArray(_loc5_,true);
               this.onChannelMessage(_loc14_);
               break;
            default:
               trace("*** SGSSocket::runOperation() | UNKNOWN ACTION: " + _loc4_);
         }
      }
      
      public function sendMessage(param1:ByteArray) : void
      {
         var _loc2_:ByteArray = SGSProtocol.createHeader(SGSProtocol.SESSION_MESSAGE);
         _loc2_.writeShort(param1.length);
         _loc2_.writeBytes(param1);
         this.send(_loc2_);
      }
      
      public function set bytesIn(param1:uint) : void
      {
         this._bytesIn = param1;
         this.dispatchEvent(new Event("changeBytesIn"));
      }
      
      public function get bytesOut() : uint
      {
         return this._bytesOut;
      }
      
      public function sendObject(param1:Object) : void
      {
         trace("*** SGSSocket::sendObject(...)");
         var _loc2_:ByteArray = new ByteArray();
         _loc2_.objectEncoding = this.objectEncoding;
         _loc2_.writeObject(param1);
         this.sendMessage(_loc2_);
      }
      
      override protected function onClose(param1:Event) : void
      {
         super.onClose(param1);
         this.bytesIn = this.bytesOut = 0;
         this.pendingSize = 0;
      }
      
      public function login(param1:String, param2:String) : void
      {
         if(!this.connected)
         {
            return;
         }
         var _loc3_:ByteArray = SGSProtocol.createHeader(SGSProtocol.LOGIN_REQUEST);
         _loc3_.writeBytes(SGSProtocol.encodeString(param1,this.charSet));
         _loc3_.writeBytes(SGSProtocol.encodeString(param2,this.charSet));
         this.send(_loc3_);
      }
      
      public function get channelManager() : ChannelManager
      {
         return this._channelManager;
      }
      
      protected function onChannelJoin(param1:Number, param2:String) : SGSChannel
      {
         var _loc3_:SGSChannel = new SGSChannel(this,param1,param2);
         this._channelManager.addChannel(_loc3_);
         var _loc4_:SGSChannelJoinEvent = new SGSChannelJoinEvent();
         _loc4_.channel = _loc3_;
         this.dispatchEvent(_loc4_);
         return _loc3_;
      }
      
      public function getBytes() : ByteArray
      {
         var _loc1_:ByteArray = new ByteArray();
         this.readBytes(_loc1_);
         return _loc1_;
      }
      
      public function get bytesIn() : uint
      {
         return this._bytesIn;
      }
      
      public function set autoFlush(param1:Boolean) : void
      {
         this._autoFlush = param1;
      }
      
      protected function onChannelLeave(param1:Number) : SGSChannel
      {
         var _loc2_:uint = uint(this._channelManager.getIndexByID(param1));
         var _loc3_:SGSChannel = this._channelManager.removeChannel(param1);
         var _loc4_:SGSChannelLeaveEvent = new SGSChannelLeaveEvent();
         _loc4_.channel = _loc3_;
         _loc4_.channelIndex = _loc2_;
         this.dispatchEvent(_loc4_);
         return _loc3_;
      }
      
      public function get charSet() : String
      {
         return this._charSet;
      }
      
      public function getBytesFrom(param1:ByteArray, param2:uint = 0) : ByteArray
      {
         var _loc3_:ByteArray = new ByteArray();
         param1.readBytes(_loc3_,0,param2);
         return _loc3_;
      }
   }
}

