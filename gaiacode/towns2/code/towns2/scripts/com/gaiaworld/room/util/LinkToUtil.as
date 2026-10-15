package com.gaiaworld.room.util
{
   import com.gaiaworld.avatar.controller.AvatarController;
   import com.gaiaworld.global.controller.MessageController;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.gobjects.model.ObjectModel;
   import com.gaiaworld.room.controller.GpsController;
   import com.gaiaworld.room.controller.RoomController;
   import com.gaiaworld.room.model.GpsModel;
   import com.gaiaworld.sushi.controller.ChatController;
   import com.gaiaworld.sushi.model.ChatModel;
   import com.gaiaworld.towns.hood.controller.HoodController;
   import com.gaiaworld.towns.hood.model.HoodModel;
   import com.gaiaworld.towns.hood.util.DirectToHood;
   import com.gaiaworld.towns.hood.util.DirectToHouse;
   import flash.events.EventDispatcher;
   import flash.system.System;
   
   public class LinkToUtil extends EventDispatcher
   {
      
      private var chatModel:ChatModel = ChatModel.getInstance();
      
      private var gpsModel:GpsModel = GpsModel.getInstance();
      
      private var gpsController:GpsController = new GpsController();
      
      private var roomController:RoomController = new RoomController();
      
      private var chatController:ChatController = new ChatController();
      
      private var objectModel:ObjectModel = ObjectModel.getInstance();
      
      private var hoodModel:HoodModel = HoodModel.getInstance();
      
      private var roomInstance:String;
      
      private var avatarController:AvatarController = new AvatarController();
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      private var hoodController:HoodController = new HoodController();
      
      private var messageController:MessageController = new MessageController();
      
      public function LinkToUtil()
      {
         super();
      }
      
      public function getLink() : *
      {
         var _loc1_:String = "";
         _loc1_ += this.globalModel.gsiSubdomain + ".gaiaonline.com/launch/towns2";
         _loc1_ += "?action=link&ip=" + this.chatModel.ip + "&port=" + this.chatModel.port;
         _loc1_ += "&room=" + this.chatModel.currentRoom;
         System.setClipboard(_loc1_);
         this.messageController.setMessage("Send this link to friends to meet up<br> This link has already been copied to your clipboard:<br>" + _loc1_,true);
      }
      
      public function goLink(param1:String) : void
      {
         var _loc4_:String = null;
         var _loc5_:DirectToHood = null;
         var _loc6_:DirectToHouse = null;
         this.roomInstance = param1;
         var _loc2_:Array = this.roomInstance.split("_");
         var _loc3_:Number = Number(_loc2_[0]);
         if(isNaN(_loc3_))
         {
            _loc4_ = _loc2_[0];
            if(_loc4_ == "vh" || _loc4_ == "Rally")
            {
               _loc4_ = param1;
            }
         }
         else
         {
            _loc4_ = this.gpsModel.getRoomName(_loc3_);
         }
         switch(_loc4_)
         {
            case "houseArea":
               this.avatarController.setAtStartAfterJump(true);
               _loc5_ = new DirectToHood();
               _loc5_.gotoHood(Number(_loc2_[2]),Number(_loc2_[1]));
               return;
            case "house":
               this.avatarController.setAtStartAfterJump(true);
               _loc6_ = new DirectToHouse();
               _loc6_.gotDirectlyToHouse(Number(_loc2_[1]));
               return;
            default:
               this.avatarController.setAtStartAfterJump(true);
               this.roomController.setRoomInstance(param1);
               this.roomController.changeRoom(_loc4_);
               return;
         }
      }
   }
}

