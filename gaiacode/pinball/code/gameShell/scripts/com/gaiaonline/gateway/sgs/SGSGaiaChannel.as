package com.gaiaonline.gateway.sgs
{
   import com.gaiaonline.gateway.GaiaChatMessage;
   import com.gaiaonline.gateway.GaiaIdentity;
   import com.gaiaonline.gateway.IGaiaChannel;
   import com.gaiaonline.sgs.SGSChannel;
   
   public class SGSGaiaChannel extends SGSChannel implements IGaiaChannel
   {
      
      private var _data:Object = null;
      
      private var _occupancy:uint = 0;
      
      private var _presences:Object;
      
      private var _limit:uint = 0;
      
      public function SGSGaiaChannel(param1:SGSGaiaGateway, param2:Number = 0, param3:String = "", param4:uint = 0, param5:uint = 0, param6:Object = null)
      {
         super(param1,param2,param3);
         this._occupancy = param4;
         this.limit = param5;
         this.data = param6;
      }
      
      internal function addPresence(param1:GaiaIdentity) : void
      {
         if(!_presences)
         {
            _presences = new Object();
         }
         if(!_presences[param1.gid])
         {
            ++_occupancy;
         }
         _presences[param1.gid] = param1;
      }
      
      public function get occupancy() : uint
      {
         return this._occupancy;
      }
      
      public function isJoined() : Boolean
      {
         return SGSGaiaGateway(this.socket).getChannelByID(this.id) != null;
      }
      
      public function set data(param1:Object) : void
      {
         this._data = param1;
      }
      
      internal function setPresences(param1:Array, param2:Function = null) : void
      {
         var _loc3_:* = undefined;
         var _loc4_:GaiaIdentity = null;
         _presences = new Object();
         _occupancy = param1.length;
         for(_loc3_ in param1)
         {
            if(param2 != null)
            {
               _loc4_ = param2(param1[_loc3_]);
            }
            else
            {
               _loc4_ = new GaiaIdentity();
               _loc4_.fromObject(param1[_loc3_]);
            }
            _presences[_loc4_.gid] = _loc4_;
         }
      }
      
      public function call(param1:String, ... rest) : uint
      {
         var _loc3_:* = null;
         if(rest)
         {
            _loc3_ = rest.length > 1 ? rest : rest[0];
         }
         return SGSGaiaGateway(this.socket).callChannel(this.id,param1,_loc3_);
      }
      
      public function chat(param1:GaiaChatMessage) : void
      {
         this.call(SGSGaiaProtocol.FUNCTION_CHAT,param1);
      }
      
      internal function removePresence(param1:GaiaIdentity) : void
      {
         if(!_presences)
         {
            return;
         }
         if(_presences[param1.gid])
         {
            --_occupancy;
            delete _presences[param1.gid];
         }
      }
      
      public function get data() : Object
      {
         return this._data;
      }
      
      public function getPresenceList() : void
      {
         SGSGaiaGateway(this.socket).getPresenceList(this.id);
      }
      
      internal function getIdentity(param1:Number) : GaiaIdentity
      {
         if(!_presences)
         {
            return null;
         }
         return _presences[param1];
      }
      
      public function set limit(param1:uint) : void
      {
         this._limit = param1;
      }
      
      public function get limit() : uint
      {
         return this._limit;
      }
      
      public function leave() : void
      {
         SGSGaiaGateway(this.socket).leaveChannel(this.id);
      }
   }
}

