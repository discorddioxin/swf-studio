package com.gaiaworld.sushi
{
   import com.gaiaworld.avatar.constants.AvatarConstants;
   import com.gaiaworld.avatar.controller.OthersController;
   import com.gaiaworld.avatar.events.AvatarActionEvent;
   import com.gaiaworld.avatar.interfaces.IAvatar;
   import com.gaiaworld.avatar.model.AvatarModel;
   import com.gaiaworld.avatar.model.OthersModel;
   import com.gaiaworld.global.constants.GlobalConstants;
   import com.gaiaworld.global.controller.MessageController;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.global.util.BadWordFilter;
   import com.gaiaworld.global.util.DebugTool;
   import com.gaiaworld.global.util.StringFunctions;
   import com.gaiaworld.house.model.HouseModel;
   import com.gaiaworld.room.model.RoomModel;
   import com.gaiaworld.sushi.constants.ChatConstants;
   import com.gaiaworld.sushi.controller.ChatController;
   import com.gaiaworld.sushi.controller.events.ChatEvent;
   import com.gaiaworld.sushi.interfaces.IDataExchange;
   import com.gaiaworld.sushi.model.ChatModel;
   import com.gaiaworld.user.model.UserModel;
   import com.gaiaworld.user.vo.PalTrackVo;
   import com.gaiaworld.user.vo.UserVo;
   import com.smartfoxserver.v2.SmartFox;
   import com.smartfoxserver.v2.core.SFSEvent;
   import com.smartfoxserver.v2.entities.Room;
   import com.smartfoxserver.v2.entities.SFSRoom;
   import com.smartfoxserver.v2.entities.SFSUser;
   import com.smartfoxserver.v2.entities.User;
   import com.smartfoxserver.v2.entities.data.ISFSObject;
   import com.smartfoxserver.v2.entities.data.SFSObject;
   import com.smartfoxserver.v2.entities.managers.SFSRoomManager;
   import com.smartfoxserver.v2.entities.variables.SFSUserVariable;
   import com.smartfoxserver.v2.requests.CreateRoomRequest;
   import com.smartfoxserver.v2.requests.JoinRoomRequest;
   import com.smartfoxserver.v2.requests.LeaveRoomRequest;
   import com.smartfoxserver.v2.requests.LoginRequest;
   import com.smartfoxserver.v2.requests.PublicMessageRequest;
   import com.smartfoxserver.v2.requests.RoomEvents;
   import com.smartfoxserver.v2.requests.RoomPermissions;
   import com.smartfoxserver.v2.requests.RoomSettings;
   import com.smartfoxserver.v2.requests.SetUserVariablesRequest;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.utils.getTimer;
   
   public class DataEx2 extends EventDispatcher implements IDataExchange
   {
      
      private static var instance:DataEx2;
      
      public static const USERS_CHANGED:String = "usersChanged";
      
      public static const PASSWORD_PROMPT:String = "passwordPrompt";
      
      public static const DATA_READY:String = "dataReady";
      
      public static const DISCONNECTED:String = "disconnected";
      
      public static const HIDE_CHAT_VIEW:String = "hideChatView";
      
      public static const LOAD_MAP:String = "loadMap";
      
      private var sfs:SmartFox;
      
      private var rm:SFSRoomManager;
      
      public var room_id:Number;
      
      public var myRoomName:String;
      
      public var portArray:Array;
      
      private var chatModel:ChatModel = ChatModel.getInstance();
      
      private var userModel:UserModel = UserModel.getInstance();
      
      private var avatarModel:AvatarModel = AvatarModel.getInstance();
      
      private var _roomName:*;
      
      private var chatController:ChatController = new ChatController();
      
      private var othersController:OthersController = new OthersController();
      
      public var emoteEnabled:Boolean = true;
      
      private var delimiter:String = ":";
      
      private var initDone:Boolean = false;
      
      private var room:Room;
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      private var othersModel:OthersModel = OthersModel.getInstance();
      
      private var roomModel:RoomModel = RoomModel.getInstance();
      
      private var joinFlag:Boolean = false;
      
      private var roomToJoin:String = "";
      
      private var iamjoined:Boolean = false;
      
      private var messageController:MessageController = new MessageController();
      
      private var lastJoined:String = "";
      
      public function DataEx2()
      {
         super();
         this.sfs = new SmartFox();
         this.rm = new SFSRoomManager(this.sfs);
         this.sfs.debug = true;
         this.sfs.addEventListener(SFSEvent.CONNECTION,this.onConnection);
         this.sfs.addEventListener(SFSEvent.LOGIN_ERROR,this.logError);
         this.sfs.addEventListener(SFSEvent.CONNECTION_LOST,this.onConnectionLost);
         this.sfs.addEventListener(SFSEvent.CONFIG_LOAD_SUCCESS,this.onConfigLoadSuccess);
         this.sfs.addEventListener(SFSEvent.CONFIG_LOAD_FAILURE,this.onConfigLoadFailure);
         this.sfs.addEventListener(SFSEvent.LOGIN,this.onLogin);
         this.sfs.addEventListener(SFSEvent.ROOM_JOIN,this.onRoomJoin);
         this.sfs.addEventListener(SFSEvent.ROOM_JOIN_ERROR,this.onRoomError);
         this.sfs.addEventListener(SFSEvent.USER_ENTER_ROOM,this.onUserEnter);
         this.sfs.addEventListener(SFSEvent.USER_EXIT_ROOM,this.onUserExit);
         this.sfs.addEventListener(SFSEvent.USER_VARIABLES_UPDATE,this.userVarUpdate);
         this.sfs.addEventListener(SFSEvent.PUBLIC_MESSAGE,this.onPublicMessage);
         this.chatModel.addEventListener(ChatEvent.AVATAR_HAS_STOPPED,this.updateMePos);
         this.avatarModel.addEventListener(AvatarConstants.ACTION_SET,this.actionSet);
         this.chatModel.addEventListener(ChatConstants.SEND_USER_CHAT,this.sendChatMessage);
         this.chatModel.addEventListener(ChatConstants.SEND_EMOTE,this.sendEmote);
         this.roomModel.addEventListener(GlobalConstants.CHANGE_ROOMS,this.changeRoom);
         this.sfs.addEventListener(SFSEvent.ROOM_ADD,this.onRoomCreated);
         this.sfs.addEventListener(SFSEvent.ROOM_CREATION_ERROR,this.onRoomCreationError);
         this.chatModel.addEventListener(ChatConstants.SHOW_ADMIN,this.showMod);
         this.chatModel.addEventListener(ChatConstants.HIDE_ADMIN,this.hideMod);
         this.chatModel.addEventListener(ChatConstants.SMITE,this.smite);
         this.avatarModel.addEventListener(AvatarActionEvent.DO_AVATAR_ACTION,this.doSpecialAction);
      }
      
      public static function getInstance() : DataEx2
      {
         if(instance == null)
         {
            instance = new DataEx2();
         }
         return instance;
      }
      
      public function getRoomInfo(param1:String) : *
      {
         return this.sfs.getRoomByName(param1).playerList.length;
      }
      
      public function getRoomInfo2(param1:String) : Room
      {
         return this.sfs.getRoomByName(param1);
      }
      
      private function doSpecialAction(param1:AvatarActionEvent) : void
      {
         var _loc2_:UserVo = this.userModel.userVo;
         var _loc3_:Array = [];
         _loc3_.push(new SFSUserVariable("specialAction",param1.action));
         _loc3_.push(new SFSUserVariable("x",_loc2_.x));
         _loc3_.push(new SFSUserVariable("y",_loc2_.y));
         this.sfs.send(new SetUserVariablesRequest(_loc3_));
      }
      
      private function smite(param1:Event) : void
      {
         var _loc2_:* = "mod:smite:" + String(this.chatModel.otherSelected.gaia_id) + ":" + String(this.chatModel.smiteNumber);
         this.sfs.send(new PublicMessageRequest(_loc2_));
      }
      
      private function hideMod(param1:Event) : void
      {
         trace("HIDE");
         var _loc2_:* = new Array();
         _loc2_.push(new SFSUserVariable("hidden",true));
         this.sfs.send(new SetUserVariablesRequest(_loc2_));
         this.avatarModel.avatar.clip.alpha = 0.5;
      }
      
      private function showMod(param1:Event) : void
      {
         trace("SHOW");
         var _loc2_:* = new Array();
         _loc2_.push(new SFSUserVariable("hidden",false));
         this.sfs.send(new SetUserVariablesRequest(_loc2_));
         this.avatarModel.avatar.clip.alpha = 1;
      }
      
      private function changeRoom(param1:Event) : void
      {
         var _loc2_:HouseModel = HouseModel.getInstance();
         trace("CHANGED ROOM");
         trace("surface name=" + this.roomModel.surfaceToLoad);
         this.roomToJoin = this.roomModel.surfaceToLoad + "_" + this.globalModel.roomInstance;
         if(StringFunctions.contains(this.roomModel.surfaceToLoad.toLowerCase(),"house") == true)
         {
            this.roomToJoin = this.roomModel.surfaceToLoad + "_" + _loc2_.houseMapID;
         }
         if(this.iamjoined == true)
         {
            this.joinFlag = true;
            this.sfs.send(new LeaveRoomRequest());
         }
      }
      
      private function onPublicMessage(param1:SFSEvent) : void
      {
         var _loc5_:UserVo = null;
         var _loc6_:Array = null;
         var _loc7_:Number = NaN;
         var _loc8_:Number = NaN;
         var _loc9_:Number = NaN;
         var _loc10_:BadWordFilter = null;
         var _loc11_:IAvatar = null;
         var _loc2_:* = param1.params.message;
         var _loc3_:User = param1.params.sender;
         var _loc4_:* = SFSUser(_loc3_).getVariable("gaia_id").getValue();
         _loc5_ = this.othersModel.getOthersUserVo(_loc4_);
         if(_loc4_ == this.userModel.userID)
         {
            _loc5_ = this.userModel.userVo;
         }
         if(_loc2_.substr(0,10) == "mod:smite:")
         {
            if(_loc3_.isModerator() == true)
            {
               _loc6_ = _loc2_.split(":");
               _loc7_ = Number(_loc6_[2]);
               this.othersController.setBadAv(_loc7_);
               this.othersController.smite(Number(_loc6_[3]));
            }
            return;
         }
         if(_loc2_.substr(0,6) == "emote:")
         {
            _loc8_ = this.othersModel.getLastEmote(_loc5_.gaia_id);
            _loc9_ = getTimer() - _loc8_;
            if(_loc9_ > 1000)
            {
               this.chatController.setNewEvent(new ChatEvent(ChatEvent.EMOTE_RECEIVED,_loc5_,_loc2_,true));
               this.othersController.regEmote(_loc5_.gaia_id);
            }
            else
            {
               this.othersController.setBadAv(_loc5_.gaia_id);
               this.othersController.smite(1);
            }
            return;
         }
         if(this.userModel.userVo.filter_level != 0)
         {
            _loc10_ = new BadWordFilter();
            _loc2_ = _loc10_.filterWords(_loc2_);
         }
         if(_loc3_.isItMe == true)
         {
            this.chatController.setNewEvent(new ChatEvent(ChatEvent.CHAT_MESSAGE_RECEIVED,_loc5_,_loc2_,true));
            return;
         }
         _loc5_ = this.othersModel.getOthersUserVo(_loc4_);
         if(this.userModel.checkIfIgnored(_loc4_) == false)
         {
            _loc11_ = this.othersModel.getAvatarByID(_loc4_);
            if(_loc11_ != null)
            {
               _loc11_.chatStatus = "";
            }
            if(this.othersModel.isUserMute(_loc4_) == false)
            {
               this.chatController.setNewEvent(new ChatEvent(ChatEvent.CHAT_MESSAGE_RECEIVED,_loc5_,_loc2_,true));
            }
         }
      }
      
      private function sendEmote(param1:Event) : void
      {
         var _loc2_:String = null;
         if(this.chatModel.messageLock == true)
         {
            return;
         }
         if(this.emoteEnabled == true)
         {
            _loc2_ = "emote:" + this.chatModel.emote.join(this.delimiter);
            this.sfs.send(new PublicMessageRequest(_loc2_));
         }
      }
      
      private function sendChatMessage(param1:Event) : void
      {
         var _loc2_:String = this.chatModel.chatMessage;
         this.sfs.send(new PublicMessageRequest(_loc2_));
      }
      
      private function actionSet(param1:Event) : void
      {
         var _loc2_:* = "";
         var _loc3_:UserVo = this.userModel.userVo;
         var _loc4_:* = this.avatarModel.action;
         switch(_loc4_)
         {
            case "kneel":
               _loc2_ = _loc3_.isKneeling;
               break;
            case AvatarConstants.ACTION_TURN_KNEEL:
               _loc2_ = this.avatarModel.actionParams;
         }
         var _loc5_:* = new Array();
         _loc5_.push(new SFSUserVariable("action",_loc4_));
         _loc5_.push(new SFSUserVariable("actionParams",_loc2_));
         this.sfs.send(new SetUserVariablesRequest(_loc5_));
      }
      
      private function sendUserMessage(param1:ChatEvent) : void
      {
      }
      
      private function updateMePos(param1:ChatEvent) : void
      {
         var _loc2_:UserVo = this.userModel.userVo;
         var _loc3_:String = this.makeDirString(_loc2_);
         var _loc4_:Array = [];
         _loc4_.push(new SFSUserVariable("x",_loc2_.x));
         _loc4_.push(new SFSUserVariable("y",_loc2_.y));
         _loc4_.push(new SFSUserVariable("dirString",_loc3_));
         this.sfs.send(new SetUserVariablesRequest(_loc4_));
      }
      
      private function updateUserInfo() : *
      {
         var _loc1_:UserVo = this.userModel.userVo;
         var _loc2_:String = this.makeDirString(_loc1_);
         var _loc3_:Array = [];
         _loc3_.push(new SFSUserVariable("gaia_id",this.userModel.userID));
         _loc3_.push(new SFSUserVariable("dirString",_loc2_));
         _loc3_.push(new SFSUserVariable("x",_loc1_.x));
         _loc3_.push(new SFSUserVariable("y",_loc1_.y));
         _loc3_.push(new SFSUserVariable("avatar",_loc1_.avatar));
         _loc3_.push(new SFSUserVariable("action","none"));
         _loc3_.push(new SFSUserVariable("actionParams","none"));
         _loc3_.push(new SFSUserVariable("level",_loc1_.user_level));
         if(this.sfs.mySelf.isModerator() == true)
         {
            _loc3_.push(new SFSUserVariable("hidden",true));
         }
         this.sfs.send(new SetUserVariablesRequest(_loc3_));
      }
      
      private function makeDirString(param1:UserVo) : *
      {
         return param1.dir + this.delimiter + param1.face + this.delimiter + String(param1.isKneeling) + this.delimiter + String(param1.carSlot) + this.delimiter + String(param1.speed);
      }
      
      public function getUserInfo(param1:String) : *
      {
         var _loc2_:User = this.sfs.userManager.getUserByName(param1);
         DebugTool.pr(_loc2_);
      }
      
      private function userVarUpdate(param1:SFSEvent = null) : void
      {
         var _loc9_:* = undefined;
         var _loc10_:* = undefined;
         var _loc11_:* = undefined;
         var _loc12_:* = undefined;
         var _loc13_:String = null;
         var _loc14_:* = undefined;
         var _loc15_:* = undefined;
         if(param1 == null)
         {
            return;
         }
         var _loc2_:SFSUser = param1.params.user;
         if(_loc2_ == null)
         {
            return;
         }
         var _loc3_:Array = param1.params.changedVars as Array;
         var _loc4_:* = SFSUser(_loc2_).getVariable("gaia_id").getValue();
         var _loc5_:IAvatar = OthersModel.getInstance().getAvatarByID2(_loc4_);
         var _loc6_:* = SFSUser(_loc2_).getVariable("avatar").getValue();
         var _loc7_:* = SFSUser(_loc2_).getVariable("level");
         if(_loc7_)
         {
            _loc7_ = _loc7_.getValue();
         }
         else
         {
            _loc7_ = 2;
         }
         var _loc8_:UserVo = new UserVo(_loc4_,_loc2_.name,_loc6_,_loc7_);
         if(_loc2_.isItMe == true)
         {
            return;
         }
         if(_loc5_ == null)
         {
            return;
         }
         if(_loc3_.indexOf("hidden") != -1)
         {
            if(_loc2_.isModerator() == true)
            {
               _loc9_ = SFSUser(_loc2_).getVariable("hidden").getValue();
               if(_loc5_)
               {
                  _loc5_.clip.visible = !_loc9_;
               }
               else if(_loc2_.isItMe == true)
               {
                  if(_loc9_ == true)
                  {
                     this.avatarModel.avatar.clip.alpha = 0.2;
                  }
                  else
                  {
                     this.avatarModel.avatar.clip.alpha = 1;
                  }
               }
               else if(_loc9_ == false)
               {
                  this.chatController.setNewEvent(new ChatEvent(ChatEvent.USER_HAS_JOINED_ROOM,_loc8_,"",false));
               }
            }
         }
         if(_loc3_.indexOf("x") != -1 || _loc3_.indexOf("y") != -1 || _loc3_.indexOf("dirString") != -1)
         {
            _loc10_ = SFSUser(_loc2_).getVariable("x").getValue();
            _loc11_ = SFSUser(_loc2_).getVariable("y").getValue();
            _loc12_ = SFSUser(_loc2_).getVariable("dirString").getValue();
            _loc13_ = AvatarConstants.MOVE_TO + ":" + _loc10_ + ":" + _loc11_ + ":" + _loc12_;
            if(_loc5_)
            {
               if(_loc3_.indexOf("specialAction") != -1)
               {
                  _loc14_ = SFSUser(_loc2_).getVariable("specialAction").getValue();
                  if(_loc14_ == "placeAt")
                  {
                     _loc5_.clip.x = _loc10_;
                     _loc5_.clip.y = _loc11_;
                  }
               }
               else
               {
                  _loc5_.walkTo(_loc10_,_loc11_);
               }
            }
         }
         if(_loc3_.indexOf("actionParams") != -1)
         {
            _loc14_ = SFSUser(_loc2_).getVariable("action").getValue();
            _loc15_ = SFSUser(_loc2_).getVariable("actionParams").getValue();
            switch(_loc14_)
            {
               case "kneel":
                  if(_loc5_)
                  {
                     if(_loc15_ == 1)
                     {
                        _loc5_.doKneel();
                     }
                     else
                     {
                        _loc5_.doStand();
                     }
                  }
                  break;
               case AvatarConstants.ACTION_TURN_KNEEL:
                  _loc5_.kneelTurn(_loc15_);
            }
         }
      }
      
      public function connect() : void
      {
         this.sfs.loadConfig();
      }
      
      private function onConnection(param1:SFSEvent) : void
      {
         var _loc2_:String = this.userModel.userVo.userName;
         var _loc3_:ISFSObject = new SFSObject();
         _loc3_.putUtfString("sid",this.userModel.sid);
         this.sfs.send(new LoginRequest(_loc2_,"","SimpleChat",_loc3_));
      }
      
      private function onLogin(param1:SFSEvent) : void
      {
         this.updateUserInfo();
         var _loc2_:HouseModel = HouseModel.getInstance();
         var _loc3_:String = this.roomModel.surfaceToLoad + "_" + this.globalModel.roomInstance;
         if(StringFunctions.contains(this.roomModel.surfaceToLoad.toLowerCase(),"house") == true)
         {
            this.roomToJoin = this.roomModel.surfaceToLoad + "_" + _loc2_.houseMapID;
         }
         this.joinRoom(_loc3_);
      }
      
      private function userInfoSet(param1:SFSEvent) : void
      {
      }
      
      private function logError(param1:SFSEvent) : void
      {
      }
      
      private function onConfigLoadFailure(param1:SFSEvent) : void
      {
      }
      
      private function onConfigLoadSuccess(param1:SFSEvent) : void
      {
      }
      
      private function onConnectionLost(param1:SFSEvent) : void
      {
         this.dispatchEvent(new Event(DISCONNECTED,true));
      }
      
      public function joinRoom(param1:String) : *
      {
         var _loc2_:Room = this.sfs.getRoomByName(param1);
         this.globalModel.myLoc = param1;
         if(_loc2_ == null)
         {
            this.roomToJoin = param1;
            this.joinFlag = true;
            this.createRoom(param1);
            return;
         }
         this.sfs.send(new JoinRoomRequest(param1,null,-1));
      }
      
      private function onRoomJoin(param1:SFSEvent) : void
      {
         this.iamjoined = true;
         this.getUsersInRoom(param1.params.room);
         this.dispatchEvent(new Event(LOAD_MAP,true));
      }
      
      private function onRoomError(param1:SFSEvent) : void
      {
         trace("room join error " + param1.params.errorMessage);
         DebugTool.pr(param1.params);
         var _loc2_:String = param1.params.errorMessage;
         if(param1.params.errorCode == 19)
         {
            _loc2_ = "You have already joined this room";
         }
         if(param1.params.errorCode == 20)
         {
            this.globalModel.dispatchEvent(new Event("ROOM_FULL",true));
         }
      }
      
      public function getRoomCapacity(param1:String, param2:String) : *
      {
         param2 = param1 + "_" + param2;
         var _loc3_:Room = this.sfs.getRoomByName(param2);
         if(!_loc3_)
         {
            return "0/40";
         }
         var _loc4_:int = this.sfs.getRoomByName(param2).capacity;
         var _loc5_:int = this.sfs.getRoomByName(param2).maxUsers;
         return String(_loc4_) + "/" + String(_loc5_);
      }
      
      public function createRoom(param1:String) : *
      {
         this.joinFlag = true;
         this.roomToJoin = param1;
         var _loc2_:RoomSettings = new RoomSettings(param1);
         _loc2_.maxUsers = 40;
         _loc2_.groupId = "default";
         var _loc3_:RoomEvents = new RoomEvents();
         _loc3_.allowUserCountChange = true;
         _loc3_.allowUserEnter = true;
         _loc3_.allowUserExit = true;
         _loc3_.allowUserVariablesUpdate = true;
         _loc2_.events = _loc3_;
         var _loc4_:RoomPermissions = new RoomPermissions();
         _loc4_.allowPublicMessages = true;
         _loc2_.permissions = _loc4_;
         this.sfs.send(new CreateRoomRequest(_loc2_));
      }
      
      private function onRoomCreated(param1:SFSEvent) : void
      {
         if(this.joinFlag == true)
         {
            if(this.sfs.mySelf.isJoinedInRoom == true)
            {
               if(StringFunctions.contains(this.roomModel.surfaceToLoad.toLowerCase(),"house") == true)
               {
                  return;
               }
               this.sfs.send(new LeaveRoomRequest());
            }
            else if(this.lastJoined != this.roomToJoin)
            {
               this.lastJoined = this.roomToJoin;
               this.joinRoom(this.roomToJoin);
            }
         }
      }
      
      private function onRoomCreationError(param1:SFSEvent) : void
      {
      }
      
      public function joinFirst() : *
      {
         var _loc1_:SFSRoom = this.sfs.roomList[1];
         this.joinRoom(_loc1_.name);
      }
      
      private function getUsersInRoom(param1:Room) : *
      {
         this.chatModel.roomUsers = param1.userList;
         this.chatModel.roomCount = param1.userCount;
         this.room = param1;
      }
      
      private function addUser(param1:User) : *
      {
         var _loc6_:Boolean = false;
         var _loc2_:String = SFSUser(param1).getVariable("avatar").getValue();
         var _loc3_:int = SFSUser(param1).getVariable("gaia_id").getValue();
         var _loc4_:* = SFSUser(param1).getVariable("level");
         if(_loc4_)
         {
            _loc4_ = _loc4_.getValue();
         }
         else
         {
            _loc4_ = 2;
         }
         var _loc5_:UserVo = new UserVo(_loc3_,param1.name,_loc2_,_loc4_);
         _loc5_.isMod = param1.isModerator();
         if(param1.isModerator() == true)
         {
            _loc6_ = SFSUser(param1).getVariable("hidden").getValue();
            trace("hidden=" + _loc6_);
            _loc5_.visible = !_loc6_;
         }
         this.chatController.setNewEvent(new ChatEvent(ChatEvent.USER_HAS_JOINED_ROOM,_loc5_,"",false));
      }
      
      private function onUserEnter(param1:SFSEvent) : void
      {
         var _loc2_:SFSUser = param1.params.user;
         var _loc3_:* = SFSUser(_loc2_).getVariable("x").getValue();
         var _loc4_:* = SFSUser(_loc2_).getVariable("y").getValue();
         this.addUser(_loc2_);
      }
      
      private function onUserExit(param1:SFSEvent) : void
      {
         var _loc3_:Room = null;
         var _loc4_:String = null;
         var _loc5_:int = 0;
         var _loc6_:UserVo = null;
         var _loc2_:SFSUser = param1.params.user;
         if(_loc2_.isItMe == false)
         {
            _loc3_ = param1.params.room;
            _loc4_ = SFSUser(_loc2_).getVariable("avatar").getValue();
            _loc5_ = SFSUser(_loc2_).getVariable("gaia_id").getValue();
            _loc6_ = new UserVo(_loc5_,_loc2_.name,_loc4_);
            _loc6_.isMod = _loc2_.isModerator();
            this.chatController.setNewEvent(new ChatEvent(ChatEvent.USER_HAS_LEFT_ROOM,_loc6_,"",false));
         }
         else if(this.joinFlag == true)
         {
            this.joinFlag = false;
            this.joinRoom(this.roomToJoin);
         }
      }
      
      public function joinHangoutRoom() : void
      {
      }
      
      public function listAlreadyHere() : void
      {
         var _loc2_:User = null;
         var _loc3_:* = undefined;
         var _loc4_:* = undefined;
         var _loc5_:String = null;
         var _loc6_:String = null;
         var _loc7_:int = 0;
         var _loc8_:* = undefined;
         var _loc9_:UserVo = null;
         var _loc10_:Boolean = false;
         var _loc1_:int = 0;
         while(_loc1_ < this.room.userCount)
         {
            _loc2_ = this.room.userList[_loc1_];
            if(_loc2_.isItMe == false)
            {
               _loc3_ = SFSUser(_loc2_).getVariable("x").getValue();
               _loc4_ = SFSUser(_loc2_).getVariable("y").getValue();
               _loc5_ = SFSUser(_loc2_).getVariable("dirString").getValue();
               _loc6_ = SFSUser(_loc2_).getVariable("avatar").getValue();
               _loc7_ = SFSUser(_loc2_).getVariable("gaia_id").getValue();
               _loc8_ = SFSUser(_loc2_).getVariable("level");
               if(_loc8_)
               {
                  _loc8_ = _loc8_.getValue();
               }
               else
               {
                  _loc8_ = 2;
               }
               _loc9_ = new UserVo(_loc7_,_loc2_.name,_loc6_,_loc8_);
               _loc9_.x = _loc3_;
               _loc9_.y = _loc4_;
               _loc9_.fromDirString(_loc5_);
               if(_loc2_.isModerator() == true)
               {
                  _loc10_ = SFSUser(_loc2_).getVariable("hidden").getValue();
                  _loc9_.visible = !_loc10_;
               }
               _loc9_.isMod = _loc2_.isModerator();
               _loc9_.wasHereBeforeMe = true;
               this.chatController.setNewEvent(new ChatEvent(ChatEvent.USER_HAS_JOINED_ROOM,_loc9_,"",false));
            }
            _loc1_++;
         }
      }
      
      public function askForFriend() : void
      {
      }
      
      public function ignore(param1:Event) : void
      {
      }
      
      public function unignore(param1:Event) : void
      {
      }
      
      public function getListOfRooms() : void
      {
      }
      
      public function createCustomHangout(param1:String) : void
      {
      }
      
      public function showRoomData() : void
      {
      }
      
      public function getCurrentRoomData() : Array
      {
         return null;
      }
      
      public function setRoomData(param1:Number, param2:Array) : void
      {
      }
      
      public function setMobDataSilent(param1:String, param2:Array) : void
      {
      }
      
      public function updateMobData(param1:String, param2:Array) : void
      {
      }
      
      public function initMob(param1:Array) : String
      {
         return "";
      }
      
      public function initMobTemp(param1:Array) : String
      {
         return "";
      }
      
      public function getMobData(param1:String) : String
      {
         return "";
      }
      
      public function clearMob() : void
      {
      }
      
      public function callPlugin(param1:Array) : *
      {
      }
      
      public function get roomName() : String
      {
         return this._roomName;
      }
      
      public function joinPlace(param1:PalTrackVo) : void
      {
      }
      
      public function set connectOverrideFlag(param1:Boolean) : void
      {
      }
   }
}

