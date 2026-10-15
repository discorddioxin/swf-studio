package
{
   import com.gaiaworld.ads.constants.MediaSpikeConstants;
   import com.gaiaworld.global.constants.SpaceConstants;
   import com.gaiaworld.global.sounds.BgSound;
   import com.gaiaworld.room.constants.MapConstants;
   import com.gaiaworld.room.view.BaseMap;
   import com.gaiaworld.room.vo.LocationVo;
   import flash.display.MovieClip;
   
   public class Market extends BaseMap
   {
      
      public var admap:MovieClip;
      
      public var background:MovieClip;
      
      public var cmap:MovieClip;
      
      public var fmap:MovieClip;
      
      public var objectMap:MovieClip;
      
      public var pmap:MovieClip;
      
      private var bgSound:BgSound = BgSound.getInstance();
      
      public function Market()
      {
         super();
         trace("MARKET");
         directionArray = [new LocationVo(MapConstants.WEAPON,MapConstants.EAST),new LocationVo(MapConstants.GAMBINO_GARDENS,MapConstants.NORTH_WEST),new LocationVo(MapConstants.GAMBINO_PARK,MapConstants.NORTH_EAST)];
         globalController.setMapDim(2058,1537);
         var _loc1_:Number = -100;
         var _loc2_:Number = 150;
         var _loc3_:Number = -1115;
         var _loc4_:Number = -760;
         globalController.showLocation("Gambino Plaza");
         roomController.setMinMax(_loc1_,_loc2_,_loc3_,_loc4_);
         roomController.setScrollPos(-100,100);
         roomController.setCanScroll(true);
         objectController.clearStationaryItem();
         avatarController.setScale(75);
         roomController.setBorders(400,450,300,350);
         globalController.setStartPos(500,814);
         globalController.unloadMusic();
         globalController.showUserBar();
         avatarController.showMenus(true);
         gpsController.setDirectionData(directionArray);
         roomController.setArea(SpaceConstants.AREA_GAMBINO);
         roomController.setRoomID(MapConstants.GAMBINO_MARKET);
         avatarController.setUseWhiteText(false);
         avatarController.setTextSize(MapConstants.TEXT_SIZE_LARGE);
         msController.setAreaID(MediaSpikeConstants.MS_TOWNS);
         avatarController.setUserControl(true);
         this.bgSound.loadStandard();
      }
   }
}

