package com.gaiaworld.avatar.util
{
   import com.gaiaworld.avatar.constants.AvatarConstants;
   import com.gaiaworld.avatar.controller.events.AvatarMoveEvent;
   import com.gaiaworld.avatar.model.AvatarModel;
   import com.gaiaworld.sushi.constants.ChatConstants;
   import com.gaiaworld.sushi.controller.ChatController;
   import com.gaiaworld.sushi.model.ChatModel;
   import com.gaiaworld.user.model.UserModel;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.TimerEvent;
   import flash.utils.Timer;
   
   public class AFK extends EventDispatcher
   {
      
      private var chatModel:ChatModel = ChatModel.getInstance();
      
      private var chatController:ChatController = new ChatController();
      
      private var avatarModel:AvatarModel = AvatarModel.getInstance();
      
      private var userModel:UserModel = UserModel.getInstance();
      
      private var afk:Boolean = false;
      
      private var afkTimer:Timer = new Timer(60000);
      
      public function AFK()
      {
         super();
         this.afkTimer.addEventListener(TimerEvent.TIMER,this.showAfk);
         this.avatarModel.avatar.clip.addEventListener(AvatarMoveEvent.AVATAR_IS_MOVING,this.resetTimer);
         this.avatarModel.addEventListener(AvatarConstants.KEY_IS_PRESSED,this.resetTimer);
         this.chatModel.addEventListener(ChatConstants.SEND_USER_CHAT,this.resetTimer);
         this.afkTimer.start();
      }
      
      private function showAfk(param1:TimerEvent) : void
      {
         this.chatController.sendUserMessage(ChatConstants.AWAY_FROM_KEYBOARD,this.userModel.userVo);
      }
      
      private function resetTimer(param1:Event) : *
      {
         this.afkTimer.stop();
         this.afkTimer.reset();
         this.afkTimer.start();
      }
   }
}

