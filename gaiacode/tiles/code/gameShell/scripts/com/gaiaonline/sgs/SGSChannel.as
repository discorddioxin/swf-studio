package com.gaiaonline.sgs
{
   import flash.utils.ByteArray;
   
   public class SGSChannel
   {
      
      protected var socket:SGSSocket;
      
      private var _name:String = "";
      
      private var _id:Number = 0;
      
      public function SGSChannel(param1:SGSSocket, param2:Number = 0, param3:String = "")
      {
         super();
         this.socket = param1;
         this._id = param2;
         this._name = param3;
      }
      
      public function sendObject(param1:Object, param2:Array = null) : void
      {
         var _loc3_:ByteArray = new ByteArray();
         _loc3_.objectEncoding = this.socket.objectEncoding;
         _loc3_.writeObject(param1);
         this.sendMessage(_loc3_,param2);
      }
      
      public function get name() : String
      {
         return this._name;
      }
      
      public function sendString(param1:String, param2:Array = null) : void
      {
         this.sendMessage(SGSProtocol.encodeString(param1,socket.charSet,false),param2);
      }
      
      public function get id() : Number
      {
         return this._id;
      }
      
      public function sendMessage(param1:ByteArray, param2:Array = null) : void
      {
         this.socket.sendChannelMessage(param1,this._id,param2);
      }
   }
}

