package com.gaiaworld.towns.olympics.view
{
   import com.gaiaworld.avatar.interfaces.IAvatar;
   import com.gaiaworld.avatar.view.WorldItem;
   import com.gaiaworld.room.interfaces.ISurfaceObject;
   import com.gaiaworld.room.interfaces.IWorldItem;
   import flash.display.MovieClip;
   import flash.events.TimerEvent;
   import flash.geom.ColorTransform;
   import flash.media.Sound;
   import flash.utils.Timer;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol304")]
   public class Splat extends WorldItem implements ISurfaceObject, IWorldItem
   {
      
      public var splats:MovieClip;
      
      private var colorArray:Array = [0,0,15249156,11673896,1471131];
      
      private var dryTimer:Timer = new Timer(600);
      
      private var av:IAvatar;
      
      public function Splat(param1:IAvatar)
      {
         super();
         this.av = param1;
         this.rotation = int(Math.random() * 360);
         MovieClip(this.splats).gotoAndStop(int(Math.random() * 4) + 1);
         this.dryTimer.addEventListener(TimerEvent.TIMER,this.dry,false,0,true);
         this.dryTimer.start();
         var _loc2_:Sound = new SplatSound();
         _loc2_.play();
      }
      
      public function setColor(param1:Number) : void
      {
         var _loc2_:ColorTransform = MovieClip(this.splats.splat).transform.colorTransform;
         _loc2_.color = this.colorArray[param1];
         MovieClip(this.splats.splat).transform.colorTransform = _loc2_;
      }
      
      private function dry(param1:TimerEvent) : *
      {
         this.scaleX -= 0.1;
         this.scaleY -= 0.1;
         this.y += 8;
         if(this.scaleX < 0.01)
         {
            this.dryTimer.stop();
            this.dryTimer.removeEventListener(TimerEvent.TIMER,this.dry);
            this.av.removeItem(this);
         }
      }
   }
}

