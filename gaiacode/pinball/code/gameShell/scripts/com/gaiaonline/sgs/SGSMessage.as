package com.gaiaonline.sgs
{
   import flash.utils.ByteArray;
   
   public class SGSMessage
   {
      
      public var messageID:uint = 0;
      
      public var data:ByteArray;
      
      public var fromSession:SGSClientSession;
      
      public var channelID:uint = 0;
      
      public function SGSMessage(param1:uint = 0, param2:uint = 0, param3:SGSClientSession = null, param4:ByteArray = null)
      {
         super();
         this.channelID = param1;
         this.messageID = param2;
         this.fromSession = param3;
         this.data = param4;
      }
      
      public static function fromByteArray(param1:ByteArray, param2:Boolean = false) : SGSMessage
      {
         var _loc5_:SGSClientSession = null;
         param1.position = 0;
         var _loc3_:uint = param2 ? param1.readUnsignedShort() : 0;
         var _loc4_:Number = param1.readDouble();
         if(param2)
         {
            _loc5_ = new SGSClientSession(SGSProtocol.decodeCompactID(param1));
         }
         var _loc6_:ByteArray = SGSProtocol.getBytesFrom(param1,param1.readUnsignedShort());
         return new SGSMessage(_loc3_,_loc4_,_loc5_,_loc6_);
      }
      
      public function toObject(param1:uint) : Object
      {
         var obj:Object = null;
         var objectEncoding:uint = param1;
         this.data.objectEncoding = objectEncoding;
         try
         {
            obj = this.data.readObject();
         }
         catch(error:Error)
         {
            obj = new Object();
            obj.error = "AMF Parsing Error";
         }
         return obj;
      }
      
      public function toString(param1:String = "") : String
      {
         return SGSProtocol.decodeString(this.data,param1);
      }
   }
}

