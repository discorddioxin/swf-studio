package com.rawfishsoftware.sushi
{
   public class Team
   {
      
      private var ref:Object;
      
      public var list:Array;
      
      private var d:String;
      
      private var e:String;
      
      public function Team(param1:Object)
      {
         super();
         ref = param1;
         d = ref.$d;
         e = ref.$e;
         $init();
      }
      
      public function getName(param1:Number) : String
      {
         return list["_" + param1].name;
      }
      
      public function getLimit(param1:Number) : Number
      {
         return list["_" + param1].limit;
      }
      
      public function getNumberOfMemberIDs(param1:Number) : Number
      {
         return list["_" + param1].members.length;
      }
      
      public function update(param1:Number, param2:Array) : void
      {
         ref.$update(this,"40",param1,param2);
      }
      
      public function indexUpdateConditional(param1:Number, param2:Array, param3:Function, param4:Object) : void
      {
         ref.$indexUpdateConditional(this,"50",param1,param2,param3,param4);
      }
      
      public function roomChat(param1:Number, param2:String) : void
      {
         ref.$sts += "10" + d + ref.me.id + d + "4" + d + param1 + d + param2 + e;
      }
      
      public function getMemberNames(param1:Number) : Array
      {
         var _loc2_:* = list["_" + param1].members;
         var _loc3_:* = _loc2_.length;
         var _loc4_:* = [];
         while(_loc3_--)
         {
            _loc4_.push(ref.member["_" + _loc2_[_loc3_]].name);
         }
         return _loc4_;
      }
      
      public function getName_list(param1:Array) : *
      {
         var _loc3_:* = undefined;
         var _loc2_:* = [];
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
         var _loc6_:* = undefined;
         var _loc3_:* = list["_" + param1].members;
         var _loc5_:* = _loc3_.length;
         _loc4_ = 0;
         while(_loc4_ < _loc5_)
         {
            if(_loc6_ == _loc3_[_loc4_])
            {
               return true;
            }
            _loc4_++;
         }
         return false;
      }
      
      public function chat(param1:Number, param2:String) : void
      {
         ref.$sts += "10" + d + ref.me.id + d + "3" + d + param1 + d + param2 + e;
      }
      
      public function getData(param1:Number) : Array
      {
         return list["_" + param1].data;
      }
      
      public function clearAllDataIndexCallbacks(param1:Number) : void
      {
         var _loc2_:* = list["_" + param1];
         delete _loc2_.__cb;
      }
      
      public function registerEvents(param1:String, param2:Object) : void
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
         return list["_" + param1].members;
      }
      
      public function setDataIndexCallback(param1:Number, param2:Number, param3:Function, param4:Object) : void
      {
         var _loc5_:* = this.list["_" + param1];
         if(!_loc5_.__cb)
         {
            _loc5_.__cb = new Array();
         }
         _loc5_.__cb["_" + param2] = {
            "cb":param3,
            "sc":param4
         };
      }
      
      public function deregisterEvents(param1:String) : void
      {
         list["_" + param1].$class = null;
      }
      
      public function $init() : void
      {
         list = [];
      }
      
      public function getObject(param1:Number) : Object
      {
         return list["_" + param1];
      }
      
      public function indexUpdateEval(param1:Number, param2:Array) : void
      {
         ref.$indexUpdateEval(this,"50",param1,param2);
      }
      
      public function indexUpdate(param1:Number, param2:Array) : void
      {
         ref.$indexUpdate(this,"74",param1,param2);
      }
   }
}

