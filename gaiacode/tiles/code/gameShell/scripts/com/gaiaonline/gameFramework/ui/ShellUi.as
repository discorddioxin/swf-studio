package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.events.CaptchaEvent;
   import flash.display.MovieClip;
   import flash.events.*;
   import flash.text.*;
   import flash.utils.*;
   
   public class ShellUi extends MovieClip implements IShellUi
   {
      
      public var cb:MovieClip;
      
      private var testTimer:Timer;
      
      private var myTimer:Timer;
      
      private var noFurtherDialogues:Boolean = false;
      
      public function ShellUi()
      {
         super();
         dTrace("constructor");
         if(parent == stage && stage != null)
         {
            createDialogue({
               "title":"DEBUG",
               "msg":"test message"
            });
         }
      }
      
      public function createIgnoreUserDialogue(param1:Object) : DialogueIgnoreUser
      {
         var _loc2_:DialogueIgnoreUser = null;
         dTrace("createReportAbuseDialogue");
         if(!noFurtherDialogues)
         {
            if(param1.noFurtherDialogues)
            {
               noFurtherDialogues = true;
            }
            _loc2_ = new DialogueIgnoreUser();
            addChild(_loc2_);
            _loc2_.setDialogue(param1);
            _loc2_.init();
            _loc2_.addEventListener("DIALOGUE_CLEARED",onDialogueCleared);
            return _loc2_;
         }
         return null;
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[ShellUi]" + param1);
      }
      
      public function createReportAbuseDialogue(param1:Object) : DialogueReportAbuse
      {
         var _loc2_:DialogueReportAbuse = null;
         if(!noFurtherDialogues)
         {
            dTrace("createReportAbuseDialogue");
            if(param1.noFurtherDialogues)
            {
               noFurtherDialogues = true;
            }
            _loc2_ = new DialogueReportAbuse();
            this.addChild(_loc2_);
            _loc2_.setDialogue(param1);
            _loc2_.addEventListener("DIALOGUE_CLEARED",onDialogueCleared);
            _loc2_.init();
            return _loc2_;
         }
         return null;
      }
      
      public function createDialogueCaptcha() : void
      {
         var _loc1_:Dialogue = new DialogueCaptcha();
         this.addChild(_loc1_);
         _loc1_.addEventListener(CaptchaEvent.SUBMIT,relayCaptchaEvent,false,0,true);
         _loc1_.addEventListener(CaptchaEvent.ERROR,relayCaptchaEvent,false,0,true);
         _loc1_.init();
      }
      
      private function relayCaptchaEvent(param1:CaptchaEvent) : void
      {
         dispatchEvent(new CaptchaEvent(param1.type,param1.data));
      }
      
      public function createDialogueCreateRoom(param1:Object) : DialogueCreateRoom
      {
         param1.shellUi = this;
         var _loc2_:DialogueCreateRoom = new DialogueCreateRoom(param1);
         addChild(_loc2_);
         _loc2_.init();
         return _loc2_;
      }
      
      public function createDialogueChooseRoom(param1:Object) : DialogueChooseRoom
      {
         param1.shellUi = this;
         var _loc2_:DialogueChooseRoom = new DialogueChooseRoom(param1);
         addChild(_loc2_);
         _loc2_.init();
         return _loc2_;
      }
      
      public function createStandardDialogue(param1:String, param2:String, param3:Object = null) : void
      {
         if(!param3)
         {
            param3 = {};
         }
         param3.title = param1;
         param3.msg = param2;
         createDialogue(param3);
      }
      
      public function createDialogue(param1:Object) : DialogueGeneral
      {
         var _loc2_:DialogueGeneral = null;
         if(!noFurtherDialogues)
         {
            dTrace("createDialogue");
            if(param1.noFurtherDialogues)
            {
               noFurtherDialogues = true;
            }
            _loc2_ = new DialogueGeneral();
            addChild(_loc2_);
            _loc2_.setDialogue(param1);
            _loc2_.addEventListener("DIALOGUE_CLEARED",onDialogueCleared);
            return _loc2_;
         }
         return null;
      }
      
      public function createDialogueLogin() : DialogueLogin
      {
         var _loc1_:DialogueLogin = new DialogueLogin();
         addChild(_loc1_);
         _loc1_.init();
         return _loc1_;
      }
      
      public function createDialogueEnterPassword(param1:Object) : DialogueEnterPassword
      {
         var _loc2_:DialogueEnterPassword = new DialogueEnterPassword(param1);
         addChild(_loc2_);
         _loc2_.init();
         return _loc2_;
      }
      
      public function createDialogueInviteFriend(param1:Object) : DialogueInviteFriend
      {
         var _loc2_:DialogueInviteFriend = null;
         dTrace("createReportAbuseDialogue");
         if(!noFurtherDialogues)
         {
            if(param1.noFurtherDialogues)
            {
               noFurtherDialogues = true;
            }
            _loc2_ = new DialogueInviteFriend();
            addChild(_loc2_);
            _loc2_.setDialogue(param1);
            _loc2_.init();
            _loc2_.addEventListener("DIALOGUE_CLEARED",onDialogueCleared);
            return _loc2_;
         }
         return null;
      }
      
      private function onDialogueCleared(param1:Event) : void
      {
         var _loc2_:Dialogue = param1.target as Dialogue;
         dTrace("dialogue:" + _loc2_);
         dTrace("onDialogueCleared");
      }
      
      public function createDialogueChooseServer(param1:Object) : DialogueChooseServer
      {
         var _loc2_:DialogueChooseServer = new DialogueChooseServer(param1);
         addChild(_loc2_);
         _loc2_.init();
         return _loc2_;
      }
   }
}

