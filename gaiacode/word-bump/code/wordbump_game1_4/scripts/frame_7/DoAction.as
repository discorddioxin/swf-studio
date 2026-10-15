function requestHandler(code, dataArr)
{
   dTrace("requestHandler:" + code + ", " + dataArr);
   var _loc2_ = new Array();
   switch(code)
   {
      case "update":
         _loc2_[0] = 1;
         break;
      case "initGame":
         _loc2_[0] = 2;
         _loc2_[1] = dataArr[0];
         break;
      case "startLevel":
         _loc2_[0] = 3;
         break;
      case "nextLevel":
         _loc2_[0] = 4;
         break;
      case "submitWord":
         _loc2_[0] = 5;
         _loc2_[1] = dataArr[0];
         _loc2_[2] = dataArr[1].toString();
         break;
      case "bumpDown":
         _loc2_[0] = 6;
         break;
      case "applyPowerUp":
         _loc2_[0] = 7;
         _loc2_[1] = dataArr[0];
         _loc2_[2] = dataArr[1];
         _loc2_[3] = dataArr[2];
         break;
      case "userQuitGame":
         _loc2_[0] = 8;
         break;
      case "initUser":
         _loc2_[0] = 11;
         _loc2_[1] = dataArr[0];
         _loc2_[2] = dataArr[1];
         _loc2_[3] = dataArr[2];
         break;
      case "restartLevel":
         _loc2_[0] = 70;
         break;
      case "keepAlive":
         _loc2_[0] = 80;
         break;
      case "testSyncError":
         _loc2_[0] = 81;
         break;
      default:
         dTrace("[WB] ERROR! Unkown command " + s);
         return undefined;
   }
   dTrace("[FLASH] sushi.callPlugin:" + _loc2_ + "," + cb_onPlugInResult + "," + _root);
   sushi.callPlugin("G_WB_PLUGIN",_loc2_,cb_onPlugInResult,_root);
}
function cb_onPlugInResult(responseStr)
{
   var _loc2_ = responseStr.split(",");
   var _loc3_ = Number(_loc2_[0]);
   dTrace("FLASH : cb_onPlugInResult: method:" + _loc3_ + " response:" + responseStr);
   var _loc0_;
   switch(_loc3_)
   {
      case -1:
         if((_loc0_ = _loc2_[2]) === "sync")
         {
            _root.attachMovie("mcDialogue","mcDialogue",_root.getNextHighestDepth(),{whereToGo:"error",messageText:"Client and server out of synch. Game aborted."});
         }
         return;
      case 1:
         gGameController.receiveGameDataFromSushi(_loc2_[2]);
         return;
      case 2:
         gGameController.receiveLevelInitDataFromSushi(_loc2_[2]);
         return;
      case 3:
         return;
      case 4:
         gGameController.receiveLevelInitDataFromSushi(_loc2_[2]);
         return;
      case 5:
         gGameController.receiveWellLettersFromSushi(_loc2_[2]);
         return;
      case 6:
         gGameController.receiveWellLettersFromSushi(_loc2_[2]);
         return;
      case 11:
         dTrace("init user success");
         gUserInited = true;
         _root.play();
         return;
      default:
         dTrace(" invalid method returned from server");
         return;
   }
}
function dTrace(str)
{
   var _loc2_ = "[server_interface]";
   if(_root.mcDebug != undefined)
   {
      _root.mcDebug.dTrace(_loc2_ + str);
   }
}
function initGlobals()
{
   function userWantsHelp()
   {
      getURL(gameHelpURL,"_blank");
   }
   _global.gDemoMode = false;
   gLocalDataObj = new code.localDataWordBump();
   date = new Date();
   if(this._url.indexOf("file://") == -1)
   {
      timestamp = Math.floor(date.getTime());
      _global.cacheBustSuffix = "?" + timestamp;
   }
   else
   {
      _global.cacheBustSuffix = "";
   }
   url = this._url;
   urlArr = this._url.split("/");
   _global.baseUrl = "";
   var _loc4_ = 0;
   while(_loc4_ < urlArr.length - 2)
   {
      _global.baseUrl += urlArr[_loc4_] + "/";
      _loc4_ = _loc4_ + 1;
   }
   dTrace("baseUrl:" + _global.baseUrl);
   if(!_global.gDemoMode)
   {
      mcSound.loadMovie(_global.baseUrl + "WORDBUMP/content/sound1.3.swf");
      _root.createEmptyMovieClip("mcWordList",_root.getNextHighestDepth());
      mcWordList.loadMovie(_global.baseUrl + "WORDBUMP/content/word_list.swf");
   }
   else
   {
      _root.attachMovie("mcWordList","mcWordList",_root.getNextHighestDepth());
   }
   gUserInited = false;
   if(!_global.gDemoMode)
   {
      sushi.event.onDisconnect.setCallback(cb_onDisconnect);
      var SESSION_COUNTER = 0;
      var KEEPALIVE_CALLBACK_COUNTER = 0;
      var PING_SERVER = 5000;
      var numFails = 0;
      var maxFails = 3;
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
      sushiPluginKeepAlive = function()
      {
         _root.requestHandler("keepAlive");
      };
   }
   var _loc5_ = new ContextMenu();
   _loc5_.builtInItems.quality = false;
   _loc5_.builtInItems.print = false;
   _loc5_.builtInItems.play = false;
   _loc5_.builtInItems.zoom = false;
   _loc5_.builtInItems.save = false;
   _loc5_.builtInItems.loop = false;
   _loc5_.builtInItems.rewind = false;
   _loc5_.builtInItems.forward_back = false;
   this.menu = _loc5_;
}
function initUser()
{
   dTrace("initUser");
   mcSound.init({localDataObj:gLocalDataObj});
   mcSound.setSound(gLocalDataObj.getProp("soundEnabled"));
   mcInterface.mcAvatarWrapper.setGuestOrRegistered();
   requestHandler("initUser",[_root.gsiUserData.gaiaSID,_root.sGameVersionNumber,Number(_root.playAsGuest == true)]);
   dTrace("sGameVersionNumber:" + sGameVersionNumber);
   date = new Date();
   timestamp = Math.floor(date.getTime());
   if(!_global.gDemoMode)
   {
      avatarUrl = _global.baseUrl + "sharedasset/avatar/avatarPngLoader.swf";
      mcInterface.mcAvatarWrapper.mcAvatar.loadMovie(avatarUrl);
      dTrace("avatarUrl:" + avatarUrl + "," + mcInterface.mcAvatarWrapper.mcAvatar);
      stop();
   }
}
function initGame()
{
   gGameController = new code.gameController();
   dTrace("gamecontroller:" + gGameController);
   gInitObject.mcWordList = mcWordList;
   gInitObject.mcBoard = mcBoard;
   gInitObject.mcWordSoFar = mcWordSoFar;
   gInitObject.mcTimer = mcInterface.mcTimeDisplay;
   gInitObject.mcInterface = mcInterface;
   gGameController.initGame(gInitObject);
}
function signUpButtonClicked()
{
   getURL("http://www.gaiaonline.com/?kbid=10387");
   if(_global.gDemoMode)
   {
      _root.__trackref.hitPage("{9F3B2A55-7B2F-4EC1-AD86-07B64D072DA5}");
   }
}
function dTrace(str)
{
   var _loc2_ = "[FLASH init.as]";
   if(_root.mcDebug != undefined)
   {
      _root.mcDebug.dTrace(_loc2_ + str);
   }
}
dTrace("server_interface.as loaded.");
initGlobals();
