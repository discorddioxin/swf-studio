package com.gaiaonline.gameFramework.sound
{
   public interface ISoundController
   {
      
      function turnOnSound() : void;
      
      function muteSound() : void;
      
      function playMusic(param1:String, ... rest) : void;
      
      function turnOnMusic() : void;
      
      function stopMusic() : void;
      
      function playSound(param1:String, ... rest) : void;
      
      function muteMusic() : void;
   }
}

