package com.rawfishsoftware.sushi
{
   public class Member
   {
      
      public var name:String = "member";
      
      private var ref:*;
      
      public var list:Object;
      
      private var d:String;
      
      private var e:String;
      
      public function Member(param1:Object)
      {
         super();
         ref = param1;
         d = ref.$d;
         e = ref.$e;
         $init();
      }
      
      public function getName(param1:Number) : String
      {
         return ref.$memberIDs["x" + param1];
      }
      
      public function getRoom(param1:Number) : Number
      {
         return list["_" + param1].room;
      }
      
      public function getTeam(param1:Number) : Number
      {
         return list["_" + param1].team;
      }
      
      public function chat(param1:Number, param2:String) : void
      {
         ref.$sts += "10" + d + ref.me.id + d + "0" + d + param1 + d + param2 + e;
      }
      
      public function getName_list(param1:Array) : Array
      {
         var _loc3_:Number = NaN;
         var _loc2_:Array = [];
         _loc3_ = 0;
         while(_loc3_ < param1.length)
         {
            _loc2_.push(getName(param1[_loc3_]));
            _loc3_++;
         }
         return _loc2_;
      }
      
      public function getData(param1:Number) : Array
      {
         return list["_" + param1].data.slice();
      }
      
      public function clearAllDataIndexCallbacks(param1:Number) : void
      {
         var _loc2_:* = list["_" + param1];
         delete _loc2_.__cb;
      }
      
      public function registerEvents(param1:Number, param2:Object) : void
      {
         list["_" + param1].$class = param2;
      }
      
      public function clearDataIndexCallback(param1:Number, param2:Number) : void
      {
         var _loc3_:* = this.list["_" + param1];
         delete _loc3_.__cb["_" + param2];
         var _loc4_:* = _loc3_.data.length;
         var _loc5_:* = 0;
         var _loc6_:* = 0;
         while(_loc6_ < _loc4_)
         {
            if(_loc3_.__cb["_" + _loc6_])
            {
               _loc5_++;
               break;
            }
            _loc6_++;
         }
         if(!_loc5_)
         {
            delete _loc3_.__cb;
         }
      }
      
      public function getPlatform(param1:Number) : Number
      {
         return list["_" + param1].platform;
      }
      
      public function degisterEvents(param1:Number, param2:Object) : void
      {
         list["_" + param1].$class = null;
      }
      
      public function setDataIndexCallback(param1:Number, param2:Number, param3:Function, param4:Object) : void
      {
         var _loc5_:* = this.list["_" + param1];
         if(!_loc5_.__cb)
         {
            _loc5_.__cb = [];
         }
         _loc5_.__cb["_" + param2] = {
            "cb":param3,
            "sc":param4
         };
      }
      
      public function isSpectator(param1:Number) : Number
      {
         return list["_" + param1].spectator;
      }
      
      public function getID(param1:String) : Number
      {
         return ref.$memberNames["x" + param1];
      }
      
      public function $init() : void
      {
         list = {};
      }
      
      public function getObject(param1:Number) : Object
      {
         return list["_" + param1];
      }
   }
}

