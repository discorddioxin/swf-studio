package com.gaiaonline.gateway.sushi
{
   import com.gaiaonline.gateway.GaiaChatMessage;
   import com.gaiaonline.gateway.IGaiaChannel;
   
   public class SushiGaiaChannel implements IGaiaChannel
   {
      
      private var _gateway:SushiGaiaGateway;
      
      private var _data:Object = null;
      
      private var _occupancy:uint = 0;
      
      private var _name:String;
      
      private var _id:Number;
      
      private var _limit:uint = 0;
      
      public function SushiGaiaChannel(param1:SushiGaiaGateway, param2:Number = 0, param3:String = "", param4:uint = 0, param5:uint = 0, param6:Object = null)
      {
         super();
         this._gateway = param1;
         this._id = param2;
         this._name = param3;
         this.occupancy = param4;
         this.limit = param5;
         this.data = param6;
      }
      
      public function get name() : String
      {
         return this._name;
      }
      
      public function set data(param1:Object) : void
      {
         this._data = param1;
      }
      
      public function chat(param1:GaiaChatMessage) : void
      {
         this._gateway.chat(param1);
      }
      
      public function set occupancy(param1:uint) : void
      {
         this._occupancy = param1;
      }
      
      public function get id() : Number
      {
         return this._id;
      }
      
      public function get occupancy() : uint
      {
         return this._occupancy;
      }
      
      public function getPresenceList() : void
      {
         this._gateway.getPresenceList(this._id);
      }
      
      public function get data() : Object
      {
         return this._data;
      }
      
      public function set limit(param1:uint) : void
      {
         this._limit = param1;
      }
      
      public function leave() : void
      {
      }
      
      public function get limit() : uint
      {
         return this._limit;
      }
   }
}

