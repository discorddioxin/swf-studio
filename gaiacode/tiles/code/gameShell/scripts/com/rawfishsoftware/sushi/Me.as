package com.rawfishsoftware.sushi
{
   public class Me
   {
      
      public var moderator:Number;
      
      public var name:String;
      
      private var ref:*;
      
      public var session:Number;
      
      public var room:Number;
      
      public var $roomToGo:Number;
      
      private var e:String;
      
      public var master:Number;
      
      public var data:Array;
      
      private var d:String;
      
      public var spectator:Number;
      
      public var $tempcbid:Number;
      
      public var id:Number;
      
      public var team:Number;
      
      public var $mobid:Number;
      
      public function Me(param1:Object)
      {
         super();
         ref = param1;
         d = ref.$d;
         e = ref.$e;
         $init();
      }
      
      public function changeRoom(param1:Number, param2:Array, param3:Function, param4:Object) : void
      {
         var _loc5_:Number;
         ref.$cblist[_loc5_ = ++ref.$cbid] = {
            "event":param3,
            "toGo":param1,
            "action":2,
            "data":param2,
            "scope":param4
         };
         $roomToGo = param1;
         ref.$sts += "20" + d + ref.$cbid + d + id + d + param1 + d + "" + d + param2.join(d) + e;
      }
      
      public function joinSessionPassword(param1:String, param2:String, param3:Number, param4:Number, param5:Number, param6:Array, param7:Function, param8:Object) : void
      {
         this.name = param1;
         var _loc9_:Number;
         ref.$cblist[_loc9_ = ++ref.$cbid] = {
            "data":param6,
            "cbid":ref.$cbid,
            "event":param7,
            "teamToGo":param4,
            "roomToGo":param5,
            "sessionToGo":param3,
            "action":4,
            "scope":param8
         };
         ref.$nocb = false;
         ref.session.data = [];
         ref.$sts += "45" + d + ref.$cbid + d + param3 + d + param4 + d + param5 + d + param2 + d + param1 + d + param6.join(d) + e;
      }
      
      public function changeRoomPassword(param1:Number, param2:String, param3:Array, param4:Function, param5:Object) : void
      {
         var _loc6_:Number;
         ref.$cblist[_loc6_ = ++ref.$cbid] = {
            "event":param4,
            "toGo":param1,
            "action":2,
            "data":param3,
            "scope":param5
         };
         $roomToGo = param1;
         ref.$sts += "20" + d + ref.$cbid + d + id + d + param1 + d + param2 + d + param3.join(d) + e;
      }
      
      public function joinSession(param1:String, param2:Number, param3:Number, param4:Number, param5:Array, param6:Function, param7:Object) : void
      {
         this.name = param1;
         var _loc8_:Number;
         ref.$cblist[_loc8_ = ++ref.$cbid] = {
            "data":param5,
            "cbid":ref.$cbid,
            "event":param6,
            "teamToGo":param3,
            "roomToGo":param4,
            "sessionToGo":param2,
            "action":4,
            "scope":param7
         };
         ref.$nocb = false;
         ref.session.data = [];
         ref.$sts += "45" + d + ref.$cbid + d + param2 + d + param3 + d + param4 + d + "" + d + param1 + d + param5.join(d) + e;
      }
      
      public function silentUpdate(param1:Array) : void
      {
         ref.$reb(param1,data);
         ref.$update(ref.member,"31",id,param1);
      }
      
      public function beSpectator(param1:Number, param2:Function, param3:Object) : void
      {
         var _loc4_:Number;
         ref.$cblist[_loc4_ = ++ref.$cbid] = {
            "event":param2,
            "action":12,
            "scope":param3,
            "value":param1
         };
         ref.$sts += "48" + d + ref.$cbid + d + param1 + e;
      }
      
      private function chr(param1:int) : String
      {
         return String.fromCharCode(param1);
      }
      
      public function update(param1:Array) : void
      {
         ref.$reb(param1,data);
         ref.$update(ref.member,"6",id,param1);
      }
      
      public function leaveSession() : void
      {
         ref.$sts += "28" + d + e;
         ref.$init();
      }
      
      public function changeName(param1:String, param2:Function, param3:Object) : void
      {
         var _loc4_:Number;
         ref.$cblist[_loc4_ = ++ref.$cbid] = {
            "event":param2,
            "newName":param1,
            "action":8,
            "scope":param3
         };
         ref.$sts += "36" + d + ref.$cbid + d + id + d + param1 + e;
      }
      
      public function changeTeam(param1:Number, param2:Function, param3:Object) : void
      {
         var _loc4_:Number;
         ref.$cblist[_loc4_ = ++ref.$cbid] = {
            "event":param2,
            "toGo":param1,
            "action":5,
            "scope":param3
         };
         ref.$sts += "42" + d + ref.$cbid + d + id + d + team + d + param1 + e;
      }
      
      public function createPrivateRoom(param1:String, param2:String, param3:Array, param4:Function, param5:Object) : void
      {
         var _loc6_:Number;
         ref.$cblist[_loc6_ = ++ref.$cbid] = {
            "event":param4,
            "toGo":-1,
            "action":3,
            "scope":param5
         };
         ref.$nocb = false;
         param3.push(ref.me.id);
         ref.$sts += "22" + d + ref.$cbid + d + id + d + "" + d + param1 + d + param2 + d + param3.join(chr(1)) + e;
      }
      
      public function $init() : void
      {
         data = [];
         id = room = session = team = -1;
         name = "";
         $mobid = $tempcbid = 0;
         spectator = master = moderator = 0;
      }
      
      public function createRoomPassword(param1:String, param2:String, param3:String, param4:Function, param5:Object) : void
      {
         var _loc7_:Number;
         ref.$cblist[_loc7_ = ++ref.$cbid] = {
            "event":param4,
            "toGo":-1,
            "action":3,
            "scope":param5
         };
         ref.$nocb = false;
         var _loc6_:Array = [];
         ref.$sts += "22" + d + ref.$cbid + d + id + d + param2 + d + param1 + d + param3 + d + _loc6_.join(chr(1)) + e;
      }
      
      public function indexUpdate(param1:Array) : void
      {
         ref.$ireb(param1,data);
         ref.$indexUpdate(ref.member,"54",id,param1);
      }
      
      public function createMob(param1:Number, param2:Number, param3:Array) : String
      {
         var _loc4_:* = id + "m" + $mobid++;
         ref.mob.list["_" + _loc4_] = {
            "id":_loc4_,
            "room":param1,
            "data":param3,
            "$lu":"",
            "$liu":""
         };
         ref.room.list["_" + param1].mobs.push(_loc4_);
         ref.$sts += "25" + d + _loc4_ + d + param1 + d + "1" + d + param2 + d + param3.join(d) + e;
         return _loc4_;
      }
      
      public function createRoom(param1:String, param2:String, param3:Function, param4:Object) : void
      {
         var _loc6_:Number;
         ref.$cblist[_loc6_ = ++ref.$cbid] = {
            "event":param3,
            "toGo":-1,
            "action":3,
            "scope":param4
         };
         ref.$nocb = false;
         var _loc5_:Array = [];
         ref.$sts += "22" + d + ref.$cbid + d + id + d + "" + d + param1 + d + param2 + d + _loc5_.join(chr(1)) + e;
      }
      
      public function createPrivateRoomPassword(param1:String, param2:String, param3:String, param4:Array, param5:Function, param6:Object) : void
      {
         var _loc7_:Number;
         ref.$cblist[_loc7_ = ++ref.$cbid] = {
            "event":param5,
            "toGo":-1,
            "action":3,
            "scope":param6
         };
         ref.$nocb = false;
         param4.push(ref.me.id);
         ref.$sts += "22" + d + ref.$cbid + d + id + d + param2 + d + param1 + d + param3 + d + param4.join(chr(1)) + e;
      }
   }
}

