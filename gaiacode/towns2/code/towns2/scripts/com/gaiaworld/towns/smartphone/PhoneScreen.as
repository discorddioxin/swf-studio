package com.gaiaworld.towns.smartphone
{
   import com.gaiaworld.avatar.controller.AvatarController;
   import com.gaiaworld.global.controller.events.GEvent;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.global.view.ui.AvatarCompass;
   import com.gaiaworld.room.controller.GpsController;
   import com.gaiaworld.room.model.GpsModel;
   import com.gaiaworld.room.model.RoomModel;
   import com.gaiaworld.sushi.DataEx2;
   import com.gaiaworld.sushi.constants.ChatConstants;
   import com.gaiaworld.sushi.controller.ChatController;
   import com.gaiaworld.sushi.model.ChatModel;
   import com.gaiaworld.towns.constants.PhoneConstants;
   import com.gaiaworld.towns.hood.util.DirectToHouse;
   import com.gaiaworld.towns.smartphone.landLord.LandLordScreen;
   import com.gaiaworld.towns.vo.LocBookmarkVo;
   import com.gaiaworld.user.events.PalEvent;
   import com.gaiaworld.user.model.UserModel;
   import com.gaiaworld.user.vo.PalTrackVo;
   import com.gaiaworld.user.vo.PalVo;
   import flash.display.Loader;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.events.TextEvent;
   import flash.net.URLLoader;
   import flash.net.URLRequest;
   import flash.net.URLRequestMethod;
   import flash.text.StyleSheet;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol782")]
   public class PhoneScreen extends Sprite
   {
      
      public var addBox:AddLocationBox;
      
      public var pageBack:MovieClip;
      
      public var palBox:PalBox;
      
      public var palInfoBox:PalInfoBox;
      
      public var text1:TextField;
      
      private var rq:URLRequest = new URLRequest();
      
      private var lv:URLLoader = new URLLoader();
      
      private var cssLoader:URLLoader = new URLLoader();
      
      private var css:StyleSheet = new StyleSheet();
      
      private var currentPath:String;
      
      private var loader:Loader = new Loader();
      
      private var gpsController:GpsController = new GpsController();
      
      private var roomModel:RoomModel = RoomModel.getInstance();
      
      private var gpsModel:GpsModel = GpsModel.getInstance();
      
      private var userModel:UserModel = UserModel.getInstance();
      
      private var chatController:ChatController = new ChatController();
      
      private var chatModel:ChatModel = ChatModel.getInstance();
      
      private var eIndex:Number;
      
      private var avatarCompass:AvatarCompass;
      
      private var palList:PalList;
      
      public var selectedIndex:Number;
      
      private var hotSpotScreen:HotSpotScreen = new HotSpotScreen();
      
      private var bookMarkScreen:BookMarkScreen = new BookMarkScreen();
      
      private var confirmDeleteScreen:ConfirmDeleteScreen = new ConfirmDeleteScreen();
      
      private var avatarController:AvatarController = new AvatarController();
      
      private var landLordOptions:LandLordScreen;
      
      private var houseCode:Number;
      
      public function PhoneScreen()
      {
         super();
         this.loader.x = this.pageBack.x;
         this.loader.y = this.pageBack.y;
         TextField(this.text1).addEventListener(TextEvent.LINK,this.getLink);
         this.cssLoader.addEventListener(Event.COMPLETE,this.cssLoaded);
         this.cssLoader.load(new URLRequest("navPages/phone.css"));
         this.addChild(this.loader);
         this.addBox.visible = false;
         this.palBox.visible = false;
         this.setChildIndex(this.addBox,this.numChildren - 1);
         TextField(this.text1).embedFonts = true;
         TextField(this.text1).multiline = true;
         this.addEventListener(GEvent.GENERIC_ACTION,this.doActions);
         this.addEventListener(PalEvent.GET_PAL_INFO,this.getPalOptions);
         this.addEventListener(PalEvent.FOLLOW_PAL,this.follow);
         this.addEventListener(PalEvent.TRANSPORT,this.transportToPal);
         this.addEventListener(PhoneConstants.DELETE_BOOKMARK,this.deleteBookmark);
         this.addEventListener(PhoneConstants.DELETE_SAY_NO,this.sayNoToDel);
         this.addEventListener(PhoneConstants.DELETE_SAY_YES,this.sayYesToDel);
         this.hotSpotScreen.visible = false;
         this.confirmDeleteScreen.visible = false;
         this.confirmDeleteScreen.y = -200;
         this.bookMarkScreen.y = -275;
         this.hotSpotScreen.y = -275;
         this.addChild(this.hotSpotScreen);
         this.addChild(this.bookMarkScreen);
         this.addChild(this.confirmDeleteScreen);
      }
      
      private function deleteBookmark(param1:Event) : void
      {
         var _loc2_:LocBookmarkVo = this.gpsModel.bookmarkArray[this.bookMarkScreen.fav];
         this.bookMarkScreen.visible = false;
         this.confirmDeleteScreen.setText(_loc2_.title);
         this.confirmDeleteScreen.visible = true;
      }
      
      private function cssLoaded(param1:Event) : void
      {
         this.css.parseCSS(param1.target.data);
         TextField(this.text1).styleSheet = this.css;
         this.dispatchEvent(new Event(PhoneConstants.CSS_LOADED,true));
      }
      
      private function scrollUp(param1:MouseEvent) : *
      {
         --TextField(this.text1).scrollV;
      }
      
      private function scrollDown(param1:MouseEvent) : *
      {
         ++TextField(this.text1).scrollV;
      }
      
      private function allOff() : *
      {
         this.text1.htmlText = "";
         this.bookMarkScreen.visible = false;
         this.hotSpotScreen.visible = false;
         if(this.palList)
         {
            this.palList.visible = false;
         }
         if(this.landLordOptions != null)
         {
            this.landLordOptions.visible = false;
         }
         this.addBox.visible = false;
         this.palBox.visible = false;
         this.confirmDeleteScreen.visible = false;
      }
      
      private function getLink(param1:TextEvent) : void
      {
         var _loc3_:String = null;
         var _loc4_:Number = NaN;
         this.addBox.visible = false;
         switch(param1.text)
         {
            case "hotspots":
               this.loadPage("hotspots.html");
               break;
            case "favorites":
               this.showBookmarks();
               break;
            case "bookmark":
               this.addBox.showMe();
               break;
            case "searchForPal":
               this.palBox.visible = true;
               this.setChildIndex(this.palBox,this.numChildren - 1);
               break;
            case "apps":
               this.loadPage("appPage.swf");
               break;
            case "goback":
               this.goBack();
               break;
            case "friends":
               this.showFriends();
               break;
            case "setting":
               this.showSettings();
         }
         var _loc2_:Array = param1.text.split("-");
         if(param1.text.substr(0,5) == "goto-")
         {
            _loc3_ = param1.text.substr(5,param1.text.length - 5);
            this.gpsController.getDirectons(this.roomModel.roomID,_loc3_);
            this.gpsController.setHotSpots(true);
            this.gpsController.setFavFlag(false);
            this.dispatchEvent(new Event(PhoneConstants.SHOW_COMPASS,true));
         }
         if(this.checkFor(param1.text,"navTo-") == true)
         {
            _loc4_ = Number(param1.text.substr(6,param1.text.length - 6));
            this.navTo(_loc4_);
         }
         if(this.checkFor(param1.text,"confirmDel-") == true)
         {
            this.confirmDelete(Number(_loc2_[1]));
         }
         if(this.checkFor(param1.text,"rename-") == true)
         {
            this.renameBookmark(Number(_loc2_[1]));
         }
         if(this.checkFor(param1.text,"pal-") == true)
         {
         }
         if(this.checkFor(param1.text,"follow-") == true)
         {
         }
      }
      
      private function sayYesToDel(param1:Event) : *
      {
         this.confirmDelete(this.bookMarkScreen.fav);
         this.confirmDeleteScreen.visible = false;
         this.showBookmarks();
      }
      
      private function sayNoToDel(param1:Event) : *
      {
         this.confirmDeleteScreen.visible = false;
         this.showBookmarks();
      }
      
      private function checkFor(param1:String, param2:String) : *
      {
         if(param1.substr(0,param2.length) == param2)
         {
            return true;
         }
      }
      
      public function goBack() : *
      {
         this.allOff();
         switch(this.currentPath)
         {
            case "hotspots.html":
            case "fav.html":
            case "bookmark.html":
            case "appPage.swf":
            case "bookmarks":
               this.dispatchEvent(new Event(PhoneConstants.SHOW_START_SCREEN,true));
               break;
            case "favChoice":
               this.showBookmarks();
               break;
            case "navTo":
               this.gpsController.setFavCord(-1,-1);
               this.gpsController.setFavFlag(false);
               this.showBookmarks();
               break;
            case "palOpt":
               PalInfoBox(this.palInfoBox).visible = false;
               this.palList.visible = true;
               this.currentPath = "palList";
               break;
            default:
               this.dispatchEvent(new Event(PhoneConstants.SHOW_START_SCREEN,true));
         }
      }
      
      public function loadPage(param1:String) : *
      {
         this.currentPath = param1;
         if(this.isSwf(param1) == false)
         {
            this.rq.url = "navPages/" + param1;
            this.rq.method = URLRequestMethod.GET;
            this.lv.addEventListener(Event.COMPLETE,this.pageLoaded);
            this.lv.load(this.rq);
            this.loader.visible = false;
            this.text1.visible = true;
         }
         else
         {
            this.loader.visible = true;
            this.text1.visible = false;
            this.loader.load(new URLRequest("navPages/" + param1));
         }
      }
      
      private function isSwf(param1:String) : *
      {
         var _loc2_:Number = param1.indexOf(".swf");
         if(_loc2_ != -1)
         {
            return true;
         }
         return false;
      }
      
      private function pageLoaded(param1:Event) : *
      {
         this.text1.htmlText = this.lv.data;
         this.dispatchEvent(new Event(PhoneConstants.PAGE_LOADED,true));
      }
      
      public function showBookmarks() : *
      {
         this.allOff();
         this.currentPath = "bookmarks";
         this.bookMarkScreen.dataProvider = this.gpsModel.bookmarkArray;
         this.bookMarkScreen.visible = true;
         if(this.gpsModel.bookmarkArray.length == 0)
         {
            this.text1.htmlText = "<br><br><br><br>You have no favorites yet. Use bookmark location to add favorites";
         }
         else
         {
            this.text1.htmlText = "";
         }
      }
      
      private function navTo(param1:Number) : *
      {
         this.currentPath = "navTo";
         var _loc2_:LocBookmarkVo = this.gpsModel.bookmarkArray[param1];
         this.gpsController.setNavState(true);
         this.gpsController.setFavCord(_loc2_.x,_loc2_.y);
         this.gpsController.getDirectons(this.roomModel.roomID,_loc2_.roomName);
         this.dispatchEvent(new Event(PhoneConstants.SHOW_COMPASS,true));
         this.dispatchEvent(new Event(PhoneConstants.SHOW_START_SCREEN,true));
         this.dispatchEvent(new Event(PhoneConstants.HIDE_PHONE,true));
      }
      
      private function confirmDelete(param1:Number) : *
      {
         this.gpsModel.bookmarkArray.splice(param1,1);
         this.dispatchEvent(new Event(PhoneConstants.SAVE_BOOKMARKS,true));
      }
      
      private function renameBookmark(param1:Number) : void
      {
         this.eIndex = param1;
         var _loc2_:LocBookmarkVo = this.gpsModel.bookmarkArray[param1];
         this.addBox.setForEdit(_loc2_.title);
      }
      
      private function renameDone(param1:String) : *
      {
         var _loc2_:LocBookmarkVo = this.gpsModel.bookmarkArray[this.eIndex];
         _loc2_.title = param1;
         this.dispatchEvent(new Event(PhoneConstants.SAVE_BOOKMARKS,true));
         this.loadPage("page1.html");
      }
      
      public function showFriends() : void
      {
         var _loc7_:PalVo = null;
         this.currentPath = "pals";
         this.hotSpotScreen.visible = false;
         this.userModel.updateFriends();
         if(this.userModel.palArray == null)
         {
            this.text1.htmlText = "<br><br><br>Aw! You have no friends yet on Gaia! Go make some!";
            return;
         }
         var _loc1_:Array = this.userModel.palArray.slice();
         if(_loc1_ == null)
         {
            this.text1.htmlText = "<br><br><br>Aw! You have no friends yet on Gaia! Go make some!";
            return;
         }
         this.text1.htmlText = "";
         _loc1_.sortOn(["isOnline","userName"],[[Array.NUMERIC,Array.DESCENDING],Array.CASEINSENSITIVE]);
         var _loc2_:Array = new Array();
         var _loc3_:Array = new Array();
         var _loc4_:Number = _loc1_.length;
         var _loc5_:int = 0;
         while(_loc5_ < _loc4_)
         {
            _loc7_ = _loc1_[_loc5_];
            if(_loc7_.isOnline == true)
            {
               _loc2_.push(_loc7_);
            }
            else
            {
               _loc3_.push(_loc7_);
            }
            _loc5_++;
         }
         var _loc6_:Array = _loc2_.concat(_loc3_);
         if(_loc1_ != null)
         {
            this.palList = new PalList();
            this.palList.y = -224;
            this.palList.dataProvider = _loc6_;
            this.addChild(this.palList);
         }
         this.pageBack.visible = false;
      }
      
      public function showLandLordOptions() : void
      {
         if(this.landLordOptions != null)
         {
            if(this.contains(this.landLordOptions))
            {
               removeChild(this.landLordOptions);
            }
         }
         this.landLordOptions = new LandLordScreen();
         this.landLordOptions.x = 3;
         this.landLordOptions.y = -148;
         this.addChild(this.landLordOptions);
         this.pageBack.visible = false;
         this.landLordOptions.startUp();
      }
      
      public function hideLandLordOptions() : void
      {
         if(this.landLordOptions != null)
         {
            if(this.contains(this.landLordOptions))
            {
               removeChild(this.landLordOptions);
            }
         }
      }
      
      public function clearAll() : *
      {
         if(this.palList != null)
         {
            if(this.contains(this.palList))
            {
               this.removeChild(this.palList);
            }
         }
         this.palInfoBox.visible = false;
      }
      
      public function getPalOptions(param1:PalEvent) : void
      {
         if(param1.type == PalEvent.GET_PAL_INFO)
         {
            this.currentPath = "palOpt";
            PalInfoBox(this.palInfoBox).visible = true;
            PalInfoBox(this.palInfoBox).palVo = param1.palVo;
            this.palList.visible = false;
         }
         if(param1.type == PalEvent.INVITE_TO_HOOD)
         {
         }
      }
      
      public function showSettings() : void
      {
      }
      
      private function follow(param1:PalEvent) : *
      {
         if(param1.palVo.isOnline == false)
         {
            this.chatController.noteToSelf(param1.palVo.userName + " is offline");
            return;
         }
         var _loc2_:PalVo = param1.palVo;
         var _loc3_:PalTrackVo = this.userModel.getTracker(_loc2_.id);
         var _loc4_:Array = _loc3_.room_name.split("_");
         var _loc5_:Number = Number(_loc4_[0]);
         var _loc6_:String = this.gpsModel.getRoomName(_loc5_);
         this.gpsController.getDirectons(this.roomModel.roomID,_loc6_);
         this.gpsController.setPalToFollow(_loc2_);
         this.gpsController.setNavState(true);
         this.gpsController.setTrackVo(_loc3_);
         this.dispatchEvent(new Event(PhoneConstants.SHOW_COMPASS,true));
         this.dispatchEvent(new Event(PhoneConstants.SHOW_START_SCREEN,true));
         this.dispatchEvent(new Event(PhoneConstants.HIDE_PHONE,true));
      }
      
      private function transportToPal(param1:PalEvent) : *
      {
         var _loc4_:* = undefined;
         var _loc5_:int = 0;
         var _loc6_:DirectToHouse = null;
         trace("transport to pal");
         DataEx2.getInstance().getUserInfo(param1.palVo.userName);
         if(this.userModel.isPalOnline(param1.palVo.id) == false)
         {
            this.chatController.noteToSelf(param1.palVo.userName + " is offline");
            return;
         }
         var _loc2_:String = this.userModel.onlinePals[param1.palVo.id];
         trace("loc=" + _loc2_);
         var _loc3_:Array = _loc2_.split("_");
         GlobalModel.getInstance().roomInstance = _loc3_[1];
         this.roomModel.surfaceToLoad = _loc3_[0];
         if(_loc2_.toLowerCase().indexOf("house") > 0)
         {
            _loc4_ = _loc2_.split("_");
            _loc5_ = Number(_loc4_[1]);
            _loc6_ = new DirectToHouse();
            _loc6_.gotDirectlyToHouse(Number(_loc5_));
         }
         else
         {
            DataEx2.getInstance().joinRoom(_loc2_);
         }
         this.dispatchEvent(new Event(PhoneConstants.SHOW_START_SCREEN,true));
         this.dispatchEvent(new Event(PhoneConstants.HIDE_PHONE,true));
      }
      
      private function connected(param1:Event) : *
      {
         this.chatModel.removeEventListener(ChatConstants.CONNECTED,this.connected);
         var _loc2_:DirectToHouse = new DirectToHouse();
         _loc2_.gotDirectlyToHouse(Number(this.houseCode));
      }
      
      private function doActions(param1:GEvent) : void
      {
         if(param1.action == "editBookmark")
         {
            this.renameDone(param1.text);
         }
      }
      
      public function showHotspots() : *
      {
         this.currentPath = "hotSpots";
         this.loader.visible = false;
         this.pageBack.visible = false;
         this.bookMarkScreen.visible = false;
         this.hotSpotScreen.visible = true;
      }
      
      public function addBookmark() : *
      {
         this.addBox.showMe();
         this.pageBack.visible = false;
      }
   }
}

