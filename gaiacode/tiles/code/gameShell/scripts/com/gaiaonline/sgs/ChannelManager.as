package com.gaiaonline.sgs
{
   import flash.events.EventDispatcher;
   import mx.events.PropertyChangeEvent;
   
   public class ChannelManager extends EventDispatcher
   {
      
      protected var _2027120815aChannels:Array;
      
      public function ChannelManager()
      {
         super();
         this.aChannels = new Array();
      }
      
      public function addChannel(param1:SGSChannel) : uint
      {
         this.aChannels.push(param1);
         return this.aChannels.length;
      }
      
      public function get length() : uint
      {
         return this.aChannels ? this.aChannels.length : 0;
      }
      
      public function indexOf(param1:SGSChannel) : int
      {
         var _loc4_:SGSChannel = null;
         var _loc2_:uint = this.length;
         var _loc3_:uint = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.aChannels[_loc3_];
            if(_loc4_ == param1)
            {
               return _loc3_;
            }
            _loc3_++;
         }
         return -1;
      }
      
      public function getIndexByID(param1:Number) : int
      {
         var _loc4_:SGSChannel = null;
         var _loc2_:uint = this.length;
         var _loc3_:uint = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.aChannels[_loc3_];
            if(_loc4_.id == param1)
            {
               return _loc3_;
            }
            _loc3_++;
         }
         return -1;
      }
      
      public function getChannelByName(param1:String) : SGSChannel
      {
         var _loc2_:int = this.getIndexByName(param1);
         return _loc2_ >= 0 ? this.aChannels[_loc2_] : null;
      }
      
      public function get channels() : Array
      {
         return this.aChannels;
      }
      
      public function removeChannel(param1:Number) : SGSChannel
      {
         var _loc2_:int = this.getIndexByID(param1);
         var _loc3_:SGSChannel = SGSChannel(this.aChannels[_loc2_]);
         var _loc4_:uint = this.aChannels.length;
         var _loc5_:uint = uint(_loc2_);
         while(_loc5_ < _loc4_ - 1)
         {
            this.aChannels[_loc5_] = this.aChannels[_loc5_ + 1];
            _loc5_++;
         }
         --this.aChannels.length;
         return _loc3_;
      }
      
      protected function get aChannels() : Array
      {
         return this._2027120815aChannels;
      }
      
      protected function set aChannels(param1:Array) : void
      {
         var _loc2_:Object = this._2027120815aChannels;
         if(_loc2_ !== param1)
         {
            this._2027120815aChannels = param1;
            this.dispatchEvent(PropertyChangeEvent.createUpdateEvent(this,"aChannels",_loc2_,param1));
         }
      }
      
      public function getIndexByName(param1:String) : int
      {
         var _loc4_:SGSChannel = null;
         var _loc2_:uint = this.length;
         var _loc3_:uint = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.aChannels[_loc3_];
            if(_loc4_.name == param1)
            {
               return _loc3_;
            }
            _loc3_++;
         }
         return -1;
      }
      
      public function getChannelByID(param1:Number) : SGSChannel
      {
         var _loc2_:int = this.getIndexByID(param1);
         return _loc2_ >= 0 ? this.aChannels[_loc2_] : null;
      }
   }
}

