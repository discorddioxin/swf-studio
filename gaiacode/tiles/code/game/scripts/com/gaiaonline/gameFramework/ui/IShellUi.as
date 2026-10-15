package com.gaiaonline.gameFramework.ui
{
   public interface IShellUi
   {
      
      function createStandardDialogue(param1:String, param2:String, param3:Object = null) : void;
      
      function createDialogueCaptcha() : void;
   }
}

