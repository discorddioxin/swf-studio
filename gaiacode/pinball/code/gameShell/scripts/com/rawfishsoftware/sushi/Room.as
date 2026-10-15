package com.rawfishsoftware.sushi
{
   public class Room
   {
      
      public var $cb:Function = null;
      
      private var ref:Object;
      
      public var list:Object;
      
      private var d:String;
      
      private var e:String;
      
      public var $sc:Object = null;
      
      public function Room(param1:Object)
      {
         super();
         ref = param1;
         d = ref.$d;
         e = ref.$e;
         $init();
      }
      
      public function getTeamLimit(param1:Number, param2:Number) : Number
      {
         return list["_" + param1].teamLimits[param2];
      }
      
      public function getName(param1:Number) : String
      {
         return this.list["_" + param1].name;
      }
      
      public function getTeamMemberNames(param1:Number, param2:Number) : Array
      {
         var _loc5_:* = undefined;
         var _loc8_:* = undefined;
         var _loc3_:* = [];
         var _loc4_:* = this.list["_" + param1].members;
         var _loc6_:* = _loc4_.length;
         var _loc7_:* = ref.member;
         _loc5_ = 0;
         while(_loc5_ < _loc6_)
         {
            _loc8_ = _loc7_.list["_" + _loc4_[_loc5_]];
            if(_loc8_.team == param2)
            {
               _loc3_.push(_loc8_.name);
            }
            _loc5_++;
         }
         return _loc3_;
      }
      
      public function getLimit(param1:Number) : Number
      {
         return list["_" + param1].limit;
      }
      
      public function update(param1:Number, param2:Array) : void
      {
         ref.$update(this,"38",param1,param2);
      }
      
      public function indexUpdateConditional(param1:Number, param2:Array, param3:Function, param4:Object) : void
      {
         ref.$indexUpdateConditional(this,"58",param1,param2,param3,param4);
      }
      
      public function $init() : void
      {
         list = new Array();
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
      
      public function getMemberList(param1:Number, param2:Function, param3:Object) : *
      {
         ref.$sts += "14" + d + param1 + e;
         $cb = param2;
         $sc = param3;
      }
      
      public function getNumberOfMobs() : Number
      {
         return list["_" + ref.me.room].mobs.length;
      }
      
      public function getNumberOfMembers(param1:Number) : Number
      {
         return list["_" + param1].members.length;
      }
      
      public function isLocked(param1:Number) : Number
      {
         return list["_" + param1].locked;
      }
      
      public function hasPassword(param1:Number) : Number
      {
         return list["_" + param1].password;
      }
      
      public function getMemberNames(param1:Number) : Array
      {
         var _loc4_:* = undefined;
         var _loc2_:* = [];
         var _loc3_:* = this.list["_" + param1].members;
         var _loc5_:* = _loc3_.length;
         _loc4_ = 0;
         while(_loc4_ < _loc5_)
         {
            _loc2_.push(ref.member.getName(_loc3_[_loc4_]));
            _loc4_++;
         }
         return _loc2_;
      }
      
      public function clearAllDataIndexCallbacks(param1:Number) : void
      {
         var _loc2_:* = list["_" + param1];
         delete _loc2_.__cb;
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
      
      public function checkMemberID(param1:Number, param2:Number) : Boolean
      {
         var _loc4_:* = undefined;
         var _loc3_:* = this.list["_" + param1].members;
         var _loc5_:* = _loc3_.length;
         _loc4_ = 0;
         while(_loc4_ < _loc5_)
         {
            if(param2 == _loc3_[_loc4_])
            {
               return true;
            }
            _loc4_++;
         }
         return false;
      }
      
      public function chat(param1:Number, param2:String) : void
      {
         ref.$sts += "10" + d + ref.me.id + d + "1" + d + param1 + d + param2 + e;
      }
      
      public function getData(param1:Number) : Array
      {
         return list["_" + param1].data.slice();
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
      
      public function getMemberIDs(param1:Number) : Array
      {
         return list["_" + param1].members.slice();
      }
      
      public function degisterEvents(param1:Number, param2:Object) : void
      {
         list["_" + param1].$class = null;
      }
      
      public function lock(param1:Number, param2:Number) : void
      {
         ref.$sts += "39" + d + param1 + d + param2 + e;
      }
      
      public function getNumberOfTeamMembers(param1:Number, param2:Number) : Number
      {
         var _loc4_:* = undefined;
         var _loc5_:* = undefined;
         var _loc3_:* = 0;
         var _loc6_:* = this.list["_" + param1].members;
         var _loc7_:* = _loc6_.length;
         var _loc8_:* = ref.member;
         _loc5_ = 0;
         while(_loc5_ < _loc7_)
         {
            if(_loc8_.list["_" + _loc6_[_loc5_]].team == param2)
            {
               _loc3_++;
            }
            _loc5_++;
         }
         return _loc3_;
      }
      
      public function getMobIDs() : Array
      {
         return list["_" + ref.me.room].mobs.slice();
      }
      
      public function getTeamMemberIds(param1:Number, param2:Number) : Array
      {
         var _loc5_:* = undefined;
         var _loc8_:* = undefined;
         var _loc3_:* = [];
         var _loc4_:* = this.list["_" + param1].members;
         var _loc6_:* = _loc4_.length;
         var _loc7_:* = ref.member;
         _loc5_ = 0;
         while(_loc5_ < _loc6_)
         {
            _loc8_ = _loc7_["_" + _loc4_[_loc5_]];
            if(_loc8_.team == param2)
            {
               _loc3_.push(_loc8_.id);
            }
            _loc5_++;
         }
         return _loc3_;
      }
      
      public function getObject(param1:Number) : Object
      {
         return list["_" + ref.me.room];
      }
      
      public function indexUpdateEval(param1:Number, param2:Array) : void
      {
         ref.$indexUpdateEval(this,"58",param1,param2);
      }
      
      public function getWaitingQueue(param1:Number) : Array
      {
         return list["_" + param1].waitingQueue.slice();
      }
      
      public function indexUpdate(param1:Number, param2:Array) : void
      {
         ref.$indexUpdate(this,"75",param1,param2);
      }
   }
}

