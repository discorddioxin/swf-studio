package com.gaiaworld.room.view
{
   import com.gaiaworld.ads.controller.MsController;
   import com.gaiaworld.avatar.controller.AvatarController;
   import com.gaiaworld.global.controller.GlobalController;
   import com.gaiaworld.gobjects.controller.ObjectController;
   import com.gaiaworld.room.controller.GpsController;
   import com.gaiaworld.room.controller.RoomController;
   import flash.display.Sprite;
   
   public class BaseMap extends Sprite
   {
      
      protected var globalController:GlobalController = new GlobalController();
      
      protected var avatarController:AvatarController = new AvatarController();
      
      protected var roomController:RoomController = new RoomController();
      
      protected var gpsController:GpsController = new GpsController();
      
      protected var objectController:ObjectController = new ObjectController();
      
      protected var msController:MsController = new MsController();
      
      protected var directionArray:Array;
      
      public function BaseMap()
      {
         super();
         this.avatarController.setUserControl(true);
      }
      
      public function destroy() : *
      {
      }
   }
}

