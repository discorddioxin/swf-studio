package com.rawfishsoftware.sushi
{
   import flash.events.EventDispatcher;
   import flash.events.TimerEvent;
   import flash.net.XMLSocket;
   import flash.utils.Timer;
   
   public class SushiAPI extends EventDispatcher
   {
      
      internal var $majorVersion:Number = 2;
      
      internal var $nocb:Boolean;
      
      public var mob:Mob;
      
      internal var $game:String;
      
      internal var $pf:Number;
      
      public var ip:String;
      
      internal var $memberNames:Object;
      
      public var connectionType:String;
      
      internal var $memberIDs:Object;
      
      public var speedFac:Number = 1;
      
      internal var timer:Timer;
      
      internal var $fps:Number;
      
      public var team:Team;
      
      public var logging:Boolean = false;
      
      public var challenge:Challenge;
      
      internal var $connected:uint = 0;
      
      internal var $$fps:Number = 0;
      
      internal var $sc:Object;
      
      public var ping:Number = -1;
      
      public var port:Number;
      
      internal var $cb:Object;
      
      internal var $minorVersion:Number = 2;
      
      internal var $sts:String = "";
      
      internal var logger:Logger;
      
      public var session:Session;
      
      internal var $socket:SushiSocket;
      
      public var me:Me;
      
      public var member:Member;
      
      public var LIMIT:Number = 0;
      
      internal var $subVersion:Number = 4;
      
      public var event:Event;
      
      internal var $pint:Number;
      
      internal var $clientSpeed:Number;
      
      internal var $cblist:Object;
      
      internal var $pon:Boolean = false;
      
      internal var $tempTeamList:Object;
      
      internal var $instance:Number;
      
      internal var $ttid:Array;
      
      internal var $d:String;
      
      internal var $e:String;
      
      internal var $netTimer:Number = -1;
      
      public var room:Room;
      
      internal var $cbid:Number;
      
      internal var $toGo:Number;
      
      public var fps:Number = 0;
      
      internal var $smode:Number = -1;
      
      internal var serial:Serializer;
      
      internal var $pollFreq:Number;
      
      public function SushiAPI()
      {
         super();
         $d = chr(2);
         $e = chr(3);
         this.session = new Session(this);
         me = new Me(this);
         member = new Member(this);
         mob = new Mob(this);
         room = new Room(this);
         team = new Team(this);
         challenge = new Challenge(this);
         event = new Event(this);
         logger = new Logger(this);
         serial = new Serializer();
         $speedCheck();
         $init();
         session.sessionList = [];
         connectionType = "";
         me.$init();
         $fps = 0;
         $ttid = new Array();
         timer = new Timer(1000);
         timer.addEventListener(TimerEvent.TIMER,this.onTimer);
      }
      
      public function sendUserMessage(param1:String, param2:Number, param3:Number, param4:Array) : void
      {
         $sts += "53" + $d + param1 + $d + me.id + $d + param2 + $d + param3 + $d + param4.join($d) + $e;
      }
      
      public function $dump(param1:Object) : void
      {
         var _loc2_:* = undefined;
         trace("**************************************************");
         echo("**************************************************");
         trace("Dump:");
         echo("Dump:");
         for(_loc2_ in param1)
         {
            trace(_loc2_ + " => " + param1[_loc2_]);
            echo(_loc2_ + " => " + param1[_loc2_]);
         }
         trace("**************************************************");
         echo("**************************************************");
      }
      
      public function getSessionList() : Array
      {
         return session.sessionList;
      }
      
      public function isBadWord(param1:String, param2:Function, param3:Object) : void
      {
         var _loc4_:Number;
         $cblist[_loc4_ = ++$cbid] = {
            "event":param2,
            "scope":param3
         };
         $sts += "57" + $d + $cbid + $d + param1 + $e;
      }
      
      public function connectToServerHTTP(param1:String, param2:String, param3:Function, param4:Object) : void
      {
         $smode = 0;
         this.ip = param1;
         $game = param2;
         $cb = param3;
         $sc = param4;
      }
      
      public function callPlugin(param1:String, param2:Array, param3:Function, param4:Object) : void
      {
         var _loc5_:Number;
         $cblist[_loc5_ = ++$cbid] = {
            "event":param3,
            "scope":param4
         };
         $sts += "19" + $d + $cbid + $d + param1 + $d + param2.join($d) + $e;
      }
      
      public function echo(... rest) : void
      {
      }
      
      public function disconnectFromServer() : void
      {
         if($smode)
         {
            $socket.close();
            $init();
         }
         session.sessionList = [];
         connectionType = "";
         me.$init();
      }
      
      public function connectToServerSocket(param1:String, param2:Number, param3:String, param4:Function, param5:Object) : XMLSocket
      {
         $smode = 1;
         this.ip = param1;
         this.port = param2;
         $game = param3;
         $cb = param4;
         $sc = param5;
         $socket = new SushiSocket(param1,param2,this);
         return $socket;
      }
      
      public function $onIndexUpdate(param1:Object, param2:Array, param3:Object) : void
      {
         var _loc11_:* = undefined;
         var _loc12_:* = undefined;
         var _loc4_:* = param2[1];
         var _loc5_:* = param2.slice(2,param2.length);
         var _loc6_:int = int(_loc5_.length);
         var _loc7_:* = param1.list["_" + _loc4_];
         var _loc8_:* = _loc7_.data;
         var _loc9_:* = _loc7_.__cb;
         var _loc10_:int = 0;
         while(_loc10_ < _loc6_)
         {
            _loc11_ = _loc5_[_loc10_];
            _loc8_[_loc11_] = _loc5_[_loc10_ + 1];
            if(_loc9_)
            {
               _loc12_ = _loc9_["_" + _loc11_];
               if(_loc12_)
               {
                  if(param1 != this.mob)
                  {
                     _loc12_.cb.apply(_loc12_.sc,[int(_loc4_),_loc5_[_loc10_ + 1]]);
                  }
                  else
                  {
                     _loc12_.cb.apply(_loc12_.sc,[_loc4_,_loc5_[_loc10_ + 1]]);
                  }
               }
            }
            _loc10_ += 2;
         }
         param3.$call(_loc4_,_loc5_);
      }
      
      private function $speedCheck() : void
      {
         var _loc3_:Number = NaN;
         var _loc4_:String = null;
         var _loc5_:Array = null;
         var _loc6_:Number = NaN;
         var _loc7_:Number = NaN;
         var _loc1_:Number = getTimer();
         var _loc2_:String = "0,00,00000000000000,00,0000,00,0,0,0#0,000,0,000000000,0,000#0,0,0000,0,000#0,0000,00000000000,0,0#0,00000000,00#000,00#0,0,000#0,00,00000000000,00#0,00,0000,000#0,0,0000#00,0000,0#";
         _loc3_ = 0;
         while(_loc3_ <= 400)
         {
            _loc5_ = _loc2_.split("#");
            _loc7_ = _loc5_.length;
            _loc6_ = 0;
            while(_loc6_ < _loc7_)
            {
               _loc4_ = _loc5_[_loc6_].split(",");
               _loc6_++;
            }
            _loc3_++;
         }
         $clientSpeed = getTimer() - _loc1_;
      }
      
      public function getMemberList(param1:*) : void
      {
         if(param1 == undefined)
         {
            param1 = "";
         }
         $sts += "14" + $d + param1 + $e;
      }
      
      public function enableLogging(param1:Boolean) : void
      {
         logging = param1;
         if(connectionType != "")
         {
            $sts += "87" + $d + Number(param1) + $e;
         }
      }
      
      internal function $init() : void
      {
         $cb = null;
         $sc = null;
         $memberIDs = {"x0":"Administrator"};
         $memberNames = {"xAdministrator":0};
         $cbid = 0;
         $cblist = {};
         $tempTeamList = {};
         $pollFreq = 100;
         $nocb = true;
         $toGo = 0;
         member.$init();
         mob.$init();
         team.$init();
         session.$init();
         room.$init();
         challenge.$init();
         event.$init();
      }
      
      public function searchMember(param1:String, param2:Function, param3:Object) : void
      {
         var _loc4_:Number;
         $cblist[_loc4_ = ++$cbid] = {
            "event":param2,
            "scope":param3
         };
         $sts += "51" + $d + $cbid + $d + param1 + $e;
      }
      
      public function $indexUpdateConditional(param1:Object, param2:String, param3:Number, param4:Array, param5:Function, param6:Object) : void
      {
         var _loc7_:Number;
         $cblist[_loc7_ = ++$cbid] = {
            "event":param5,
            "action":6,
            "obj":param1.list["_" + param3],
            "index":param4[0],
            "value":param4[1],
            "scope":param6
         };
         $sts += param2 + $d + param3 + $d + param4.join($d) + $d + $cbid + $e;
      }
      
      private function getTimer() : int
      {
         return new Date().getTime();
      }
      
      public function getPollingInterval() : Number
      {
         return $pollFreq;
      }
      
      public function loadSessionList(param1:String, param2:Function, param3:Object) : void
      {
         var _loc4_:Number;
         $cblist[_loc4_ = ++$cbid] = {
            "event":param2,
            "action":7,
            "scope":param3
         };
         $sts += "29" + $d + $cbid + $d + param1 + $e;
      }
      
      public function $ping() : void
      {
         $netTimer = getTimer();
         $sts += "62" + $d + $e;
      }
      
      public function $indexUpdate(param1:Object, param2:String, param3:Number, param4:Array) : void
      {
         var _loc8_:* = undefined;
         var _loc5_:* = param4.join($d);
         var _loc6_:int = int(param4.length);
         var _loc7_:* = param1.list["_" + param3].data;
         _loc8_ = 0;
         while(_loc8_ < _loc6_)
         {
            _loc7_[param4[_loc8_]] = param4[_loc8_ + 1];
            _loc8_ += 2;
         }
         $sts += param2 + $d + param3 + $d + _loc5_ + $e;
      }
      
      public function getVersion() : String
      {
         return $majorVersion + "." + $minorVersion + "." + $subVersion;
      }
      
      private function onTimer(param1:TimerEvent) : void
      {
         this.$ping();
      }
      
      public function $silentUpdate(param1:Object, param2:String, param3:Number, param4:Array) : void
      {
         var _loc5_:* = param4.join($d);
         var _loc6_:* = param1.list["_" + param3];
         $reb(param4,_loc6_.data);
         $sts += param2 + $d + param3 + $d + _loc5_ + $e;
      }
      
      public function $onUpdate(param1:Object, param2:Array, param3:Object) : void
      {
         var _loc11_:* = undefined;
         var _loc4_:* = param2[1];
         var _loc5_:* = param2.slice(2,param2.length);
         var _loc6_:* = param1.list["_" + _loc4_];
         if(!_loc6_)
         {
            _loc6_ = new Object();
         }
         if(!_loc6_.data)
         {
            _loc6_.data = new Array();
         }
         var _loc7_:* = _loc6_.data;
         var _loc8_:* = _loc5_.length;
         var _loc9_:* = _loc6_.__cb;
         var _loc10_:int = 0;
         while(_loc10_ < _loc8_)
         {
            _loc7_[_loc10_] = _loc5_[_loc10_];
            if(_loc9_)
            {
               _loc11_ = _loc9_["_" + _loc10_];
               if(_loc11_)
               {
                  if(param1 != this.mob)
                  {
                     _loc11_.cb.apply(_loc11_.sc,[int(_loc4_),_loc5_[_loc10_]]);
                  }
                  else
                  {
                     _loc11_.cb.apply(_loc11_.sc,[_loc4_,_loc5_[_loc10_]]);
                  }
               }
            }
            _loc10_++;
         }
         if($nocb)
         {
            param3.$call(_loc4_,_loc5_);
         }
      }
      
      private function chr(param1:int) : String
      {
         return String.fromCharCode(param1);
      }
      
      public function connectToServer(... rest) : XMLSocket
      {
         if(rest[0].toUpperCase() == "SOCKET")
         {
            return connectToServerSocket(rest[1],rest[2],rest[3],rest[4],rest[5]);
         }
         if(rest[0].toUpperCase() == "HTTP")
         {
            connectToServerHTTP(rest[1],rest[2],rest[3],rest[4]);
         }
         return null;
      }
      
      public function $removeValue(... rest) : Boolean
      {
         var _loc2_:* = rest[0];
         var _loc3_:* = rest[1];
         var _loc4_:* = _loc2_.length;
         _loc4_ = _loc2_.length;
         while(_loc4_ >= 0)
         {
            if(_loc2_[_loc4_] == _loc3_)
            {
               _loc2_.splice(_loc4_,1);
               return true;
            }
            _loc4_--;
         }
         return false;
      }
      
      public function getFPS(param1:Number) : void
      {
         $fps = param1;
      }
      
      public function decodeObject(param1:String) : Object
      {
         return serial.unserialize(param1);
      }
      
      public function $p(param1:String) : void
      {
         var $n:* = undefined;
         var p:* = undefined;
         var $v:* = undefined;
         var d:* = undefined;
         var len:int = 0;
         var m:* = undefined;
         var index:* = undefined;
         var c:* = undefined;
         var i:int = 0;
         var c2:* = undefined;
         var id:* = undefined;
         var room:* = undefined;
         var mem:* = undefined;
         var data:* = undefined;
         var o:* = undefined;
         var r:* = undefined;
         var n:* = undefined;
         var k:int = 0;
         var xid:* = undefined;
         var xname:* = undefined;
         var xteam:* = undefined;
         var xraum:* = undefined;
         var px:* = undefined;
         var xdata:* = undefined;
         var l:int = 0;
         var v:* = undefined;
         var out:* = undefined;
         var w:* = undefined;
         var cbid:* = undefined;
         var info:* = undefined;
         var obj:* = undefined;
         var action:* = undefined;
         var objx:* = undefined;
         var roomID:* = undefined;
         var pw:* = undefined;
         var limit:* = undefined;
         var t1:* = undefined;
         var t2:* = undefined;
         var newteam:* = undefined;
         var oldteam:* = undefined;
         var ret:* = undefined;
         var q:* = undefined;
         var s:* = undefined;
         var wc:* = undefined;
         var nam:* = undefined;
         var lo:* = undefined;
         var numcl:* = undefined;
         var ok:* = undefined;
         var o1:* = undefined;
         var sid:* = undefined;
         var so:* = undefined;
         var to:* = undefined;
         var tn:* = undefined;
         var cb:* = undefined;
         var ttl:* = undefined;
         var am:* = undefined;
         var li:* = undefined;
         var t:* = undefined;
         var message:String = null;
         var $x:String = param1;
         var $k:* = $x.split($e);
         var $l:* = $k.length - 1;
         $n = 0;
         while($n < $l)
         {
            p = $k[$n].split($d);
            if(logging)
            {
               logger.log(p,"SERVER");
            }
            $v = parseInt(p[0]);
            if($v == 6)
            {
               $onUpdate(this.member,p,this.event.onUpdateMember);
            }
            else if($v == 26)
            {
               $onUpdate(this.mob,p,this.event.onUpdateMob);
            }
            else if($v == 54)
            {
               $onIndexUpdate(this.member,p,this.event.onIndexUpdateMember);
            }
            else if($v == 60)
            {
               $onIndexUpdate(this.mob,p,this.event.onIndexUpdateMob);
            }
            else if($v == 40)
            {
               $onUpdate(this.team,p,this.event.onUpdateTeam);
            }
            else if($v == 38)
            {
               $onUpdate(this.room,p,this.event.onUpdateRoom);
            }
            else if($v == 17)
            {
               d = p.slice(1,p.length);
               len = int(d.length);
               m = session.data;
               c = session.__cb;
               i = 0;
               while(i < len)
               {
                  index = d[i];
                  m[index] = d[i + 1];
                  if(c)
                  {
                     c2 = c["_" + index];
                     if(c2)
                     {
                        c2.cb.apply(c2.sc,[d[i + 1]]);
                     }
                  }
                  i += 2;
               }
               event.onIndexUpdateSession.$call(d);
            }
            else if($v == 75)
            {
               $onIndexUpdate(this.room,p,this.event.onIndexUpdateRoom);
            }
            else if($v == 74)
            {
               $onIndexUpdate(this.team,p,this.event.onIndexUpdateTeam);
            }
            else if($v == 25)
            {
               id = p[1];
               room = parseInt(p[2]);
               mem = parseInt(p[3]);
               data = p.slice(4,p.length);
               if(this.mob.list["_" + id] == null)
               {
                  o = this.mob.list["_" + id] = {
                     "id":id,
                     "room":room,
                     "member":mem
                  };
                  this.room.list["_" + room].mobs.push(id);
               }
               this.mob.list["_" + id].data = data;
               if($nocb)
               {
                  event.onNewMob.$call(id,mem,data);
               }
            }
            else if($v == 27)
            {
               id = p[1];
               r = this.mob.list["_" + id].room;
               $removeValue(this.room.list["_" + r].mobs,id);
               delete this.mob.list["_" + id];
               event.onRemoveMob.$call(id);
            }
            else if($v == 21)
            {
               id = int(p[1]);
               if(id != me.id)
               {
                  n = int(p[2]);
                  o = int(p[3]);
                  d = p.slice(4,p.length);
                  r = this.room.list["_" + o];
                  if(Boolean(r.mobs) && r.mobs.length != undefined)
                  {
                     k = 0;
                     while(k < r.mobs.length)
                     {
                        delete this.mob.list["_" + r.mobs[k]];
                        k++;
                     }
                  }
                  r.mobs = [];
                  $removeValue(r.members,id);
                  this.room.list["_" + n].members.push(id);
                  this.member.list["_" + id].room = n;
                  $reb(d,this.member.list["_" + id].data);
                  event.onMemberChangesRoom.$call(id,n,o,d);
                  echo("removeMember");
                  if(Boolean(challenge.id) && o == challenge.room)
                  {
                     $removeValue(challenge.$challengers,id);
                     echo("remove from challengerlist:" + challenge.$challengers + " " + id);
                  }
               }
            }
            else if($v == 53)
            {
               d = p.slice(5,p.length);
               event.onUserMessage.$call(p[1],int(p[2]),int(p[3]),int(p[4]),d);
            }
            else if($v == 5)
            {
               xid = int(p[1]);
               xname = p[2];
               xteam = int(p[3]);
               xraum = int(p[4]);
               px = p[5];
               xdata = p.slice(6,p.length);
               this.room.list["_" + xraum].members.push(xid);
               this.session.members.push(xid);
               $memberIDs["x" + xid] = xname;
               $memberNames["x" + xname] = xid;
               this.team.list["_" + xteam].members.push(xid);
               this.member.list["_" + xid] = {
                  "id":xid,
                  "name":xname,
                  "room":xraum,
                  "team":xteam,
                  "data":xdata,
                  "platform":px,
                  "challenger":0,
                  "spectator":0
               };
               event.onNewMember.$call(xid,xteam,xraum,px,xdata);
            }
            else if($v == 16)
            {
               d = p.slice(1,p.length);
               m = session.data;
               c = session.__cb;
               l = int(d.length);
               i = 0;
               while(i < l)
               {
                  m[i] = d[i];
                  if(c)
                  {
                     c2 = c["_" + i];
                     if(c2)
                     {
                        c2.cb.apply(c2.sc,[d[i]]);
                     }
                  }
                  i++;
               }
               if($nocb)
               {
                  event.onUpdateSession.$call(id,d);
               }
            }
            else if($v == 10)
            {
               event.onChatMessage.$call(int(p[1]),int(p[2]),int(p[3]),p[4]);
            }
            else if($v == 11)
            {
               xid = int(p[1]);
               xteam = int(p[2]);
               room = int(p[3]);
               xname = member.getName(xid);
               if(challenge.id)
               {
                  $removeValue(challenge.$challengers,xid);
               }
               session.removeMember(xid);
               $removeValue(this.room.list["_" + room].members,xid);
               $removeValue(this.team.list["_" + xteam].members,xid);
               $removeValue(this.session.members,xid);
               event.onRemoveMember.$call(xid,xteam,room);
               delete this.$memberIDs["x" + xid];
               delete this.$memberNames["x" + xname];
            }
            else if($v == 86)
            {
               event.onObjectReceived.$call(int(p[1]),int(p[2]),serial.unserialize(p[3]));
            }
            else if($v == 62)
            {
               ping = getTimer() - $netTimer;
            }
            else if($v == 49)
            {
               id = int(p[1]);
               v = int(p[2]);
               this.member.list["_" + id].spectator = v;
               event.onBeSpectator.$call(id,v);
            }
            else if($v == 32)
            {
               out = "";
               w = 1;
               cbid = parseInt(p[1]);
               info = parseInt(p[2]);
               obj = this.$cblist[cbid];
               action = obj.action;
               if(!info)
               {
                  if(action == 2)
                  {
                     if(logging)
                     {
                        out = "\'changeRoom\' status:" + logger.errors[info];
                     }
                     $reb(obj.data,me.data);
                     $removeValue(this.room.list["_" + me.room].members,me.id);
                     if($toGo)
                     {
                        obj.toGo = $toGo;
                     }
                     me.room = obj.toGo;
                     this.room.list["_" + me.room].members.push(me.id);
                     mob.$iid = 0;
                     $nocb = true;
                     me.$roomToGo = null;
                     if(Boolean(challenge.id) && challenge.room != obj.toGo)
                     {
                        challenge.id = 0;
                        challenge.$challengers = [];
                        me.moderator = 0;
                     }
                     $toGo = 0;
                  }
                  else if(action == 3)
                  {
                     if(logging)
                     {
                        out = "\'createRoom\' status:" + logger.errors[info];
                     }
                  }
                  else if(action == 4)
                  {
                     if(logging)
                     {
                        out = "\'joinSession\' status:" + logger.errors[info];
                     }
                     if($toGo)
                     {
                        obj.roomToGo = $toGo;
                     }
                     me.session = obj.sessionToGo;
                     me.team = obj.teamToGo;
                     me.room = obj.roomToGo;
                     me.data = obj.data;
                     o = $tempTeamList["_" + me.session].teamList;
                     l = int(o.length);
                     i = 0;
                     while(i < l)
                     {
                        session.teams.push(o[i].id);
                        objx = this.team.list["_" + o[i].id] = {};
                        objx.limit = o[i].limit;
                        objx.name = o[i].name;
                        objx.id = o[i].id;
                        objx.members = [];
                        i++;
                     }
                     this.room.list["_" + me.room].members.push(me.id);
                     this.session.members.push(me.id);
                     $memberIDs["x" + me.id] = me.name;
                     $memberNames["x" + me.name] = me.id;
                     this.member.list["_" + me.id] = {
                        "challenger":0,
                        "id":me.id,
                        "name":me.name,
                        "room":me.room,
                        "team":me.team,
                        "data":me.data,
                        "platform":"FLASH"
                     };
                     o = session.getMemberIDs();
                     l = int(o.length);
                     i = 0;
                     while(i < l)
                     {
                        m = o[i];
                        this.team.list["_" + member.getTeam(m)].members.push(m);
                        i++;
                     }
                     i = 0;
                     while(i < session.sessionList.length)
                     {
                        o = session.sessionList[i];
                        if(o.id == me.session)
                        {
                           break;
                        }
                        i++;
                     }
                     session.id = o.id;
                     session.name = o.name;
                     $nocb = true;
                  }
                  else if(action == 5)
                  {
                     if(logging)
                     {
                        out = "\'changeTeam\' status:" + logger.errors[info];
                     }
                     $removeValue(this.team.list["_" + me.team].members,me.id);
                     me.team = obj.toGo;
                     this.team["_" + this.me.team].members.push(this.me.id);
                  }
                  else if(action == 6)
                  {
                     obj.obj.data[obj.index] = obj.value;
                  }
                  else if(action == 12)
                  {
                     if(logging)
                     {
                        out = "\'beSpectator\' status:" + logger.errors[info];
                     }
                     me.spectator = obj.value;
                  }
                  else if(action == 8)
                  {
                     if(logging)
                     {
                        out = "\'changeName\' status:" + logger.errors[info];
                     }
                     n = obj.newName;
                     delete $memberNames["x" + this.me.name];
                     $memberNames["x" + n] = me.id;
                     me.name = this.member.list["_" + me.id].name = $memberIDs["x" + me.id] = n;
                  }
               }
               else
               {
                  if(info == 10)
                  {
                     if(logging)
                     {
                        logger.log("Server is full!","STATUS");
                     }
                     $cb.apply($sc,[3]);
                     $cb = $sc = null;
                     disconnectFromServer();
                  }
                  if(action == 7)
                  {
                     if(logging)
                     {
                        out = "\'loadSessionList\' status:" + logger.errors[info];
                     }
                     info = 2;
                  }
                  else if(action == 3)
                  {
                     if(info == 11)
                     {
                        if(logging)
                        {
                           out = "\'createRoom\' status:" + logger.errors[info];
                        }
                        info = 2;
                     }
                  }
                  else if(action == 4)
                  {
                     if(logging)
                     {
                        out = "\'joinSession\' status:" + logger.errors[info];
                     }
                     if(info == 3)
                     {
                        info = 1;
                     }
                     else if(info == 4)
                     {
                        info = 2;
                     }
                     else if(info == 2)
                     {
                        info = 3;
                     }
                     else if(info == 5)
                     {
                        info = 4;
                     }
                     else if(info == 14)
                     {
                        info = 5;
                     }
                  }
                  else if(action == 2)
                  {
                     if(logging)
                     {
                        out = "\'changeRoom\' status:" + logger.errors[info];
                     }
                     if(info == 2)
                     {
                        info = 1;
                     }
                     else if(info == 6)
                     {
                        info = 2;
                     }
                     else if(info == 7)
                     {
                        info = 3;
                     }
                     else if(info == 13)
                     {
                        w = 0;
                        info = 4;
                     }
                     else if(info == 14)
                     {
                        info = 5;
                     }
                  }
                  else if(action == 6)
                  {
                     if(logging)
                     {
                        out = "\'indexUpdateConditional\' status:" + logger.errors[info];
                     }
                     info = 1;
                  }
                  else if(action == 10)
                  {
                     if(info == 12)
                     {
                        if(logging)
                        {
                           out = "\'requestChallenge\' status:" + logger.errors[info];
                        }
                        challenge.id = int(p[3]);
                        me.moderator = 1;
                        info = 0;
                        challenge.$template = obj.template;
                        challenge.$timeout = obj.timeout;
                        challenge.$minMembers = obj.minMembers;
                     }
                     else
                     {
                        if(logging)
                        {
                           out = "\'requestChallenge\' status:" + logger.errors[info];
                        }
                        challenge.id = 0;
                        info = 1;
                     }
                  }
                  else if(action == 12)
                  {
                     if(logging)
                     {
                        out = "\'beSpectator\' status:" + logger.errors[info];
                     }
                     if(info == 8)
                     {
                        info = 1;
                     }
                  }
                  else if(action == 8)
                  {
                     if(logging)
                     {
                        out = "\'changeName\' status:" + logger.errors[info];
                     }
                     if(info == 5)
                     {
                        info = 1;
                     }
                     else if(info == 3)
                     {
                        info = 2;
                     }
                  }
               }
               if(logging)
               {
                  logger.log(out,"STATUS");
               }
               obj.event.apply(obj.scope,p.length == 4 ? [info,parseInt(p[3])] : [info]);
               if(w)
               {
                  delete $cblist[cbid];
               }
            }
            else if($v == 19)
            {
               cbid = parseInt(p[1]);
               obj = $cblist[cbid];
               if(obj)
               {
                  obj.event.apply(obj.scope,p.slice(3,p.length));
               }
               delete $cblist[cbid];
            }
            else if($v == 30)
            {
               roomID = int(p[1]);
               pw = parseInt(p[2]);
               limit = 0;
               xname = p[3];
               t1 = p[4].split(chr(4));
               l = int(t1.length);
               t2 = [];
               d = [];
               d = p.slice(5,p.length);
               k = 0;
               while(k < l)
               {
                  limit = t2[t1[k]] = int(t1[k + 1]);
                  k += 2;
               }
               session.rooms.push(roomID);
               this.room.list["_" + roomID] = {
                  "data":d,
                  "mobs":[],
                  "members":[],
                  "waitingQueue":[],
                  "locked":0,
                  "id":roomID,
                  "limit":limit,
                  "name":xname,
                  "teamLimits":t2,
                  "password":pw
               };
               if(d.length)
               {
                  event.onNewRoom.$call(roomID,xname,limit,d);
               }
               else
               {
                  event.onNewRoom.$call(roomID,xname,limit);
               }
            }
            else if($v == 23)
            {
               room = int(p[1]);
               $removeValue(session.rooms,room);
               delete this.room.list["_" + room];
               event.onRemoveRoom.$call(room);
            }
            else if($v == 34)
            {
               this.room.list["_" + me.$roomToGo].waitingQueue = [];
               if(p[1] != null)
               {
                  d = p.slice(1,p.length);
                  this.room.list["_" + me.$roomToGo].waitingQueue = d;
                  event.onUpdateWaitingQueue.$call(me.$roomToGo,d);
               }
            }
            else if($v == 67)
            {
               challenge.id = int(p[1]);
               p.push(me.id);
               m = p.slice(3,p.length);
               event.onChallengeRequest.$call(int(p[2]),m);
            }
            else if($v == 69)
            {
               challenge.$challengers = p.slice(3,p.length);
               challenge.room = int(p[2]);
               event.onStartChallenge.$call(int(p[2]));
            }
            else if($v == 73)
            {
               event.onPlay.$call(int(p[1]));
            }
            else if($v == 68)
            {
               if(challenge.id == p[2])
               {
                  event.onAnswerChallengeRequest.$call(int(p[1]),int(p[3]));
               }
            }
            else if($v == 72)
            {
               if(challenge.id == int(p[1]))
               {
                  challenge.id = 0;
                  challenge.$challengers = [];
                  me.moderator = 0;
                  event.onCancelChallenge.$call(int(p[2]));
               }
            }
            else if($v == 18)
            {
               if(me.id == int(p[1]))
               {
                  me.moderator = 1;
               }
               event.onModeratorChanged.$call(int(p[1]));
            }
            else if($v == 64)
            {
               if(int(p[2]))
               {
                  event.onIncludeMember.$call(int(p[1]));
               }
               else
               {
                  event.onExcludeMember.$call(int(p[1]));
               }
            }
            else if($v == 24)
            {
               $toGo = int(p[1]);
            }
            else if($v == 36)
            {
               xid = p[1];
               xname = p[2];
               delete $memberNames["x" + xname];
               $memberNames["x" + xname] = xid;
               this.member.list["_" + xid].name = $memberIDs["x" + xid] = xname;
               event.onMemberNameChanged.$call(int(xid),xname);
            }
            else if($v == 39)
            {
               this.room.list["_" + p[1]].locked = int(p[2]);
               event.onRoomLocked.$call(int(p[1]),int(p[2]));
            }
            else if($v == 8)
            {
               me.master = 1;
               event.onMaster.$call();
            }
            else if($v == 9)
            {
               me.master = 0;
               event.onSlave.$call();
            }
            else if($v == 43)
            {
               id = parseInt(p[1]);
               if(id != me.id)
               {
                  newteam = int(p[3]);
                  oldteam = int(p[2]);
                  $removeValue(this.team.list["_" + oldteam].members,id);
                  this.team.list["_" + newteam].members.push(id);
                  this.member.list["_" + id].team = newteam;
                  event.onMemberChangesTeam.$call(id,oldteam,newteam);
               }
            }
            else if($v == 52)
            {
               obj = $cblist[p[1]];
               if(p[2] == -1)
               {
                  obj.event.apply(obj.scope,[0]);
               }
               else
               {
                  ret = [];
                  l = int(p.length);
                  i = 2;
                  while(i < l)
                  {
                     if(p[i] != -1)
                     {
                        ret.push({
                           "id":p[i],
                           "session":p[i + 1],
                           "team":p[i + 2],
                           "room":p[i + 3],
                           "spectator":0
                        });
                     }
                     i += 4;
                  }
                  obj.event.apply(obj.scope,[ret]);
               }
            }
            else if($v == 56)
            {
               event.onSystemMessage.$call(p[1]);
            }
            else if($v == 1)
            {
               if(connectionType != "HTTP")
               {
                  me.id = parseInt(p[1]);
               }
            }
            else if($v == 2)
            {
               $cblist[++$cbid] = {
                  "event":$cb,
                  "action":7,
                  "scope":$sc
               };
               $sts += "29" + $d + $cbid + $d + $game + $e;
               $sts += "3" + $d + (getTimer() - $netTimer) + $e;
               if(logging)
               {
                  $sts += "87" + $d + "1" + $e;
               }
            }
            else if($v == 35)
            {
               limit = 0;
               s = p.length;
               n = 1;
               t2 = [];
               ok = 0;
               while(n < s)
               {
                  id = parseInt(p[n++]);
                  pw = parseInt(p[n++]) == 1 ? true : false;
                  numcl = parseInt(p[n++]);
                  wc = parseInt(p[n++]);
                  nam = p[n++];
                  lo = parseInt(p[n++]);
                  t1 = p[n++].split(chr(4));
                  l = int(t1.length);
                  t2 = [];
                  k = 0;
                  while(k < l)
                  {
                     limit += t2[t1[k]] = parseInt(t1[k + 1]);
                     k += 2;
                  }
                  session.rooms.push(id);
                  q = this.room.list["_" + id] = {
                     "data":[],
                     "mobs":[],
                     "members":[],
                     "waitingQueue":[],
                     "locked":lo,
                     "id":id,
                     "limit":limit,
                     "name":nam,
                     "teamLimits":t2,
                     "password":pw
                  };
                  while(p[n].charCodeAt(0) != 1 && n < s)
                  {
                     q.data.push(p[n]);
                     n++;
                  }
                  n++;
                  limit = 0;
               }
            }
            else if($v == 7)
            {
               if(!$smode)
               {
                  event.onDisconnect.$call();
               }
               $init();
               event.onServerRestart.$call();
            }
            else if($v == 65)
            {
               id = int(p[1]);
               if(id == me.id && !$smode)
               {
                  $init();
               }
               event.onMemberKicked.$call(id);
            }
            else if($v == 77)
            {
               event.onBadwordDetected.$call();
            }
            else if($v == 57)
            {
               cbid = parseInt(p[1]);
               obj = $cblist[cbid];
               obj.event.apply(obj.scope,[parseInt(p[2])]);
               delete $cblist[cbid];
            }
            else if($v == 61)
            {
               if(connectionType == "SOCKET")
               {
                  this.timer.stop;
                  this.timer.delay = parseInt(p[1]);
                  this.timer.start();
               }
            }
            else if($v == 44)
            {
               o1 = true;
               n = 2;
               s = p.length;
               cb = $cblist[p[1]];
               session.sessionList = [];
               while(n < s)
               {
                  sid = parseInt(p[n++]);
                  so = {};
                  am = 0;
                  li = 0;
                  so.teamList = [];
                  so.name = p[n++];
                  so.version = p[n++];
                  so.id = sid;
                  session.sessionList.push(so);
                  ttl = $tempTeamList["_" + sid] = {};
                  ttl.teamList = [];
                  do
                  {
                     to = {};
                     tn = {};
                     id = tn.id = to.id = parseInt(p[n++]);
                     $ttid[id] = [];
                     to.name = tn.name = p[n++];
                     am += to.activeMembers = parseInt(p[n++]);
                     li += tn.limit = to.limit = parseInt(p[n++]);
                     so.teamList.push(to);
                     ttl.teamList.push(tn);
                  }
                  while(p[n].charCodeAt(0) != 1);
                  so.activeMembers = am;
                  so.limit = li;
                  am = 0;
                  li = 0;
                  so.data = [];
                  n++;
                  do
                  {
                     so.data.push(p[n++]);
                  }
                  while(p[n].charCodeAt(0) != 1);
                  n++;
               }
               try
               {
                  cb.event.apply(cb.scope,[0]);
                  delete this.$cblist[p[1]];
               }
               catch(e:Error)
               {
                  trace("*** SushiAPI Error: " + e.message);
                  this.$socket.close();
               }
            }
            else if($v == 33)
            {
               if(p[1] != null)
               {
                  l = p.length - 6;
                  i = 0;
                  while(i <= l)
                  {
                     id = parseInt(p[i + 4]);
                     t = parseInt(p[i + 1]);
                     r = parseInt(p[i + 2]);
                     n = p[i + 5];
                     s = parseInt(p[i + 3]);
                     q = p[i + 6];
                     this.session.members.push(id);
                     this.room.list["_" + r].members.push(id);
                     if(!this.team.list["_" + t])
                     {
                        this.team.list["_" + t] = new Object();
                     }
                     if(!this.team.list["_" + t].members)
                     {
                        this.team.list["_" + t].members = new Array();
                     }
                     this.team.list["_" + t].members.push(id);
                     this.$memberIDs["x" + id] = n;
                     this.$memberNames["x" + n] = id;
                     this.member.list["_" + id] = {
                        "challenger":0,
                        "id":id,
                        "name":n,
                        "room":r,
                        "data":[],
                        "team":t,
                        "platform":q,
                        "spectator":s
                     };
                     i += 6;
                  }
                  if(Boolean(room) && Boolean(room.$cb))
                  {
                     room.$cb.apply(room.$sc,[0]);
                     room.$cb = room.$sc = null;
                  }
               }
            }
            else
            {
               message = $x.split($e)[0];
               this.dispatchEvent(new CustomEvent(CustomEvent.CUSTOM_MESSAGE,message));
            }
            $n++;
         }
      }
      
      public function $getFPS() : void
      {
         fps = -1000 / ($$fps - ($$fps = getTimer()));
         speedFac = $fps / fps;
      }
      
      public function $indexUpdateEval(param1:Object, param2:String, param3:Number, param4:Array) : void
      {
         $sts += param2 + $d + param3 + $d + param4.join($d) + $e;
      }
      
      public function receiveMyUpdates(param1:Boolean) : void
      {
         $sts += "4" + $d + int(param1) + $e;
      }
      
      public function setPollingInterval(param1:Number) : void
      {
         $pollFreq = param1;
      }
      
      public function $update(param1:Object, param2:String, param3:Number, param4:Array) : void
      {
         var _loc5_:* = param4.join($d);
         $reb(param4,param1.list["_" + param3].data);
         $sts += param2 + $d + param3 + $d + _loc5_ + $e;
      }
      
      public function sendObject(param1:Number, param2:Number, param3:Object) : void
      {
         $sts += "86" + $d + param1 + $d + param2 + $d + serial.serialize(param3) + $e;
      }
      
      public function encodeObject(param1:Object) : String
      {
         return serial.serialize(param1);
      }
      
      public function $reb(param1:Array, param2:Array) : void
      {
         var _loc3_:int = int(param1.length);
         var _loc4_:int = 0;
         while(_loc4_ < _loc3_)
         {
            param2[_loc4_] = param1[_loc4_];
            _loc4_++;
         }
      }
   }
}

