package com.rawfishsoftware.sushi
{
   public class Session
   {
      
      private var $cb:Array;
      
      public var name:String;
      
      private var ref:*;
      
      public var sessionList:Array;
      
      public var members:Array;
      
      public var id:Number;
      
      private var d:String;
      
      private var e:String;
      
      public var data:Array;
      
      public var teams:Array;
      
      public var rooms:Array;
      
      public var __cb:Array;
      
      public function Session(param1:Object)
      {
         super();
         this.ref = param1;
         if(Boolean(this.ref) && ref.$d != undefined)
         {
            d = ref.$d;
         }
         if(Boolean(this.ref) && ref.$e != undefined)
         {
            e = ref.$e;
         }
         $init();
      }
      
      public function getName() : String
      {
         return name;
      }
      
      public function clearDataIndexCallback(param1:Number) : void
      {
         delete __cb["_" + param1];
         var _loc2_:* = data.length;
         var _loc3_:* = 0;
         var _loc4_:* = 0;
         while(_loc4_ < _loc2_)
         {
            if(__cb["_" + _loc4_])
            {
               _loc3_++;
               break;
            }
            _loc4_++;
         }
         if(!_loc3_)
         {
            __cb = null;
         }
      }
      
      public function getTeamIDs() : Array
      {
         return teams.slice();
      }
      
      public function getRoomIDs() : Array
      {
         return rooms.slice();
      }
      
      public function update(param1:Array) : void
      {
         var _loc2_:String = param1.join(d).toString();
         ref.$reb(param1,data);
         ref.$sts += "16" + d + _loc2_ + e;
      }
      
      public function removeMember(param1:int) : int
      {
         var _loc2_:uint = this.members.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            if(this.members[_loc3_] == param1)
            {
               this.members = this.members.slice(0,_loc3_).concat(this.members.slice(_loc3_ + 1));
               return _loc3_;
            }
            _loc3_++;
         }
         return -1;
      }
      
      public function indexUpdateConditional(param1:Array, param2:Function, param3:Object) : *
      {
         var _loc4_:Number;
         ref.$cblist[_loc4_ = ++ref.$cbid] = {
            "event":param2,
            "action":6,
            "obj":this,
            "index":param1[0],
            "value":param1[1],
            "scope":param3
         };
         ref.$sts += "59" + d + param1.join(d) + d + ref.$cbid + e;
      }
      
      public function getMemberNames() : Array
      {
         var _loc1_:* = members.length;
         var _loc2_:* = [];
         while(_loc1_--)
         {
            _loc2_.push(ref.member.getName(members[_loc1_]));
         }
         return _loc2_;
      }
      
      public function clearAllDataIndexCallbacks() : void
      {
         __cb = null;
      }
      
      public function getSessionList() : Array
      {
         return sessionList;
      }
      
      public function chat(param1:String) : void
      {
         ref.$sts += "10" + d + ref.me.id + d + "2" + d + "0" + d + param1 + e;
      }
      
      public function getData() : Array
      {
         return data;
      }
      
      public function getNumberOfRooms() : Number
      {
         return rooms.length;
      }
      
      public function getNumberOfTeams() : Number
      {
         return teams.length;
      }
      
      public function setDataIndexCallback(param1:Number, param2:Function, param3:Object) : void
      {
         if(!__cb)
         {
            __cb = [];
         }
         __cb["_" + param1] = {
            "cb":param2,
            "sc":param3
         };
      }
      
      public function getMemberIDs() : Array
      {
         return members.slice();
      }
      
      public function $init() : void
      {
         teams = [];
         rooms = [];
         members = [];
         data = [];
         $cb = [];
      }
      
      public function getTeamNames() : Array
      {
         var _loc1_:* = teams.length;
         var _loc2_:* = [];
         while(_loc1_--)
         {
            _loc2_.push(ref.team.list["_" + teams[_loc1_]].name);
         }
         return _loc2_;
      }
      
      public function indexUpdateEval(param1:Array) : void
      {
         ref.$sts += "59" + d + param1.join(d).toString() + e;
      }
      
      public function indexUpdate(param1:Array) : void
      {
         var _loc2_:String = param1.join(d).toString();
         var _loc3_:Number = d.length;
         var _loc4_:* = data;
         var _loc5_:* = 0;
         while(_loc5_ < _loc3_)
         {
            _loc4_[param1[_loc5_]] = param1[_loc5_ + 1];
            _loc5_ += 2;
         }
         ref.$sts += "17" + d + _loc2_ + e;
      }
      
      public function getNumberOfMembers() : Number
      {
         return members.length;
      }
   }
}

