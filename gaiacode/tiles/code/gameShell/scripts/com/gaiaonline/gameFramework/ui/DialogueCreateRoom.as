package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.data.UserDataGlobal;
   import com.gaiaonline.gameFramework.util.RoomNameUtil;
   import com.gaiaonline.gateway.IGaiaChannel;
   import com.gaiaonline.gateway.IGaiaGateway;
   import com.gaiaonline.gateway.events.GaiaChannelEvent;
   import fl.controls.CheckBox;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.text.TextField;
   import flash.text.TextFieldType;
   import flash.text.TextFormat;
   
   public class DialogueCreateRoom extends DialogueRoomBase
   {
      
      public var serverGateway:IGaiaGateway;
      
      public var roomNameTxt:TextField = null;
      
      public var passwordTxt:TextField = null;
      
      public var cancel_btn:GaiaButton = null;
      
      public var checkBoxPrivateRoom:CheckBox = null;
      
      private var roomNameTitleTxt:TextField = null;
      
      private var createdRoom:IGaiaChannel;
      
      private var shellUi:ShellUi = null;
      
      private var msgTxt:TextField = null;
      
      public var passwordTitleTxt:TextField = null;
      
      public var ok_btn:GaiaButton = null;
      
      public var passwordRequiredTxt:TextField = null;
      
      public function DialogueCreateRoom(param1:Object)
      {
         super();
         shellUi = param1.shellUi;
         serverGateway = param1.serverGateway;
         serverGateway.addEventListener(Event.CLOSE,this.onServerClose);
         serverGateway.getAllChannels();
      }
      
      private function onOKClick(param1:MouseEvent) : void
      {
         serverGateway.addEventListener(GaiaChannelEvent.CHANNEL_CREATE,onCreateChannel);
         var _loc2_:String = roomNameTxt.text;
         password = passwordTxt.text;
         if(isPasswordRequired())
         {
            serverGateway.createChannel(RoomNameUtil.PASSWORD_PROTECTED_PREFIX + "_" + _loc2_,null,password);
         }
         else
         {
            serverGateway.createChannel(RoomNameUtil.USER_CREATED_PREFIX + "_" + _loc2_);
            dTrace("user room name:" + RoomNameUtil.USER_CREATED_PREFIX + "_" + _loc2_);
         }
      }
      
      private function onCreateChannel(param1:GaiaChannelEvent) : void
      {
         dTrace("onCreateChannel");
         createdRoom = param1.channel;
         dispatchEvent(new Event("ROOM_CHOSEN"));
         close();
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[DialogueCreateRoom]";
         trace(_loc2_ + param1);
      }
      
      private function onCheckBoxPrivateChange(param1:Event) : void
      {
         var _loc2_:CheckBox = param1.target as CheckBox;
         var _loc3_:Boolean = _loc2_.selected;
         passwordTitleTxt.visible = _loc3_;
         passwordTxt.visible = _loc3_;
         passwordRequired = _loc3_;
      }
      
      private function onServerClose(param1:Event) : void
      {
         close();
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.width = 408.9;
         dialogBG.height = 386.3;
         titleTxt.text = "CREATE A ROOM";
         msgTxt = new TextField();
         msgTxt.x = 31.6;
         msgTxt.y = 36.8;
         msgTxt.width = 340.2;
         msgTxt.height = 62.6;
         msgTxt.defaultTextFormat = new TextFormat(null,14);
         msgTxt.text = "Create your own room. Room is based on your user name. Click REQUIRE PASSWORD to make it private.";
         msgTxt.multiline = true;
         msgTxt.wordWrap = true;
         addChildToDialog(msgTxt);
         roomNameTitleTxt = new TextField();
         roomNameTitleTxt.text = "ROOM NAME:";
         roomNameTitleTxt.x = 31.6;
         roomNameTitleTxt.y = 116.7;
         roomNameTitleTxt.width = 236.1;
         roomNameTitleTxt.height = 20;
         roomNameTitleTxt.defaultTextFormat = new TextFormat(null,12,0,true);
         addChildToDialog(roomNameTitleTxt);
         roomNameTxt = new TextField();
         roomNameTxt.x = 31.6;
         roomNameTxt.y = 137.8;
         roomNameTxt.width = 246.1;
         roomNameTxt.height = 21;
         roomNameTxt.defaultTextFormat = new TextFormat(null,16,0,true);
         var _loc1_:String = UserDataGlobal.getInstance().userName;
         var _loc2_:String = "\'s";
         if(_loc1_.charAt(_loc1_.length - 1) == "s")
         {
            _loc2_ = "\'";
         }
         roomNameTxt.text = _loc1_ + _loc2_ + " room";
         addChildToDialog(roomNameTxt);
         checkBoxPrivateRoom = new CheckBox();
         checkBoxPrivateRoom.x = 27.6;
         checkBoxPrivateRoom.y = 175.3;
         checkBoxPrivateRoom.width = 204.1;
         checkBoxPrivateRoom.height = 22;
         checkBoxPrivateRoom.label = "";
         checkBoxPrivateRoom.addEventListener(Event.CHANGE,onCheckBoxPrivateChange);
         addChildToDialog(checkBoxPrivateRoom);
         passwordRequiredTxt = new TextField();
         passwordRequiredTxt.x = 51.6;
         passwordRequiredTxt.y = 177.3;
         passwordRequiredTxt.width = 246;
         passwordRequiredTxt.height = 21;
         passwordRequiredTxt.defaultTextFormat = new TextFormat(null,12,0,true);
         passwordRequiredTxt.text = "REQUIRE PASSWORD";
         addChildToDialog(passwordRequiredTxt);
         passwordTitleTxt = new TextField();
         passwordTitleTxt.x = 31.6;
         passwordTitleTxt.y = 216.6;
         passwordTitleTxt.width = 236.1;
         passwordTitleTxt.height = 20;
         passwordTitleTxt.defaultTextFormat = new TextFormat(null,12,0,true);
         passwordTitleTxt.text = "PASSWORD";
         passwordTitleTxt.visible = false;
         addChildToDialog(passwordTitleTxt);
         passwordTxt = new TextField();
         passwordTxt.displayAsPassword = true;
         passwordTxt.type = TextFieldType.INPUT;
         passwordTxt.x = 31.6;
         passwordTxt.y = 239.6;
         passwordTxt.width = 126.2;
         passwordTxt.height = 20;
         passwordTxt.defaultTextFormat = new TextFormat(null,12,0,true);
         passwordTxt.visible = false;
         passwordTxt.border = true;
         passwordTxt.background = true;
         addChildToDialog(passwordTxt);
         cancel_btn = new GaiaButton(new DialogButtonAsset(),"CANCEL");
         cancel_btn.x = 51.6;
         cancel_btn.y = 325.1;
         cancel_btn.addEventListener(MouseEvent.CLICK,onCancelClick,false,0,true);
         addChildToDialog(cancel_btn);
         ok_btn = new GaiaButton(new DialogButtonAsset(),"OK");
         ok_btn.x = 228.8;
         ok_btn.y = 325.1;
         ok_btn.addEventListener(MouseEvent.CLICK,onOKClick,false,0,true);
         addChildToDialog(ok_btn);
      }
      
      private function onCancelClick(param1:MouseEvent) : void
      {
         dispatchEvent(new Event("CANCEL_CREATE_ROOM"));
         close();
      }
      
      override public function getChosenRoom() : Object
      {
         return createdRoom;
      }
   }
}

