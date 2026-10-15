package com.gaiaonline.gameFramework.sound
{
   import flash.display.*;
   import flash.events.*;
   import flash.media.*;
   import flash.text.*;
   import flash.utils.*;
   
   public class SoundController extends Sprite implements ISoundController
   {
      
      private var soundSoundTransform:SoundTransform = null;
      
      private var musicChannel:SoundChannel = null;
      
      private var soundChannel:SoundChannel = null;
      
      private var soundLoopChannel:SoundChannel = null;
      
      private var musicSoundTransform:SoundTransform = null;
      
      public function SoundController()
      {
         super();
         musicSoundTransform = new SoundTransform();
         soundSoundTransform = new SoundTransform();
         if(parent == stage && stage != null)
         {
            playMusic("music");
         }
      }
      
      private function setSoundTransform() : void
      {
         if(soundChannel)
         {
            soundChannel.soundTransform = soundSoundTransform;
         }
         if(soundLoopChannel)
         {
            soundLoopChannel.soundTransform = soundSoundTransform;
         }
      }
      
      public function playSound(param1:String, ... rest) : void
      {
         var classRef:Class = null;
         var sound:Sound = null;
         var soundName:String = param1;
         var args:Array = rest;
         try
         {
            classRef = getDefinitionByName(soundName) as Class;
            if(classRef)
            {
               sound = new classRef();
               soundChannel = sound.play(0,0,soundSoundTransform);
            }
         }
         catch(e:Error)
         {
            trace("SoundController ERROR: " + e.toString());
         }
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[SoundController]" + param1);
      }
      
      public function stopMusic() : void
      {
         if(musicChannel != null)
         {
            musicChannel.stop();
         }
      }
      
      public function turnOnMusic() : void
      {
         musicSoundTransform.volume = 1;
         setMusicTransform();
      }
      
      public function playMusic(param1:String, ... rest) : void
      {
         var classRef:Class = null;
         var sound:Sound = null;
         var soundName:String = param1;
         var args:Array = rest;
         try
         {
            classRef = getDefinitionByName(soundName) as Class;
            if(classRef)
            {
               sound = new classRef();
               musicChannel = sound.play(0,999,musicSoundTransform);
            }
         }
         catch(e:Error)
         {
            trace("SoundController ERROR: " + e.toString());
         }
      }
      
      public function stopSoundLoop() : void
      {
         if(soundLoopChannel != null)
         {
            soundLoopChannel.stop();
         }
      }
      
      public function muteSound() : void
      {
         soundSoundTransform.volume = 0;
         setSoundTransform();
      }
      
      public function playSoundLoop(param1:String, ... rest) : void
      {
         var classRef:Class = null;
         var sound:Sound = null;
         var soundName:String = param1;
         var args:Array = rest;
         try
         {
            classRef = getDefinitionByName(soundName) as Class;
            if(classRef)
            {
               sound = new classRef();
               soundLoopChannel = sound.play(0,999,soundSoundTransform);
            }
         }
         catch(e:Error)
         {
            trace("SoundController ERROR: " + e.toString());
         }
      }
      
      public function turnOnSound() : void
      {
         soundSoundTransform.volume = 1;
         setSoundTransform();
      }
      
      public function muteMusic() : void
      {
         musicSoundTransform.volume = 0;
         setMusicTransform();
      }
      
      private function setMusicTransform() : void
      {
         if(musicChannel)
         {
            musicChannel.soundTransform = musicSoundTransform;
         }
      }
   }
}

