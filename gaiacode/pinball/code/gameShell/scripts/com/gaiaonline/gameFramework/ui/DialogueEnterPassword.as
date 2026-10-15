package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.data.*;
   import com.gaiaonline.gameFramework.text.*;
   import flash.display.*;
   import flash.events.*;
   import flash.text.*;
   
   public class DialogueEnterPassword extends Dialogue
   {
      
      public var msgTxt:TextField;
      
      public var passwordTitleTxt:TextField;
      
      public var passwordTxt:TextField;
      
      public var cancel_btn:GaiaButton;
      
      public var ok_btn:GaiaButton;
      
      public function DialogueEnterPassword(param1:Object)
      {
         super();
         dTrace("constructor");
         msgTxt.text = param1.msg;
         titleTxt.text = param1.title;
         ok_btn.addEventListener(MouseEvent.CLICK,okButtonClicked);
         cancel_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
         super.setEnterClickedFunction(okButtonClicked);
      }
      
      private function okButtonClicked(param1:Event) : void
      {
         dispatchEvent(new Event("OK_CLICKED"));
         close();
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[DialogueEnterPassword]";
         trace(_loc2_ + param1);
      }
      
      public function getPassword() : String
      {
         return passwordTxt.text;
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.width = 379.6;
         dialogBG.height = 211.8;
         msgTxt = new TextField();
         msgTxt.x = 9;
         msgTxt.y = 38;
         msgTxt.width = 340.2;
         msgTxt.height = 42.6;
         msgTxt.multiline = true;
         msgTxt.wordWrap = true;
         msgTxt.defaultTextFormat = new TextFormat(null,14);
         addChildToDialog(msgTxt);
         passwordTitleTxt = new TextField();
         passwordTitleTxt.x = 9;
         passwordTitleTxt.y = 101.3;
         passwordTitleTxt.width = 247.8;
         passwordTitleTxt.height = 21;
         passwordTitleTxt.defaultTextFormat = new TextFormat(null,14,0,true);
         passwordTitleTxt.text = "PASSWORD";
         addChildToDialog(passwordTitleTxt);
         passwordTxt = new TextField();
         passwordTxt.type = TextFieldType.INPUT;
         passwordTxt.x = 114.7;
         passwordTxt.y = 101.3;
         passwordTxt.width = 132.5;
         passwordTxt.height = 21;
         passwordTxt.border = true;
         passwordTxt.background = true;
         passwordTxt.displayAsPassword = true;
         passwordTxt.defaultTextFormat = new TextFormat(null,14,0,true);
         addChildToDialog(passwordTxt);
         cancel_btn = new GaiaButton(new DialogButtonAsset(),"CANCEL");
         cancel_btn.x = 48.6;
         cancel_btn.y = 173.3;
         addChildToDialog(cancel_btn);
         ok_btn = new GaiaButton(new DialogButtonAsset(),"OK");
         ok_btn.x = 220.8;
         ok_btn.y = 173.3;
         addChildToDialog(ok_btn);
      }
      
      private function cancelButtonClicked(param1:Event) : void
      {
         dispatchEvent(new Event("CANCEL_CLICKED"));
         close();
      }
   }
}

