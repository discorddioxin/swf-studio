package com.gaiaworld.sushi.model
{
   import com.gaiaworld.global.util.StringFunctions;
   import com.gaiaworld.global.vo.ColorVo;
   import com.gaiaworld.hangouts.controller.events.CreateRoomEvent;
   import com.gaiaworld.hangouts.controller.events.RoomEvent;
   import com.gaiaworld.sushi.constants.ChatConstants;
   import com.gaiaworld.sushi.controller.events.ChatEvent;
   import com.gaiaworld.sushi.vo.SRoomVo;
   import com.gaiaworld.sushi.vo.ServerVo;
   import com.gaiaworld.user.vo.UserVo;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   
   public class ChatModel extends EventDispatcher
   {
      
      private static var instance:ChatModel;
      
      public var sid:String;
      
      public var gaia_id:Number;
      
      public var areaPrefix:String = "gaiahood_";
      
      private var _userMessage:String;
      
      private var _chatMessage:String;
      
      private var _emote:Array;
      
      private var serverArray:Array = new Array();
      
      private var roomArray:Array = new Array();
      
      private var contactedID:Number;
      
      private var _privateMessage:String;
      
      public var selfMessage:String;
      
      private var _otherSelected:UserVo;
      
      private var _otherContacted:UserVo;
      
      private var colorArray:Array = new Array();
      
      public var selfEmote:String;
      
      public var autoFind:Boolean = false;
      
      public function ChatModel()
      {
         super();
      }
      
      public static function getInstance() : ChatModel
      {
         if(instance == null)
         {
            instance = new ChatModel();
         }
         return instance;
      }
      
      public function setServers(param1:Array) : *
      {
         this.serverArray = param1;
      }
      
      public function getServer(param1:Number) : ServerVo
      {
         return this.serverArray[param1] as ServerVo;
      }
      
      public function getRoom(param1:Number) : SRoomVo
      {
         return this.roomArray[param1] as SRoomVo;
      }
      
      public function get userMessage() : String
      {
         return this._userMessage;
      }
      
      public function set userMessage(param1:String) : void
      {
         this._userMessage = param1;
         this.dispatchEvent(new Event(ChatConstants.SEND_USER_MESSAGE,false));
      }
      
      public function get chatMessage() : String
      {
         return this._chatMessage;
      }
      
      public function set chatMessage(param1:String) : void
      {
         this._chatMessage = param1;
         this.dispatchEvent(new Event(ChatConstants.SEND_USER_CHAT,false));
      }
      
      public function get emote() : Array
      {
         return this._emote;
      }
      
      public function set emote(param1:Array) : void
      {
         this._emote = param1;
         this.dispatchEvent(new Event(ChatConstants.SEND_EMOTE,true));
      }
      
      public function sendEmoteToSelf(param1:String) : *
      {
         this.selfEmote = param1;
         this.dispatchEvent(new Event(ChatConstants.EMOTE_TO_SELF,true));
      }
      
      public function get privateMessage() : String
      {
         return this._privateMessage;
      }
      
      public function set privateMessage(param1:String) : void
      {
         this._privateMessage = param1;
         this.dispatchEvent(new Event(ChatConstants.PRIVATE_MESSAGE,true));
      }
      
      public function newEventReceived(param1:ChatEvent) : *
      {
         this.dispatchEvent(param1);
      }
      
      public function gotFriendRequest(param1:Number) : *
      {
         this.contactedID = param1;
         this.dispatchEvent(new Event(ChatConstants.FRIEND_REQUEST_REC,true));
      }
      
      public function sendFriendReq() : *
      {
         this.dispatchEvent(new Event(ChatConstants.FRIEND_REQUEST_SEND,true));
      }
      
      public function ignore() : *
      {
         this.dispatchEvent(new Event(ChatConstants.IGNORE,true));
      }
      
      public function unignore() : *
      {
         this.dispatchEvent(new Event(ChatConstants.UNIGNORE,true));
      }
      
      public function disconnect() : void
      {
         this.dispatchEvent(new Event(ChatConstants.DISCONNECT,true));
      }
      
      public function noteToSelf(param1:String) : void
      {
         param1 = StringFunctions.findReplace("+",param1," ");
         this.selfMessage = param1;
         this.dispatchEvent(new Event(ChatConstants.NOTE_TO_SELF,true));
      }
      
      public function showIgnoreDialog() : void
      {
         this.dispatchEvent(new Event(ChatConstants.CONFIRM_IGNORE,true));
      }
      
      public function showUnignoreDialog() : void
      {
         this.dispatchEvent(new Event(ChatConstants.CONFIRM_UNIGNORE,true));
      }
      
      public function get otherContacted() : UserVo
      {
         return this._otherContacted;
      }
      
      public function set otherContacted(param1:UserVo) : void
      {
         this._otherContacted = param1;
      }
      
      public function get otherSelected() : UserVo
      {
         return this._otherSelected;
      }
      
      public function set otherSelected(param1:UserVo) : void
      {
         if(param1 != null)
         {
            this._otherSelected = param1;
         }
      }
      
      public function get numberOfServers() : Number
      {
         return this.serverArray.length;
      }
      
      public function get numberOfRooms() : Number
      {
         return this.roomArray.length;
      }
      
      public function colorsReady() : *
      {
         this.dispatchEvent(new Event(ChatConstants.COLORS_READY,true));
      }
      
      public function addColor(param1:ColorVo) : *
      {
         this.colorArray.push(param1);
      }
      
      public function getColor(param1:Number) : Number
      {
         var _loc4_:ColorVo = null;
         var _loc2_:Number = this.colorArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.colorArray[_loc3_];
            if(_loc4_.level == param1)
            {
               return _loc4_.color;
            }
            _loc3_++;
         }
         return 16777215;
      }
      
      public function setRooms(param1:Array) : void
      {
         this.roomArray = param1;
         this.dispatchEvent(new Event(ChatConstants.ROOMS_READY,true));
      }
      
      public function selectedRoom(param1:Number) : *
      {
         this.dispatchEvent(new RoomEvent(RoomEvent.CHOOSE_ROOM,param1,true));
      }
      
      public function createRoom(param1:String) : void
      {
         this.dispatchEvent(new CreateRoomEvent(CreateRoomEvent.CREATE_ROOM,param1,true));
      }
      
      public function roomIsChanged() : void
      {
         this.dispatchEvent(new Event(ChatConstants.ROOM_CHANGED,true));
      }
   }
}

