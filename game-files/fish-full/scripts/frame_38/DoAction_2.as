function captcha(hasError)
{
   _global.gsiMethod = new GSItools.GSIGateway(_root.gsiUrl + ".gaiaonline.com","sushi");
   GSItools.GSIGateway.setDebugging(true);
   _global.gsiMethod.setTimeout(true);
   _global.gsiMethod.invoke(3009,["fishing","93e5f8c7e4e3d0d22a695c2ec1a6bff0ca3ab67fc96446ea"],onGetCaptcha);
   if(hasError == true)
   {
      _root.captcha_panel.hasError = true;
   }
}
function onGetCaptcha(noErr, info)
{
   _root.captcha_panel.capURL = info[0];
   _root.captcha_panel.gotoAndPlay(2);
   _root.captcha_panel.onEnterFrame = captchaEnterFrame;
}
function captchaEnterFrame()
{
   if(_root.captcha_panel.submit_btn)
   {
      delete _root.captcha_panel.onEnterFrame;
      if(_root.captcha_panel.hasError == true)
      {
         _root.captcha_panel.error_txt.text = "passcode was incorrect";
      }
      _root.captcha_panel.submit_btn.enabled = false;
      _root.captcha_panel.refresh_btn.enabled = false;
      _root.chatArea.enabled = false;
      Selection.setFocus(_root.captcha_panel.captcha_txt);
      _root.loadCaptchaImage();
   }
}
function loadCaptchaImage()
{
   _root.captcha_panel.submit_btn.enabled = false;
   _root.captcha_panel.refresh_btn.enabled = false;
   _root.captcha_panel.createEmptyMovieClip("capImage",_root.captcha_panel.getNextHighestDepth());
   var _loc2_ = new Object();
   var _loc3_ = new MovieClipLoader();
   _loc3_.addListener(_loc2_);
   _loc2_.onLoadStart = function(target_mc)
   {
      target_mc._x = -150;
      target_mc._y = -45;
   };
   _loc2_.onLoadComplete = function(target_mc)
   {
      _root.captcha_panel.refresh_btn.onRelease = function()
      {
         _root.captcha_panel.capImage.removeMovieClip();
         _root.captcha(false);
      };
      _root.captcha_panel.submit_btn.onRelease = function()
      {
         _root.chatArea.enabled = true;
         _root.captcha_panel.capImage.removeMovieClip();
         _root.captcha_panel.passcode = _root.captcha_panel.captcha_txt.text;
         _root.captcha_panel.gotoAndPlay("fadeout");
         _root.savePanel.gotoAndPlay(2);
      };
      _root.captcha_panel.submit_btn.enabled = true;
      _root.captcha_panel.refresh_btn.enabled = true;
   };
   _loc3_.loadClip(_root.captcha_panel.capURL,_root.captcha_panel.capImage);
}
function savingGame()
{
   if(_root.playAsGuest)
   {
      _root.main.continueGame();
      return undefined;
   }
   var _loc3_ = new Array(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
   var _loc8_ = "";
   var _loc9_ = new Object();
   var _loc5_ = "";
   var _loc7_ = "|";
   var _loc4_;
   if(_root.whichLake == "bassken")
   {
      _loc9_.pondMap = 0;
      _loc4_ = new Array(100005,100004,100006,100007,100008,100021,100020,100019,100028,100029,100022,100023,100034,100035,100040,1000523,1000463,1000465,1000467,1000469,1000471,1000473,1000503,1000501,1000499);
   }
   else if(_root.whichLake == "gambino")
   {
      _loc9_.pondMap = 1;
      _loc4_ = new Array(100009,100010,100011,100012,100013,100021,100020,100019,100031,100030,100024,100025,100036,100037,100041,1000523,1000475,1000477,1000479,1000521,1000519,1000517,1000515,1000513,1000511);
   }
   else if(_root.whichLake == "durem")
   {
      _loc9_.pondMap = 2;
      _loc4_ = new Array(100014,100015,100016,100017,100018,100021,100020,100019,100033,100032,100026,100027,100038,100039,100042,1000523,1000481,1000483,1000485,1000509,1000507,1000505,1000493,1000495,1000497);
   }
   var _loc2_;
   if(_root.main.myFish.length > 0)
   {
      _loc2_ = 0;
      while(_loc2_ < _root.main.myFish.length)
      {
         _loc3_[_root.main.myFish[_loc2_]]++;
         _loc2_ = _loc2_ + 1;
      }
      _loc2_ = 0;
      while(_loc2_ < _loc3_.length)
      {
         if(_loc3_[_loc2_] > 0)
         {
            _loc8_ += _loc4_[_loc2_] + "" + _loc3_[_loc2_];
            _loc5_ += _loc4_[_loc2_] + ":" + _loc3_[_loc2_] + _loc7_;
         }
         _loc2_ = _loc2_ + 1;
      }
   }
   else
   {
      _loc5_ += _loc7_;
   }
   var _loc11_ = _root.main.fishData.sid2 + _root.gsiUserData.gaia_id + _root.main.fishData.sid3;
   var _loc10_ = _loc8_ + _root.main.fishData.sid3;
   var _loc6_ = new Array();
   _loc6_[0] = "510";
   _loc6_[1] = _loc9_.pondMap;
   _loc6_[2] = _loc5_;
   _loc6_[3] = calcMD5(_loc11_);
   _loc6_[4] = calcMD5(_loc10_);
   _loc6_[5] = _root.gsiUserData.gaiaSID;
   _loc6_[6] = _root.captcha_panel.passcode;
   sushi.callPlugin("G_FISH_PLUGIN",_loc6_,savingGame_CB,_root);
}
function savingGame_CB(loadedData)
{
   if(loadedData.toLowerCase() == "error" || checkForGSIError(loadedData))
   {
      _root.savePanel.gotoAndStop(1);
      captcha(true);
      return undefined;
   }
   var _loc2_ = unescape(loadedData);
   var _loc4_ = _loc2_.split("\x01");
   if(_loc4_[1] == "\x06")
   {
      _root.savePanel.gotoAndStop(1);
      captcha(true);
   }
   else
   {
      _root.savePanel.gotoAndPlay("fadeout");
   }
}
function game_onUpdateMember(id, data)
{
   var whichAvatar = eval("_root.avatarGroup.avatar" + id);
   if(data[DATA_UPDATE_TYPE] == UPDATE_TYPE_MAP_CHANGE)
   {
      updateMapMarker(id);
   }
   else if(data[DATA_UPDATE_TYPE] == UPDATE_TYPE_CHANGE_ROD)
   {
      whichAvatar.avatarRod.gotoAndStop(data[DATA_ROD_TYPE]);
   }
   else if(data[DATA_UPDATE_TYPE] == UPDATE_TYPE_CHANGE_BAIT)
   {
      whichAvatar.avatarBait.gotoAndStop(data[DATA_BAIT_TYPE]);
   }
   else
   {
      whichAvatar.wordBubble.whichFishIcon = data[DATA_BUBBLE_FISH];
      whichAvatar.wordBubble.gotoAndPlay(data[DATA_BUBBLE_TYPE]);
   }
}
function game_addAvatar(mc_avatar, id, iSlot, bIsItMe)
{
   var data = sushi.member.getData(id);
   mc_avatar.avatarRod.gotoAndStop(data[_root.DATA_ROD_TYPE]);
   mc_avatar.avatarBait.gotoAndStop(data[_root.DATA_BAIT_TYPE]);
   if(bIsItMe)
   {
      _root.mapOverview.map.p1.gotoAndStop(iSlot);
      tellSushiAboutMyMapStuff();
   }
   else
   {
      _root.mapOverview.map.attachMovie("fisher","mMarker" + id,id);
      mMark = eval("_root.mapOverview.map.mMarker" + id);
      mMark.gotoAndStop(iSlot);
      updateMapMarker(id);
   }
}
function updateMapMarker(id)
{
   var data = sushi.member.getData(id);
   var mMark = eval("_root.mapOverview.map.mMarker" + id);
   mMark._x = data[DATA_MARKER_X];
   mMark._y = data[DATA_MARKER_Y];
}
function game_onRemoveMember(id)
{
   var whichMapMarker = eval("_root.mapOverview.map.mMarker" + id);
   whichMapMarker.removeMovieClip();
}
function tellSushiAboutMyMapStuff()
{
   var _loc2_ = sushi.me.data;
   _loc2_[DATA_MARKER_X] = _root.mapOverview.map.p1._x;
   _loc2_[DATA_MARKER_Y] = _root.mapOverview.map.p1._y;
   _loc2_[DATA_UPDATE_TYPE] = UPDATE_TYPE_MAP_CHANGE;
   sushi.me.update(_loc2_);
}
function cb_onDisconnect()
{
   _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"Oh no! You just lost your connection to the game server. Stupid game server.",popPanelType:"quit"});
}
function sessionAlive()
{
   gsiMethod.invoke("107",[gsiUserData.gaiaSID],sessionKeepAlive);
}
function sessionKeepAlive(noError, userData)
{
   if(noError == false)
   {
      if(userData[0] == -3 || userData[0] == "-3")
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:userData[1],popPanelType:"quit"});
         _root.sushi.disconnectFomServer();
         _root.onEnterFrame = function()
         {
         };
      }
      else if(++numFails >= maxFails)
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"Cannot connect to keep your session alive. \n\nPlease try again at a later time.",popPanelType:"quit"});
      }
   }
   else
   {
      _root.KEEPALIVE_CALLBACK_COUNTER = _root.KEEPALIVE_CALLBACK_COUNTER + 1;
      numFails = 0;
   }
}
function cb_onRemoveMember(id, teamID, roomID)
{
   avatar_onRemoveMember(id,teamID,roomID);
   chat_onRemoveMember(id,teamID,roomID);
   game_onRemoveMember(id,teamID,roomID);
}
function cb_onUpdateMember(id, data)
{
   avatar_onUpdateMember(id,data);
   chat_onUpdateMember(id,data);
   game_onUpdateMember(id,data);
}
function cb_onMemberChangesRoom(id, newRoomID, oldRoomID, data)
{
   chat_onMemberChangesRoom(id,newRoomID,oldRoomID,data);
}
function cb_onChatMessage(senderID, routing, targetID, txt)
{
   var _loc1_ = new Object();
   _loc1_ = qadca.Qadca.d0(senderID,txt);
   if(_loc1_.b)
   {
      chat_onChatMessage(senderID,routing,targetID,_loc1_.s);
   }
}
function cb_onSystemMessage(s)
{
   chat_onSystemMessage(s);
   game_onSystemMessage(s);
}
function tellSushiAboutMyAvatar()
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   var _loc2_ = sushi.me.data;
   _loc2_[DATA_AVATAR_URL] = gsiUserData.avatar;
   sushi.me.update(_loc2_);
}
function updateAvatars()
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   var _loc4_ = sushi.room.getMemberIDs(sushi.me.room);
   var _loc2_ = 0;
   var _loc5_;
   var _loc6_;
   while(_loc2_ < _loc4_.length)
   {
      if(_loc4_[_loc2_] != sushi.me.id)
      {
         var data = sushi.member.getData(_loc4_[_loc2_]);
         _loc5_ = parseInt(data[DATA_PLAYER_NUMBER]);
         _loc6_ = _loc5_ - 1;
         placePlayer[_loc6_] = _loc4_[_loc2_];
         addAvatar(_loc6_,data[DATA_AVATAR_URL],_loc4_[_loc2_],false);
      }
      _loc2_ = _loc2_ + 1;
   }
   var _loc3_ = 0;
   while(_loc3_ < placePlayer.length)
   {
      if(placePlayer[_loc3_] == 0)
      {
         placePlayer[_loc3_] = sushi.me.id;
         _loc5_ = _loc3_ + 1;
         var data = sushi.me.data;
         data[DATA_PLAYER_NUMBER] = _loc5_;
         _root.myPlayerNumber = _loc5_;
         addAvatar(_loc3_,gsiUserData.avatar,sushi.me.id,true);
         sushi.me.update(data);
         break;
      }
      _loc3_ = _loc3_ + 1;
   }
}
function addAvatar(iSlot, avatarURL, id, bIsItMe)
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   var pNumber = iSlot + 1;
   var currentPlacement = 50 - pNumber;
   if(bIsItMe)
   {
      _root.avatarGroup.attachMovie("avatar","avatarp1",currentPlacement);
      var mAvatar = _root.avatarGroup.avatarp1;
   }
   else
   {
      _root.avatarGroup.attachMovie("avatar","avatar" + id,currentPlacement);
      var mAvatar = eval("_root.avatarGroup.avatar" + id);
      if(_root.sGameNameString == "blackjack" or _root.sGameNameString == "jigsaw")
      {
         var sAvatarReporter_SWF_LOC = codebase + "../sharedsource/gameSushiUtils/avatar_reporting_low.swf";
      }
      else
      {
         var sAvatarReporter_SWF_LOC = codebase + "../sharedsource/gameSushiUtils/avatar_reporting.swf";
      }
      mAvatar.createEmptyMovieClip("mReporter",99);
      mAvatar.mReporter.loadMovie(sAvatarReporter_SWF_LOC);
   }
   mAvatar.avImage.loadMovie(avatarURL);
   mAvatar.pMarker.gotoAndStop(pNumber);
   mAvatar._x = 100 * pNumber;
   game_addAvatar(mAvatar,id,pNumber,bIsItMe);
   mAvatar.id = id;
   mAvatar.avatarName = sushi.member.getName(id);
}
function avatar_onUpdateMember(id, data)
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   if(data[DATA_AVATAR_URL] != 0)
   {
      var whichAvatar = eval("_root.avatarGroup.avatar" + id);
      if(whichAvatar == null)
      {
         n = 0;
         while(n < placePlayer.length)
         {
            if(placePlayer[n] == 0)
            {
               placePlayer[n] = id;
               addAvatar(n,data[DATA_AVATAR_URL],id,false);
               break;
            }
            n++;
         }
      }
   }
}
function avatar_onRemoveMember(id, teamID, roomID)
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   if(roomID == sushi.me.room)
   {
      var slotNumber;
      n = 0;
      while(n < placePlayer.length)
      {
         if(placePlayer[n] == id)
         {
            slotNumber = n + 1;
            placePlayer[n] = 0;
            break;
         }
         n++;
      }
      var whichAvatar = eval("_root.avatarGroup.avatar" + id);
      whichAvatar.removeMovieClip();
      var whichMiniStation = eval("_root.miniStation" + slotNumber);
      whichMiniStation.cleanUp();
   }
}
function checkForGSIError(s)
{
   if(s == undefined)
   {
      _root.attachMovie("errorPanelConnection","errorPanelConnection",430,{theMessage:"Cannot connect to game server to load game information.",popPanelType:"game"});
      return true;
   }
   return false;
}
var DATA_UPDATE_TYPE = 2;
var DATA_MARKER_X = 3;
var DATA_MARKER_Y = 4;
var DATA_ROD_TYPE = 5;
var DATA_BAIT_TYPE = 6;
var DATA_BUBBLE_TYPE = 7;
var DATA_BUBBLE_FISH = 8;
var UPDATE_TYPE_BUBBLE = 0;
var UPDATE_TYPE_NEW = 1;
var UPDATE_TYPE_CHANGE_ROD = 2;
var UPDATE_TYPE_CHANGE_BAIT = 3;
var UPDATE_TYPE_MAP_CHANGE = 4;
sushi.event.onDisconnect.setCallback(cb_onDisconnect);
var SESSION_COUNTER = 0;
var KEEPALIVE_CALLBACK_COUNTER = 0;
var PING_SERVER = 5000;
var numFails = 0;
var maxFails = 4;
_root.onEnterFrame = function()
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   SESSION_COUNTER++;
   if(SESSION_COUNTER % PING_SERVER == 0)
   {
      sessionAlive();
      sushiPluginKeepAlive();
   }
};
var DATA_AVATAR_URL = 0;
var DATA_PLAYER_NUMBER = 1;
if(_root.playAsGuest != true)
{
   sushi.event.onUpdateMember.setCallback(cb_onUpdateMember);
   sushi.event.onRemoveMember.setCallback(cb_onRemoveMember);
   sushi.event.onMemberChangesRoom.setCallback(cb_onMemberChangesRoom);
   sushi.event.onChatMessage.setCallback(cb_onChatMessage);
}
sushi.event.onSystemMessage.setCallback(cb_onSystemMessage);
var placePlayer = new Array(0,0,0,0,0,0,0);
var myPlayerNumber = 0;
tellSushiAboutMyAvatar();
updateAvatars();
var smoother = new botDetection.SmoothMove();
var setMessageCounter = 0;
_root.loadingBar.removeMovieClip();
_root.splashScreen.removeMovieClip();
_root.woodPanel.swapDepths(302);
var mouseListener = new Object();
mouseListener.onMouseMove = function()
{
   if(_root.mapOverview.map.coast.hitTest(_root._xmouse,_root._ymouse,true))
   {
      _root.mapOverview.map.movePointer(_root.mapOverview.map._xmouse,_root.mapOverview.map._ymouse);
   }
};
Mouse.addListener(mouseListener);
stop();
