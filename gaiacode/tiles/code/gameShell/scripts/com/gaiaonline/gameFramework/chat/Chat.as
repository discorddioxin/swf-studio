package com.gaiaonline.gameFramework.chat
{
   import com.gaiaonline.gameFramework.data.*;
   import com.gaiaonline.gameFramework.text.*;
   import com.gaiaonline.gameFramework.ui.GaiaButton;
   import com.gaiaonline.gameFramework.util.*;
   import com.gaiaonline.gateway.GaiaChatMessage;
   import com.gaiaonline.gateway.events.GaiaChatEvent;
   import com.gaiaonline.gateway.events.GaiaPresenceEvent;
   import fl.controls.*;
   import fl.events.*;
   import flash.display.*;
   import flash.events.*;
   import flash.geom.ColorTransform;
   import flash.text.*;
   import flash.utils.*;
   
   public class Chat extends MovieClip
   {
      
      public static const BOTTOM:String = "bottom";
      
      public static const RIGHT:String = "right";
      
      private var serverGateway:*;
      
      private var _lineCount:uint = 0;
      
      private var textContentManager:TextContentManager = TextContentManager.getInstance();
      
      private var _chatEnabled:Boolean = true;
      
      public var reportAbuse_btn:GaiaButton;
      
      public var taContainer:MovieClip;
      
      private var userData:UserDataGlobal = UserDataGlobal.getInstance();
      
      public var chatSend_btn:GaiaButton;
      
      public var TextArea_upSkin:Class = Chat_TextArea_upSkin;
      
      public var chatHeader_txt:TextField;
      
      public var TextArea_disabledSkin:Class = Chat_TextArea_disabledSkin;
      
      public var inputTxt:TextField;
      
      private var _maxLines:uint = 30;
      
      private var vertSpaceMargin:uint = 4;
      
      public var mcBackground:Shape;
      
      private var taHistory:TextArea;
      
      public var ignore_btn:GaiaButton;
      
      public function Chat()
      {
         super();
         drawUI();
         var _loc1_:String = "Welcome to Gaia game chat! Make sure to follow our";
         _loc1_ += " " + applyStyle("terms of service","url",UrlUtil.getTOS_URL());
         _loc1_ += " and " + applyStyle("rules","url",UrlUtil.getURLRulesUrl()) + ".";
         taHistory.htmlText = _loc1_;
         taHistory.editable = false;
         chatHeader_txt.text = "CHAT";
         inputTxt.addEventListener(MouseEvent.MOUSE_DOWN,clearInitialInputText);
         inputTxt.addEventListener(MouseEvent.MOUSE_DOWN,focusInHandler);
         inputTxt.addEventListener(FocusEvent.FOCUS_IN,focusInHandler);
         inputTxt.addEventListener(FocusEvent.FOCUS_OUT,focusOutHandler);
         inputTxt.addEventListener(FocusEvent.MOUSE_FOCUS_CHANGE,mouseFocusChangeHandler);
      }
      
      private function onTestMouseMove(param1:Event) : void
      {
         dTrace("onTestMouseMove");
         dTrace(taHistory.verticalScrollPosition.toString());
      }
      
      private function mouseFocusChangeHandler(param1:FocusEvent) : void
      {
         dTrace("mouseFocusChangeHandler");
      }
      
      public function init(param1:Object) : void
      {
         this.chatEnabled = !userData.isGuest();
         serverGateway = param1.serverGateway;
         serverGateway.addEventListener(GaiaChatEvent.CHAT,onReceiveMessage);
         serverGateway.addEventListener(GaiaPresenceEvent.PRESENCE_IN,this.onPresenceIn);
         serverGateway.addEventListener(GaiaPresenceEvent.PRESENCE_OUT,this.onPresenceOut);
         chatSend_btn.addEventListener(MouseEvent.CLICK,onSendButtonClicked);
         reportAbuse_btn.addEventListener(MouseEvent.CLICK,onReportAbuseClicked);
         ignore_btn.addEventListener(MouseEvent.CLICK,onIgnoreClicked);
         addEventListener(KeyboardEvent.KEY_DOWN,checkKeyDown);
         if(param1.windowColor != null && !isNaN(param1.windowColor))
         {
            setColor(param1.windowColor);
         }
      }
      
      public function set chatEnabled(param1:Boolean) : void
      {
         _chatEnabled = param1;
         inputTxt.type = param1 ? TextFieldType.INPUT : TextFieldType.DYNAMIC;
         chatSend_btn.enabled = param1;
      }
      
      private function clearInitialInputText(param1:Event) : void
      {
         dTrace("clearInitialInputText");
         inputTxt.htmlText = this._chatEnabled ? "" : "You need to register before you are allowed to chat. <a href=\'" + UrlUtil.getRegisterUrl() + "\' target=\'_blank\'><b><u><font color=\'#0000FF\'>Register now.</font></u></b></a>";
         inputTxt.removeEventListener(MouseEvent.MOUSE_DOWN,clearInitialInputText);
      }
      
      public function setColor(param1:Number) : void
      {
         var _loc2_:ColorTransform = new ColorTransform();
         _loc2_.color = param1;
         mcBackground.transform.colorTransform = _loc2_;
      }
      
      public function setChatPosition(param1:String) : void
      {
         if(param1 == BOTTOM)
         {
            positionBottom();
         }
         else
         {
            positionRight();
         }
      }
      
      public function getRecentHistory() : String
      {
         var _loc1_:String = getHistory();
         return _loc1_.substring(_loc1_.length - 1000,_loc1_.length);
      }
      
      public function setHeight(param1:uint) : void
      {
         mcBackground.height = param1;
         chatSend_btn.y = param1 - chatSend_btn.height - vertSpaceMargin;
         inputTxt.y = chatSend_btn.y - inputTxt.height - vertSpaceMargin;
         taHistory.height = inputTxt.y - taHistory.y - vertSpaceMargin;
      }
      
      private function focusOutHandler(param1:FocusEvent) : void
      {
         dTrace("focusOutHandler");
         if(this.parent.parent["focusGame"])
         {
            this.parent.parent["focusGame"]();
         }
      }
      
      private function scrollHistoryToBottom(... rest) : void
      {
         taHistory.verticalScrollPosition = taHistory.maxVerticalScrollPosition;
      }
      
      public function getHeight() : uint
      {
         return mcBackground.height;
      }
      
      private function positionBottom() : void
      {
         removeChild(chatHeader_txt);
         reportAbuse_btn.x = 672.7;
         reportAbuse_btn.y = 5.4;
         reportAbuse_btn.width = 82.3;
         reportAbuse_btn.height = 17.4;
         ignore_btn.x = 672.7;
         ignore_btn.y = 23.1;
         ignore_btn.width = 82.3;
         ignore_btn.height = 17.4;
         chatSend_btn.width = 108.3;
         chatSend_btn.height = 22.8;
         chatSend_btn.x = 657.7;
         chatSend_btn.y = 76;
         inputTxt.width = 646.8;
         inputTxt.height = 18;
         inputTxt.x = 6.2;
         inputTxt.y = 76;
         chatHeader_txt.width = 59.1;
         chatHeader_txt.height = 19;
         chatHeader_txt.x = 9.6;
         chatHeader_txt.y = 10.2;
         taContainer.x = 6;
         taContainer.y = 7;
         taHistory.setSize(646.8,66);
         setBackgroundSize(770,100);
      }
      
      private function onPresenceIn(param1:GaiaPresenceEvent) : void
      {
         writeLine(applyStyle(param1.identity.userName + " has joined...","soft"));
      }
      
      private function keyFocusChangeHandler(param1:FocusEvent) : void
      {
         dTrace("keyFocusChangeHandler");
      }
      
      private function clearInputTxt(param1:Event) : void
      {
         inputTxt.text = "";
      }
      
      private function onHistoryChange(param1:Event) : void
      {
         dTrace("onHistoryChange");
         scrollHistoryToBottom();
      }
      
      public function get chatEnabled() : Boolean
      {
         return this._chatEnabled;
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[Chat] ";
         trace(_loc2_ + param1);
      }
      
      private function setBackgroundSize(param1:Number, param2:Number) : void
      {
         var _loc3_:Graphics = mcBackground.graphics;
         graphics.clear();
         graphics.beginFill(4808084);
         graphics.drawRect(0,0,param1,param2);
         graphics.endFill();
      }
      
      private function removeFirstLines(param1:uint = 1) : void
      {
         var _loc3_:int = 0;
         var _loc2_:uint = 0;
         while(_loc2_ < param1)
         {
            _loc3_ = taHistory.htmlText.indexOf("</P>");
            if(_loc3_ >= 0)
            {
               taHistory.htmlText = taHistory.htmlText.substr(_loc3_ + 4);
               --this._lineCount;
            }
            _loc2_++;
         }
      }
      
      private function onSendButtonClicked(param1:Event) : void
      {
         if(this._chatEnabled)
         {
            sendMessage();
         }
      }
      
      private function onIgnoreClicked(param1:Event) : void
      {
         dispatchEvent(new Event("IGNORE_USER_CLICKED"));
         dTrace("onIgnoreClicked");
      }
      
      private function writeUserMsg(param1:String, param2:String, param3:uint = 0) : void
      {
         var _loc4_:String = param2;
         _loc4_ = _loc4_.replace(/\</g,"&lt;");
         _loc4_ = _loc4_.replace(/\>/g,"&gt;");
         writeLine("<font color=\'#" + param3.toString(16) + "\'><b>" + param1 + "</b>:" + _loc4_ + "</font>");
      }
      
      private function drawUI() : void
      {
         mcBackground = new Shape();
         addChild(mcBackground);
         taContainer = new MovieClip();
         taHistory = new TextArea();
         taHistory.setStyle("TextArea_upSkin",TextArea_upSkin);
         taHistory.setStyle("TextArea_disabledSkin",TextArea_disabledSkin);
         taHistory.setStyle("upSkin",TextArea_upSkin);
         taHistory.setStyle("disabledSkin",TextArea_disabledSkin);
         taHistory.drawNow();
         taContainer.addChild(taHistory);
         taContainer.x = 6;
         taContainer.y = 7;
         addChild(taContainer);
         chatHeader_txt = new TextField();
         var _loc1_:TextFormat = new TextFormat("Arial",13,16777215,true);
         _loc1_.align = TextFormatAlign.CENTER;
         chatHeader_txt.defaultTextFormat = _loc1_;
         addChild(chatHeader_txt);
         inputTxt = new TextField();
         inputTxt.type = TextFieldType.INPUT;
         inputTxt.defaultTextFormat = new TextFormat("Arial",12,0);
         inputTxt.text = "type message here.";
         inputTxt.wordWrap = true;
         inputTxt.multiline = true;
         inputTxt.selectable = true;
         inputTxt.border = true;
         inputTxt.maxChars = 80;
         inputTxt.background = true;
         inputTxt.backgroundColor = 16777215;
         addChild(inputTxt);
         reportAbuse_btn = new GaiaButton(new ChatButtonAsset(),"REPORT ABUSE");
         ignore_btn = new GaiaButton(new ChatButtonAsset(),"IGNORE USER");
         chatSend_btn = new GaiaButton(new ChatButtonAsset(),"SEND");
         addChild(reportAbuse_btn);
         addChild(ignore_btn);
         addChild(chatSend_btn);
         positionRight();
      }
      
      public function sendMessage() : void
      {
         inputTxt.text = inputTxt.text.replace(/\r/g,"");
         inputTxt.text = inputTxt.text.replace(/\n/g,"");
         if(inputTxt.text != "")
         {
            serverGateway.chat(new GaiaChatMessage({"message":inputTxt.text}));
         }
         var _loc1_:Timer = new Timer(100,1);
         _loc1_.addEventListener(TimerEvent.TIMER,clearInputTxt);
         _loc1_.start();
      }
      
      public function getHistory() : String
      {
         return taHistory.text;
      }
      
      private function onReportAbuseClicked(param1:Event) : void
      {
         dispatchEvent(new Event("REPORT_ABUSE_CLICKED"));
         dTrace("onReportAbuseClicked");
      }
      
      private function onReceiveMessage(param1:GaiaChatEvent) : void
      {
         var _loc2_:String = param1.data.sender.userName;
         if(!userData.isIgnored(_loc2_))
         {
            writeUserMsg(_loc2_,param1.data.message,param1.data.color);
         }
      }
      
      private function focusInHandler(param1:Event) : void
      {
         dTrace("focusInHandler");
      }
      
      private function applyStyle(param1:String, param2:String, ... rest) : String
      {
         var _loc4_:String = null;
         switch(param2)
         {
            case "soft":
               _loc4_ = "<I><FONT COLOR=\"#999999\">" + param1 + "</FONT></I>";
               break;
            case "url":
               _loc4_ = "<FONT COLOR=\"#0000FF\"><U><A TARGET=\"_blank\" HREF=\"" + rest[0] + "\">" + param1 + "</A></U></FONT>";
         }
         return _loc4_;
      }
      
      private function positionRight() : void
      {
         if(chatHeader_txt.parent != this)
         {
            addChild(chatHeader_txt);
         }
         reportAbuse_btn.x = 84;
         reportAbuse_btn.y = 1.5;
         reportAbuse_btn.width = 82.3;
         reportAbuse_btn.height = 17.4;
         ignore_btn.x = 84;
         ignore_btn.y = 19.3;
         ignore_btn.width = 82.3;
         ignore_btn.height = 17.4;
         chatSend_btn.width = 108.3;
         chatSend_btn.height = 22.8;
         chatSend_btn.x = 29;
         chatSend_btn.y = 419;
         inputTxt.width = 160.1;
         inputTxt.height = 77.9;
         inputTxt.x = 5;
         inputTxt.y = 338;
         chatHeader_txt.width = 59.1;
         chatHeader_txt.height = 19;
         chatHeader_txt.x = 9.6;
         chatHeader_txt.y = 10.2;
         taContainer.x = 6;
         taContainer.y = 40;
         taHistory.setSize(160,294);
         setBackgroundSize(170,447);
      }
      
      private function onPresenceOut(param1:GaiaPresenceEvent) : void
      {
         writeLine(applyStyle(param1.identity.userName + " has left...","soft"));
      }
      
      private function checkKeyDown(param1:KeyboardEvent) : void
      {
         if(param1.keyCode == 13 && this._chatEnabled)
         {
            sendMessage();
         }
      }
      
      private function writeLine(param1:String) : void
      {
         taHistory.htmlText += param1 + "<BR>";
         ++this._lineCount;
         if(this._lineCount > this._maxLines)
         {
            this.removeFirstLines(1);
         }
         var _loc2_:Timer = new Timer(100,1);
         _loc2_.addEventListener(TimerEvent.TIMER,scrollHistoryToBottom);
         _loc2_.start();
      }
   }
}

