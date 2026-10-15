package com.gaiaworld.global.controller
{
   import com.gaiaworld.global.model.MessageModel;
   
   public class MessageController
   {
      
      private var messageModel:MessageModel = MessageModel.getInstance();
      
      public function MessageController()
      {
         super();
      }
      
      public function setMessage(param1:String, param2:Boolean = true, param3:Number = 16) : *
      {
         this.messageModel.showCloseButton = param2;
         this.messageModel.fontSize = param3;
         this.messageModel.message = param1;
      }
      
      public function setPhoneMessage(param1:String) : void
      {
         this.messageModel.phoneMessage = param1;
      }
   }
}

