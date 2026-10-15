package com.gaiaworld.global.view
{
   import com.gaiaworld.global.constants.GlobalConstants;
   import com.gaiaworld.global.model.GlobalModel;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.Event;
   
   public class NightLight extends Sprite
   {
      
      public var corona:MovieClip;
      
      public var halo:MovieClip;
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      public function NightLight()
      {
         super();
         this.globalModel.addEventListener(GlobalConstants.TIME_OF_DAY_CHANGE,this.timeOfDayChange);
      }
      
      private function timeOfDayChange(param1:Event) : void
      {
         if(this.globalModel.isDayTime == true)
         {
            this.visible = false;
         }
         else
         {
            this.visible = true;
         }
      }
   }
}

