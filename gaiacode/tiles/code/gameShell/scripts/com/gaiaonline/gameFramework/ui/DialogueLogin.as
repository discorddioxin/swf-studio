package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.util.UrlUtil;
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.events.MouseEvent;
   
   public class DialogueLogin extends Dialogue
   {
      
      protected var LoginBtn:Class = DialogueLogin_LoginBtn;
      
      protected var login:DisplayObject = null;
      
      protected var btn:DisplayObject = null;
      
      protected var LoginPrompt:Class = DialogueLogin_LoginPrompt;
      
      public function DialogueLogin()
      {
         super();
         stop();
      }
      
      private function loginClicked(param1:MouseEvent) : void
      {
         UrlUtil.navigateToLogin();
      }
      
      override protected function drawUI() : void
      {
         dialogHolder = new Sprite();
         addChild(dialogHolder);
         login = new LoginPrompt();
         dialogHolder.addChild(login);
         btn = new LoginBtn();
         btn.x = (login.width - btn.width) / 2;
         btn.y = 140;
         addChildToDialog(btn);
         btn.addEventListener(MouseEvent.CLICK,loginClicked);
         super.setEnterClickedFunction(loginClicked);
      }
   }
}

