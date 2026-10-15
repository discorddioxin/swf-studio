package hObjects
{
   import com.gaiaworld.avatar.model.AvatarModel;
   import com.gaiaworld.avatar.view.WorldItem;
   import com.gaiaworld.room.constants.MapConstants;
   import com.gaiaworld.room.controller.RoomController;
   import com.gaiaworld.room.interfaces.ISurfaceObject;
   import com.gaiaworld.room.interfaces.IWorldItem;
   import com.gaiaworld.sushi.controller.ChatController;
   import flash.events.Event;
   import flash.events.MouseEvent;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol14")]
   public class PaintBallPortKey extends WorldItem implements ISurfaceObject, IWorldItem
   {
      
      private var avatarModel:AvatarModel = AvatarModel.getInstance();
      
      private var chatController:ChatController = new ChatController();
      
      private var roomController:RoomController = new RoomController();
      
      public function PaintBallPortKey()
      {
         super();
         this.addEventListener(MouseEvent.MOUSE_DOWN,this.gotoPaintball);
         this.useHandCursor = true;
         this.buttonMode = true;
      }
      
      private function gotoPaintball(param1:Event) : *
      {
         if(isNaN(this.avatarModel.avatar.dataProvider.team))
         {
            this.chatController.noteToSelf("Event not active");
            return;
         }
         this.roomController.changeRoom(MapConstants.PAINTBALL_ROOM);
      }
   }
}

