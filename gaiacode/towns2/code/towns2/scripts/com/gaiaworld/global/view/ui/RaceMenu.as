package com.gaiaworld.global.view.ui
{
   import com.gaiaworld.room.constants.MapConstants;
   import com.gaiaworld.room.controller.RoomController;
   import com.gaiaworld.user.model.UserModel;
   import flash.display.MovieClip;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.events.MouseEvent;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol854")]
   public class RaceMenu extends Sprite
   {
      
      public var bg:MovieClip;
      
      public var btnPractice:SimpleButton;
      
      private var roomController:RoomController = new RoomController();
      
      private var userModel:UserModel = UserModel.getInstance();
      
      public function RaceMenu()
      {
         super();
         this.btnPractice.addEventListener(MouseEvent.MOUSE_DOWN,this.practiceRace);
      }
      
      private function practiceRace(param1:MouseEvent) : void
      {
         this.roomController.setSpecialRoomSub(this.userModel.userVo.userName);
         this.roomController.changeRoom(MapConstants.RALLY_GAME);
      }
   }
}

