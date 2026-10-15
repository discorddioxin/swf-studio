package com.gaiaonline.sgs
{
   import flash.utils.ByteArray;
   
   public class SGSProtocol
   {
      
      public static const VERSION:uint = 2;
      
      public static const APPLICATION_SERVICE:uint = 1;
      
      public static const CHANNEL_SERVICE:uint = 2;
      
      public static const LOGIN_REQUEST:uint = 16;
      
      public static const LOGIN_SUCCESS:uint = 17;
      
      public static const LOGIN_FAILURE:uint = 18;
      
      public static const RECONNECT_REQUEST:uint = 32;
      
      public static const RECONNECT_SUCCESS:uint = 33;
      
      public static const RECONNECT_FAILURE:uint = 34;
      
      public static const SESSION_MESSAGE:uint = 48;
      
      public static const LOGOUT_REQUEST:uint = 64;
      
      public static const LOGOUT_SUCCESS:uint = 65;
      
      public static const CHANNEL_JOIN:uint = 80;
      
      public static const CHANNEL_LEAVE:uint = 82;
      
      public static const CHANNEL_SEND_REQUEST:uint = 83;
      
      public static const CHANNEL_MESSAGE:uint = 84;
      
      public function SGSProtocol()
      {
         super();
      }
      
      public static function encodeString(param1:String, param2:String, param3:Boolean = true) : ByteArray
      {
         var _loc4_:ByteArray = new ByteArray();
         if(param3)
         {
            _loc4_.writeShort(param1.length);
         }
         _loc4_.writeMultiByte(param1,param2);
         return _loc4_;
      }
      
      public static function getActionsFromPacket(param1:ByteArray) : Array
      {
         var _loc4_:uint = 0;
         var _loc5_:ByteArray = null;
         var _loc2_:Array = new Array();
         var _loc3_:uint = param1.length;
         while(param1.position < _loc3_)
         {
            _loc4_ = uint(param1.readInt());
            _loc5_ = new ByteArray();
            param1.readBytes(_loc5_,0,_loc4_);
            _loc2_.push(_loc5_);
         }
         return _loc2_;
      }
      
      public static function getBytesFrom(param1:ByteArray, param2:uint = 0) : ByteArray
      {
         var _loc3_:ByteArray = new ByteArray();
         param1.readBytes(_loc3_,0,param2);
         return _loc3_;
      }
      
      public static function decodeString(param1:ByteArray, param2:String) : String
      {
         param1.position = 0;
         return param1.readMultiByte(param1.length,param2);
      }
      
      public static function createPacket(param1:ByteArray) : ByteArray
      {
         var _loc2_:ByteArray = new ByteArray();
         _loc2_.writeInt(param1.length);
         _loc2_.writeBytes(param1);
         return _loc2_;
      }
      
      public static function decodeCompactID(param1:ByteArray) : Number
      {
         var _loc5_:uint = 0;
         var _loc6_:* = 0;
         if(param1.position >= param1.length)
         {
            return -1;
         }
         var _loc2_:uint = param1.readUnsignedByte();
         var _loc3_:uint = uint(_loc2_ >> 6);
         var _loc4_:Number = 0;
         switch(_loc3_)
         {
            case 0:
               --param1.position;
               _loc4_ = param1.readUnsignedShort();
               break;
            case 1:
               --param1.position;
               _loc4_ = param1.readUnsignedInt();
               _loc4_ = _loc4_ & 0x3FFFFFFF;
               break;
            case 2:
               _loc5_ = 8;
               _loc4_ = (_loc2_ & 0x3F) << 8 * (_loc5_ - 1);
               _loc6_ = int(_loc5_ - 2);
               while(_loc6_ >= 0)
               {
                  _loc4_ += param1.readUnsignedByte() << 8 * _loc6_;
                  _loc6_--;
               }
               break;
            case 3:
               _loc5_ = 8 + (_loc2_ & 0x0F);
               _loc6_ = int(_loc5_ - 1);
               while(_loc6_ >= 0)
               {
                  _loc4_ += param1.readUnsignedByte() << 8 * _loc6_;
                  _loc6_--;
               }
         }
         return _loc4_;
      }
      
      public static function createHeader(param1:uint, param2:uint = 0) : ByteArray
      {
         var _loc3_:uint = param2 ? CHANNEL_SERVICE : APPLICATION_SERVICE;
         var _loc4_:ByteArray = new ByteArray();
         _loc4_.writeByte(VERSION);
         _loc4_.writeByte(_loc3_);
         _loc4_.writeByte(param1);
         if(param2)
         {
            _loc4_.writeShort(param2);
         }
         switch(param1)
         {
            case SESSION_MESSAGE:
            case CHANNEL_SEND_REQUEST:
               _loc4_.writeInt(0);
               _loc4_.writeInt(0);
         }
         return _loc4_;
      }
   }
}

