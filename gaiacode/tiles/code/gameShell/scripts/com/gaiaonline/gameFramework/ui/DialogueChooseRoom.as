package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.util.RoomNameUtil;
   import com.gaiaonline.gateway.IGaiaChannel;
   import com.gaiaonline.gateway.IGaiaGateway;
   import com.gaiaonline.gateway.events.GaiaChannelListEvent;
   import fl.controls.DataGrid;
   import fl.controls.ScrollPolicy;
   import fl.data.DataProvider;
   import fl.events.DataChangeType;
   import fl.events.ListEvent;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.text.TextField;
   import flash.text.TextFormat;
   
   public class DialogueChooseRoom extends DialogueRoomBase
   {
      
      public var serverGateway:IGaiaGateway;
      
      public var back_btn:GaiaButton = null;
      
      public var joinRoom_btn:GaiaButton = null;
      
      public var createRoom_btn:GaiaButton = null;
      
      private var shellUi:ShellUi = null;
      
      public var dgStaticRooms:DataGrid = null;
      
      public var dgUserRooms:DataGrid = null;
      
      private var msgTxt:TextField = null;
      
      public function DialogueChooseRoom(param1:Object)
      {
         super();
         shellUi = param1.shellUi;
         serverGateway = param1.serverGateway;
         serverGateway.addEventListener(GaiaChannelListEvent.CHANNEL_LIST,onChannelList);
         serverGateway.addEventListener(Event.CLOSE,this.onServerClose);
         serverGateway.getAllChannels();
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[DialogueChooseRoom]";
         trace(_loc2_ + param1);
      }
      
      public function joinRoomClicked(param1:Event) : void
      {
         var _loc2_:Object = null;
         var _loc3_:DialogueEnterPassword = null;
         passwordRequired = (getChosenRoom() as Object).lockedFlag;
         if((getChosenRoom() as Object).lockedFlag)
         {
            _loc2_ = {
               "title":textContentManager.getText("enterPasswordTitle"),
               "msg":textContentManager.getText("enterPasswordBody")
            };
            _loc3_ = shellUi.createDialogueEnterPassword(_loc2_);
            _loc3_.addEventListener("OK_CLICKED",enterPasswordOkClicked);
         }
         else
         {
            dTrace("joinRoomClicked");
            dispatchEvent(new Event("ROOM_CHOSEN"));
            close();
         }
      }
      
      private function onServerClose(param1:Event) : void
      {
         close();
      }
      
      public function enterPasswordOkClicked(param1:Event) : void
      {
         password = param1.target.getPassword();
         dispatchEvent(new Event("ROOM_CHOSEN"));
         close();
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.width = 677.9;
         dialogBG.height = 496.3;
         titleTxt.text = "CHOOSE A ROOM";
         msgTxt = new TextField();
         msgTxt.defaultTextFormat = new TextFormat(null,14);
         msgTxt.x = 28.7;
         msgTxt.y = 42;
         msgTxt.width = 577.1;
         msgTxt.height = 38.9;
         msgTxt.text = "Select a room and click JOIN. Or make your own by clicking CREATE ROOM";
         addChildToDialog(msgTxt);
         var _loc1_:TextField = new TextField();
         _loc1_.defaultTextFormat = new TextFormat("Arial",12,0,true);
         _loc1_.text = "PERMANENT ROOMS";
         _loc1_.width = 153.1;
         _loc1_.x = 28.7;
         _loc1_.y = 87.8;
         addChildToDialog(_loc1_);
         var _loc2_:TextField = new TextField();
         _loc2_.defaultTextFormat = new TextFormat("Arial",12,0,true);
         _loc2_.text = "USER CREATED ROOMS";
         _loc2_.width = 163.1;
         _loc2_.x = 347.6;
         _loc2_.y = 87.8;
         addChildToDialog(_loc2_);
         dgStaticRooms = new DataGrid();
         dgStaticRooms.x = 29.6;
         dgStaticRooms.y = 106.8;
         dgStaticRooms.width = 294.6;
         dgStaticRooms.height = 316.2;
         dgStaticRooms.allowMultipleSelection = false;
         dgStaticRooms.editable = false;
         dgStaticRooms.headerHeight = 25;
         dgStaticRooms.horizontalLineScrollSize = 4;
         dgStaticRooms.horizontalPageScrollSize = 0;
         dgStaticRooms.horizontalScrollPolicy = ScrollPolicy.OFF;
         dgStaticRooms.resizableColumns = true;
         dgStaticRooms.rowHeight = 20;
         dgStaticRooms.showHeaders = true;
         dgStaticRooms.sortableColumns = true;
         dgStaticRooms.verticalLineScrollSize = 4;
         dgStaticRooms.verticalPageScrollSize = 0;
         dgStaticRooms.verticalScrollPolicy = ScrollPolicy.AUTO;
         dgStaticRooms.width = 294.6;
         dgStaticRooms.height = 316.2;
         dgStaticRooms.x = 29.6;
         dgStaticRooms.y = 106.8;
         addChildToDialog(dgStaticRooms);
         dgUserRooms = new DataGrid();
         dgUserRooms.x = 29.6;
         dgUserRooms.y = 106.8;
         dgUserRooms.width = 294.6;
         dgUserRooms.height = 316.2;
         dgUserRooms.allowMultipleSelection = false;
         dgUserRooms.editable = false;
         dgUserRooms.headerHeight = 25;
         dgUserRooms.horizontalLineScrollSize = 4;
         dgUserRooms.horizontalPageScrollSize = 0;
         dgUserRooms.horizontalScrollPolicy = ScrollPolicy.OFF;
         dgUserRooms.resizableColumns = true;
         dgUserRooms.rowHeight = 20;
         dgUserRooms.showHeaders = true;
         dgUserRooms.sortableColumns = true;
         dgUserRooms.verticalLineScrollSize = 4;
         dgUserRooms.verticalPageScrollSize = 0;
         dgUserRooms.verticalScrollPolicy = ScrollPolicy.AUTO;
         dgUserRooms.width = 294.6;
         dgUserRooms.height = 316.2;
         dgUserRooms.x = 348.8;
         dgUserRooms.y = 106.8;
         addChildToDialog(dgUserRooms);
         back_btn = new GaiaButton(new DialogButtonAsset(),"Back");
         back_btn.x = 141.5;
         back_btn.y = 446.3;
         addChildToDialog(back_btn);
         createRoom_btn = new GaiaButton(new DialogButtonAsset(),"Create Room");
         createRoom_btn.x = 284.5;
         createRoom_btn.y = 446.3;
         addChildToDialog(createRoom_btn);
         joinRoom_btn = new GaiaButton(new DialogButtonAsset(),"Join Room");
         joinRoom_btn.x = 427.6;
         joinRoom_btn.y = 446.3;
         addChildToDialog(joinRoom_btn);
         back_btn.addEventListener(MouseEvent.CLICK,onBackClicked);
         joinRoom_btn.addEventListener(MouseEvent.CLICK,joinRoomClicked);
         createRoom_btn.addEventListener(MouseEvent.CLICK,createRoomClicked);
      }
      
      public function onBackClicked(param1:Event) : void
      {
         dTrace("onBackClicked");
         dispatchEvent(new Event("ROOM_CHOICE_BACK"));
         close();
      }
      
      private function onChannelList(param1:GaiaChannelListEvent) : void
      {
         var _loc5_:IGaiaChannel = null;
         var _loc6_:Boolean = false;
         var _loc7_:String = null;
         var _loc8_:String = null;
         var _loc9_:Boolean = false;
         var _loc10_:DataProvider = null;
         var _loc11_:* = undefined;
         var _loc12_:String = null;
         var _loc2_:DataProvider = new DataProvider();
         var _loc3_:DataProvider = new DataProvider();
         var _loc4_:Array = param1.channels;
         for each(_loc5_ in _loc4_)
         {
            _loc6_ = true;
            _loc7_ = RoomNameUtil.getPrefix(_loc5_.name);
            _loc9_ = false;
            if(_loc7_ == RoomNameUtil.SOLO_ROOM_PREFIX)
            {
               _loc6_ = false;
            }
            if(_loc7_ == RoomNameUtil.PASSWORD_PROTECTED_PREFIX)
            {
               _loc9_ = true;
            }
            if(_loc5_.name.toUpperCase() == "MAIN LOBBY")
            {
               _loc6_ = false;
            }
            if(_loc6_)
            {
               if(_loc7_ == RoomNameUtil.USER_CREATED_PREFIX || _loc7_ == RoomNameUtil.PASSWORD_PROTECTED_PREFIX)
               {
                  _loc10_ = _loc3_;
               }
               else
               {
                  _loc10_ = _loc2_;
               }
               _loc11_ = _loc5_.occupancy;
               _loc12_ = RoomNameUtil.clean(_loc5_.name);
               _loc10_.addItem({
                  "name":_loc12_,
                  "id":_loc5_.id,
                  "players":_loc11_,
                  "password":(_loc9_ ? "X" : ""),
                  "lockedFlag":_loc9_
               });
            }
         }
         dgStaticRooms.columns = ["name","players"];
         dgStaticRooms.getColumnAt(0).width = 190;
         dgStaticRooms.dataProvider = _loc2_;
         dgStaticRooms.dataProvider.addEventListener(DataChangeType.SORT,onStaticDataProviderSorted);
         dgStaticRooms.selectedIndex = 0;
         dgStaticRooms.dataProvider.sortOn("name");
         dgStaticRooms.addEventListener(ListEvent.ITEM_CLICK,onStaticRoomClicked);
         dgUserRooms.columns = ["name","players","password"];
         dgUserRooms.getColumnAt(0).width = 160;
         dgUserRooms.dataProvider = _loc3_;
         dgUserRooms.dataProvider.sortOn("occupancy");
         dgUserRooms.clearSelection();
         dgUserRooms.addEventListener(ListEvent.ITEM_CLICK,onUserRoomClicked);
      }
      
      override public function getChosenRoom() : Object
      {
         if(dgStaticRooms.selectedItem != null)
         {
            return dgStaticRooms.selectedItem;
         }
         return dgUserRooms.selectedItem;
      }
      
      private function onStaticDataProviderSorted(param1:Event) : void
      {
         dTrace("onStaticDataProviderSorted");
         dgStaticRooms.dataProvider = param1.target as DataProvider;
         dgStaticRooms.selectedIndex = 0;
      }
      
      private function onStaticRoomClicked(param1:Event) : void
      {
         dgUserRooms.clearSelection();
      }
      
      private function onUserRoomClicked(param1:Event) : void
      {
         dTrace("onUserRoomClicked");
         dgStaticRooms.clearSelection();
      }
      
      public function createRoomClicked(param1:Event) : void
      {
         dTrace("createRoomClicked");
         dispatchEvent(new Event("ROOM_START_CREATE"));
         close();
      }
   }
}

