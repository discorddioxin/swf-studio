package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.events.*;
   import com.gaiaonline.gameFramework.sound.*;
   import com.gaiaonline.gameFramework.text.*;
   import com.gaiaonline.gameFramework.util.*;
   import com.gaiaonline.gsi.*;
   import flash.display.*;
   import flash.events.*;
   import flash.geom.ColorTransform;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   import flash.text.*;
   
   public class UserBar extends MovieClip implements IUserBar
   {
      
      private var textContentManager:TextContentManager;
      
      public var roomNameTxt:TextField;
      
      public var UserBarBg:Class;
      
      public var HelpIcon:Class;
      
      private var userData:Object;
      
      public var serverNameTxt:TextField;
      
      private var mode:String;
      
      public var saveGame_btn:GaiaButton;
      
      private var shell:MovieClip;
      
      public var GoldCoin:Class;
      
      public var SaveGameButton:Class;
      
      private var gameConfig:XML;
      
      public var newGame_btn:GaiaButton;
      
      public var gaiaLogo_btn:SimpleButton;
      
      public var help_btn:Sprite;
      
      public var volumeControl:VolumeControl;
      
      private var shellUi:ShellUi;
      
      public var shareWithFriend_btn:GaiaButton;
      
      public var NewGameButton:Class;
      
      public var LongButton:Class;
      
      public var goldTxt:TextField;
      
      public var LogoSmall:Class;
      
      private var gsi:GSIGateway;
      
      public function UserBar()
      {
         var _loc1_:Object = null;
         textContentManager = TextContentManager.getInstance();
         UserBarBg = UserBar_UserBarBg;
         LogoSmall = UserBar_LogoSmall;
         GoldCoin = UserBar_GoldCoin;
         HelpIcon = UserBar_HelpIcon;
         NewGameButton = UserBar_NewGameButton;
         SaveGameButton = UserBar_SaveGameButton;
         LongButton = UserBar_LongButton;
         super();
         dTrace("constructor:");
         drawUI();
         if(parent == stage && stage != null)
         {
            _loc1_ = {"userData":{
               "gid":1496278,
               "username":"pizmonaut"
            }};
            init(_loc1_);
         }
         newGame_btn.visible = false;
         saveGame_btn.visible = false;
         this.addEventListener(MouseEvent.MOUSE_DOWN,onMouseDown);
         gaiaLogo_btn.addEventListener(MouseEvent.CLICK,onClickLogo);
         newGame_btn.addEventListener(MouseEvent.CLICK,newGameClicked);
         saveGame_btn.addEventListener(MouseEvent.CLICK,saveGameClicked);
         help_btn.addEventListener(MouseEvent.CLICK,onHelpClicked);
         shareWithFriend_btn.addEventListener(MouseEvent.CLICK,onShareWithFriendClicked);
         stop();
      }
      
      protected function goldLoaded(param1:GSIEvent) : void
      {
         gsi.removeEventListener(GSIEvent.LOADED,goldLoaded);
         dTrace("goldLoaded() " + param1.gsiData);
         goldTxt.text = String(param1.gsiData);
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[UserBar]";
         trace(_loc2_ + param1);
      }
      
      public function setRoomName(param1:String) : void
      {
         dTrace("setRoomName");
         roomNameTxt.text = param1;
      }
      
      private function gsiError(param1:GSIEvent) : void
      {
         dTrace("GSI error");
      }
      
      public function toggleNewGameButton(param1:Boolean = true) : void
      {
         if(param1)
         {
            newGame_btn.visible = true;
         }
         else
         {
            newGame_btn.visible = false;
         }
      }
      
      private function saveGameClicked(param1:Event) : void
      {
         dispatchEvent(new GaiaGameEvent(GaiaGameEvent.SAVE_GAME));
      }
      
      private function newGameClicked(param1:Event) : void
      {
         dTrace("newGameClicked...");
         var _loc2_:Dialogue = shellUi.createDialogue({
            "cancelable":true,
            "title":textContentManager.getText("newGameDialogueTitle"),
            "msg":textContentManager.getText("newGameDialogueBody")
         });
         _loc2_.addEventListener("OK_CLICKED",requestNewGame);
      }
      
      public function init(param1:Object) : void
      {
         dTrace("init:" + param1.userData.toString());
         shell = param1.shell;
         shellUi = param1.shellUi;
         userData = param1.userData;
         updateGold();
         gameConfig = param1.gameConfig;
      }
      
      public function addNewGameListener(param1:Function) : void
      {
         addEventListener(GaiaGameEvent.NEW_GAME_REQUEST,param1,false,0,true);
      }
      
      public function getVolumeControl() : VolumeControl
      {
         return volumeControl;
      }
      
      public function requestNewGame(param1:Event = null) : void
      {
         dispatchEvent(new GaiaGameEvent(GaiaGameEvent.NEW_GAME_REQUEST));
      }
      
      private function onClickLogo(param1:MouseEvent) : void
      {
         var _loc2_:String = unescape(gameConfig.homeUrl);
         if(!_loc2_)
         {
            _loc2_ = "http://www.gaiaonline.com";
         }
         var _loc3_:URLRequest = new URLRequest(_loc2_);
         navigateToURL(_loc3_,"_new");
      }
      
      private function onShareWithFriendClicked(param1:Event) : void
      {
         dispatchEvent(new Event("INVITE_FRIEND_CLICKED"));
      }
      
      private function onHelpClicked(param1:Event) : void
      {
         var _loc2_:String = unescape(gameConfig.helpUrl);
         var _loc3_:URLRequest = new URLRequest(_loc2_);
         navigateToURL(_loc3_,"_new");
      }
      
      public function updateGold() : void
      {
         dTrace("updateGold for user:" + userData.gid);
         gsi = new GSIGateway(UrlUtil.getGsiServerSubdomain());
         gsi.addEventListener(GSIEvent.LOADED,goldLoaded);
         gsi.addEventListener(GSIEvent.ERROR,gsiError);
         gsi.invoke(113,userData.sid);
      }
      
      public function onGameStarted(param1:Event) : void
      {
         dTrace("onGameStarted");
         newGame_btn.visible = true;
         if(Boolean(gameConfig) && Boolean(gameConfig.allowSaveGame == "true") && gameConfig.autoSaveGame == "false")
         {
            saveGame_btn.visible = true;
         }
      }
      
      public function setMode(param1:String) : void
      {
         mode = param1;
         gotoAndStop(param1);
      }
      
      private function onMouseDown(param1:MouseEvent) : void
      {
         if(parent.parent["focusGame"])
         {
            parent.parent["focusGame"]();
         }
      }
      
      public function onLoginSuccess(param1:Event) : void
      {
         setMode("server");
      }
      
      private function drawUI() : void
      {
         var _loc1_:Sprite = new UserBarBg();
         _loc1_.width = 770;
         _loc1_.height = 25;
         addChild(_loc1_);
         gaiaLogo_btn = new LogoSmall();
         gaiaLogo_btn.x = 8.6;
         gaiaLogo_btn.y = 3.6;
         var _loc2_:ColorTransform = new ColorTransform(0,0,0,1,153,102,30,120);
         gaiaLogo_btn.transform.colorTransform = _loc2_;
         addChild(gaiaLogo_btn);
         var _loc3_:Sprite = new GoldCoin();
         _loc3_.x = 70.7;
         _loc3_.y = 13.2;
         _loc3_.height = 14.6;
         _loc3_.width = 14.6;
         addChild(_loc3_);
         goldTxt = new TextField();
         goldTxt.x = 81;
         goldTxt.y = 3;
         goldTxt.width = 85;
         goldTxt.height = 18;
         goldTxt.defaultTextFormat = new TextFormat(null,12,0,true);
         addChild(goldTxt);
         serverNameTxt = new TextField();
         serverNameTxt.x = 175.1;
         serverNameTxt.y = 0;
         serverNameTxt.width = 197.9;
         serverNameTxt.height = 15.4;
         serverNameTxt.defaultTextFormat = new TextFormat(null,9,0,true);
         addChild(serverNameTxt);
         roomNameTxt = new TextField();
         roomNameTxt.x = 175.1;
         roomNameTxt.y = 9.1;
         roomNameTxt.width = 197.9;
         roomNameTxt.height = 17.7;
         roomNameTxt.defaultTextFormat = new TextFormat(null,10,0,true);
         addChild(roomNameTxt);
         help_btn = new HelpIcon();
         help_btn.x = 693;
         help_btn.y = 4;
         addChild(help_btn);
         newGame_btn = new GaiaButton(new GaiaButtonAsset(),"NEW GAME");
         newGame_btn.x = 372.9;
         newGame_btn.y = 3;
         addChild(newGame_btn);
         saveGame_btn = new GaiaButton(new GaiaButtonAsset(),"SAVE GAME");
         saveGame_btn.x = 477.9;
         saveGame_btn.y = 3;
         addChild(saveGame_btn);
         shareWithFriend_btn = new GaiaButton(new GaiaButtonAsset(),"Share with Friend");
         shareWithFriend_btn.x = 554.5;
         shareWithFriend_btn.y = 3;
         addChild(shareWithFriend_btn);
         volumeControl = new VolumeControl();
         volumeControl.x = help_btn.x + help_btn.width + 5;
         volumeControl.y = help_btn.y;
         addChild(volumeControl);
      }
      
      public function removeNewGameListener(param1:Function) : void
      {
         removeEventListener(GaiaGameEvent.NEW_GAME_REQUEST,param1,false);
      }
      
      public function setServerName(param1:String) : void
      {
         serverNameTxt.text = param1;
      }
   }
}

