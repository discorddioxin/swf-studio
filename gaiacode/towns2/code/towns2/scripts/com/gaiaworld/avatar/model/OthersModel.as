package com.gaiaworld.avatar.model
{
   import com.gaiaworld.avatar.constants.AvatarConstants;
   import com.gaiaworld.avatar.controller.events.AvatarMoveEvent;
   import com.gaiaworld.avatar.controller.events.OtherEvent;
   import com.gaiaworld.avatar.interfaces.IAvatar;
   import com.gaiaworld.global.util.DebugTool;
   import com.gaiaworld.sushi.constants.ChatConstants;
   import com.gaiaworld.sushi.controller.events.ChatEvent;
   import com.gaiaworld.user.vo.UserVo;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.utils.getTimer;
   
   public class OthersModel extends EventDispatcher
   {
      
      private static var instance:OthersModel;
      
      private var _ignoreID:Number;
      
      private var _unIgnoreID:Number;
      
      private var othersArray:Array = new Array();
      
      public var justJoined:Array = new Array();
      
      public var badAv:IAvatar;
      
      private var _selectedAvatar:IAvatar;
      
      public var badID:Number;
      
      public var smiteNumber:Number;
      
      public var emoteTimeArray:Array = new Array();
      
      private var sendTimeArray:Array = new Array();
      
      private var muteArray:Array = new Array();
      
      public function OthersModel()
      {
         super();
      }
      
      public static function getInstance() : OthersModel
      {
         if(instance == null)
         {
            instance = new OthersModel();
         }
         return instance;
      }
      
      public function allAvatars() : Array
      {
         return this.othersArray;
      }
      
      public function getNumberOfUsersHere() : Number
      {
         var _loc2_:* = undefined;
         var _loc3_:IAvatar = null;
         var _loc1_:Number = 0;
         for(_loc2_ in this.othersArray)
         {
            _loc3_ = this.othersArray[_loc2_];
            if(_loc3_.clip != null)
            {
               _loc1_++;
            }
         }
         return _loc1_;
      }
      
      public function registerOtherAv(param1:IAvatar) : *
      {
         DebugTool.pr(param1);
         this.othersArray[param1.dataProvider.gaia_id] = param1;
      }
      
      public function getAvatar(param1:UserVo) : IAvatar
      {
         return this.othersArray[param1.gaia_id];
      }
      
      public function getOthersUserVo(param1:Number) : UserVo
      {
         var _loc2_:IAvatar = this.othersArray[param1];
         if(_loc2_ == null)
         {
            return null;
         }
         return _loc2_.dataProvider;
      }
      
      public function getAvatarByID(param1:Number) : IAvatar
      {
         return this.othersArray[param1];
      }
      
      public function getAvatarByID2(param1:Number) : IAvatar
      {
         return this.othersArray[param1];
      }
      
      public function setBadAv(param1:Number) : *
      {
         this.badID = param1;
         this.badAv = this.getAvatarByID(param1);
      }
      
      public function smite(param1:Number) : *
      {
         this.smiteNumber = param1;
         this.dispatchEvent(new Event(ChatConstants.SMITE,true));
      }
      
      public function takeAvatarOffList(param1:UserVo) : *
      {
      }
      
      public function removeAv(param1:UserVo) : *
      {
         this.dispatchEvent(new ChatEvent(ChatEvent.USER_HAS_LEFT_ROOM,param1,"",true));
      }
      
      public function getList() : *
      {
         var _loc2_:* = undefined;
         var _loc1_:Array = new Array();
         for(_loc2_ in this.othersArray)
         {
            _loc1_.push(this.othersArray[_loc2_]);
         }
         return _loc1_;
      }
      
      public function userGone(param1:UserVo) : *
      {
         if(param1 == null)
         {
            return;
         }
         this.othersArray[param1.gaia_id] = null;
      }
      
      public function isThereAlready(param1:UserVo) : Boolean
      {
         return this.othersArray[param1.gaia_id] == null ? false : true;
      }
      
      public function broadcastUpdate(param1:String, param2:Number) : *
      {
         var _loc3_:Array = param1.split(":");
         var _loc4_:String = _loc3_.shift();
         var _loc5_:String = _loc3_.join(":");
         this.dispatchEvent(new OtherEvent(OtherEvent.OTHER_ACTION,param2,_loc4_,_loc5_,false));
      }
      
      public function showAvatarMenu() : void
      {
         this.dispatchEvent(new Event(AvatarConstants.SHOW_AVATAR_MENU,true));
      }
      
      public function hideAvatarMenu() : void
      {
         this.dispatchEvent(new Event(AvatarConstants.HIDE_AVATAR_MENU,true));
      }
      
      public function get ignoreID() : Number
      {
         return this._ignoreID;
      }
      
      public function set ignoreID(param1:Number) : void
      {
         this._ignoreID = param1;
         this.dispatchEvent(new Event(ChatConstants.IGNORE,true));
      }
      
      public function get unIgnoreID() : Number
      {
         return this._unIgnoreID;
      }
      
      public function set unIgnoreID(param1:Number) : void
      {
         this._unIgnoreID = param1;
         this.dispatchEvent(new Event(ChatConstants.UNIGNORE,true));
      }
      
      public function get selectedAvatar() : IAvatar
      {
         return this._selectedAvatar;
      }
      
      public function set selectedAvatar(param1:IAvatar) : void
      {
         this._selectedAvatar = param1;
         this.dispatchEvent(new Event(AvatarConstants.AVATAR_SELECTED,true));
      }
      
      public function getNumberOfOthers() : Number
      {
         return this.othersArray.length;
      }
      
      public function getOtherAt(param1:Number) : IAvatar
      {
         return this.othersArray[param1];
      }
      
      public function addJustJoined(param1:UserVo) : void
      {
         this.justJoined.push(param1);
      }
      
      public function onUpdateAvatarStatus(param1:IAvatar) : *
      {
         this.dispatchEvent(new AvatarMoveEvent(AvatarMoveEvent.STATUS_CHANGED,param1,true));
      }
      
      public function hideAvatars() : void
      {
         var _loc3_:IAvatar = null;
         var _loc1_:Number = this.othersArray.length;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            _loc3_ = this.othersArray[_loc2_];
            _loc3_.clip.visible = false;
            _loc2_++;
         }
      }
      
      public function showAvatars() : void
      {
         var _loc3_:IAvatar = null;
         var _loc1_:Number = this.othersArray.length;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            _loc3_ = this.othersArray[_loc2_];
            _loc3_.clip.visible = true;
            _loc2_++;
         }
      }
      
      public function updateUserColor(param1:uint, param2:Object) : void
      {
      }
      
      public function getLastSend(param1:Number) : Number
      {
         var _loc2_:Number = 0;
         if(this.sendTimeArray[param1])
         {
            _loc2_ = Number(this.sendTimeArray[param1]);
         }
         return _loc2_;
      }
      
      public function getLastEmote(param1:Number) : Number
      {
         var _loc2_:Number = 0;
         if(this.emoteTimeArray[param1])
         {
            _loc2_ = Number(this.emoteTimeArray[param1]);
         }
         return _loc2_;
      }
      
      public function regEmoteTime(param1:Number) : void
      {
         this.emoteTimeArray[param1] = getTimer();
         this.dispatchEvent(new Event("HIDE_EMOTES",true));
      }
      
      public function regSendTime(param1:Number) : void
      {
         this.sendTimeArray[param1] = getTimer();
      }
      
      public function muteUser(param1:Number) : void
      {
         this.muteArray[param1] = 1;
      }
      
      public function isUserMute(param1:Number) : Boolean
      {
         if(this.muteArray[param1] == 1)
         {
            return true;
         }
         return false;
      }
   }
}

