package com.gaiaworld.house.controller
{
   import com.gaiaworld.global.interfaces.ISurface;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.house.data.SurfaceMap;
   import com.gaiaworld.house.model.HouseModel;
   import com.gaiaworld.house.view.items.SwfItem;
   import com.gaiaworld.house.vo.ItemDataVo;
   import com.gaiaworld.house.vo.ItemVo;
   import com.gaiaworld.house.vo.RoomItemVo;
   import com.gaiaworld.house.vo.SwfVo;
   import com.gaiaworld.user.vo.UserVo;
   import flash.display.Sprite;
   import flash.utils.ByteArray;
   
   public class HouseController
   {
      
      private var houseModel:HouseModel = HouseModel.getInstance();
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      public function HouseController()
      {
         super();
      }
      
      public function setHouseSize(param1:Number, param2:Number) : *
      {
         this.houseModel.setSize(param2,param1);
      }
      
      public function setRotation(param1:Number) : *
      {
         this.houseModel.currentItem.setRotation(param1);
      }
      
      public function setLeftWallTile(param1:String) : *
      {
      }
      
      public function setRightWallTile(param1:String) : *
      {
      }
      
      public function setCurrentArea(param1:String) : *
      {
         this.houseModel.currentArea = param1;
      }
      
      public function setFloorTile(param1:String) : *
      {
         this.houseModel.floorTile = param1;
      }
      
      public function setLeftWallData(param1:ItemDataVo) : *
      {
         this.houseModel.lWallVo = param1;
      }
      
      public function setRightWallData(param1:ItemDataVo) : *
      {
         this.houseModel.rWallVo = param1;
      }
      
      public function setFloorData(param1:ItemDataVo) : *
      {
         this.houseModel.floorVo = param1;
      }
      
      public function setWallIDs(param1:Number, param2:Number) : *
      {
         this.houseModel.leftWallTileID = param1;
         this.houseModel.rightWallTileID = param2;
      }
      
      public function setWallPatterns(param1:Number, param2:Number) : *
      {
         this.houseModel.initWallTiles(param1,param2);
      }
      
      public function changedLeftWall(param1:Number) : *
      {
         this.houseModel.leftWallPattern = param1;
      }
      
      public function changeRightWall(param1:Number) : *
      {
         this.houseModel.rightWallPattern = param1;
      }
      
      public function changeFloor(param1:Number) : *
      {
         this.houseModel.floorPattern = param1;
      }
      
      public function changeWallSwitch(param1:String) : *
      {
         this.houseModel.wallSwitch = param1;
      }
      
      public function setPaths(param1:*, param2:*, param3:*, param4:*) : void
      {
         this.houseModel.thumbPath = param1;
         this.houseModel.imagespath = param2;
         this.houseModel.roomimagepath = param3;
         this.houseModel.avatarpath = param4;
      }
      
      public function setUserID(param1:Number) : *
      {
         this.houseModel.user_id = param1;
      }
      
      public function setUserData(param1:UserVo) : *
      {
         this.houseModel.userVo = param1;
      }
      
      public function setHouseID(param1:Number) : *
      {
         this.houseModel.house_id = param1;
      }
      
      public function addItem(param1:RoomItemVo) : *
      {
         this.houseModel.addItemToRoom(param1);
      }
      
      public function addInfo(param1:ItemVo) : *
      {
         this.houseModel.addInfo(param1);
      }
      
      public function setDefs(param1:Array) : *
      {
         this.houseModel.definitionArray = param1;
      }
      
      public function dtrace(param1:String) : *
      {
         this.houseModel.debugText = param1;
      }
      
      public function debugFlag(param1:Boolean) : *
      {
         this.houseModel.debugFlag = param1;
      }
      
      public function setCurrentItem(param1:SwfItem) : *
      {
         this.houseModel.currentItem = param1;
      }
      
      public function registerMap(param1:String, param2:SurfaceMap) : *
      {
         this.houseModel.registerMap(param1,param2);
      }
      
      public function registerSwf(param1:SwfVo) : *
      {
         this.houseModel.registerSwf(param1);
      }
      
      public function registerSurface(param1:String, param2:ISurface) : *
      {
         this.houseModel.registerSurface(param1,param2);
      }
      
      public function updatePos(param1:Number, param2:Number, param3:Number) : *
      {
         this.houseModel.updatePos(param1,param2,param3);
      }
      
      public function updateTruePos(param1:Number, param2:Number, param3:Number) : *
      {
         this.houseModel.updateTruePos(param1,param2,param3);
      }
      
      public function updateRelPos(param1:Number, param2:Number, param3:Number) : *
      {
         this.houseModel.updateRelPos(param1,param2,param3);
      }
      
      public function updateWall(param1:Number, param2:Boolean) : *
      {
         this.houseModel.updateWall(param1,param2);
      }
      
      public function addNewItem(param1:ItemDataVo) : *
      {
         this.houseModel.newItem = param1;
      }
      
      public function registerSwfItem(param1:SwfItem) : *
      {
         this.houseModel.registerSwfItem(param1);
      }
      
      public function moveItem(param1:Number, param2:Number, param3:SwfItem) : *
      {
         this.houseModel.moveItem(param1,param2,param3);
      }
      
      public function moveWallItem(param1:Number, param2:Number, param3:SwfItem) : *
      {
         this.houseModel.moveWallItem(param1,param2,param3);
      }
      
      public function moveToWall(param1:SwfItem, param2:SwfItem) : *
      {
         this.houseModel.moveToWall(param1,param2);
      }
      
      public function updateYPos(param1:Number, param2:Number) : *
      {
         this.houseModel.updateYPos(param1,param2);
      }
      
      public function updateRotation(param1:Number, param2:Number) : *
      {
         this.houseModel.updateRotation(param1,param2);
      }
      
      public function setSid(param1:String) : void
      {
         this.houseModel.sid = param1;
      }
      
      public function assignUid(param1:Number, param2:Number) : *
      {
         this.houseModel.assignUid(param1,param2);
      }
      
      public function changeItemCat(param1:String) : *
      {
         this.houseModel.itemCat = param1;
      }
      
      public function setLastSaveDate(param1:Number) : void
      {
         this.houseModel.saveDate = param1;
      }
      
      public function clearHouse() : void
      {
         this.houseModel.clearHouse();
      }
      
      public function destroyItems() : *
      {
         this.houseModel.destroyItems();
      }
      
      public function destroyCurrentItem() : *
      {
         this.houseModel.destroyCurrentItem();
      }
      
      public function clearCurrentItem() : *
      {
         this.houseModel.clearCurrentItem();
      }
      
      public function houseIsBuilt() : void
      {
         this.houseModel.houseIsBuilt();
      }
      
      public function setEditMode(param1:Boolean) : *
      {
         this.houseModel.editMode = param1;
      }
      
      public function setDragWorld(param1:Boolean) : *
      {
         this.houseModel.dragWorld = param1;
      }
      
      public function setDragMode(param1:Boolean) : *
      {
         this.houseModel.dragMode = param1;
      }
      
      public function setCurrentTab(param1:Object) : *
      {
         this.houseModel.currentTab = param1;
      }
      
      public function fakeItemIsDragging() : *
      {
         this.houseModel.fakeItemIsDragging();
      }
      
      public function setColFlag(param1:Boolean) : void
      {
         this.houseModel.colFlag = param1;
      }
      
      public function setStatus(param1:Number) : *
      {
         this.houseModel.itemStatus = param1;
      }
      
      public function lockCurrent() : void
      {
         this.houseModel.currentLock = true;
      }
      
      public function unlockCurrent() : void
      {
         this.houseModel.currentLock = false;
      }
      
      public function itemIsPlaced() : void
      {
         this.houseModel.itemIsPlaced();
      }
      
      public function itemIsBeingDragged(param1:Boolean) : *
      {
         this.houseModel.itemIsBeingDragged = param1;
      }
      
      public function putBackInItems(param1:Number) : *
      {
         this.houseModel.putBackInItems2(param1);
      }
      
      public function houseIsDragging() : void
      {
         this.houseModel.houseIsDragging();
      }
      
      public function changeAlpha(param1:Number) : *
      {
         this.houseModel.itemTrans = param1;
      }
      
      public function setDay() : *
      {
         this.houseModel.setDay();
      }
      
      public function setNight() : *
      {
         this.houseModel.setNight();
      }
      
      public function setPercentLoaded(param1:Number) : *
      {
         this.houseModel.percentLoaded = param1;
      }
      
      public function setLoadingMessage(param1:String) : *
      {
         this.houseModel.loadingMessage = param1;
      }
      
      public function setStyle(param1:String) : void
      {
         this.houseModel.houseStyle = param1;
      }
      
      public function setBubbleMessage(param1:String) : *
      {
         this.houseModel.setBubble(param1);
      }
      
      public function hideBubble() : void
      {
         this.houseModel.hideBubble();
      }
      
      public function enableSave() : void
      {
         this.houseModel.enableSave();
      }
      
      public function setSerialView(param1:Number) : *
      {
         this.houseModel.serialView = param1;
      }
      
      public function setMapDif(param1:Number, param2:Number) : *
      {
         this.houseModel.mDifX = param1;
         this.houseModel.mDifY = param2;
      }
      
      public function setWallPos(param1:Number, param2:Number) : void
      {
         this.houseModel.wallMapX = param1;
         this.houseModel.wallMapY = param2;
      }
      
      public function setHouse(param1:Sprite) : void
      {
         this.houseModel.house = param1;
      }
      
      public function showHouse() : void
      {
         this.houseModel.showHouse();
      }
      
      public function addDef(param1:ItemDataVo) : void
      {
         this.houseModel.addDef(param1);
      }
      
      public function addDefFromHouse(param1:Number, param2:Number) : *
      {
         this.houseModel.addDefFromHouse(param1,param2);
      }
      
      public function setAlwaysDark(param1:Boolean) : *
      {
         this.houseModel.alwaysDark = param1;
      }
      
      public function setDoorPos(param1:Number, param2:Number, param3:Number) : void
      {
         this.houseModel.doorX = param1;
         this.houseModel.doorY = param2;
         this.houseModel.doorR = param3;
         this.globalModel.doorX = param1;
         this.globalModel.doorY = param2;
      }
      
      public function setUserHood(param1:Number) : void
      {
         this.houseModel.hood = param1;
         this.globalModel.hood = param1;
      }
      
      public function setDragItem(param1:SwfItem) : *
      {
         this.houseModel.itemBeingDragged = param1;
      }
      
      public function setHouseName(param1:String) : void
      {
         this.houseModel.houseName = param1;
      }
      
      public function enableStacking(param1:Boolean) : *
      {
         this.houseModel.enableStacking = param1;
      }
      
      public function setEditData(param1:ByteArray) : *
      {
         this.houseModel.editData = param1;
      }
      
      public function addAvatarItems(param1:Array) : void
      {
         this.houseModel.addAvatarItems(param1);
      }
      
      public function showTooltip(param1:String) : *
      {
         this.houseModel.tooltipText = param1;
      }
      
      public function hideTooltip() : *
      {
         this.houseModel.hideTooltip();
      }
      
      public function setAlwaysLight(param1:Boolean) : void
      {
         this.houseModel.alwaysLight = param1;
      }
      
      public function dataIsReady() : void
      {
         this.houseModel.houseDataIsReady();
      }
   }
}

