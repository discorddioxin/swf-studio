package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.data.*;
   import com.gaiaonline.gameFramework.text.*;
   import com.gaiaonline.gameFramework.util.*;
   import com.gaiaonline.gateway.IGaiaGateway;
   import com.gaiaonline.gateway.events.GaiaPresenceListEvent;
   import com.gaiaonline.moderation.*;
   import fl.controls.ComboBox;
   import fl.data.DataProvider;
   import flash.display.*;
   import flash.events.*;
   import flash.text.*;
   
   public class DialogueReportAbuse extends Dialogue
   {
      
      private var userList:Array;
      
      private var errorScreen:Sprite = null;
      
      private var userData:UserDataGlobal = UserDataGlobal.getInstance();
      
      public var cancel_btn:GaiaButton;
      
      private var chatHistory:String;
      
      private var sentScreen:Sprite = null;
      
      private var gameId:int;
      
      public var msgTxt:TextField;
      
      private var currentScreen:Sprite = null;
      
      public var cbOffender:ComboBox;
      
      public var completeMsgTxt:TextField;
      
      public var cbReportType:ComboBox;
      
      private var enterAbuseScreen:Sprite = null;
      
      private var returnedReportId:String;
      
      private var sendingScreen:Sprite = null;
      
      private var numChannelsReported:uint;
      
      private var numChannels:uint;
      
      public var ok_btn:GaiaButton;
      
      private var roomNameArr:Array;
      
      public function DialogueReportAbuse()
      {
         super();
         dTrace("constructor");
         stop();
      }
      
      private function okButtonClicked(param1:Event) : void
      {
         if(cbOffender.selectedItem != null)
         {
            submitReport();
            gotoSendingScreen();
         }
      }
      
      private function drawComboBoxes() : void
      {
         var _loc1_:DataProvider = new DataProvider();
         var _loc2_:uint = 0;
         while(_loc2_ < userList.length)
         {
            _loc1_.addItem({
               "label":userList[_loc2_],
               "roomName":roomNameArr[_loc2_]
            });
            _loc2_++;
         }
         cbOffender.dataProvider = _loc1_;
         cbOffender.rowCount = userList.length;
         _loc1_ = new DataProvider();
         _loc1_.addItem({
            "label":"Trolling/Abuse",
            "data":3
         });
         _loc1_.addItem({
            "label":"Offsite Advertising",
            "data":7
         });
         _loc1_.addItem({
            "label":"Password Phishing",
            "data":2
         });
         _loc1_.addItem({
            "label":"Sexually Explicit Material",
            "data":1
         });
         _loc1_.addItem({
            "label":"Other",
            "data":5
         });
         cbReportType.dataProvider = _loc1_;
         cbReportType.rowCount = _loc1_.length;
         ok_btn.addEventListener(MouseEvent.CLICK,okButtonClicked);
         cancel_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
      }
      
      private function gotoErrorScreen() : void
      {
         errorScreen.addChild(completeMsgTxt);
         errorScreen.addChild(ok_btn);
         addScreen(errorScreen);
      }
      
      private function cancelButtonClicked(param1:Event) : void
      {
         dTrace("cancelButtonClicked");
         close();
      }
      
      private function onPresenceList(param1:GaiaPresenceListEvent) : void
      {
         var _loc4_:String = null;
         var _loc2_:Array = param1.identities;
         var _loc3_:uint = 0;
         while(_loc3_ < _loc2_.length)
         {
            _loc4_ = _loc2_[_loc3_].userName;
            if(_loc4_ != userData.userName)
            {
               userList.push(_loc4_);
               roomNameArr.push(param1.channel.name);
            }
            _loc3_++;
         }
         ++numChannelsReported;
         if(numChannelsReported == numChannels)
         {
            if(userList.length == 0)
            {
               gotoSentScreen();
               checkInitNooneToReport();
            }
            else
            {
               drawComboBoxes();
            }
         }
         dTrace("onPresenceList:" + userList);
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[DialogueReportAbuse]";
         trace(_loc2_ + param1);
      }
      
      private function gotoSendingScreen() : void
      {
         sendingScreen.addChild(completeMsgTxt);
         addScreen(sendingScreen);
      }
      
      private function onReportComplete(param1:Event) : void
      {
         dTrace("onReportComplete");
         returnedReportId = param1.target.reportID;
         checkInitSentFrame();
         completeMsgTxt.visible = true;
         gotoSentScreen();
      }
      
      private function onReportError(param1:Event) : void
      {
         dTrace("onReportError");
         checkInitSentFrame();
         completeMsgTxt.visible = false;
         gotoErrorScreen();
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.width = 374.6;
         dialogBG.height = 211.8;
         enterAbuseScreen = new Sprite();
         var _loc1_:TextFormat = new TextFormat("Arial",13,0,true);
         var _loc2_:TextField = new TextField();
         _loc2_.defaultTextFormat = _loc1_;
         _loc2_.text = "User";
         _loc2_.x = 7.8;
         _loc2_.y = 37.2;
         _loc2_.width = 33.1;
         enterAbuseScreen.addChild(_loc2_);
         var _loc3_:TextField = new TextField();
         _loc3_.defaultTextFormat = _loc1_;
         _loc3_.text = "Reason";
         _loc3_.x = 178.7;
         _loc3_.y = 37.2;
         _loc3_.width = 51.2;
         enterAbuseScreen.addChild(_loc3_);
         var _loc4_:TextField = new TextField();
         _loc4_.defaultTextFormat = _loc1_;
         _loc4_.text = "Notes:";
         _loc4_.x = 7.8;
         _loc4_.y = 59.7;
         _loc4_.width = 44.8;
         enterAbuseScreen.addChild(_loc4_);
         completeMsgTxt = new TextField();
         completeMsgTxt.defaultTextFormat = new TextFormat(null,14,0,false);
         completeMsgTxt.x = 42;
         completeMsgTxt.y = 63.6;
         completeMsgTxt.width = 291.4;
         completeMsgTxt.height = 82;
         completeMsgTxt.multiline = true;
         completeMsgTxt.wordWrap = true;
         enterAbuseScreen.addChild(completeMsgTxt);
         msgTxt = new TextField();
         msgTxt.defaultTextFormat = new TextFormat(null,14);
         msgTxt.x = 9.3;
         msgTxt.y = 78.5;
         msgTxt.width = 354.9;
         msgTxt.height = 83.3;
         msgTxt.multiline = true;
         msgTxt.border = true;
         msgTxt.background = true;
         msgTxt.maxChars = 255;
         msgTxt.type = TextFieldType.INPUT;
         enterAbuseScreen.addChild(msgTxt);
         cbOffender = new ComboBox();
         cbOffender.x = 41.1;
         cbOffender.y = 37.2;
         cbOffender.width = 136.1;
         cbOffender.height = 22;
         cbOffender.rowCount = 5;
         cbOffender.prompt = "";
         cbOffender.editable = false;
         enterAbuseScreen.addChild(cbOffender);
         cbReportType = new ComboBox();
         cbReportType.x = 229.1;
         cbReportType.y = 37.2;
         cbReportType.width = 136.1;
         cbReportType.height = 22;
         cbReportType.rowCount = 5;
         cbReportType.prompt = "";
         cbReportType.editable = false;
         enterAbuseScreen.addChild(cbReportType);
         cancel_btn = new GaiaButton(new DialogButtonAsset(),"CANCEL");
         cancel_btn.x = 152.6;
         cancel_btn.y = 171.7;
         enterAbuseScreen.addChild(cancel_btn);
         ok_btn = new GaiaButton(new DialogButtonAsset(),"OK");
         ok_btn.x = 262.6;
         ok_btn.y = 171.7;
         enterAbuseScreen.addChild(ok_btn);
         sendingScreen = new Sprite();
         var _loc5_:TextField = new TextField();
         _loc5_.defaultTextFormat = _loc1_;
         _loc5_.text = "Sending...";
         _loc5_.x = 42;
         _loc5_.y = 37.7;
         _loc5_.width = 103.8;
         sendingScreen.addChild(_loc5_);
         sentScreen = new Sprite();
         errorScreen = new Sprite();
         var _loc6_:TextField = new TextField();
         _loc6_.defaultTextFormat = _loc1_;
         _loc6_.text = "Error.";
         _loc6_.x = 42;
         _loc6_.y = 37.7;
         _loc6_.width = 103.8;
         errorScreen.addChild(_loc6_);
         gotoEnterAbuseScreen();
      }
      
      private function checkInitNooneToReport(param1:Event = null) : void
      {
         if(ok_btn != null)
         {
            ok_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
            completeMsgTxt.text = textContentManager.getText("reportAbuseNooneToReport");
         }
      }
      
      private function gotoEnterAbuseScreen() : void
      {
         addScreen(enterAbuseScreen);
      }
      
      public function setDialogue(param1:Object) : void
      {
         var _loc3_:Array = null;
         var _loc4_:uint = 0;
         dTrace("setDialogue");
         var _loc2_:IGaiaGateway = param1.serverGateway;
         gameId = param1.gameConfig.gaiaApplicationID;
         chatHistory = param1.chatHistory;
         if(titleTxt != null)
         {
            titleTxt.text = textContentManager.getText("reportAbuseTitle");
            userList = new Array();
            roomNameArr = new Array();
            _loc3_ = param1.serverGateway.channels;
            numChannels = _loc3_.length;
            numChannelsReported = 0;
            _loc2_.addEventListener(GaiaPresenceListEvent.PRESENCE_LIST,this.onPresenceList);
            _loc4_ = 0;
            while(_loc4_ < _loc3_.length)
            {
               _loc3_[_loc4_].getPresenceList();
               _loc4_++;
            }
            super.init();
         }
      }
      
      private function checkInitSentFrame(param1:Event = null) : void
      {
         dTrace("enterframe");
         if(ok_btn != null)
         {
            ok_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
            completeMsgTxt.text = textContentManager.getText("reportAbuseComplete");
            completeMsgTxt.appendText("\n\n" + textContentManager.getText("abuseReportNumber") + returnedReportId + "\n");
         }
      }
      
      private function gotoSentScreen() : void
      {
         sentScreen.addChild(completeMsgTxt);
         sentScreen.addChild(ok_btn);
         addScreen(sentScreen);
      }
      
      private function submitReport() : void
      {
         var _loc1_:String = userData.sid;
         var _loc2_:Object = {};
         _loc2_.userSid = _loc1_;
         _loc2_.accusedName = cbOffender.selectedItem.label;
         var _loc3_:Object = cbReportType.selectedItem;
         _loc2_.reportType = _loc3_.data;
         _loc2_.roomName = cbOffender.selectedItem.roomName;
         _loc2_.gameId = gameId;
         _loc2_.comments = msgTxt.text;
         _loc2_.chatHistory = chatHistory;
         _loc2_.subDomain = UrlUtil.getGsiServerSubdomain();
         var _loc4_:ReportAbuse = new ReportAbuse(_loc2_);
         _loc4_.addEventListener(Event.COMPLETE,onReportComplete);
         _loc4_.addEventListener("ERROR",onReportError);
      }
      
      private function addScreen(param1:Sprite) : void
      {
         if(Boolean(currentScreen) && Boolean(currentScreen.parent))
         {
            removeChildFromDialog(currentScreen);
         }
         addChildToDialog(param1);
         currentScreen = param1;
      }
   }
}

