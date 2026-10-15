package com.gaiaworld.global.view
{
   import com.gaiaonline.display.wordbubble.WordBubbleManager;
   import com.gaiaworld.avatar.interfaces.IAvatar;
   import com.gaiaworld.avatar.model.AvatarModel;
   import com.gaiaworld.avatar.model.OthersModel;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.house.controller.DebugController;
   import com.gaiaworld.sushi.constants.ChatConstants;
   import com.gaiaworld.sushi.controller.events.ChatEvent;
   import com.gaiaworld.sushi.model.ChatModel;
   import com.gaiaworld.user.model.UserModel;
   import flash.display.Sprite;
   import flash.events.Event;
   
   public class ChatLayer extends Sprite
   {
      
      private var chatModel:ChatModel = ChatModel.getInstance();
      
      private var userModel:UserModel = UserModel.getInstance();
      
      private var avatarModel:AvatarModel = AvatarModel.getInstance();
      
      private var othersModel:OthersModel = OthersModel.getInstance();
      
      private var debugController:DebugController = new DebugController();
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      private var bubbleBox:Sprite = new Sprite();
      
      private var wordBubbleManager:WordBubbleManager;
      
      public function ChatLayer(param1:Sprite)
      {
         super();
         this.addChild(this.bubbleBox);
         this.wordBubbleManager = new WordBubbleManager(this.bubbleBox);
         this.chatModel.addEventListener(ChatEvent.CHAT_MESSAGE_RECEIVED,this.newMessage);
         this.chatModel.addEventListener(ChatConstants.NOTE_TO_SELF,this.noteToSelf);
         this.chatModel.addEventListener(ChatConstants.SHOW_BALLOONS_CHANGED,this.chatOptChanged);
      }
      
      private function newMessage(param1:ChatEvent) : *
      {
         var _loc2_:IAvatar = null;
         if(this.globalModel.isInSittingGame == false)
         {
            try
            {
               if(this.userModel.userID == param1.userVo.gaia_id)
               {
                  _loc2_ = this.avatarModel.avatar;
               }
               else
               {
                  _loc2_ = this.othersModel.getAvatar(param1.userVo);
               }
               if(_loc2_.clip.visible == true || this.userModel.userVo.user_level > 50)
               {
                  this.wordBubbleManager.addText(param1.userVo.userName,param1.param,_loc2_.clip);
               }
            }
            catch(e2:Error)
            {
            }
         }
      }
      
      private function chatOptChanged(param1:Event) : *
      {
         this.visible = this.chatModel.canShowBalloons;
      }
      
      private function noteToSelf(param1:Event) : *
      {
         var _loc2_:Sprite = this.avatarModel.avatar as Sprite;
         this.wordBubbleManager.addText(this.userModel.userVo.userName,this.chatModel.selfMessage,_loc2_);
      }
   }
}

