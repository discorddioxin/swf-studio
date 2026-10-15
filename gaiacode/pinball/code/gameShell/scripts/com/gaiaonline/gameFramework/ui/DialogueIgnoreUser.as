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
   
   public class DialogueIgnoreUser extends Dialogue
   {
      
      private var ignoreLabel:TextField = null;
      
      private var userList:Array;
      
      private var confirmScreen:Sprite = null;
      
      private var userData:UserDataGlobal = UserDataGlobal.getInstance();
      
      private var cancel_btn:GaiaButton;
      
      private var ignoreScreen:Sprite = null;
      
      private var cb:ComboBox;
      
      private var userLabel:TextField = null;
      
      private var ignoreOk_btn:GaiaButton;
      
      private var numChannelsReported:uint;
      
      private var numChannels:uint;
      
      private var ok_btn:GaiaButton;
      
      private var okMsgTxt:TextField;
      
      private var roomNameArr:Array;
      
      public function DialogueIgnoreUser()
      {
         super();
         dTrace("constructor");
         stop();
      }
      
      private function drawComboBox() : void
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
         cb.dataProvider = _loc1_;
         cb.rowCount = userList.length;
         ignoreOk_btn.addEventListener(MouseEvent.CLICK,ignoreButtonClicked);
         cancel_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[DialogueIgnoreUser]";
         trace(_loc2_ + param1);
      }
      
      private function cancelButtonClicked(param1:Event) : void
      {
         dTrace("cancelButtonClicked");
         close();
      }
      
      public function setDialogue(param1:Object) : void
      {
         var _loc3_:Array = null;
         var _loc4_:uint = 0;
         dTrace("setDialogue");
         var _loc2_:IGaiaGateway = param1.serverGateway;
         if(titleTxt == null)
         {
            dTrace("titleTxt is null. WHATS UP?");
         }
         else
         {
            titleTxt.text = textContentManager.getText("ignoreUserTitle");
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
      
      private function checkInitNooneToIgnore(param1:Event) : void
      {
         dTrace("checkInitNooneToIgnore");
         if(ok_btn != null)
         {
            okMsgTxt.text = textContentManager.getText("ignoreNooneToIgnore");
            ok_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
            root.removeEventListener(Event.ENTER_FRAME,checkInitNooneToIgnore);
         }
      }
      
      private function checkInitOkFrame(param1:Event) : void
      {
         dTrace("checkInitOkFrame");
         if(ok_btn != null)
         {
            okMsgTxt.text = textContentManager.getText("ignoreUserComplete");
            ok_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
            root.removeEventListener(Event.ENTER_FRAME,checkInitOkFrame);
         }
      }
      
      private function ignoreButtonClicked(param1:Event) : void
      {
         if(cb.selectedItem != null)
         {
            userData.ignoreUser(cb.selectedItem.label);
            gotoConfirmScreen();
            root.addEventListener(Event.ENTER_FRAME,checkInitOkFrame);
         }
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.width = 374.6;
         dialogBG.height = 211.8;
         ignoreScreen = new Sprite();
         ignoreLabel = new TextField();
         ignoreLabel.defaultTextFormat = new TextFormat("Arial",13,0,true);
         ignoreLabel.x = 78.8;
         ignoreLabel.y = 45.2;
         ignoreLabel.width = 205.1;
         ignoreLabel.text = "Choose who you want to ignore:";
         ignoreScreen.addChild(ignoreLabel);
         userLabel = new TextField();
         userLabel.defaultTextFormat = new TextFormat("Arial",13,0,true);
         userLabel.x = 58.8;
         userLabel.y = 90.2;
         userLabel.width = 33.1;
         userLabel.text = "User";
         ignoreScreen.addChild(userLabel);
         cb = new ComboBox();
         cb.width = 221.9;
         cb.height = 22;
         cb.x = 100.2;
         cb.y = 89.2;
         cb.editable = false;
         cb.prompt = "";
         cb.rowCount = 5;
         ignoreScreen.addChild(cb);
         cancel_btn = new GaiaButton(new DialogButtonAsset(),"CANCEL");
         cancel_btn.x = 155.8;
         cancel_btn.y = 173.7;
         ignoreScreen.addChild(cancel_btn);
         ignoreOk_btn = new GaiaButton(new DialogButtonAsset(),"IGNORE");
         ignoreOk_btn.x = 265.8;
         ignoreOk_btn.y = 173.7;
         ignoreScreen.addChild(ignoreOk_btn);
         addChildToDialog(ignoreScreen);
         confirmScreen = new Sprite();
         okMsgTxt = new TextField();
         okMsgTxt.multiline = true;
         okMsgTxt.defaultTextFormat = new TextFormat(null,14,0,false);
         okMsgTxt.x = 9;
         okMsgTxt.y = 41.7;
         okMsgTxt.width = 288.9;
         okMsgTxt.height = 85.3;
         confirmScreen.addChild(okMsgTxt);
         ok_btn = new GaiaButton(new DialogButtonAsset(),"OK");
         ok_btn.x = 265.8;
         ok_btn.y = 173.7;
         confirmScreen.addChild(ok_btn);
      }
      
      private function gotoConfirmScreen() : void
      {
         if(Boolean(ignoreScreen) && Boolean(ignoreScreen.parent))
         {
            removeChildFromDialog(ignoreScreen);
         }
         addChildToDialog(confirmScreen);
      }
      
      private function onPresenceList(param1:GaiaPresenceListEvent) : void
      {
         var _loc4_:String = null;
         var _loc2_:Array = param1.identities;
         var _loc3_:uint = 0;
         while(_loc3_ < _loc2_.length)
         {
            _loc4_ = _loc2_[_loc3_].userName;
            dTrace(_loc4_ + " = " + userData.userName);
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
               gotoConfirmScreen();
               root.addEventListener(Event.ENTER_FRAME,checkInitNooneToIgnore);
            }
            else
            {
               drawComboBox();
            }
         }
         dTrace("onPresenceList:" + userList);
      }
   }
}

