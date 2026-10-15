package com.rawfishsoftware.sushi
{
   public class Challenge
   {
      
      public var $challengers:Array;
      
      public var $timeout:Number;
      
      public var $minMembers:Number;
      
      private var ref:Object;
      
      public var id:Number;
      
      public var $template:String;
      
      private var d:String;
      
      private var e:String;
      
      public var room:Number;
      
      public function Challenge(param1:Object)
      {
         super();
         ref = param1;
         d = ref.$d;
         e = ref.$e;
      }
      
      public function request(param1:String, param2:Number, param3:Number, param4:Array, param5:Function, param6:Object) : void
      {
         var _loc7_:Number;
         ref.$cblist[_loc7_ = ++ref.$cbid] = {
            "event":param5,
            "action":10,
            "scope":param6,
            "template":param1,
            "timeout":param2,
            "minMembers":param3
         };
         ref.$sts += "66" + d + "-1" + d + ref.$cbid + d + param1 + d + param2 + d + param3 + d + param4.join(d) + e;
      }
      
      public function excludeMember(param1:Number) : void
      {
         ref.$sts += "64" + d + param1 + d + "0" + e;
      }
      
      public function getMemberPosition(param1:Number) : Number
      {
         var _loc3_:* = undefined;
         var _loc2_:* = $challengers.length;
         _loc3_ = 0;
         while(_loc3_ < _loc2_)
         {
            if($challengers[_loc3_] == param1)
            {
               return _loc3_;
            }
            _loc3_++;
         }
         return -1;
      }
      
      public function start(param1:Array) : void
      {
         if(param1)
         {
            ref.$sts += "70" + d + id + d + param1.join(d) + e;
         }
         else
         {
            ref.$sts += "70" + d + id + e;
         }
      }
      
      public function getMemberIDs() : Array
      {
         return $challengers.slice();
      }
      
      public function includeMember(param1:Number) : void
      {
         ref.$sts += "64" + d + param1 + d + "1" + e;
      }
      
      public function nextMember() : void
      {
         ref.$sts += "71" + d + id + e;
      }
      
      public function reChallenge(param1:Function, param2:Object) : void
      {
         var _loc4_:Number;
         ref.$cblist[_loc4_ = ++ref.$cbid] = {
            "event":param1,
            "action":10,
            "scope":param2,
            "template":$template,
            "timeout":$timeout,
            "minMembers":$minMembers
         };
         var _loc3_:Array = ref.room.getMemberIDs(ref.me.room).slice(0);
         ref.removeValue(_loc3_,ref.me.id);
         ref.$sts += "66" + d + id + d + ref.$cbid + d + $template + d + $timeout + d + $minMembers + d + _loc3_.join(d) + e;
      }
      
      public function answerRequest(param1:Number) : void
      {
         ref.$sts += "68" + d + ref.me.id + d + id + d + param1 + e;
         if(!param1)
         {
            id = 0;
            $challengers = [];
            ref.me.moderator = 0;
         }
      }
      
      public function $init() : void
      {
         id = 0;
         $challengers = [];
      }
      
      public function cancel() : void
      {
         ref.$sts += "72" + d + id + e;
         id = 0;
         $challengers = [];
         ref.me.moderator = 0;
      }
   }
}

