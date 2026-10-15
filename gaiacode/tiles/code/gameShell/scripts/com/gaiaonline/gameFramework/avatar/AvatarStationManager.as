package com.gaiaonline.gameFramework.avatar
{
   import com.gaiaonline.gameFramework.chat.*;
   import com.gaiaonline.gameFramework.data.*;
   import com.gaiaonline.gameFramework.ui.*;
   import com.gaiaonline.gateway.GaiaIdentity;
   import com.gaiaonline.gateway.IGaiaGateway;
   import com.gaiaonline.gateway.events.GaiaChatEvent;
   import com.gaiaonline.gateway.events.GaiaFunctionEvent;
   import com.gaiaonline.gateway.events.GaiaPresenceEvent;
   import com.gaiaonline.gateway.events.GaiaPresenceListEvent;
   import flash.display.*;
   import flash.events.*;
   import flash.net.*;
   import flash.system.LoaderContext;
   import flash.utils.*;
   
   public class AvatarStationManager extends MovieClip
   {
      
      private var serverGateway:IGaiaGateway;
      
      private var ratio:Number;
      
      private var userData:UserDataGlobal;
      
      private var loaderContext:LoaderContext;
      
      public var inviteFriend_btn:GaiaButton;
      
      public var stationContainer:Sprite;
      
      private var horizSpace:Number;
      
      private var stationGameDisplayUrl:String;
      
      private var gotPresences:Boolean;
      
      private var InviteFriendButtonBG:Class;
      
      private var aStationHash:Object;
      
      private var timer:Timer;
      
      private var aStationArr:Array;
      
      private var roomId:int;
      
      private var loadedStationCount:int = 0;
      
      private var mcBackground:Loader = null;
      
      private var numStations:int = 10;
      
      public var mcBackgroundContainer:Sprite;
      
      public function AvatarStationManager()
      {
         var _loc1_:String = null;
         userData = UserDataGlobal.getInstance();
         aStationHash = {};
         aStationArr = [];
         InviteFriendButtonBG = AvatarStationManager_InviteFriendButtonBG;
         super();
         drawUI();
         ratio = height / width;
         this.loaderContext = new LoaderContext();
         this.loaderContext.checkPolicyFile = true;
         timer = new Timer(1000);
         timer.addEventListener(TimerEvent.TIMER,onTimer);
         if(parent == stage && stage != null)
         {
            _loc1_ = _loc1_ = "../games/tileMatch/media/tileMatchAvatarStation.swf";
            init({"stationGameDisplayUrl":_loc1_});
         }
         this.addEventListener(MouseEvent.MOUSE_DOWN,onMouseDown);
         inviteFriend_btn.addEventListener(MouseEvent.MOUSE_UP,onInviteFriendClicked);
      }
      
      public function setWidth(param1:Number) : void
      {
         if(mcBackground)
         {
            mcBackground.width = param1;
         }
         mcBackgroundContainer.width = param1;
      }
      
      public function addUser(param1:Object) : Boolean
      {
         var _loc3_:uint = 0;
         var _loc4_:AvatarStation = null;
         if(!param1)
         {
            return false;
         }
         var _loc2_:Boolean = false;
         if(aStationHash[param1.gid] == null)
         {
            _loc3_ = uint(getEmptyStationNum());
            if(_loc3_ != -1)
            {
               _loc4_ = aStationArr[_loc3_];
               _loc4_.initStation({"userData":param1});
               aStationHash[param1.gid] = _loc4_;
               dTrace("++++++++++++++++ addUser with gid of " + param1.gid);
               _loc2_ = true;
               positionInviteFriendBtn();
            }
         }
         return _loc2_;
      }
      
      public function getStationByGid(param1:int) : AvatarStation
      {
         return aStationHash[param1];
      }
      
      public function init(param1:Object) : void
      {
         gotPresences = false;
         horizSpace = param1.horizSpace;
         stationGameDisplayUrl = param1.stationGameDisplayUrl;
         serverGateway = param1.serverGateway;
         roomId = param1.roomId;
         numStations = param1.totalStations;
         loadedStationCount = 0;
         loadStation();
      }
      
      private function setHoriz(param1:AvatarStation, param2:int) : void
      {
         var _loc3_:Number = 4 + (horizSpace - 10) / numStations * param2;
         if(param1 != null)
         {
            param1.x = _loc3_;
         }
      }
      
      public function test() : void
      {
         var _loc1_:Array = new Array();
         _loc1_.push({
            "gid":1099056,
            "name":"pizmonaut",
            "avatar":"ava/30/c5/20f78c8d10c530_48x48.gif"
         });
         _loc1_.push({
            "gid":1980,
            "name":"shao",
            "avatar":"ava/30/c5/20f78c8d10c530_48x48.gif"
         });
         _loc1_.push({
            "gid":578390,
            "name":"kaia",
            "avatar":"ava/30/c5/20f78c8d10c530_48x48.gif"
         });
         init(_loc1_);
      }
      
      private function removeAllUsers() : void
      {
         var _loc1_:* = undefined;
         var _loc2_:AvatarStation = null;
         dTrace("removeAllUsers");
         for(_loc1_ in aStationHash[_loc1_])
         {
            _loc2_ = aStationHash[_loc1_];
            _loc2_.clear();
            delete aStationHash[_loc1_];
         }
         aStationHash = new Object();
         positionInviteFriendBtn();
      }
      
      private function onServerClose(param1:Event) : void
      {
         dTrace("onServerClose");
         this.clear();
      }
      
      public function setBackgroundUrl(param1:String) : void
      {
         mcBackground = new Loader();
         mcBackground.load(new URLRequest(param1));
         mcBackgroundContainer.addChild(mcBackground);
      }
      
      private function onTimer(param1:TimerEvent) : void
      {
         dTrace("onTimerComplete");
         loadStation();
      }
      
      private function getEmptyStationNum() : int
      {
         var _loc1_:int = -1;
         var _loc2_:* = int(numStations - 1);
         while(_loc2_ >= 0)
         {
            if(aStationArr[_loc2_] == null)
            {
               _loc1_ = _loc2_;
            }
            else if(aStationArr[_loc2_].isEmpty())
            {
               _loc1_ = _loc2_;
            }
            _loc2_--;
         }
         return _loc1_;
      }
      
      private function onStationLoaded(param1:Event) : void
      {
         var _loc2_:AvatarStation = param1.target.content;
         aStationArr.push(_loc2_);
         stationContainer.addChild(_loc2_);
         draw();
         if(++loadedStationCount == numStations)
         {
            if(serverGateway != null)
            {
               serverGateway.addEventListener(Event.CLOSE,this.onServerClose);
               serverGateway.addEventListener(GaiaChatEvent.CHAT,onChat);
               serverGateway.addEventListener(GaiaPresenceListEvent.PRESENCE_LIST,this.onPresenceList);
               serverGateway.addEventListener(GaiaPresenceEvent.PRESENCE_IN,this.onPresenceIn);
               serverGateway.addEventListener(GaiaPresenceEvent.PRESENCE_OUT,this.onPresenceOut);
               serverGateway.addEventListener(GaiaFunctionEvent.FUNCTION_CALL,this.onFunctionCall);
               serverGateway.getPresenceList(roomId);
            }
         }
         else
         {
            loadStation();
         }
      }
      
      public function onPresenceIn(param1:GaiaPresenceEvent) : void
      {
         addUser(param1.identity);
      }
      
      private function draw() : void
      {
         var _loc1_:int = int(aStationArr.length);
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            setHoriz(aStationArr[_loc2_],_loc2_);
            _loc2_++;
         }
      }
      
      public function onPresenceList(param1:GaiaPresenceListEvent) : void
      {
         if(!this.gotPresences)
         {
            drawInitial(param1.identities);
            this.gotPresences = true;
         }
      }
      
      private function onMouseDown(param1:MouseEvent) : void
      {
         if(parent.parent["focusGame"])
         {
            parent.parent["focusGame"]();
         }
      }
      
      private function clear() : void
      {
         dTrace("clear");
         var _loc1_:int = stationContainer.numChildren;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            stationContainer.removeChildAt(0);
            _loc2_++;
         }
         aStationHash = new Object();
         aStationArr = new Array();
      }
      
      private function onInviteFriendClicked(param1:Event) : void
      {
         dispatchEvent(new Event("INVITE_FRIEND_CLICKED"));
      }
      
      public function getStationAt(param1:int) : AvatarStation
      {
         return aStationArr[param1];
      }
      
      public function onFunctionCall(param1:GaiaFunctionEvent) : void
      {
         var _loc2_:String = null;
         if(Boolean(param1) && Boolean(param1.data))
         {
            switch(param1.data.name)
            {
               case "updateGameStatus":
                  _loc2_ = param1.data.args["gid"];
                  aStationHash[_loc2_].update(param1.data.args);
            }
         }
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[AvatarStationManager]" + param1);
      }
      
      private function onChat(param1:GaiaChatEvent) : void
      {
         var _loc5_:WordBalloon = null;
         var _loc2_:String = param1.data.sender.userName;
         var _loc3_:GaiaIdentity = param1.data.sender;
         var _loc4_:AvatarStation = aStationHash[_loc3_.gid];
         if(_loc4_ != null)
         {
            if(!userData.isIgnored(_loc2_))
            {
               if(_loc4_.wordBalloon == null)
               {
                  _loc5_ = new WordBalloon();
                  _loc4_.setWordBalloon(_loc5_);
               }
               _loc4_.speak(param1.data);
            }
         }
      }
      
      private function drawUI() : void
      {
         mcBackgroundContainer = new Sprite();
         addChild(mcBackgroundContainer);
         stationContainer = new Sprite();
         addChild(stationContainer);
         inviteFriend_btn = new GaiaButton(new InviteUserButtonAsset(),"Invite friend to sit here");
         addChild(inviteFriend_btn);
      }
      
      public function onPresenceUpdate(param1:GaiaPresenceEvent) : void
      {
         var _loc2_:GaiaIdentity = param1.identity;
         if(aStationHash[_loc2_.gid] == null)
         {
            addUser(_loc2_);
         }
         else
         {
            aStationHash[_loc2_.gid].update(_loc2_);
         }
      }
      
      private function drawInitial(param1:Array) : void
      {
         var _loc2_:Object = null;
         var _loc3_:AvatarStation = null;
         var _loc4_:int = 0;
         while(_loc4_ < numStations)
         {
            _loc2_ = param1[_loc4_];
            _loc3_ = aStationArr[_loc4_];
            if(_loc2_ != null)
            {
               _loc3_.initStation({"userData":_loc2_});
               aStationHash[_loc2_.gid] = _loc3_;
            }
            stationContainer.addChild(_loc3_);
            _loc4_++;
         }
         draw();
         positionInviteFriendBtn();
      }
      
      private function positionInviteFriendBtn() : void
      {
         var _loc2_:AvatarStation = null;
         var _loc1_:int = getEmptyStationNum();
         if(_loc1_ >= 0)
         {
            _loc2_ = aStationArr[_loc1_];
            inviteFriend_btn.x = _loc2_.width / 2 - inviteFriend_btn.width / 2 + _loc2_.x;
            inviteFriend_btn.y = 25;
            inviteFriend_btn.visible = true;
         }
         else
         {
            inviteFriend_btn.visible = false;
         }
      }
      
      private function onStationLoadError(param1:IOErrorEvent) : void
      {
         dTrace("onStationLoadError - KAI");
         timer.reset();
         timer.start();
      }
      
      private function loadStation() : void
      {
         dTrace("loadStation");
         var _loc1_:Loader = new Loader();
         _loc1_.contentLoaderInfo.addEventListener(Event.INIT,onStationLoaded);
         _loc1_.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,onStationLoadError);
         var _loc2_:URLRequest = new URLRequest(stationGameDisplayUrl);
         _loc1_.load(_loc2_,this.loaderContext);
      }
      
      public function removeUser(param1:int) : void
      {
         dTrace("removeUser:" + param1);
         var _loc2_:AvatarStation = aStationHash[param1];
         if(_loc2_ != null)
         {
            _loc2_.clear();
            aStationHash[param1] = null;
         }
         positionInviteFriendBtn();
      }
      
      public function onPresenceOut(param1:GaiaPresenceEvent) : void
      {
         removeUser(param1.identity.gid);
      }
   }
}

