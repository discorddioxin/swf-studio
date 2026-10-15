package com.gaiaonline.gameFramework.sound
{
   public interface ISoundController
   {
      
      function playMusic(param1:String, ... rest) : void;
      
      function turnOnSound() : void;
      
      function muteSound() : void;
      
      function stopSoundLoop() : void;
      
      function turnOnMusic() : void;
      
      function stopMusic() : void;
      
      function playSound(param1:String, ... rest) : void;
      
      function muteMusic() : void;
      
      function playSoundLoop(param1:String, ... rest) : void;
   }
}

