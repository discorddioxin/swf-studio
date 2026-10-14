function buttonPressed(sButtonName)
{
   switch(sButtonName)
   {
      case "login":
         var _loc2_ = "http://" + _root.gsiUrl + ".gaiaonline.com";
         var _loc3_ = "javascript:if(opener){ window.close(); opener.location=\'" + _loc2_ + "\';} else location=\'" + _loc2_ + "\';";
         _root.getURL(_loc3_,"_parent");
         break;
      case "single_player":
         startSinglePlayerGame();
         break;
      case "multi_player":
         openSelectServerScreen();
         break;
      case "quit":
         _root.getURL("javascript:window.close();");
   }
}
function bringUpReportAbuseWindow(avName, avUID)
{
   reportAvatarName = avName;
   gotoAndStop("reportAbuse_frame");
   _root.chatAutoFocus(false);
}
function reportAbusiveRoomName()
{
   showLoadingBar();
   var _loc2_ = getUIDFromRoomName(reportRoomName);
   var _loc3_ = removeUIDFromRoomName(reportRoomName);
   var _loc4_ = "offensive room name: " + removeUIDFromRoomName(reportRoomName) + "  created by " + _loc2_ + " ... user notes: " + mChooser.notes_txt.text;
   sendReport(3,_loc2_,_loc4_,_loc3_,"",this.cb_abuseRoomNameReport);
}
function reportAbuseUser()
{
   showLoadingBar();
   var _loc3_ = removeUIDFromRoomName(sushi.room.getName(sushi.me.room));
   var _loc4_ = "Abusive game chat... user notes: " + mReporter.notes_txt.text;
   sendReport(_root.GSECS_report_reason,reportAvatarName,_loc4_,_loc3_,_root.getChatRecord(),this.cb_abuseAvatarReport);
}
function sendReport(reasonType, sOffenderName, sNote, sRoomName, chat_history, cb_function)
{
   var _loc4_ = _root.gaiaApplicationID;
   var _loc2_ = _root.GSECS_SelectedServerName + " (" + _root.GSECS_SelectedServerIP + ")";
   var _loc3_ = _loc2_ + "  " + sRoomName;
   _root.gsiMethod.invoke("1001",[_root.gsiUserData.gaiaSID,reasonType,_loc4_,sOffenderName,sNote,chat_history,_loc3_],cb_function,false);
}
function cb_abuseAvatarReport(noError, gsiSays)
{
   if(noError == false)
   {
      handleReportError(gsiSays);
   }
   else
   {
      closeReportAbuseAvWindow();
      thankYouForTheReport(gsiSays);
   }
}
function cb_abuseRoomNameReport(noError, gsiSays)
{
   if(noError == false)
   {
      handleReportError(gsiSays);
   }
   else
   {
      mChooser.gotoAndStop(1);
      thankYouForTheReport(gsiSays);
   }
}
function thankYouForTheReport(ticket)
{
   _root.hideLoadingBar();
   hideLoadingBar();
   _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:"Your report has been sent. Your report ticket id is <b>" + ticket + "</b>\n\nThank you.\n",popPanelType:"ok"});
}
function handleReportError(gsiSays)
{
   var _loc4_ = -3;
   var _loc3_ = -8;
   var _loc6_ = -2;
   hideLoadingBar();
   if(gsiSays[0] == _loc4_)
   {
      var _loc5_ = gsiSays[1];
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:_loc5_,popPanelType:"ok"});
   }
   else if(gsiSays[0] == _loc3_)
   {
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:"Error! \n\nDuplicate report. Once you have reported a user as abusive, you cannot report them again during this game session. \n\n\n\n",popPanelType:"ok"});
   }
   else if(gsiSays[0] == _loc6_)
   {
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:"Error! \n\nCould not submit report at this time. Please try again later.\n\n\n\n",popPanelType:"ok"});
   }
   else
   {
      _loc5_ = gsiSays[1];
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:"Error " + gsiSays[0] + ". \n\n" + _loc5_,popPanelType:"ok"});
   }
}
function closeReportAbuseAvWindow()
{
   gotoAndStop("blank_frame");
}
function initGSECS()
{
   stop();
   bar.mc_LockButon._visible = false;
   if(_root.sGameNameString == "fishing")
   {
      bar.mc_top_fishers_btn._visible = true;
   }
   else
   {
      bar.mc_top_fishers_btn._visible = false;
   }
   mc_password_display._visible = false;
   _root.gsecs = this;
   if(_root.gsecsWidth == 770)
   {
      bar.gotoAndStop("f770");
      mc_loading_bar._x += 65;
   }
   _root.GSECS_SelectedServerIP = _root.serverListing[0];
   _root.GSECS_SelectedServerName = _root.sGameNameString + "_server";
   showLoadBar();
   if(_root.testOnLocalHostGameServer)
   {
      _root.serverListing = new Array();
      _root.serverListing = ["127.0.0.1"];
      checkGaiaSID();
   }
   else if(_root.dynamicServerListing)
   {
      bar.maintitle = "fetching game server list " + _root.gaiaApplicationID;
      _root.gsiMethod.invoke("50",[_root.gaiaApplicationID],resultServerListing,this);
   }
   else
   {
      checkGaiaSID();
   }
}
function resultServerListing(noError, sl, sl2, sl3, sl4, sl5)
{
   removeLoadingBar();
   if(noError == true)
   {
      var _loc4_ = true;
      var _loc3_ = 0;
      _root.serverListing = new Array();
      while(_loc4_ && _loc3_ < 1000)
      {
         var _loc2_ = sl[_loc3_++];
         if(_loc2_.ip == undefined)
         {
            _loc4_ = false;
         }
         else
         {
            _root.serverListing.push(_loc2_.ip);
         }
      }
      checkGaiaSID();
   }
   bar.maintitle = "Error getting server list. Please try again later.";
   return undefined;
}
function checkGaiaSID()
{
   showLoadBar();
   bar.maintitle = "checking Gaia session";
   if(_root.alwaysLogIn)
   {
      gotoAndStop("login_frame");
      play();
   }
   else
   {
      _root.gsiMethod.invoke("109",[],resultGaiaSID,true);
   }
}
function resultGaiaSID(noError, gaiaSID)
{
   if(noError == false)
   {
      if(gaiaSID[0] == -3)
      {
         bar.maintitle = "please log in";
         gotoAndStop("login_frame");
         play();
         removeLoadingBar();
      }
      else
      {
         bar.maintitle = "problem with your gaia session";
         var _loc3_ = gaiaSID[1];
         _root.attachMovie("retryOrQuitPanel","retryOrQuitPanel",430,{theMessage:_loc3_,popPanelType:"loginConnection"});
         removeLoadingBar();
      }
   }
   else
   {
      bar.maintitle = "retrieving user data";
      _root.gsiUserData.gaiaSID = gaiaSID;
      _root.gsiMethod.invoke("107",[gaiaSID],resultUserData,true);
   }
}
function resultUserData(noError, userData)
{
   if(noError == false)
   {
      if(userData[0] == -4)
      {
         bar.maintitle = "please log in";
         removeLoadingBar();
         gotoAndStop("login_frame");
         play();
      }
      else if(userData[0] == -3)
      {
         bar.maintitle = "this account has been banned.";
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:userData[1],popPanelType:"quit"});
         removeLoadingBar();
      }
      else
      {
         bar.maintitle = "connection error";
         _root.attachMovie("retryOrQuitPanel","retryOrQuitPanel",430,{theMessage:"Can\'t load up your user information.\n\nError Code: " + userData[0],popPanelType:"connection"});
         removeLoadingBar();
      }
   }
   else
   {
      _root.gsiUserData.gaia_id = userData.gaia_id;
      _root.gsiUserData.username = userData.username;
      var _loc3_ = userData.avatar.split("_");
      _root.gsiUserData.avatar = g_sAvatarServer + _loc3_[0] + ".swf";
      _root.gsiUserData.user_level = userData.user_level;
      _root.gsiUserData.filter_level = userData.filter_level;
      _root.gsiUserData.user_active = userData.user_active;
      if(_root.gsiUserData.user_level == 1)
      {
         _root.playAsGuest = true;
      }
      if(_root.iGSIMethodToCallAfterAuth > 0)
      {
         bar.maintitle = "retrieving game info";
         _root.gsiMethod.invoke(String(_root.iGSIMethodToCallAfterAuth),[_root.gsiUserData.gaiaSID],resultGameInfo,true);
      }
      else
      {
         continueToNextStep();
      }
   }
}
function resultGameInfo(noError, userData)
{
   if(noError == false || userData[0] == -1000)
   {
      _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"Cannot connect to any of the game servers. \n\nPlease try again at a later time.\n\nError Code: " + userData[0],popPanelType:"quit"});
   }
   else
   {
      _root.populateGameSpcificData(userData);
      continueToNextStep();
   }
}
function continueToNextStep()
{
   if(_root.showPlayerMode == true)
   {
      gotoAndStop("modeSelect_frame");
      play();
   }
   else if(_root.serverListing.length == 1 || _root.noChat == true)
   {
      connectToSushi();
   }
   else
   {
      bar.maintitle = "please choose a game server";
      openSelectServerScreen();
   }
}
function connectToSushi(specificServerIP)
{
   bar.maintitle = "connecting to game server";
   _global.omnitureTracking.sendPixelRequest("SERVER INIT");
   if(_root.noChat)
   {
      var _loc3_ = Math.floor(Math.random() * _root.serverListing.length);
      _root.GSECS_SelectedServerIP = _root.serverListing[_loc3_];
      _root.GSECS_SelectedServerName = _root.sGameNameString + "";
      _root.mcDebug.dTrace("[GSECS] connect to a random server: " + _loc3_ + " (" + _root.serverListing[_loc3_] + ")");
      openSushiConnection(_root.serverListing[_loc3_],_root.port,_root.session,_root.initUserGameData);
   }
   else
   {
      var connectToThisServer = _root.serverListing[0];
      if(specificServerIP.length > 0)
      {
         connectToThisServer = specificServerIP;
      }
      _root.GSECS_SelectedServerIP = connectToThisServer;
      _root.mcDebug.dTrace("[GSECS] connect to a single server");
      openSushiConnection(connectToThisServer,_root.port,_root.session,_root.initUserGameData);
   }
}
function openSushiConnection(server, port, session, initUserGameData)
{
   _root.showLoadBar();
   _root.gsecs_currentServer = _root.serverListing[0];
   sushi.connectToServer("SOCKET",server,port,session,sushiConnectCB);
}
function sushiConnectCB(s)
{
   if(!s)
   {
      var _loc5_ = sushi.getSessionList()[0].id;
      bar.maintitle = "connected... now joining session";
      sushi.me.joinSession(_root.gsiUserData.username,_loc5_,1,1,_root.initUserGameData,sessionCheck);
   }
   else
   {
      removeLoadingBar();
      if(s == 4)
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"You already have a game in play or got disconnected from previous. Check back in 1 minute.",popPanelType:"quit"});
         bar.maintitle = "already connected to server";
         sushi.disconnectFromServer();
      }
      else
      {
         if(numRetries < MAX_RETRIES)
         {
            numRetries++;
            serverRetryInterval = setInterval(this,"openSushiConnection",SERVER_RETRY_PAUSE * numRetries,_root.GSECS_SelectedServerIP,_root.port,_root.session,_root.initUserGameData);
            return undefined;
         }
         _root.attachMovie("errorPanelSushi","errorPanelSushi",430,{theMessage:"Cannot connect to the game server.",popPanelType:"sushiconnect"});
         bar.maintitle = "cannot connect to game server";
         _global.omnitureTracking.sendPixelRequest("SERVER FAILED :: ERROR " + s);
         _global.omnitureTracking.sendPixelRequest("SERVER FAILED :: IP " + _root.GSECS_SelectedServerIP);
      }
   }
}
function sessionCheck(s)
{
   if(!s)
   {
      if(_root.playAsGuest)
      {
         bar.maintitle = "Gaia " + _root.sGameNameString;
      }
      else
      {
         bar.maintitle = "session joined";
      }
      if(_root.noChat)
      {
         _root.randomRoomName = "r" + Math.floor(Math.random() * 999 + 1000);
         bar.maintitle = "session joined... creating room";
         sushi.me.createRoom(_root.randomRoomName,_root.dynamicRoomName,createRandomRoomCallback);
      }
      else
      {
         selectGameRoom();
      }
   }
   else
   {
      removeLoadingBar();
      if(s == 4)
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"You already have a game in play or got disconnected from previous. Check back in 1 minute.",popPanelType:"quit"});
         bar.maintitle = "already connected to server (2)";
      }
      else
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"The multi-player server is full. \n\nPlease try again at a later time.",popPanelType:"quit"});
         bar.maintitle = "server is full";
      }
   }
}
function createRandomRoomCallback(unkown, roomID, roomCreator, roomLimit)
{
   var _loc1_ = sushi.session.getRoomIDs();
   sushi.me.changeRoom(roomID,sushi.me.data,changed2RandomRoomCallBack);
}
function changed2RandomRoomCallBack(s)
{
   startSinglePlayerGame();
}
function removeLoadingBar()
{
   mc_loading_bar._visible = false;
}
function showLoadingBar()
{
   mc_loading_bar._visible = true;
}
function selectGameRoom()
{
   if(_root.singleRoom == true || _root.playAsGuest)
   {
      startSinglePlayerGame();
   }
   else
   {
      gotoAndStop("selectGame_frame");
      play();
   }
}
function openSelectServerScreen()
{
   if(_root.serverListing.length == 1)
   {
      showLoadingBar();
      openSushiConnection(_root.serverListing[0],_root.port,_root.session,_root.initUserGameData);
   }
   else
   {
      gotoAndStop("selectServer_frame");
      play();
   }
}
function lockMyRoom(iLock)
{
   if(iLock)
   {
      bar.maintitle += sLockString;
   }
   else
   {
      indexOfLockedString = bar.maintitle.indexOf(sLockString);
      if(indexOfLockedString != -1)
      {
         bar.maintitle = bar.maintitle.substring(0,indexOfLockedString);
      }
   }
   sushi.room.lock(iMyRoomID,iLock);
}
function startSinglePlayerGame()
{
   cleanUp();
   bar.maintitle = "";
   _root.singlePlayer = true;
   sMyRoomName = "**single player game**";
   _root.startGameSingle();
}
function startMultiPlayerGame()
{
   cleanUp();
   _root.singlePlayer = false;
   sMyRoomName = sushi.room.getName(sushi.me.room);
   _root.startGameMulti();
}
function removeUIDFromRoomName(s)
{
   var _loc1_ = s.indexOf(cDivChar);
   if(_loc1_ != -1)
   {
      return s.substring(0,_loc1_);
   }
   return s;
}
function getUIDFromRoomName(s)
{
   var _loc1_ = s.indexOf(cDivChar);
   if(_loc1_ != -1)
   {
      return s.substring(_loc1_ + 1,s.length);
   }
   return "ERROR";
}
function changeQuality()
{
   if(_root._quality == "BEST")
   {
      thisGameUsesBestQuality = true;
      _root._quality = "HIGH";
   }
   else if(_root._quality == "HIGH")
   {
      _root._quality = "MEDIUM";
   }
   else if(_root._quality == "MEDIUM")
   {
      _root._quality = "LOW";
   }
   else if(_root._quality == "LOW")
   {
      if(thisGameUsesBestQuality == true)
      {
         _root._quality = "BEST";
      }
      else
      {
         _root._quality = "HIGH";
      }
   }
   bar.tooltip.gotoAndPlay("quality");
}
function cleanUp()
{
   gotoAndStop("blank_frame");
   Key.removeListener(keyListener);
}
function onActionSourceLoaded()
{
   _global.omnitureTrackingObject.account = "gaiainteractiveprod";
   _global.omnitureTrackingObject.trackLocal = true;
   _global.omnitureTrackingObject.pageName = "";
   _global.omnitureTrackingObject.pageURL = "";
   _global.omnitureTrackingObject.charSet = "ISO-8859-1";
   _global.s.currencyCode = "USD";
   _global.omnitureTrackingObject.trackClickMap = true;
   _global.omnitureTrackingObject.movieID = "";
   _global.omnitureTrackingObject.visitorNamespace = "gaiainteractive";
   _global.omnitureTrackingObject.dc = 112;
}
bTextEntryOnScreen = true;
_global.omnitureTracking.startPingInterval();
var g_sAvatarServer = "http://a2.cdn.gaiaonline.com/gaia/members/";
var iMyRoomID;
var sMyRoomName = "not yet joined room";
var sVersionNumber = "2.9";
var bTextEntryOnScreen = true;
var cDivChar = "|";
var cSubChar = "l";
var sLockString = " (locked)";
var MAX_RETRIES = 10;
var SERVER_RETRY_PAUSE = 1000;
if(!_global.isReset)
{
   _global.isAutoAndCreateNew = false;
   _global.isAutoConnect = false;
}
initGSECS();
_root._quality = "BEST";
var thisGameUsesBestQuality = false;
_global.omnitureTrackingObject = trackingMC;
_global.omnitureTrackingObject.debugTracking = true;
_global.omnitureTrackingObject.addEventListener("loaded",this,"onActionSourceLoaded");
var statURL = "http://s.gaiaonline.com/images/Gaia_Flash/sharedasset/stats/OmnitureActionSource.swf";
_global.omnitureTrackingObject.loadActionSource(statURL);
