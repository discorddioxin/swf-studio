package com.rawfishsoftware.sushi
{
   import flash.net.LocalConnection;
   
   public class Logger
   {
      
      private var $d:String;
      
      private var $e:String;
      
      private var mess_out:Object;
      
      public var errors:Object;
      
      private var mess_in:Object;
      
      private var ref:Object;
      
      public function Logger(param1:*)
      {
         super();
         ref = param1;
         $d = ref.$d;
         $e = ref.$e;
         mess_in = {
            "m1":["idMessage","ID","","",""],
            "m5":["newMember","ID","name","teamID","roomID","platform","!data"],
            "m6":["memberUpdate","ID","!data"],
            "m7":["serverRestart"],
            "m8":["masterClient"],
            "m9":["slaveClient"],
            "m10":["chatMessage","senderID","routing","","message"],
            "m11":["removeMember","ID","teamID","roomID"],
            "m16":["sessionUpdate","!data"],
            "m17":["sessionIndexUpdate","$data"],
            "m19":["pluginAnswer","","pluginID","!data"],
            "m21":["changeRoom","ID","newRoomID","oldRoomID","!data"],
            "m23":["removeRoom","roomID"],
            "m25":["newMob","mobID","roomID","creatorID","!data"],
            "m26":["mobUpdate","mobID","!data"],
            "m27":["removeMob","mobID"],
            "m30":["newRoom","roomID","password","name","","!data"],
            "m34":["waitingQueue","queue"],
            "m36":["memberNameChanged","memberID","newName"],
            "m38":["roomUpdate","roomID","!data"],
            "m39":["lockRoom","roomID","value"],
            "m40":["teamUpdate","teamID","!data"],
            "m43":["changeTeam","userID","oldTeamID","newTeamID"],
            "m49":["beSpectator","value"],
            "m52":["memberSearchResult","","!resultList"],
            "m53":["userMessage","messageID","","routing","targetID","!data"],
            "m54":["memberIndexUpdate","memberID","$data"],
            "m57":["isBadwordAnswer","","result"],
            "m60":["mobIndexUpdate","mobID","$data"],
            "m64":["in/excludeMember","memberID","value"],
            "m65":["kickMember","memberID"],
            "m67":["challengeRequest","challengeID","challengerID","!participantIDs"],
            "m68":["acceptChallenge","userID","challengeID","value"],
            "m69":["startChallenge","challengeID","roomID","!order"],
            "m73":["play","userID"],
            "m72":["cancelChallenge","challengeID","status"],
            "m74":["teamIndexUpdate","teamID","$data"],
            "m75":["roomIndexUpdate","roomID","$data"],
            "m86":["sendObject","routing","targetID","object"],
            "m87":["serverError","message"]
         };
         mess_out = {
            "m2":["clientSpeed","time"],
            "m3":["netSpeed","time"],
            "m4":["receiveMyUpdates","value"],
            "m6":["meUpdate","","!data"],
            "m10":["chatMessage","myID","routing","targetUserID","message"],
            "m11":["removeMe","myID"],
            "m14":["getMemberList","roomID"],
            "m15":["mobSilentUpdate","mobID","!data"],
            "m16":["sessionUpdate","!data"],
            "m17":["sessionIndexUpdate","$data"],
            "m19":["callPlugin","","pluginID","!data"],
            "m20":["changeRoom","","myID","roomID","password","!data"],
            "m22":["createRoom","","myID","password","name","roomTemplate","!clientIdList"],
            "m25":["createMob","mobID","roomID","delete","!data"],
            "m26":["mobUpdate","mobID","!data"],
            "m27":["removeMob","mobID"],
            "m28":["leaveSession",""],
            "m29":["loadSessionList","","game"],
            "m31":["meSilentUpdate","","!data"],
            "m36":["changeName","","","newName"],
            "m38":["roomUpdate","roomID","!data"],
            "m39":["lockRoom","roomID","lock"],
            "m40":["teamUpdate","teamID","!data"],
            "m41":["mobIndexUpdateEval|Conditional","mobID","%data"],
            "m42":["changeTeam","","userID","oldTeamID","newTeamID"],
            "m45":["joinSession","","sessionID","teamID","roomID","password","name","!data"],
            "m47":["initMob","mobID","roomID","delete","!data"],
            "m48":["beSpectator","","value"],
            "m50":["teamIndexUpdateEval|Conditional","teamID","%data"],
            "m51":["searchClient","","!names"],
            "m53":["userMessage","messageID","","routing","targetID","!data"],
            "m54":["meIndexUpdate","myID","$data"],
            "m57":["isBadword","","word"],
            "m58":["roomIndexUpdateEval|Conditional","roomID","%data"],
            "m59":["sessionIndexUpdateEval|Conditional","%data"],
            "m60":["mobIndexUpdate","mobID","$data"],
            "m64":["in/excludeMember","memberID","value"],
            "m66":["requestChallenge","","","roomTemplate","timeout","minUsers","!participantIDs"],
            "m68":["acceptChallenge","userID","challengeID","value"],
            "m70":["startChallenge","challengeID","!order"],
            "m71":["nextMember","challengeID"],
            "m72":["cancelChallenge","challengeID"],
            "m74":["teamIndexUpdate","teamID","$data"],
            "m75":["roomIndexUpdate","roomID","$data"],
            "m86":["sendObject","routing","targetID","object"],
            "m87":["enableLogging","value"]
         };
         errors = ["ok","create room failed","room full","name contains badword","team full","name used","user is not allowed to enter room","room doesn\'t exist","failed","game not found","server full","room-template not found","challenge born","queued","wrong password"];
      }
      
      public function log(param1:*, param2:*) : *
      {
         var _loc3_:* = undefined;
         var _loc4_:* = undefined;
         var _loc5_:* = undefined;
         var _loc6_:* = undefined;
         var _loc7_:* = undefined;
         if(typeof param1 == "string")
         {
            _loc3_ = param1.split(this.$e);
            _loc4_ = _loc3_.length;
            _loc7_ = this.$d;
            param1 = 0;
            while(param1 < _loc4_)
            {
               _loc5_ = _loc3_[param1].split(_loc7_);
               $log(_loc5_,param2);
               param1++;
            }
         }
         else
         {
            $log(param1,param2);
         }
      }
      
      private function $log(param1:*, param2:*) : *
      {
         var lc:LocalConnection = null;
         var $e:* = undefined;
         var $s:* = undefined;
         var out:* = undefined;
         var i:* = undefined;
         var l:* = undefined;
         var s:* = undefined;
         var j:* = undefined;
         var r:* = undefined;
         var op:* = undefined;
         var n:* = param1;
         var a:* = param2;
         var m:* = "";
         if(a == "SERVER")
         {
            m = this.mess_in["m" + n[0]];
         }
         else if(a == "FLASH")
         {
            m = this.mess_out["m" + n[0]];
         }
         else if(a == "STATUS")
         {
            trace("SERVER: " + n);
            lc = new LocalConnection();
            try
            {
               lc.send("_SUSHIOutput","echo","<b>ID" + ref.me.id + ":SERVER:</b> " + n);
            }
            catch(e:*)
            {
               trace("*** Logger::$log(): failed to send to LocalConnection");
            }
         }
         if(m)
         {
            $e = "";
            $s = "";
            out = $s + "\'" + m[0] + "\'" + $e + " ";
            l = n.length;
            i = 1;
            while(i < l)
            {
               if(m[i] != "")
               {
                  s = m[i].substring(0,1);
                  if(!(s != "$" && s != "%" && s != "!"))
                  {
                     if(s == "!")
                     {
                        j = m[i].slice(1,length(m[i]));
                        out += $s + j + ":" + $e + "[" + n.slice(i,l).join(",") + "]";
                     }
                     else if(s == "$")
                     {
                        out += $s + "data:" + $e + "[";
                        r = i;
                        while(r < l)
                        {
                           out += n[r] + ":" + n[r + 1] + " ";
                           r += 2;
                        }
                        out += "]";
                     }
                     else if(s == "%")
                     {
                        if(l - i == 3)
                        {
                           op = n[i + 1];
                           if(op == "/" || op == "+" || op == "-" || op == "*")
                           {
                              op += "=";
                           }
                           out += $s + "evaluate:" + $e + "[index" + n[i] + op + n[i + 2] + "]";
                        }
                        else
                        {
                           op = n[i + 1];
                           if(op == "/" || op == "+" || op == "-" || op == "*")
                           {
                              op += "=";
                           }
                           out += $s + "conditional:" + $e + "[" + n[i] + op + n[i + 2] + " if " + n[i + 3] + n[i + 4] + n[i + 5] + "]";
                        }
                     }
                     break;
                  }
                  out += $s + m[i] + ":" + $e + n[i] + " ";
               }
               i++;
            }
            lc = new LocalConnection();
            try
            {
               lc.send("_SUSHIOutput","echo","<b>ID" + ref.me.id + ":" + a + ":</b> " + out);
            }
            catch(e:*)
            {
               trace("*** Logger::$log(): failed to send to LocalConnection");
            }
         }
      }
      
      private function length(param1:String) : int
      {
         return param1.length;
      }
   }
}

