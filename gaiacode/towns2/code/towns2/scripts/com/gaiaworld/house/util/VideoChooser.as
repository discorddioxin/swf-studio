package com.gaiaworld.house.util
{
   public class VideoChooser
   {
      
      private var videoArray:Array;
      
      public function VideoChooser()
      {
         super();
         this.videoArray = ["Omnidrink","Safety1","Safety2","7anniversary","Safety3"];
      }
      
      public function getVideo() : String
      {
         var _loc1_:Number = this.videoArray.length;
         var _loc2_:Number = int(Math.random() * _loc1_);
         return "media/" + this.videoArray[_loc2_] + ".flv";
      }
   }
}

