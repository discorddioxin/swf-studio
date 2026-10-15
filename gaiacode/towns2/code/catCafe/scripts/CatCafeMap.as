package
{
   import com.gaiaworld.room.constants.MapConstants;
   import com.gaiaworld.room.view.BaseMap;
   import flash.display.MovieClip;
   
   public class CatCafeMap extends BaseMap
   {
      
      public var admap:MovieClip;
      
      public var background:MovieClip;
      
      public var cmap:MovieClip;
      
      public var fmap:MovieClip;
      
      public var objectMap:MovieClip;
      
      public var pmap:MovieClip;
      
      public function CatCafeMap()
      {
         super();
         globalController.setMapDim(1024,768);
         globalController.setStartPos(508,572);
         avatarController.setAtStartAfterJump(true);
         var _loc1_:Number = -50;
         var _loc2_:Number = 376;
         var _loc3_:Number = -100;
         var _loc4_:Number = 28;
         globalController.showLocation("Cat Cafe");
         roomController.setMinMax(_loc1_,_loc2_,_loc3_,_loc4_);
         roomController.setScrollPos(-100,25);
         roomController.setCanScroll(true);
         avatarController.setScale(100);
         roomController.setBorders(400,450,300,350);
         objectController.clearStationaryItem();
         globalController.unloadMusic();
         globalController.showUserBar();
         gpsController.setDirectionData(directionArray);
         avatarController.setUseWhiteText(false);
         avatarController.setTextSize(MapConstants.TEXT_SIZE_LARGE);
         roomController.setRoomID(MapConstants.CAT_CAFE);
      }
   }
}

