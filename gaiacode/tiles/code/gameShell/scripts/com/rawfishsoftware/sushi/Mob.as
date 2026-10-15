package com.rawfishsoftware.sushi
{
   public class Mob
   {
      
      private var ref:Object;
      
      public var list:Array;
      
      public var $iid:Number;
      
      private var d:String;
      
      private var e:String;
      
      public function Mob(param1:Object)
      {
         super();
         ref = param1;
         d = ref.$d;
         e = ref.$e;
         $init();
      }
      
      public function remove(param1:String) : void
      {
         ref.$sts += "27" + d + param1 + e;
         var _loc2_:* = list["_" + param1].room;
         ref.$removeValue(ref.room.list["_" + _loc2_].mobs,param1);
         trace("list:" + ref.room.list["_" + _loc2_].mobs);
         delete list["_" + param1];
      }
      
      public function update(param1:String, param2:Array) : void
      {
         ref.$update(this,"26",param1,param2);
      }
      
      public function indexUpdateConditional(param1:String, param2:Array, param3:Function, param4:Object) : void
      {
         ref.$indexUpdateConditional(this,"41",param1,param2,param3,param4);
      }
      
      public function getMember(param1:String) : Number
      {
         return list["_" + param1].member;
      }
      
      public function getRoom(param1:String) : Number
      {
         return list["_" + param1].room;
      }
      
      public function init(param1:Number, param2:Boolean, param3:Array) : String
      {
         var _loc4_:String = ++$iid + "m" + param1;
         var _loc5_:Number = param2 ? 1 : 0;
         if(list["_" + _loc4_] == null)
         {
            list["_" + _loc4_] = {
               "id":_loc4_,
               "room":param1,
               "data":param3,
               "member":ref.me.id
            };
            if(ref.me.master)
            {
               ref.$sts += "47" + d + _loc4_ + d + param1 + d + _loc5_ + d + param3.join(d) + e;
            }
         }
         return _loc4_;
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
      
      public function deregisterEvents(param1:String) : void
      {
         list["_" + param1].$class = null;
      }
      
      public function getData(param1:String) : Number
      {
         return list["_" + param1].data;
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
      
      public function $init() : void
      {
         list = [];
         $iid = 0;
      }
      
      public function getObject(param1:String) : Number
      {
         return list["_" + param1];
      }
      
      public function indexUpdateEval(param1:String, param2:Array) : void
      {
         ref.$indexUpdateEval(this,"41",param1,param2);
      }
      
      public function indexUpdate(param1:String, param2:Array) : void
      {
         ref.$indexUpdate(this,"60",param1,param2);
      }
      
      public function silentUpdate(param1:String, param2:Array) : void
      {
         ref.$update(this,"15",param1,param2);
      }
   }
}

