package com.gaiaonline.games.tiles
{
   import com.gaiaonline.gameFramework.sound.ISoundController;
   
   public class GlobalGameEvents
   {
      
      private static var s_instance:GlobalGameEvents;
      
      private static var s_tunes:Array = ["musicFantasyland","musicHappyTrails"];
      
      private static const s_cardSounds:Array = ["cardSelect0","cardSelect1","cardSelect2","cardSelect3"];
      
      private var _lastMouseOverSound:Date = new Date();
      
      private var _controller:ISoundController = null;
      
      public function GlobalGameEvents(h:CONSTRUCTOR_HIDER)
      {
         super();
      }
      
      public static function inst() : GlobalGameEvents
      {
         if(!s_instance)
         {
            s_instance = new GlobalGameEvents(new CONSTRUCTOR_HIDER());
         }
         return s_instance;
      }
      
      public function nextLevel() : void
      {
         _controller.playSound("longFlourish");
      }
      
      public function UIClick() : void
      {
         _controller.playSound("pop");
      }
      
      public function grantedTickets() : void
      {
         _controller.playSound("highlight");
         _controller.stopMusic();
      }
      
      public function gameOver() : void
      {
         _controller.stopMusic();
         _controller.playSound("gameOver");
      }
      
      public function firework() : void
      {
         _controller.playSound("firecracker");
      }
      
      private function cueSong() : void
      {
         _controller.stopMusic();
         _controller.playMusic(s_tunes[0]);
         s_tunes.push(s_tunes.shift());
      }
      
      public function setSoundController(controller:ISoundController) : void
      {
         _controller = controller;
      }
      
      public function cardSelect(length:uint, growing:Boolean, target:int = -1) : void
      {
         var progress:int = 0;
         if(!growing)
         {
            _controller.playSound("pop");
         }
         else if(length == target)
         {
            _controller.playSound("highlight");
         }
         else
         {
            progress = Math.min(s_cardSounds.length - 1,Math.max(0,Number(length / target) * s_cardSounds.length - 1));
            _controller.playSound(s_cardSounds[progress]);
         }
      }
      
      public function newBoard() : void
      {
         cueSong();
      }
      
      public function itemGranted() : void
      {
         _controller.playSound("itemGrant");
      }
      
      public function mouseOverCard() : void
      {
         var now:Date = new Date();
         if(now.time - _lastMouseOverSound.time > 100)
         {
            _controller.playSound("click");
            _lastMouseOverSound = now;
         }
      }
      
      public function removingCard() : void
      {
         _controller.playSound("pop");
      }
      
      public function gambling() : void
      {
         cueTensionSong();
      }
      
      private function cueTensionSong() : void
      {
         _controller.stopMusic();
         _controller.playMusic("musicTension");
      }
      
      public function destroyingCard() : void
      {
         _controller.playSound("torch");
      }
      
      public function warning() : void
      {
         _controller.playSound("warning");
      }
      
      public function levelDefeated() : void
      {
         _controller.stopMusic();
         _controller.playSound("endOfLevel");
      }
      
      public function abortAll() : void
      {
         _controller.stopMusic();
      }
   }
}

final class CONSTRUCTOR_HIDER
{
   
   public function CONSTRUCTOR_HIDER()
   {
      super();
   }
}
