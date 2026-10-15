package com.gaiaonline.gameFramework.ui
{
   public class DialogueRoomBase extends Dialogue
   {
      
      protected var passwordRequired:Boolean = false;
      
      protected var password:String = null;
      
      public function DialogueRoomBase()
      {
         super();
      }
      
      public function getPassword() : String
      {
         return password;
      }
      
      public function getChosenRoom() : Object
      {
         return null;
      }
      
      public function isPasswordRequired() : Boolean
      {
         return passwordRequired;
      }
   }
}

