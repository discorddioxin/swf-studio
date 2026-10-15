package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.text.*;
   import flash.display.*;
   import flash.events.*;
   import flash.text.*;
   
   public class DialogueGeneral extends Dialogue
   {
      
      public var cancel_btn:GaiaButton;
      
      public var ok_btn:GaiaButton;
      
      public var msgTxt:TextField;
      
      public function DialogueGeneral()
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
         var _loc2_:String = "[DialogueGeneral]";
         trace(_loc2_ + param1);
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.width = 374.6;
         dialogBG.height = 211.8;
         msgTxt = new TextField();
         msgTxt.defaultTextFormat = new TextFormat(null,14,0);
         msgTxt.multiline = true;
         msgTxt.width = 356;
         msgTxt.height = 119.3;
         msgTxt.x = 8.4;
         msgTxt.y = 40.5;
         addChildToDialog(msgTxt);
         cancel_btn = new GaiaButton(new DialogButtonAsset(),"CANCEL");
         cancel_btn.x = 12;
         cancel_btn.y = 174.8;
         addChildToDialog(cancel_btn);
         ok_btn = new GaiaButton(new DialogButtonAsset(),"OK");
         ok_btn.x = 262;
         ok_btn.y = 176;
         addChildToDialog(ok_btn);
      }
      
      public function setDialogue(param1:Object) : void
      {
         msgTxt.text = param1.msg;
         titleTxt.text = param1.title;
         if(param1.permanent)
         {
            cancel_btn.visible = false;
            ok_btn.visible = false;
         }
         else
         {
            ok_btn.addEventListener(MouseEvent.CLICK,okButtonClicked);
            if(param1.cancelable)
            {
               cancel_btn.addEventListener(MouseEvent.CLICK,cancelButtonClicked);
               cancel_btn.visible = true;
            }
            else
            {
               cancel_btn.visible = false;
            }
         }
         super.init();
      }
      
      private function cancelButtonClicked(param1:Event) : void
      {
         dispatchEvent(new Event("CANCEL_CLICKED"));
         close();
      }
   }
}

