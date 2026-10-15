package
{
   import com.gaiaonline.events.DownloadAssetManagerEvent;
   import com.gaiaonline.gameFramework.avatar.*;
   import com.gaiaonline.gameFramework.chat.*;
   import com.gaiaonline.gameFramework.data.*;
   import com.gaiaonline.gameFramework.events.*;
   import com.gaiaonline.gameFramework.loader.*;
   import com.gaiaonline.gameFramework.login.*;
   import com.gaiaonline.gameFramework.shell.IGameShell;
   import com.gaiaonline.gameFramework.sound.*;
   import com.gaiaonline.gameFramework.text.*;
   import com.gaiaonline.gameFramework.tracking.ITracking;
   import com.gaiaonline.gameFramework.tracking.Tracking;
   import com.gaiaonline.gameFramework.ui.*;
   import com.gaiaonline.gameFramework.util.*;
   import com.gaiaonline.games.IGaiaGame;
   import com.gaiaonline.gateway.*;
   import com.gaiaonline.gateway.events.*;
   import com.gaiaonline.gateway.sgs.*;
   import com.gaiaonline.gateway.sushi.*;
   import com.gaiaonline.gsi.*;
   import com.gaiaonline.managers.DownloadedAssetManager;
   import com.gaiaonline.serializers.*;
   import com.gaiaonline.sgs.*;
   import com.gaiaonline.utils.signin.SessionKeeperWithActivityCheck;
   import flash.display.*;
   import flash.events.*;
   import flash.external.ExternalInterface;
   import flash.net.*;
   import flash.system.*;
   import flash.text.*;
   import flash.ui.Keyboard;
   import flash.utils.*;
   
   public class gameShell extends MovieClip implements IGameShell
   {
      
      public var chatContainer:Sprite = null;
      
      private var _userInfoReady:Boolean = false;
      
      private var gotInitialRoom:Boolean = false;
      
      private var userData:UserDataGlobal = UserDataGlobal.getInstance();
      
      private var _tracking:ITracking;
      
      private var playerMode:String;
      
      private var serverLogoutIntentional:Boolean = false;
      
      public var avatarStations:AvatarStationManager;
      
      private var loginSuccess:Boolean = false;
      
      private var progressEvent:ProgressEvent = new ProgressEvent(ProgressEvent.PROGRESS);
      
      private var _gameConfigAssetsLoaded:Boolean = false;
      
      private var serverList:Array;
      
      private const FW_RELEASED_DATE:String = "05/28/2008";
      
      private var shellBaseUrl:String;
      
      private var roomPassword:String;
      
      private var chosenServerData:Object;
      
      public var mcGame:MovieClip = null;
      
      private var startGameWidth:Number = 0;
      
      private var initSequenceLoginIndex:Number;
      
      private var _gameSound:ISoundController;
      
      private var gameHandle:String;
      
      private var _gameBaseUrl:String;
      
      public var mcLoadingScreen:Sprite = null;
      
      private var isHappyEaster:Boolean = false;
      
      private var mediaUrls:Object;
      
      private var gameHandleInitCaps:String;
      
      private var initSequence:Array;
      
      private var loadingScreenLoader:Loader = null;
      
      private var gsi:GSIGateway;
      
      private var _userBar:UserBar = null;
      
      private var _nonGameConfigAssetsLoaded:Boolean = false;
      
      public var userBarContainer:Sprite = null;
      
      private const APP_HEIGHT:int = 585;
      
      private var sessionKeeper:SessionKeeperWithActivityCheck;
      
      public var avatarStationsContainer:Sprite = null;
      
      private var _gameIsPrepared:Boolean = false;
      
      private const START_GAME_WIDTH:Number = 600;
      
      private var keySequence:String;
      
      private var _sequenceStarted:Boolean = false;
      
      private const FW_VERSION:String = "1.1.13";
      
      public var loadBar:LoadBar = null;
      
      private const DEFAULT_GAME:String = "jigsaw";
      
      private var chat:Chat = null;
      
      private var passwordRequired:Boolean = false;
      
      private var _gameConfigLoaded:Boolean = false;
      
      private var chosenRoom:Object;
      
      private var gameChildrenAdded:Boolean = false;
      
      private var textContentManager:TextContentManager = TextContentManager.getInstance();
      
      private var _serverGateway:IGaiaGateway;
      
      private var playAlone:Boolean = false;
      
      public var mcSponsorshipContainer:Sprite = null;
      
      private const START_GAME_HEIGHT:Number = 450;
      
      private var _gameParameters:Object = {};
      
      private var mc:MovieClip;
      
      private var _shellUi:ShellUi;
      
      private var mediaHashByUrl:Object;
      
      private const SESSION_KEEPER_INTERVAL:int = 2000;
      
      private const GSI_RETRIES:int = 10;
      
      private var initSequenceCounter:Number;
      
      private var gameConfig:XML;
      
      private const APP_WIDTH:int = 770;
      
      private var game:Sprite;
      
      public function gameShell()
      {
         super();
         var _loc1_:Object = root.loaderInfo.parameters;
         drawUI();
         stage.scaleMode = StageScaleMode.NO_SCALE;
         stage.align = StageAlign.TOP_LEFT;
         startGameWidth = START_GAME_WIDTH;
         stage.stageFocusRect = stage.tabChildren = false;
         stage.addEventListener(SizeUpdateEvent.SIZE_UPDATE,onSizeUpdate,false,0,true);
         TheStage.init(stage);
         gameHandle = _loc1_.game;
         gameHandleInitCaps = gameHandle.charAt(0).toUpperCase() + gameHandle.substr(1);
         dTrace("gameHandleInitCaps:" + gameHandleInitCaps);
         mc = this;
         shellBaseUrl = UrlUtil.getShellBaseUrl(this);
         _gameBaseUrl = shellBaseUrl + "games/" + gameHandle + "/";
         var _loc2_:String = UrlUtil.getDomainUrl();
         initSequenceCounter = 0;
         loadGame();
      }
      
      private function cancelCreateRoom(param1:Event) : void
      {
         chooseRoom();
      }
      
      private function onStartCreateRoom(param1:Event) : void
      {
         var _loc2_:DialogueCreateRoom = _shellUi.createDialogueCreateRoom({"serverGateway":serverGateway});
         _loc2_.addEventListener("CANCEL_CREATE_ROOM",cancelCreateRoom,false,0,true);
         _loc2_.addEventListener("ROOM_CHOSEN",onRoomChosen,false,0,true);
      }
      
      private function onGameConfigAssetsLoaded(param1:DownloadAssetManagerEvent) : void
      {
         _gameConfigAssetsLoaded = true;
         tryToStartGame();
      }
      
      public function onServerIoError(param1:IOErrorEvent) : void
      {
         trace("onServerIoError");
         var _loc2_:Dialogue = _shellUi.createDialogue({
            "title":"ALERT",
            "msg":"The server is not responding."
         });
         _loc2_.addEventListener("OK_CLICKED",onServerError);
      }
      
      public function get soundController() : ISoundController
      {
         return _gameSound;
      }
      
      private function loginToServer() : void
      {
         dTrace("logInToServer with username " + userData.userName + " and sid:" + userData.sid);
         serverGateway.login(userData.userName,userData.getSid());
      }
      
      private function onGSIIOError(param1:IOErrorEvent) : void
      {
         dTrace("onGSIIOError() | " + param1);
         var _loc2_:Dialogue = _shellUi.createDialogue({
            "title":"ALERT",
            "msg":"HTTP IO Error. Click OK to retry"
         });
         _loc2_.addEventListener("OK_CLICKED",onRetryGSI);
      }
      
      private function addXmlToTextManager(param1:XML) : void
      {
         textContentManager.addXml(param1);
      }
      
      private function onGetGameInfoComplete(param1:GSIEvent) : void
      {
         dTrace("onGetGameInfoComplete");
         setServerList(param1.gsiData as Array);
      }
      
      private function onRetryGSI(param1:Event) : void
      {
         jumpBackAndStep();
      }
      
      private function onServerChosen(param1:Event) : void
      {
         chosenServerData = param1.target.getChosenServer();
         stepInit();
      }
      
      private function beginInitSequence() : void
      {
         if(!_sequenceStarted)
         {
            _sequenceStarted = true;
            initSequence = [getSid,getUserInfo,tryToGetServerList,chooseServer,connectToServer,loginToServer,chooseRoom,joinRoom,initChat,initAvatarStations,gameIsPrepared];
            stepInit();
         }
      }
      
      private function onCloseEaster(param1:Event) : void
      {
         isHappyEaster = false;
      }
      
      private function onLoadGameConfigXml(param1:Event) : void
      {
         var _loc3_:XMLList = null;
         var _loc2_:XML = new XML(param1.target.data);
         gameConfig = _loc2_;
         _gameConfigLoaded = true;
         tryToGetServerList();
         loadGameConfigAssets();
         playerMode = gameConfig.defaultPlayerMode;
         if(playerMode == "single")
         {
            gameConfig.showChat = false;
            gameConfig.showAvatarStations = false;
         }
         if(gameConfig.game)
         {
            _loc3_ = gameConfig.game;
            if(_loc3_.@x.length() > 0)
            {
               mcGame.x = parseFloat(gameConfig.game.@x[0].valueOf());
            }
            if(_loc3_.@y.length() > 0)
            {
               mcGame.y = parseFloat(gameConfig.game.@y[0].valueOf());
            }
         }
         dTrace("gameConfig.showChat:" + gameConfig.showChat);
         if(gameConfig.showChat == "true")
         {
            if(Boolean(gameConfig.chat) && gameConfig.chat.@url.length() > 0)
            {
               if(gameConfig.chat.@position[0].valueOf() == "bottom")
               {
                  chatContainer.x = 0;
                  chatContainer.y = 485;
                  chat.setChatPosition(Chat.BOTTOM);
               }
            }
         }
      }
      
      private function chooseServer() : void
      {
         var _loc2_:int = 0;
         var _loc3_:Object = null;
         var _loc4_:DialogueChooseServer = null;
         dTrace("chooseServer");
         chosenServerData = null;
         var _loc1_:String = UrlUtil.getExternalFlashVar("invite_server_ip");
         if(_loc1_)
         {
            _loc2_ = 0;
            while(_loc2_ < serverList.length)
            {
               if(_loc1_ == serverList[_loc2_].ip)
               {
                  chosenServerData = serverList[_loc2_];
                  break;
               }
               _loc2_++;
            }
         }
         if(chosenServerData == null)
         {
            if(serverList.length > 1)
            {
               _loc3_ = {
                  "servers":this.serverList,
                  "gameConfig":this.gameConfig
               };
               _loc4_ = _shellUi.createDialogueChooseServer(_loc3_);
               _loc4_.addEventListener("SERVER_CHOSEN",onServerChosen);
               _loc4_.addEventListener("PLAY_ALONE",onPlayAloneChosen);
            }
            else
            {
               chosenServerData = serverList[0];
               stepInit();
            }
         }
         else
         {
            stepInit();
         }
      }
      
      private function getSidCallbackError(param1:Event) : void
      {
         loadBar.visible = false;
         var _loc2_:DialogueLogin = _shellUi.createDialogueLogin();
      }
      
      private function loadAllAssets() : void
      {
         beginInitSequence();
         loadGameConfigXml();
         loadNonGameConfigAssets();
      }
      
      public function get userBar() : IUserBar
      {
         return _userBar;
      }
      
      private function loadGameConfigXml() : void
      {
         var _loc1_:URLLoader = new URLLoader();
         _loc1_.addEventListener(Event.COMPLETE,onLoadGameConfigXml);
         var _loc2_:String = gameBaseUrl + "gameConfig.xml";
         _loc1_.load(new URLRequest(_loc2_));
      }
      
      private function jumpToInitStep(param1:Function) : void
      {
         initSequenceCounter = initSequence.indexOf(param1);
         stepInit();
      }
      
      private function onCreateSoloChannel(param1:GaiaChannelEvent) : void
      {
         dTrace("onCreateSoloChannel");
         chosenRoom = param1.channel;
         stepInit();
      }
      
      private function jumpAndStop(param1:Function) : void
      {
         initSequenceCounter = initSequence.indexOf(param1);
      }
      
      private function onGetGameInfoError(param1:GSIEvent) : void
      {
         trace("onGetGameInfoError");
      }
      
      private function tryToStartGame() : void
      {
         if(_nonGameConfigAssetsLoaded && _gameConfigAssetsLoaded && _gameIsPrepared)
         {
            initGame();
         }
      }
      
      private function setServerList(param1:Array) : void
      {
         serverList = param1;
         stepInit();
      }
      
      private function getServerList() : void
      {
         var _loc1_:Array = null;
         var _loc2_:XMLList = null;
         var _loc3_:uint = 0;
         dTrace("getServerList");
         if(gameConfig.useDynamicGameServerIps == "true")
         {
            gsi = new GSIGateway(UrlUtil.getGsiServerSubdomain());
            gsi.serializerClass = PHPSerializer;
            gsi.addEventListener(GSIEvent.LOADED,onGetGameInfoComplete);
            gsi.addEventListener(GSIEvent.ERROR,onGetGameInfoError);
            gsi.addEventListener(IOErrorEvent.IO_ERROR,onGSIIOError);
            gsi.invoke(50,Number(gameConfig.gaiaApplicationID));
         }
         else
         {
            serverList = new Array();
            _loc1_ = [];
            _loc2_ = gameConfig.gameServers.server;
            _loc3_ = 0;
            while(_loc3_ < _loc2_.length())
            {
               _loc1_.push(_loc2_[_loc3_]);
               _loc3_++;
            }
            setServerList(_loc1_);
         }
      }
      
      private function onServerConnect(param1:Event) : void
      {
         dTrace("onServerConnect");
         serverLogoutIntentional = false;
         stepInit();
      }
      
      private function onIgnoreUserClicked(param1:Event) : void
      {
         var _loc2_:Object = {};
         _loc2_.serverGateway = serverGateway;
         _shellUi.createIgnoreUserDialogue(_loc2_);
      }
      
      public function get gameBaseUrl() : String
      {
         return _gameBaseUrl;
      }
      
      private function onInviteFriend(param1:Event) : void
      {
         var _loc2_:Object = {};
         _loc2_.url = UrlUtil.getInviteFriendUrl({
            "game":gameHandle,
            "roomData":chosenRoom,
            "serverData":chosenServerData,
            "userData":userData,
            "roomPassword":this.roomPassword
         });
         _loc2_.title = textContentManager.getText("inviteFriendDialogueTitle");
         _loc2_.msg = textContentManager.getText("inviteFriendDialogueBody");
         _loc2_.game = gameConfig.gameHandle;
         _shellUi.createDialogueInviteFriend(_loc2_);
      }
      
      private function getUserInfo() : void
      {
         dTrace("getUserInfo: sid:" + userData.sid);
         gsi = new GSIGateway(UrlUtil.getGsiServerSubdomain());
         gsi.addEventListener(GSIEvent.LOADED,getUserInfoCallback);
         gsi.addEventListener(GSIEvent.ERROR,getUserInfoError);
         gsi.addEventListener(IOErrorEvent.IO_ERROR,onGSIIOError);
         gsi.serializerClass = PHPSerializer;
         gsi.invoke(107,userData.sid);
      }
      
      private function tryToGetServerList() : void
      {
         if(_gameConfigLoaded && _userInfoReady)
         {
            getServerList();
         }
      }
      
      private function loadGameTextXml() : void
      {
         var _loc1_:URLLoader = new URLLoader();
         _loc1_.addEventListener(Event.COMPLETE,onLoadGameTextXml);
         var _loc2_:String = gameBaseUrl + "text/gameText_" + gameConfig.language + ".xml";
         _loc1_.load(new URLRequest(_loc2_));
         dTrace("loadGameTextXml: " + _loc2_);
      }
      
      private function onLoadingScreenLoaded(param1:Event) : void
      {
         mcLoadingScreen.width = APP_WIDTH;
         mcLoadingScreen.height = APP_HEIGHT;
         addGameChildren();
      }
      
      private function initChat() : void
      {
         var _loc1_:Number = NaN;
         if(gameConfig.showChat == "true")
         {
            dTrace("initChat");
            chat.init({
               "serverGateway":serverGateway,
               "windowColor":Number(gameConfig.chatWindowColor)
            });
            chat.addEventListener("REPORT_ABUSE_CLICKED",onReportAbuseClicked);
            chat.addEventListener("IGNORE_USER_CLICKED",onIgnoreUserClicked);
            if(UrlUtil.getExternalFlashVar("sponsorship_url") != null)
            {
               dTrace("sponsorship passed");
               _loc1_ = Number(UrlUtil.getExternalFlashVar("sponsorship_height"));
               mcSponsorshipContainer.y = 585 - _loc1_;
               chat.setHeight(chat.getHeight() - _loc1_);
            }
            else
            {
               mcSponsorshipContainer.visible = false;
            }
         }
         stepInit();
      }
      
      private function loadNonGameConfigAssets() : void
      {
         var soundLoader:Loader;
         var gameLoader:Loader;
         var self:gameShell = null;
         var downloadedAssetManager:DownloadedAssetManager = new DownloadedAssetManager();
         downloadedAssetManager.addEventListener(DownloadAssetManagerEvent.COMPLETE,onNonGameConfigAssetsLoaded,false,0,true);
         gameLoader = new Loader();
         mcGame.addChild(gameLoader);
         downloadedAssetManager.register(gameLoader);
         gameLoader.load(new URLRequest(gameBaseUrl + "game.swf"));
         soundLoader = new Loader();
         self = this;
         soundLoader.contentLoaderInfo.addEventListener(Event.COMPLETE,function(param1:Event):void
         {
            self._gameSound = (param1.target as LoaderInfo).content as ISoundController;
            if(self._gameSound)
            {
               self._gameSound.playMusic("music");
            }
         });
         downloadedAssetManager.register(soundLoader);
         soundLoader.load(new URLRequest(gameBaseUrl + "media/sound.swf"));
         mediaUrls.avatarStationGameDisplay = gameBaseUrl + "media/" + gameHandle + "AvatarStation.swf";
         mediaUrls.avatarStationsBackground = gameBaseUrl + "media/avatarStationsBackground.swf";
      }
      
      private function connectToServer() : void
      {
         var _loc1_:String = null;
         var _loc4_:String = null;
         var _loc5_:int = 0;
         dTrace("connectToServer");
         if(gameConfig.demoMode == "true")
         {
            _loc1_ = "localDummy";
         }
         else
         {
            _loc1_ = gameConfig.serverType;
         }
         var _loc2_:String = null;
         var _loc3_:uint = 0;
         _loc2_ = chosenServerData.ip;
         _loc3_ = uint(chosenServerData.port);
         if(Boolean(serverGateway) && serverGateway.connected)
         {
            serverGateway.close();
         }
         Security.loadPolicyFile("xmlsocket://" + _loc2_ + ":843");
         dTrace("serverType:" + _loc1_);
         switch(_loc1_)
         {
            case "sgs":
               _serverGateway = new SGSGaiaGateway(_loc2_,_loc3_);
               break;
            case "sushi":
               _loc4_ = gameConfig.sushi.pluginName;
               _loc5_ = isNaN(gameConfig.sushi.session) ? 1 : int(gameConfig.sushi.session);
               dTrace("pluginName:" + _loc4_ + ", Session: " + _loc5_);
               _serverGateway = new SushiGaiaGateway(_loc2_,_loc3_,_loc4_,_loc5_);
               break;
            default:
               dTrace("INVALID SERVER TYPE IN CONFIG!!!!");
         }
         serverGateway.timeout = 30000;
         serverGateway.addEventListener(Event.CONNECT,onServerConnect);
         serverGateway.addEventListener(IOErrorEvent.IO_ERROR,this.onServerIoError);
         serverGateway.addEventListener(SecurityErrorEvent.SECURITY_ERROR,this.onServerSecurityError);
         serverGateway.addEventListener(Event.CLOSE,this.onServerClose);
         serverGateway.addEventListener("timeout",this.onServerTimeout);
         serverGateway.addEventListener(GaiaGatewayEvent.LOGIN_SUCCESS,this.onLoginSuccess);
         serverGateway.addEventListener(GaiaGatewayEvent.LOGIN_FAIL,this.onLoginFail);
         serverGateway.addEventListener(GaiaGatewayEvent.LOGIN_SUCCESS,_userBar.onLoginSuccess);
         serverGateway.addEventListener(GaiaGatewayEvent.CHANNEL_JOIN_ERROR,this.onChannelJoinError);
         serverGateway.addEventListener(GaiaGatewayEvent.DISPLAY_CAPTCHA,this.onDisplayCaptcha);
         dTrace("server:" + serverGateway);
      }
      
      private function onLoadGameTextXml(param1:Event) : void
      {
         dTrace("onLoadGameTextXml: " + param1);
         var _loc2_:XML = new XML(param1.target.data);
         addXmlToTextManager(_loc2_);
      }
      
      private function getUserInfoError(param1:Event = null) : void
      {
         var _loc2_:DialogueLogin = _shellUi.createDialogueLogin();
      }
      
      private function showContent(param1:Boolean) : void
      {
         if(this.game)
         {
            this.game.visible = param1;
         }
         this.gotoAndStop(param1 ? "play" : "login");
      }
      
      private function onKeyUp(param1:KeyboardEvent) : void
      {
         var _loc2_:Dialogue = null;
         switch(param1.keyCode)
         {
            case Keyboard.UP:
               keySequence += "U";
               break;
            case Keyboard.DOWN:
               keySequence += "D";
               break;
            case Keyboard.LEFT:
               keySequence += "L";
               break;
            case Keyboard.RIGHT:
               keySequence += "R";
               break;
            case Keyboard.SPACE:
               keySequence += " ";
               break;
            default:
               keySequence = "";
         }
         if(keySequence.length > 10)
         {
            keySequence = keySequence.substr(1);
         }
         else if(keySequence.length < 10)
         {
            return;
         }
         if(keySequence == "UUDDLRLR  ")
         {
            keySequence = "";
            if(isHappyEaster)
            {
               return;
            }
            isHappyEaster = true;
            _loc2_ = _shellUi.createDialogue({
               "title":"FRAMEWORK INFO",
               "msg":"Version: " + FW_VERSION + ", " + "Released Date: " + FW_RELEASED_DATE + "\n" + "Game: " + gameHandle + "\n" + "GSI: " + UrlUtil.getGsiServerSubdomain() + "\n" + "Avatar: " + UrlUtil.getAvatarServerSubdomain() + "\n" + "Server: " + (chosenServerData != null ? chosenServerData.ip : "") + "\n" + "Flash version: " + Capabilities.version
            });
            _loc2_.addEventListener("OK_CLICKED",onCloseEaster);
         }
      }
      
      public function get tracking() : ITracking
      {
         if(!_tracking)
         {
            _tracking = String(gameConfig.trackingEnabled) == "true" ? new Tracking() : new NullTracking();
         }
         return _tracking;
      }
      
      private function onMusicChange(param1:Event) : void
      {
         trace("music e: " + param1.type);
         switch(param1.type)
         {
            case VolumeControl.MUSIC_OFF_EVENT:
               _gameSound.muteMusic();
               break;
            case VolumeControl.MUSIC_ON_EVENT:
               _gameSound.turnOnMusic();
               break;
            case VolumeControl.SOUND_OFF_EVENT:
               _gameSound.muteSound();
               break;
            case VolumeControl.SOUND_ON_EVENT:
               _gameSound.turnOnSound();
         }
      }
      
      private function drawUI() : void
      {
         graphics.beginFill(4808084);
         graphics.drawRect(0,0,1000,1000);
         graphics.endFill();
         mcGame = new MovieClip();
         mcGame.x = 0;
         mcGame.y = 135;
         avatarStationsContainer = new Sprite();
         avatarStationsContainer.x = 0;
         avatarStationsContainer.y = 25;
         chatContainer = new Sprite();
         chatContainer.x = 600;
         chatContainer.y = 139;
         mcSponsorshipContainer = new Sprite();
         mcSponsorshipContainer.x = 600;
         mcSponsorshipContainer.y = 480;
         userBarContainer = new Sprite();
         mcLoadingScreen = new Sprite();
         _shellUi = new ShellUi();
         _shellUi.addEventListener(CaptchaEvent.SUBMIT,onCaptchaSubmit,false,0,true);
         _shellUi.addEventListener(CaptchaEvent.ERROR,onCaptchaError,false,0,true);
         addChild(_shellUi);
      }
      
      public function get shellUi() : IShellUi
      {
         return _shellUi;
      }
      
      public function focusGame() : void
      {
         dTrace("focusGame");
         if(this.game)
         {
            this.stage.focus = this.game;
         }
      }
      
      private function onServerTimeout(param1:Event) : void
      {
         dTrace("onServerTimeout");
         var _loc2_:Dialogue = _shellUi.createDialogue({
            "title":"ALERT",
            "msg":"The server is not responding. (server timeout)."
         });
         if(_loc2_)
         {
            _loc2_.addEventListener("OK_CLICKED",onServerError);
         }
      }
      
      private function onLoginFail(param1:GaiaLoginEvent) : void
      {
         var _loc2_:Dialogue = null;
         dTrace("onLoginFail:" + param1.error);
         this.loginSuccess = false;
         switch(param1.error)
         {
            case -1:
               _loc2_ = _shellUi.createDialogue({
                  "title":"ERROR",
                  "msg":"Login failed.",
                  "noFurtherDialogues":false
               });
               if(_loc2_)
               {
                  _loc2_.addEventListener("OK_CLICKED",onServerError);
               }
               break;
            case -2:
               _loc2_ = _shellUi.createDialogue({
                  "title":"ERROR",
                  "msg":"You\'re already logged in.",
                  "noFurtherDialogues":false
               });
               if(_loc2_)
               {
                  _loc2_.addEventListener("OK_CLICKED",getUserInfoError);
               }
         }
      }
      
      private function onReportAbuseClicked(param1:Event) : void
      {
         var _loc2_:Object = {};
         _loc2_.serverGateway = serverGateway;
         _loc2_.gameConfig = gameConfig;
         _loc2_.chatHistory = chat.getRecentHistory();
         _shellUi.createReportAbuseDialogue(_loc2_);
      }
      
      private function onServerClose(param1:Event) : void
      {
         var _loc2_:Dialogue = null;
         dTrace("onServerClose");
         if(!serverLogoutIntentional && this.loginSuccess)
         {
            _loc2_ = _shellUi.createDialogue({
               "title":"ALERT",
               "msg":"The server connection has been closed."
            });
            if(_loc2_)
            {
               _loc2_.addEventListener("OK_CLICKED",onServerError);
            }
            serverLogoutIntentional = false;
         }
         if(userData.isGuest())
         {
            userData.setUserName("");
         }
         showContent(false);
         if(this.sessionKeeper)
         {
            this.sessionKeeper.stop();
         }
      }
      
      private function onDisplayCaptcha(param1:Event) : void
      {
         shellUi.createDialogueCaptcha();
      }
      
      private function initUserBar() : void
      {
         _userBar.init({
            "userData":userData,
            "shell":this,
            "shellUi":_shellUi,
            "gameConfig":gameConfig
         });
         _userBar.addEventListener("INVITE_FRIEND_CLICKED",onInviteFriend);
      }
      
      private function gameIsPrepared() : void
      {
         _gameIsPrepared = true;
         tryToStartGame();
      }
      
      private function onGameEventHappened(param1:Event) : void
      {
         trace("game event RECEIVED FROM GAME");
         sessionKeeper.overrideGameEventHappened();
      }
      
      private function onServerError(param1:Event) : void
      {
         if(serverList.length > 1)
         {
            onRoomChoiceBack(null);
         }
         else
         {
            ExternalInterface.call("closeWindow");
         }
      }
      
      private function onCaptchaError(param1:CaptchaEvent) : void
      {
         _shellUi.createDialogue({
            "title":"Internal Error",
            "msg":"Sorry, an internal problem occurred:\n\n\"" + param1.data + "\"\n\nPlease refresh your browser."
         });
      }
      
      private function onRoomChoiceBack(param1:Event = null) : void
      {
         initSequenceCounter = initSequence.indexOf(chooseServer) + 1;
         serverLogoutIntentional = true;
         if(serverGateway.connected)
         {
            serverGateway.logout();
         }
         chooseServer();
      }
      
      private function joinRoom() : void
      {
         dTrace("joinRoom");
         serverGateway.addEventListener(GaiaGatewayEvent.CHANNEL_JOIN,this.onChannelJoin);
         serverGateway.leaveAllChannels();
         if(passwordRequired && roomPassword != null)
         {
            serverGateway.joinChannel(chosenRoom.id,roomPassword);
         }
         else
         {
            serverGateway.joinChannel(chosenRoom.id);
         }
      }
      
      private function onChannelJoinError(param1:GaiaChannelEvent) : void
      {
         var _loc2_:String = null;
         var _loc3_:Dialogue = null;
         dTrace("onChannelJoinError| Error: " + param1.error);
         if(serverGateway.connected && !this.loginSuccess)
         {
            serverGateway.close();
            _loc3_ = _shellUi.createDialogue({
               "title":"ERROR",
               "msg":"You\'re already logged in.",
               "noFurtherDialogues":false
            });
            if(_loc3_)
            {
               _loc3_.addEventListener("OK_CLICKED",getUserInfoError);
            }
            return;
         }
         switch(param1.error)
         {
            case GaiaGatewayProtocol.ERROR_CHANNEL_LIMIT_EXCEEDED:
               _loc2_ = "Room is full";
               break;
            case GaiaGatewayProtocol.ERROR_CHANNEL_NOT_FOUND:
               _loc2_ = "Room no longer exists";
               break;
            default:
               _loc2_ = "Room is full or you\'re not allowed to join";
         }
         _loc3_ = _shellUi.createDialogue({
            "title":"ERROR",
            "msg":_loc2_
         });
         _loc3_.addEventListener("OK_CLICKED",onJoinChannelErrorDialogueOk);
      }
      
      private function initGame() : void
      {
         var _loc2_:XML = null;
         var _loc3_:String = null;
         trace("initgame");
         addGameChildren();
         if(Boolean(loadBar) && Boolean(loadBar.parent))
         {
            removeChild(loadBar);
            loadBar = null;
         }
         var _loc1_:XMLList = gameConfig.extraParams;
         if(_loc1_.length() > 0)
         {
            _gameParameters = {};
            for each(_loc2_ in _loc1_.children())
            {
               _loc3_ = (_loc2_.name() as QName).localName;
               _gameParameters[_loc3_] = _loc2_.toString();
            }
         }
         if(game != null)
         {
            focusGame();
            game.addEventListener(GaiaGameEvent.GAME_STARTED,_userBar.onGameStarted);
            game.addEventListener(MouseEvent.MOUSE_DOWN,this.onMouseDown);
            showContent(true);
            (game as IGaiaGame).init(this);
            if(mcLoadingScreen.parent)
            {
               mcLoadingScreen.parent.removeChild(mcLoadingScreen);
            }
            _userBar.requestNewGame();
         }
         else
         {
            _shellUi.createDialogue({
               "title":"ERROR",
               "msg":"Game not loaded. game == null."
            });
         }
         trace("initgame: " + mcLoadingScreen.parent);
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[GameShell] " + param1);
      }
      
      private function jumpBackAndStep() : void
      {
         if(initSequenceCounter > 0)
         {
            --initSequenceCounter;
         }
         stepInit();
      }
      
      private function addGameChildren() : void
      {
         if(!gameChildrenAdded)
         {
            addChild(mcGame);
            addChild(avatarStationsContainer);
            addChild(chatContainer);
            addChild(mcSponsorshipContainer);
            addChild(userBarContainer);
            addChild(mcLoadingScreen);
            addChild(loadBar);
            addChild(_shellUi);
            gameChildrenAdded = true;
         }
      }
      
      private function initAvatarStations() : void
      {
         var _loc1_:uint = 0;
         var _loc2_:Number = NaN;
         var _loc3_:Object = null;
         var _loc4_:XMLList = null;
         if(gameConfig.showAvatarStations == "true")
         {
            _loc1_ = 10;
            _loc2_ = 770;
            if(gameConfig.avatar)
            {
               _loc4_ = gameConfig.avatar;
               if(_loc4_.@stations.length() > 0)
               {
                  _loc1_ = parseInt(gameConfig.avatar.@stations[0].valueOf());
               }
               if(_loc4_.@width.length() > 0)
               {
                  _loc2_ = parseFloat(gameConfig.avatar.@width[0].valueOf());
               }
            }
            _loc3_ = {
               "serverGateway":serverGateway,
               "stationGameDisplayUrl":mediaUrls.avatarStationGameDisplay,
               "horizSpace":_loc2_,
               "totalStations":_loc1_
            };
            avatarStations.setBackgroundUrl(mediaUrls.avatarStationsBackground);
            _loc3_.roomId = chosenRoom.id;
            avatarStations.init(_loc3_);
            avatarStations.addEventListener("INVITE_FRIEND_CLICKED",onInviteFriend);
         }
         stepInit();
      }
      
      private function onSizeUpdate(param1:Object) : void
      {
         var _loc2_:Number = startGameWidth + chat.width;
         var _loc3_:Number = Number(param1.width);
         var _loc4_:Number = Number(param1.height);
         var _loc5_:Number = _loc3_ + chat.width;
         var _loc6_:Number = _loc4_ + avatarStationsContainer.height + avatarStationsContainer.y;
         ExternalInterface.call("GAIA.GameFramework.updateSize",_loc5_,_loc6_);
         chatContainer.x = _loc3_;
         avatarStations.setWidth(_loc5_);
         mcGame.height = _loc4_;
         chat.setHeight(_loc4_);
         _userBar.getChildAt(0).width = _loc5_;
         var _loc7_:uint = _userBar.numChildren - 1;
         _userBar.getChildAt(_loc7_).x = _userBar.getChildAt(_loc7_).x + (_loc5_ - _loc2_);
         _userBar.getChildAt(_loc7_ - 3).x = _userBar.getChildAt(_loc7_ - 3).x + (_loc5_ - _loc2_);
         _userBar.getChildAt(_loc7_ - 4).x = _userBar.getChildAt(_loc7_ - 4).x + (_loc5_ - _loc2_);
         _userBar.getChildAt(0).width = _loc5_;
         _userBar.getChildAt(0).x = _userBar.getChildAt(0).x + (_loc5_ - _loc2_) / 2;
      }
      
      private function onNonGameConfigAssetsLoaded(param1:DownloadAssetManagerEvent) : void
      {
         _nonGameConfigAssetsLoaded = true;
         var _loc2_:Sprite = (mcGame.getChildAt(0) as Loader).getChildAt(0) as Sprite;
         mcGame.removeChildAt(0);
         mcGame.addChild(_loc2_);
         this.game = _loc2_;
         (game as Sprite).addEventListener("GameEventHappened",onGameEventHappened,false,0,true);
         tryToStartGame();
      }
      
      private function onRoomChosen(param1:Event) : void
      {
         var _loc2_:DialogueRoomBase = param1.target as DialogueRoomBase;
         dTrace("onRoomChosen:" + _loc2_.getChosenRoom().id);
         chosenRoom = _loc2_.getChosenRoom();
         if(_loc2_.isPasswordRequired())
         {
            roomPassword = _loc2_.getPassword();
            dTrace("roomPassword:" + roomPassword);
            passwordRequired = true;
         }
         stepInit();
      }
      
      private function onChannelJoin(param1:Event) : void
      {
         dTrace("&&onChannelJoin");
         _userBar.setRoomName(chosenRoom.name);
         stepInit();
      }
      
      public function onResize(param1:Event) : void
      {
         dTrace("resize");
      }
      
      private function loadGameConfigAssets() : void
      {
         var _loc1_:DownloadedAssetManager = new DownloadedAssetManager();
         _loc1_.addEventListener(DownloadAssetManagerEvent.COMPLETE,onGameConfigAssetsLoaded,false,0,true);
         if(gameConfig.loadingScreen != undefined && Boolean(gameConfig.loadingScreen))
         {
            loadingScreenLoader = new Loader();
            mcLoadingScreen.addChild(loadingScreenLoader);
            _loc1_.register(loadingScreenLoader);
            loadingScreenLoader.contentLoaderInfo.addEventListener(Event.COMPLETE,onLoadingScreenLoaded,false,0,true);
            loadingScreenLoader.load(new URLRequest(gameConfig.loadingScreen));
         }
         var _loc2_:URLLoader = new URLLoader();
         _loc2_.addEventListener(Event.COMPLETE,onLoadCommonTextXml,false,0,true);
         var _loc3_:String = shellBaseUrl + "text/commonText_" + gameConfig.language + ".xml";
         _loc1_.register(_loc2_);
         _loc2_.load(new URLRequest(_loc3_));
         var _loc4_:URLLoader = new URLLoader();
         _loc4_.addEventListener(Event.COMPLETE,onLoadGameTextXml,false,0,true);
         var _loc5_:String = gameBaseUrl + "text/gameText_" + gameConfig.language + ".xml";
         _loc1_.register(_loc4_);
         _loc4_.load(new URLRequest(_loc5_));
         addChild(_shellUi);
         _userBar = new UserBar();
         _userBar.volumeControl.addEventListener(VolumeControl.MUSIC_OFF_EVENT,onMusicChange,false,0,true);
         _userBar.volumeControl.addEventListener(VolumeControl.MUSIC_ON_EVENT,onMusicChange,false,0,true);
         _userBar.volumeControl.addEventListener(VolumeControl.SOUND_OFF_EVENT,onMusicChange,false,0,true);
         _userBar.volumeControl.addEventListener(VolumeControl.SOUND_ON_EVENT,onMusicChange,false,0,true);
         userBarContainer.addChild(_userBar);
         chat = new Chat();
         chatContainer.addChild(chat);
         if(gameConfig.showAvatarStations == "true")
         {
            avatarStations = new AvatarStationManager();
            avatarStationsContainer.addChild(avatarStations);
         }
         loadBar.setMessage("Loading " + textContentManager.getText("gameName") + "...");
      }
      
      public function get gameParameters() : Object
      {
         return _gameParameters;
      }
      
      private function onJoinChannelErrorDialogueOk(param1:Event) : void
      {
         jumpToInitStep(chooseRoom);
      }
      
      private function chooseRoom() : void
      {
         var _loc2_:String = null;
         var _loc3_:Object = null;
         var _loc4_:DialogueChooseRoom = null;
         chosenRoom = null;
         var _loc1_:Number = -1;
         if(!this.gotInitialRoom)
         {
            _loc1_ = Number(UrlUtil.getExternalFlashVar("invite_room_id"));
            this.gotInitialRoom = true;
         }
         if(_loc1_ > 0)
         {
            chosenRoom = new Object();
            chosenRoom.id = _loc1_;
            chosenRoom.name = UrlUtil.getExternalFlashVar("invite_room_name");
            this.roomPassword = UrlUtil.getExternalFlashVar("invite_password");
            this.passwordRequired = true;
         }
         if(chosenRoom == null)
         {
            if(playAlone)
            {
               serverGateway.addEventListener(GaiaChannelEvent.CHANNEL_CREATE,onCreateSoloChannel);
               _loc2_ = RoomNameUtil.SOLO_ROOM_PREFIX + "_" + userData.userName + " alone " + String(Math.floor(Math.random() * 1000));
               serverGateway.createChannel(_loc2_);
            }
            else
            {
               _loc3_ = {"serverGateway":serverGateway};
               _loc4_ = _shellUi.createDialogueChooseRoom(_loc3_);
               _loc4_.addEventListener("ROOM_CHOSEN",onRoomChosen);
               _loc4_.addEventListener("ROOM_CHOICE_BACK",onRoomChoiceBack);
               _loc4_.addEventListener("ROOM_START_CREATE",onStartCreateRoom);
            }
         }
         else
         {
            setTimeout(stepInit,1);
         }
      }
      
      private function onCaptchaSubmit(param1:CaptchaEvent) : void
      {
         serverGateway.call(SushiGaiaProtocol.FUNCTION_VERIFY_CAPTCHA,param1.data);
      }
      
      private function getSid() : void
      {
         loadBar.setMessage("Logging in to server...");
         gsi = new GSIGateway(UrlUtil.getGsiServerSubdomain());
         gsi.serializerClass = PHPSerializer;
         gsi.addEventListener(GSIEvent.LOADED,getSidCallback);
         gsi.addEventListener(GSIEvent.ERROR,getSidCallbackError);
         gsi.addEventListener(IOErrorEvent.IO_ERROR,onGSIIOError);
         gsi.invoke(109);
      }
      
      public function get serverGateway() : IGaiaGateway
      {
         return _serverGateway;
      }
      
      private function onSessionExpire(param1:GSIEvent) : void
      {
         var _loc2_:Dialogue = _shellUi.createDialogue({
            "title":"ERROR",
            "msg":"Your session expired.",
            "noFurtherDialogues":false
         });
         if(_loc2_)
         {
            _loc2_.addEventListener("OK_CLICKED",getUserInfoError);
         }
         if(serverGateway.connected)
         {
            serverLogoutIntentional = true;
            serverGateway.close();
         }
      }
      
      public function onServerSecurityError(param1:SecurityErrorEvent) : void
      {
         trace("onServerSecurityError");
         var _loc2_:Dialogue = _shellUi.createDialogue({
            "title":"ALERT",
            "msg":"Server security error."
         });
         _loc2_.addEventListener("OK_CLICKED",onServerError);
      }
      
      private function onMouseDown(param1:MouseEvent) : void
      {
         dTrace("onMouseDown");
         focusGame();
      }
      
      private function onLoginSuccess(param1:GaiaLoginEvent) : void
      {
         dTrace("onLoginSuccess");
         this.loginSuccess = true;
         _userBar.setServerName(chosenServerData.name);
         chat.reportAbuse_btn.visible = !userData.isGuest();
         if(!this.sessionKeeper)
         {
            this.sessionKeeper = new SessionKeeperWithActivityCheck(this.stage,UrlUtil.getGsiServerSubdomain(),userData.getSid(),gameConfig.gaiaApplicationID);
            this.sessionKeeper.addEventListener(GSIEvent.ERROR,this.onSessionExpire);
            this.sessionKeeper.start(SESSION_KEEPER_INTERVAL);
         }
         else
         {
            this.sessionKeeper.stop();
            this.sessionKeeper.session = userData.getSid();
            this.sessionKeeper.start(SESSION_KEEPER_INTERVAL);
         }
         stepInit();
      }
      
      private function onLoadCommonTextXml(param1:Event) : void
      {
         dTrace("onLoadCommonTextXml: " + param1);
         var _loc2_:XML = new XML(param1.target.data);
         addXmlToTextManager(_loc2_);
      }
      
      private function getUserInfoCallback(param1:GSIEvent) : void
      {
         dTrace("getUserInfoCallback() " + param1.gsiData);
         gsi.removeEventListener(GSIEvent.LOADED,getUserInfoCallback);
         var _loc2_:Object = param1.gsiData;
         var _loc3_:Number = Number(_loc2_["user_level"]);
         if(_loc3_ <= 1)
         {
            UserDataGlobal.getInstance().setAsGuest();
         }
         userData.init({
            "userName":_loc2_.username,
            "gid":_loc2_.gaia_id,
            "avatar":_loc2_.avatar
         });
         _userInfoReady = true;
         if(userBar != null)
         {
            initUserBar();
         }
         stepInit();
      }
      
      private function loadGame(param1:Event = null) : void
      {
         mediaUrls = new Object();
         loadBar = new LoadBar();
         addChild(loadBar);
         loadBar.x = 247;
         loadBar.y = 290;
         loadBar.setMessage("Loading...");
         this.addEventListener(KeyboardEvent.KEY_UP,this.onKeyUp);
         loadAllAssets();
      }
      
      private function onPlayAloneChosen(param1:Event) : void
      {
         playAlone = true;
      }
      
      private function stepInit(... rest) : void
      {
         var _loc2_:Function = initSequence[initSequenceCounter] as Function;
         if(_loc2_ == null)
         {
            return;
         }
         ++initSequenceCounter;
         dTrace("stepInit. init sequence step " + initSequenceCounter + " of " + initSequence.length);
         _loc2_.call(this);
         progressEvent.bytesLoaded = initSequenceCounter * 100;
         progressEvent.bytesTotal = initSequence.length * 100;
         dispatchEvent(progressEvent);
      }
      
      private function getSidCallback(param1:GSIEvent) : void
      {
         userData.setSid(String(param1.gsiData));
         dTrace("getSidCallback:" + userData.sid);
         stepInit();
      }
   }
}

import com.gaiaonline.gameFramework.tracking.ITracking;

class NullTracking implements ITracking
{
   
   public function NullTracking()
   {
      super();
   }
   
   public function set appID(param1:String) : void
   {
   }
   
   public function track(param1:String) : void
   {
   }
}
