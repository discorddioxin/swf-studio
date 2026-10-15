package com.gaiaworld.sushi.controller
{
   import com.gaiaworld.global.vo.ColorVo;
   import com.gaiaworld.sushi.controller.events.ChatEvent;
   import com.gaiaworld.sushi.model.ChatModel;
   import com.gaiaworld.user.vo.UserVo;
   
   public class ChatController
   {
      
      private var chatModel:ChatModel = ChatModel.getInstance();
      
      public function ChatController()
      {
         super();
      }
      
      public function setSid(param1:String) : *
      {
         this.chatModel.sid = param1;
      }
      
      public function setGaiaId(param1:Number) : *
      {
         this.chatModel.gaia_id = param1;
      }
      
      public function setServers(param1:Array) : *
      {
         this.chatModel.setServers(param1);
      }
      
      public function setRooms(param1:Array) : *
      {
         this.chatModel.setRooms(param1);
      }
      
      public function setNewEvent(param1:ChatEvent) : *
      {
         this.chatModel.newEventReceived(param1);
      }
      
      public function noteToSelf(param1:String) : *
      {
         this.chatModel.noteToSelf(param1);
      }
      
      public function sendChat(param1:String) : *
      {
         this.chatModel.chatMessage = param1;
      }
      
      public function sendEmote(param1:Array) : *
      {
         this.chatModel.emote = param1;
      }
      
      public function emoteToSelf(param1:*) : *
      {
         this.chatModel.sendEmoteToSelf(param1);
      }
      
      public function disconnect() : *
      {
         this.chatModel.disconnect();
      }
      
      public function friendRequestRec(param1:Number) : *
      {
         this.chatModel.gotFriendRequest(param1);
      }
      
      public function sendFriendReq() : *
      {
         this.chatModel.sendFriendReq();
      }
      
      public function sendPrivateMessage(param1:String) : *
      {
         this.chatModel.privateMessage = param1;
      }
      
      public function setContacted(param1:UserVo) : *
      {
         this.chatModel.otherContacted = param1;
      }
      
      public function setSelected(param1:UserVo) : *
      {
         this.chatModel.otherSelected = param1;
      }
      
      public function ignoreConfirmed() : *
      {
         this.chatModel.ignore();
      }
      
      public function unignoreConfirmed() : *
      {
         this.chatModel.unignore();
      }
      
      public function showIgnoreDialog() : *
      {
         this.chatModel.showIgnoreDialog();
      }
      
      public function showUnignoreDialog() : *
      {
         this.chatModel.showUnignoreDialog();
      }
      
      public function addColor(param1:ColorVo) : void
      {
         this.chatModel.addColor(param1);
      }
      
      public function colorsReady() : *
      {
         this.chatModel.colorsReady();
      }
      
      public function setPrefix(param1:String) : void
      {
         this.chatModel.areaPrefix = param1;
      }
      
      public function setAutoFind(param1:Boolean) : *
      {
         this.chatModel.autoFind = param1;
      }
      
      public function selectedRoom(param1:Number) : *
      {
         this.chatModel.selectedRoom(param1);
      }
      
      public function createRoom(param1:String) : void
      {
         this.chatModel.createRoom(param1);
      }
      
      public function roomIsChanged() : void
      {
         this.chatModel.roomIsChanged();
      }
   }
}

