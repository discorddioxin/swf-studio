package hObjects
{
   import com.gaiaworld.pets.model.PetModel;
   import com.gaiaworld.room.constants.MapConstants;
   import com.gaiaworld.room.controller.RoomController;
   import com.gaiaworld.room.interfaces.ISurfaceObject;
   import com.gaiaworld.room.view.WorldItem2;
   import com.gaiaworld.sushi.controller.ChatController;
   import flash.display.SimpleButton;
   import flash.events.MouseEvent;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol11")]
   public class RacePortKey extends WorldItem2 implements ISurfaceObject
   {
      
      public var btnGo:SimpleButton;
      
      private var roomController:RoomController = new RoomController();
      
      private var petModel:PetModel = PetModel.getInstance();
      
      private var chatController:ChatController = new ChatController();
      
      public function RacePortKey()
      {
         super();
         this.addEventListener(MouseEvent.MOUSE_DOWN,this.gotoRace);
         this.useHandCursor = true;
         this.buttonMode = true;
      }
      
      private function gotoRace(param1:MouseEvent) : void
      {
         if(this.petModel.myPet == null)
         {
            this.chatController.noteToSelf("You must have a pet with you to play this game!");
         }
         else
         {
            this.roomController.changeRoom(MapConstants.BGAMBINO_MARKET);
         }
      }
      
      override public function get depth2() : Number
      {
         return 100000;
      }
   }
}

