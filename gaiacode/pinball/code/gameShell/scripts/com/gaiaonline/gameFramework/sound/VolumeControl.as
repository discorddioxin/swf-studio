package com.gaiaonline.gameFramework.sound
{
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   
   public class VolumeControl extends Sprite
   {
      
      public static const MUSIC_OFF_EVENT:String = "MUSIC_OFF";
      
      public static const MUSIC_ON_EVENT:String = "MUSIC_ON";
      
      public static const SOUND_OFF_EVENT:String = "SOUND_OFF";
      
      public static const SOUND_ON_EVENT:String = "SOUND_ON";
      
      public var SoundIconOff:Class = VolumeControl_SoundIconOff;
      
      private var musicActive:Boolean = true;
      
      public var MusicIconOn:Class = VolumeControl_MusicIconOn;
      
      public var SoundIconOn:Class = VolumeControl_SoundIconOn;
      
      private var soundIcon:Sprite = null;
      
      public var MusicIconOff:Class = VolumeControl_MusicIconOff;
      
      private var soundActive:Boolean = true;
      
      private var musicIcon:DisplayObject = null;
      
      public function VolumeControl()
      {
         super();
         drawUI();
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[VolumeControl]" + param1);
      }
      
      private function addSoundEventListeners() : void
      {
         addListeners(soundIcon,onSoundClick);
      }
      
      private function replaceSoundIcon(param1:Class) : void
      {
         removeSoundEventListeners();
         if(Boolean(soundIcon) && Boolean(soundIcon.parent))
         {
            removeChild(soundIcon);
         }
         soundIcon = new param1();
         addChild(soundIcon);
         addSoundEventListeners();
      }
      
      private function removeSoundEventListeners() : void
      {
         removeListeners(soundIcon,onSoundClick);
      }
      
      private function drawUI() : void
      {
         replaceSoundIcon(SoundIconOn);
         replaceMusicIcon(MusicIconOn);
      }
      
      private function removeListeners(param1:DisplayObject, param2:Function) : void
      {
         if(param1)
         {
            param1.removeEventListener(MouseEvent.CLICK,param2);
         }
      }
      
      public function setVolume(param1:int) : void
      {
      }
      
      private function addListeners(param1:DisplayObject, param2:Function) : void
      {
         if(param1)
         {
            param1.addEventListener(MouseEvent.CLICK,param2,false,0,true);
         }
      }
      
      private function removeMusicEventListeners() : void
      {
         removeListeners(musicIcon,onMusicClick);
      }
      
      private function onMusicClick(param1:Event) : void
      {
         if(musicActive)
         {
            replaceMusicIcon(MusicIconOff);
            dispatchEvent(new Event(MUSIC_OFF_EVENT));
         }
         else
         {
            replaceMusicIcon(MusicIconOn);
            dispatchEvent(new Event(MUSIC_ON_EVENT));
         }
         musicActive = !musicActive;
      }
      
      private function addMusicEventListeners() : void
      {
         addListeners(musicIcon,onMusicClick);
      }
      
      private function onSoundClick(param1:Event) : void
      {
         if(soundActive)
         {
            replaceSoundIcon(SoundIconOff);
            dispatchEvent(new Event(SOUND_OFF_EVENT));
         }
         else
         {
            replaceSoundIcon(SoundIconOn);
            dispatchEvent(new Event(SOUND_ON_EVENT));
         }
         soundActive = !soundActive;
      }
      
      private function replaceMusicIcon(param1:Class) : void
      {
         removeMusicEventListeners();
         if(Boolean(musicIcon) && Boolean(musicIcon.parent))
         {
            removeChild(musicIcon);
         }
         musicIcon = new param1();
         addChild(musicIcon);
         musicIcon.x = soundIcon.width + 5;
         addMusicEventListeners();
      }
   }
}

