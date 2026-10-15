package com.gaiaonline.sgs
{
   public class SGSClientSession
   {
      
      private var _idHex:String;
      
      private var _id:Number;
      
      private var _reconnectionKey:Number;
      
      public function SGSClientSession(param1:Number, param2:Number = 0)
      {
         super();
         this._id = param1;
         this._reconnectionKey = param2;
      }
      
      public function toHex() : String
      {
         return this._idHex;
      }
      
      public function get reconnectionKey() : Number
      {
         return this._reconnectionKey;
      }
      
      public function toString() : String
      {
         return this._idHex;
      }
      
      public function get id() : Number
      {
         return this._id;
      }
   }
}

