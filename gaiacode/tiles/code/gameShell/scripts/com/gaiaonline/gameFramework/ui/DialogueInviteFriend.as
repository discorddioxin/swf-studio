package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.text.*;
   import flash.display.*;
   import flash.events.*;
   import flash.text.*;
   
   public class DialogueInviteFriend extends Dialogue
   {
      
      private var urlTxt:TextField = null;
      
      private var ok_btn:GaiaButton = null;
      
      private var msgTxt:TextField = null;
      
      public function DialogueInviteFriend()
      {
         dTrace("constructor");
         super();
      }
      
      private function okButtonClicked(param1:Event) : void
      {
         dispatchEvent(new Event("OK_CLICKED"));
         close();
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[DialogueInviteFriend]";
         trace(_loc2_ + param1);
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.width = 374.6;
         dialogBG.height = 211.8;
         msgTxt = new TextField();
         msgTxt.defaultTextFormat = new TextFormat(null,14);
         msgTxt.x = 8.3;
         msgTxt.y = 34.4;
         msgTxt.width = 356;
         msgTxt.height = 60.3;
         msgTxt.multiline = true;
         msgTxt.wordWrap = true;
         addChildToDialog(msgTxt);
         urlTxt = new TextField();
         urlTxt.defaultTextFormat = new TextFormat(null,14);
         urlTxt.border = true;
         urlTxt.background = true;
         urlTxt.x = 8.3;
         urlTxt.y = 98.7;
         urlTxt.width = 356;
         urlTxt.height = 60.3;
         urlTxt.multiline = true;
         urlTxt.wordWrap = true;
         addChildToDialog(urlTxt);
         ok_btn = new GaiaButton(new DialogButtonAsset(),"OK");
         ok_btn.x = 261.8;
         ok_btn.y = 171.7;
         addChildToDialog(ok_btn);
      }
      
      public function setDialogue(param1:Object) : void
      {
         msgTxt.text = param1.msg;
         titleTxt.text = param1.title;
         urlTxt.text = param1.url;
         ok_btn.addEventListener(MouseEvent.CLICK,okButtonClicked);
         super.init();
      }
   }
}

