package com.gaiaworld.house.view.items
{
   import com.gaiaworld.avatar.controller.AvatarController;
   import com.gaiaworld.avatar.model.AvatarModel;
   import com.gaiaworld.global.controller.MessageController;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.house.constants.HouseConstants;
   import com.gaiaworld.house.constants.HouseMessages;
   import com.gaiaworld.house.controller.DebugController;
   import com.gaiaworld.house.controller.HouseController;
   import com.gaiaworld.house.controller.events.DraggingEvent;
   import com.gaiaworld.house.controller.events.EditEvent;
   import com.gaiaworld.house.controller.events.ResetEvent;
   import com.gaiaworld.house.data.SurfaceMap;
   import com.gaiaworld.house.interfaces.IFurniture;
   import com.gaiaworld.house.model.HouseModel;
   import com.gaiaworld.house.util.VideoChooser;
   import com.gaiaworld.house.vo.CoordVo;
   import com.gaiaworld.house.vo.ItemDataVo;
   import com.gaiaworld.house.vo.SwfVo;
   import com.gaiaworld.house.vo.items.StackedItemVo;
   import com.gaiaworld.house.vo.tiles.WallItemVo;
   import com.gaiaworld.room.interfaces.ITileVo;
   import com.gaiaworld.room.interfaces.IWorldItem;
   import fl.transitions.Tween;
   import fl.transitions.TweenEvent;
   import fl.transitions.easing.None;
   import flash.display.Loader;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.ErrorEvent;
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.events.MouseEvent;
   import flash.filters.GlowFilter;
   import flash.geom.Point;
   import flash.net.URLRequest;
   import flash.utils.ByteArray;
   
   public class SwfItem extends Sprite implements IWorldItem
   {
      
      public static const ITEM_LOADED:String = "itemLoaded";
      
      public static const REMOVE_ITEM:String = "removeItem";
      
      private var loader:Loader = new Loader();
      
      private var content:IFurniture;
      
      private var _rot:Number;
      
      public var isStacked:Boolean = false;
      
      private var _h:Number;
      
      private var _w:Number;
      
      private var _l:Number;
      
      private var _numberOfRots:Number;
      
      private var _canStackOn:Boolean;
      
      private var _isStackable:Boolean;
      
      private var _canSitOn:Boolean = false;
      
      private var _specialAction:String = "";
      
      private var _type:String;
      
      private var _obj:MovieClip;
      
      private var _hitBox:MovieClip;
      
      private var _isStackedOn:SwfItem;
      
      public var stackArray:Array = new Array();
      
      public var autoPlace:Boolean = false;
      
      public var feelerX:Number;
      
      public var feelerY:Number;
      
      public var feelerH:Number;
      
      public var feelerW:Number;
      
      private var originalX:Number;
      
      private var originalY:Number;
      
      private var originalYY:Number;
      
      private var originalRot:Number;
      
      private var originalIsStacked:Boolean;
      
      private var originalLevel:Number = 1;
      
      private var _editMode:Boolean = false;
      
      public var isDragging:Boolean = false;
      
      private var tweenY:Tween;
      
      private var tweenX:Tween;
      
      private var debugController:DebugController = new DebugController();
      
      private var houseController:HouseController = new HouseController();
      
      private var houseModel:HouseModel = HouseModel.getInstance();
      
      public var surfaceMap:SurfaceMap;
      
      public var surfaceMapName:String;
      
      public var level:Number = 1;
      
      public var depth:Number = 0;
      
      private var _depth2:Number;
      
      private var _xx:Number;
      
      private var _zz:Number;
      
      private var _yy:Number;
      
      public var parentCellHeight:Number = 0;
      
      private var _itemID:Number;
      
      private var zoomTweenX:Tween;
      
      private var zoomTweenY:Tween;
      
      private var _canDrag:Boolean = false;
      
      public var newInHouseFlag:Boolean;
      
      public var wallHeight:Number = 0;
      
      public var index:Number;
      
      private var _itemTileVo:ITileVo;
      
      private var _itemDataVo:ItemDataVo;
      
      private var noMove:Boolean = false;
      
      private var resetFlag:Boolean = false;
      
      private var messageController:MessageController = new MessageController();
      
      private var wasStackedOn:SwfItem;
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      private var vidIsPlaying:Boolean = false;
      
      public var leftWall:Boolean;
      
      public var hasBeenPlaced:Boolean = false;
      
      public var xSplit:Number = 283;
      
      public function SwfItem()
      {
         super();
         this.loader.contentLoaderInfo.addEventListener(Event.COMPLETE,this.swfLoaded);
         this.loader.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,this.itemNotFound);
         this.houseModel.addEventListener(HouseConstants.CURRENT_ITEM_SELECTED,this.itemSelected);
         if(this.houseModel.editMode == true)
         {
         }
      }
      
      public function setItem(param1:Number, param2:Number, param3:String, param4:Number, param5:Number, param6:Number, param7:Number = -1) : *
      {
         var _loc8_:String = null;
         this.itemDataVo = this.houseModel.getItemDef(param1).clone();
         this.zz = param5;
         this.xx = param4;
         this.yy = param6;
         if(this.yy > 1)
         {
            this.isStacked = true;
         }
         this.itemID = param1;
         this.itemDataVo.uid = param7;
         this.surfaceMapName = param3;
         this._rot = param2;
         if(this.newInHouse == false)
         {
            this.houseController.updatePos(this.index,this.xx,this.zz);
         }
         if(this.itemDataVo.isAvatarItem == false)
         {
            if(param1 != -2)
            {
               _loc8_ = this.houseModel.imagespath + "furniture/" + String(param1) + ".swf";
               _loc8_ = _loc8_ + ("?ver=" + String(this.globalModel.version));
               this.loader.load(new URLRequest(_loc8_));
            }
            else
            {
               this.loadEditFile();
            }
         }
         else
         {
            _loc8_ = this.houseModel.thumbPath + this.itemDataVo.thumb;
            this.loader.load(new URLRequest(_loc8_));
         }
      }
      
      private function itemNotFound(param1:ErrorEvent) : *
      {
         this.messageController.setMessage("An item of furniture was not found. Error code:fnf" + String(this.itemID) + ". Please check that you are online and refresh your browser. If you get this error again, please contact support");
         this.dispatchEvent(new Event(ITEM_LOADED,true));
      }
      
      public function changeArea(param1:String) : *
      {
         this.itemDataVo.area = param1;
      }
      
      private function swfLoaded(param1:Event) : *
      {
         var _loc2_:Sprite = null;
         this.addChild(this.loader);
         if(this.itemDataVo.isAvatarItem == false)
         {
            this.content = IFurniture(this.loader.content);
            this.setRotation(this._rot);
            this.h = this.content.getH();
            this.w = this.content.getW();
            this.l = this.content.getL();
            this.isStackable = this.content.getIsStackable();
            this.canStackOn = this.content.getCanStackOn();
            this.canSitOn = this.content.getCanSitOn();
            this.specialAction = this.content.getSpecialAction();
            this.content.setEditMode(this._editMode);
            this.type = this.content.getType();
            this.hitBox = this.content.getHitBox();
            this.hitBox.visible = false;
            if(this.h == 0)
            {
               this.level = 0;
            }
            if(this.yy > 1)
            {
               this.level = 2;
            }
            this.obj = this.content.getObj();
            this.feelerX = this.hitBox.x;
            this.feelerY = this.hitBox.y;
            this.feelerH = this.hitBox.height;
            this.feelerW = this.hitBox.width;
            switch(this.type)
            {
               case "light":
                  if(this.obj.light != null)
                  {
                     _loc2_ = this.obj.light.corona;
                     this.obj.light.visible = false;
                  }
                  if(this.obj.corona != null)
                  {
                     this.obj.corona.visible = false;
                  }
                  if(_loc2_ != null)
                  {
                     _loc2_.visible = false;
                  }
                  this.noMove = true;
                  break;
               case "video":
                  this.noMove = true;
                  this.content.setCallback(this.turnOnTv);
                  break;
               case "magicMirror":
                  this.content.setCallback(this.showReflection);
                  break;
               case "orb_of_darkness":
                  if(this.houseModel.editMode == false)
                  {
                     this.houseController.setAlwaysDark(true);
                     this.houseController.setNight();
                  }
                  break;
               case "orb_of_light":
                  if(this.houseModel.editMode == false)
                  {
                     this.houseController.setAlwaysLight(true);
                     this.houseController.setDay();
                  }
            }
            this.numberOfRots = this.content.getR();
         }
         else
         {
            this.hitBox = new MovieClip();
            this.hitBox.graphics.beginFill(0,0.5);
            this.hitBox.graphics.drawRect(-20,-20,30,30);
            this.hitBox.graphics.endFill();
            this.addChild(this.hitBox);
            this.hitBox.visible = false;
            this.h = 1;
            this.w = 1;
            this.l = 1;
            this.isStackable = true;
            this.canStackOn = false;
            this.canSitOn = false;
            this.specialAction = "none";
            this.numberOfRots = 2;
            this.type = "avatarItem";
            this.loader.x = -20;
            this.loader.y = -20;
            this.setRotation(this._rot);
         }
         this.surfaceMap = this.houseModel.getMap(this.surfaceMapName);
         if(this.autoPlace == false)
         {
            if(this.newInHouseFlag == false)
            {
               if(this.canSitOn == false && this.h != 0)
               {
                  if(this.surfaceMap.placeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot,this.itemDataVo.uid,this.index) == false)
                  {
                     this.reset();
                     return;
                  }
               }
               this.houseController.registerSwf(new SwfVo(this.itemID,this.h,this.w,this.l,this.canStackOn,this.isStackable));
            }
         }
         else
         {
            this.findMyPlace();
         }
         this.dispatchEvent(new Event(ITEM_LOADED,true));
      }
      
      private function showReflection() : void
      {
         var _loc1_:AvatarModel = AvatarModel.getInstance();
         var _loc2_:Point = new Point(_loc1_.avatar.x,_loc1_.avatar.y);
         var _loc3_:Point = new Point(this.x,this.y);
         var _loc4_:Number = Math.abs(localToGlobal(_loc2_).x - localToGlobal(_loc3_).x);
         var _loc5_:Number = Math.abs(localToGlobal(_loc2_).y - localToGlobal(_loc3_).y);
      }
      
      private function isNear(param1:Number = 20) : Boolean
      {
         var _loc2_:AvatarModel = AvatarModel.getInstance();
         var _loc3_:Number = this.x - _loc2_.avatar.x;
         var _loc4_:Number = this.y - _loc2_.avatar.y;
         var _loc5_:Number = Math.sqrt(_loc3_ * _loc3_ + _loc4_ * _loc4_);
         if(_loc5_ < param1)
         {
            return true;
         }
         return false;
      }
      
      private function turnOnTv() : void
      {
         this.flipVid(!this.vidIsPlaying);
      }
      
      public function drawBox() : *
      {
         this.graphics.lineStyle(1,16711680);
         this.graphics.drawRect(this.feelerX - this.feelerW / 2,this.feelerY - this.feelerH / 2,this.feelerW,this.feelerH);
      }
      
      public function clearBox() : *
      {
         this.graphics.clear();
      }
      
      public function setRotation(param1:Number) : *
      {
         var _loc2_:Boolean = false;
         this.resetInfo();
         this.originalRot = this._rot;
         this._rot = param1;
         if(this.content != null)
         {
            this.content.setRotation(param1);
            this.content.getHitBox().gotoAndStop(param1);
         }
         if(this.itemDataVo.isAvatarItem == true)
         {
            if(param1 == 1)
            {
               this.scaleX = 1;
            }
            else
            {
               this.scaleX = -1;
            }
         }
         this.houseController.updateRotation(this.index,param1);
         if(this.surfaceMap != null)
         {
            if(this.isStacked == true)
            {
               if(this.level < 2)
               {
                  this.level = 2;
               }
            }
            _loc2_ = true;
            if(this.surfaceMap.isBlocked(this.level,this.xx,this.zz,this.w,this.l,this._rot) != -1)
            {
               _loc2_ = false;
            }
            if(this.surfaceMap.checkOutOfBounds(this.xx,this.zz,this.l,this.w,this._rot) == true)
            {
               _loc2_ = false;
            }
            if(_loc2_ == false && this.itemDataVo.area == "#floor" && this.isStacked == false)
            {
               this._rot = this.originalRot;
               this.content.setRotation(this.originalRot);
               this.content.getHitBox().gotoAndStop(this.originalRot);
               this.houseController.updateRotation(this.index,this._rot);
               this.messageController.setMessage(HouseMessages.NO_ROOM_ROTATE);
               this.reset();
               return;
            }
            if(this.h != 0 && this.canSitOn == false)
            {
               this.surfaceMap.placeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot,this.itemDataVo.uid,this.index);
            }
         }
         if(this.itemDataVo.area == "#wall" && this.resetFlag == true)
         {
            this.resetFlag = false;
            if(this.originalX < this.xSplit)
            {
               this.content.setRotation(1);
               this.originalRot = 1;
               this._rot = 1;
               this.leftWall = true;
               this.hitBox.gotoAndStop(1);
            }
            else
            {
               this.content.setRotation(2);
               this.originalRot = 2;
               this._rot = 2;
               this.leftWall = false;
               this.hitBox.gotoAndStop(2);
            }
         }
      }
      
      public function moveUp() : *
      {
         var _loc1_:Number = this.surfaceMap.isBlocked(this.level,this.xx + 1,this.zz - 1,this.w,this.l,this._rot);
         if(this._isStackedOn == null)
         {
            this.resetInfo();
            if(_loc1_ == -1 || _loc1_ == this.itemDataVo.uid)
            {
               if(this.itemDataVo.area == "#floor")
               {
                  this.x += this.parentCellHeight;
                  this.y -= this.parentCellHeight;
               }
               this.houseController.enableSave();
            }
         }
         else
         {
            --this.y;
            this.houseController.enableSave();
         }
         this.dispatchEvent(new DraggingEvent(DraggingEvent.RELEASED,this));
      }
      
      public function moveDown() : *
      {
         var _loc1_:Number = this.surfaceMap.isBlocked(this.level,this.xx - 1,this.zz + 1,this.w,this.l,this._rot);
         if(this._isStackedOn == null)
         {
            this.resetInfo();
            if(_loc1_ == -1 || _loc1_ == this.itemDataVo.uid)
            {
               if(this.itemDataVo.area == "#floor")
               {
                  this.x -= this.parentCellHeight;
                  this.y += this.parentCellHeight;
               }
               this.houseController.enableSave();
            }
         }
         else
         {
            ++this.y;
            this.houseController.enableSave();
         }
         this.dispatchEvent(new DraggingEvent(DraggingEvent.RELEASED,this));
      }
      
      public function moveLeft() : *
      {
         var _loc1_:Number = this.surfaceMap.isBlocked(this.level,this.xx - 1,this.zz - 1,this.w,this.l,this._rot);
         if(this._isStackedOn == null)
         {
            this.resetInfo();
            if(_loc1_ == -1 || _loc1_ == this.itemDataVo.uid)
            {
               if(this.itemDataVo.area == "#floor")
               {
                  this.x -= this.parentCellHeight;
                  this.y -= this.parentCellHeight;
               }
               this.houseController.enableSave();
            }
         }
         else
         {
            --this.x;
            this.houseController.enableSave();
         }
         this.dispatchEvent(new DraggingEvent(DraggingEvent.RELEASED,this));
      }
      
      public function moveRight() : *
      {
         var _loc1_:Number = this.surfaceMap.isBlocked(this.level,this.xx + 1,this.zz + 1,this.w,this.l,this._rot);
         if(this._isStackedOn == null)
         {
            this.resetInfo();
            if(_loc1_ == -1 || _loc1_ == this.itemDataVo.uid)
            {
               if(this.itemDataVo.area == "#floor")
               {
                  this.x += this.parentCellHeight;
                  this.y += this.parentCellHeight;
               }
            }
         }
         else
         {
            ++this.x;
            this.houseController.enableSave();
         }
         this.dispatchEvent(new DraggingEvent(DraggingEvent.RELEASED,this));
      }
      
      public function getRotation() : Number
      {
         return this._rot;
      }
      
      public function reset() : void
      {
         this.resetFlag = true;
         if(this.newInHouseFlag == false)
         {
            this.tweenX = new Tween(this,"x",None.easeNone,this.x,this.originalX,6,false);
            this.tweenY = new Tween(this,"y",None.easeNone,this.y,this.originalY,6,false);
            this.tweenX.addEventListener(TweenEvent.MOTION_FINISH,this.resetTweenDone);
         }
         this.yy = this.originalYY;
         if(this.itemDataVo.area == "#wall")
         {
            if(this.originalX > this.xSplit)
            {
               this.content.getObj().gotoAndStop(2);
               this._rot = 1;
               this.hitBox.gotoAndStop(2);
               this.leftWall = true;
            }
            else
            {
               this.content.getObj().gotoAndStop(1);
               this._rot = 2;
               this.hitBox.gotoAndStop(1);
               this.leftWall = false;
            }
         }
         this.isStacked = this.originalIsStacked;
         this.level = this.originalLevel;
         if(this.surfaceMap != null)
         {
            if(this.newInHouseFlag == false)
            {
               if(this.isStacked == true)
               {
                  if(this.level < 2)
                  {
                     this.level = 2;
                  }
               }
               if(this.h != 0 && this.canSitOn == false)
               {
                  this.surfaceMap.placeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot,this.itemDataVo.uid,this.index);
               }
            }
         }
         if(this.newInHouseFlag == true)
         {
            this.sendBack();
         }
         else
         {
            this.dispatchEvent(new ResetEvent(ResetEvent.RESET_ITEM,this,true));
         }
         if(this.itemDataVo.area == "#floor")
         {
            this.dispatchEvent(new Event(HouseConstants.RESET_BLOCKED,true));
         }
      }
      
      private function resetStackedItems() : *
      {
         var _loc3_:StackedItemVo = null;
         var _loc1_:Number = this.stackArray.length;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            _loc3_ = this.stackArray[_loc2_];
            if(_loc3_ != null)
            {
               _loc3_.item.reset();
            }
            _loc2_++;
         }
      }
      
      public function getStackString() : String
      {
         var _loc3_:StackedItemVo = null;
         var _loc1_:String = "";
         var _loc2_:int = 0;
         while(_loc2_ < this.numberOfStackedItems)
         {
            _loc3_ = this.stackArray[_loc2_];
            if(_loc3_ != null)
            {
               _loc1_ += String(_loc3_.item.itemDataVo.uid) + "<si>";
            }
            _loc2_++;
         }
         return _loc1_;
      }
      
      public function sendBack() : *
      {
         if(this._isStackedOn != null)
         {
            this._isStackedOn.removeStackedItem(this);
         }
         this.houseController.lockCurrent();
         this.tweenX = new Tween(this,"x",None.easeNone,this.x,800,1,true);
         this.tweenY = new Tween(this,"y",None.easeNone,this.y,0,1,true);
         this.tweenY.addEventListener(TweenEvent.MOTION_FINISH,this.tweenDone);
         this.houseController.destroyCurrentItem();
         this.dispatchEvent(new Event(HouseConstants.RESET_BLOCKED,true));
      }
      
      private function tweenDone(param1:TweenEvent) : *
      {
         this.tweenY.removeEventListener(TweenEvent.MOTION_FINISH,this.tweenDone);
         this.houseController.clearCurrentItem();
         this.houseController.unlockCurrent();
      }
      
      private function resetTweenDone(param1:TweenEvent) : *
      {
         this.tweenX.removeEventListener(TweenEvent.MOTION_FINISH,this.resetTweenDone);
         this.dispatchEvent(new ResetEvent(ResetEvent.RESET_ITEM,this,true));
         if(this.itemDataVo.area == "#wall")
         {
            if(this.x > this.xSplit)
            {
               this.content.getObj().gotoAndStop(2);
               this._rot = 1;
               this.leftWall = true;
            }
            else
            {
               this.content.getObj().gotoAndStop(1);
               this._rot = 2;
               this.leftWall = false;
            }
         }
      }
      
      public function setPos(param1:CoordVo) : *
      {
         if(param1.x == -1 && param1.y == -1)
         {
            this.reset();
         }
         else
         {
            this.x = param1.x;
            this.y = param1.y;
         }
      }
      
      public function setWallPos(param1:WallItemVo, param2:Boolean = false) : *
      {
         var _loc3_:Number = NaN;
         this.leftWall = param2;
         this.hasBeenPlaced = true;
         if(param1 == null)
         {
            this.reset();
         }
         else
         {
            this.wallHeight = 9 - param1.z;
            if(this.surfaceMap == null)
            {
               this.reset();
               return;
            }
            _loc3_ = this.surfaceMap.isBlocked(this.level,param1.x,param1.z,this.w,this.l,this._rot);
            this.x = param1.clip.x;
            this.y = param1.clip.y;
            this.xx = param1.x;
            this.zz = param1.z;
            if(param2 == true)
            {
               this.xx = this.houseModel.houseW - param1.x;
            }
            this.surfaceMap.placeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot,this.itemDataVo.uid,this.index);
            this.houseController.updatePos(this.index,this.xx,this.zz);
            this.updateOrigs();
         }
      }
      
      public function setPosByTile(param1:ITileVo) : *
      {
         var _loc2_:Number = NaN;
         var _loc3_:SwfVo = null;
         var _loc4_:Number = NaN;
         this.hasBeenPlaced = true;
         if(param1 == null)
         {
            this.reset();
         }
         else
         {
            this.itemTileVo = param1;
            this.depth = param1.depth;
            _loc2_ = this.surfaceMap.isBlocked(this.level,param1.x,param1.z,this.w,this.l,this._rot);
            _loc3_ = this.houseModel.getSwf(_loc2_);
            if(_loc2_ == -1 || _loc3_.height == 0 || _loc2_ == this.itemDataVo.uid)
            {
               this.x = param1.clip.x;
               if(this._isStackedOn != null)
               {
                  if(this._isStackedOn.type != "shelf")
                  {
                     this.y = param1.clip.y;
                  }
               }
               else
               {
                  this.y = param1.clip.y;
               }
               _loc4_ = (this.yy - 1) * this.parentCellHeight;
               this.xx = param1.x;
               this.zz = param1.z;
               if(this.h != 0 && this.canSitOn == false)
               {
                  if(this.surfaceMap.placeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot,this.itemDataVo.uid,this.index) == false)
                  {
                     this.reset();
                     return;
                  }
               }
               this.houseController.updatePos(this.index,this.xx,this.zz);
               this.updateOrigs();
            }
            else
            {
               this.reset();
            }
         }
      }
      
      public function stackItem(param1:ITileVo, param2:Number, param3:Number) : Boolean
      {
         if(this.houseModel.editMode == false)
         {
            return false;
         }
         this.hasBeenPlaced = true;
         if(param1 != null)
         {
            this.itemTileVo = param1;
            this.depth = param1.depth;
            this.isStacked = true;
            this.xx = param1.x;
            this.zz = param1.z;
         }
         this.yy = param2;
         this.updateOrigs();
         if(this.level < 2)
         {
            this.level = 2;
         }
         this.houseController.updatePos(this.index,this.xx,this.zz);
         this.houseController.updateYPos(this.index,this.yy);
         return true;
      }
      
      public function updateStackItem(param1:ITileVo) : *
      {
         this.itemTileVo = param1;
         this.depth = param1.depth;
         this.xx = param1.x;
         this.zz = param1.z;
         this.updateOrigs();
         if(this.level < 2)
         {
            this.level = 2;
         }
         if(this.surfaceMap.placeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot,this.itemDataVo.uid,this.index) == false)
         {
            this.reset();
            return;
         }
         this.houseController.updatePos(this.index,this.xx,this.zz);
      }
      
      public function updateOrigs() : *
      {
         this.originalX = this.x;
         this.originalY = this.y;
         this.originalYY = this.yy;
         this.originalIsStacked = this.isStacked;
         this.originalLevel = this.level;
      }
      
      public function registerStackedItem(param1:StackedItemVo) : *
      {
         this.stackArray.push(param1);
      }
      
      public function getStackedItem(param1:Number) : StackedItemVo
      {
         return this.stackArray[param1];
      }
      
      public function get numberOfStackedItems() : *
      {
         var _loc1_:Number = 0;
         var _loc2_:Number = this.stackArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            if(this.stackArray[_loc3_] != null)
            {
               _loc1_++;
            }
            _loc3_++;
         }
         return _loc1_;
      }
      
      public function isStackedOnMe(param1:SwfItem) : Boolean
      {
         var _loc4_:StackedItemVo = null;
         var _loc2_:Number = this.stackArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.stackArray[_loc3_];
            if(_loc4_ != null)
            {
               if(_loc4_.item == param1)
               {
                  return true;
               }
            }
            _loc3_++;
         }
         return false;
      }
      
      public function removeStackedItem(param1:SwfItem) : *
      {
         var _loc5_:StackedItemVo = null;
         var _loc2_:Array = new Array();
         var _loc3_:Number = this.stackArray.length;
         var _loc4_:int = 0;
         while(_loc4_ < _loc3_)
         {
            if(this.stackArray[_loc4_] != null)
            {
               _loc5_ = this.stackArray[_loc4_];
               if(_loc5_.item == param1)
               {
                  _loc5_.item.yy = 0;
                  this.houseController.updateYPos(_loc5_.item.index,0);
               }
               else
               {
                  _loc2_.push(_loc5_);
               }
            }
            _loc4_++;
         }
         this.stackArray = _loc2_;
      }
      
      public function displayStacked() : *
      {
         var _loc3_:StackedItemVo = null;
         var _loc1_:Number = this.stackArray.length;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            if(this.stackArray[_loc2_] != null)
            {
               _loc3_ = this.stackArray[_loc2_];
            }
            _loc2_++;
         }
      }
      
      public function unstack() : *
      {
         if(this._isStackedOn != null)
         {
            this._isStackedOn.removeStackedItem(this);
         }
         this._isStackedOn = null;
         this.isStacked = false;
      }
      
      public function get editMode() : Boolean
      {
         return this._editMode;
      }
      
      public function set editMode(param1:Boolean) : void
      {
         this._editMode = param1;
         if(this.editMode == true)
         {
            this.addEventListener(MouseEvent.MOUSE_DOWN,this.pressed);
            this.addEventListener(MouseEvent.MOUSE_OVER,this.over);
            this.addEventListener(MouseEvent.MOUSE_OUT,this.out);
         }
         else
         {
            this.addEventListener(MouseEvent.MOUSE_DOWN,this.moveHere);
         }
      }
      
      private function showPopOutButtons() : *
      {
         this.dispatchEvent(new EditEvent(EditEvent.EDIT,this,true));
      }
      
      private function moveHere(param1:Event) : *
      {
         var _loc2_:AvatarController = null;
         if(this.noMove == false && this.itemDataVo.area == "#floor" && this.isStacked == false)
         {
            _loc2_ = new AvatarController();
            _loc2_.setTarget(this.x + this.mouseX,this.y + this.mouseY);
         }
      }
      
      public function init() : void
      {
         this.originalX = this.x;
         this.originalY = this.y;
         this.originalYY = this.yy;
         this.originalIsStacked = this.isStacked;
         this.originalLevel = this.level;
         if(this.houseModel.editMode == true)
         {
         }
         this.houseController.setCurrentItem(this);
         try
         {
            if(this.newInHouseFlag == false)
            {
               if(this._isStackedOn != null)
               {
                  if(this.level < 2)
                  {
                     this.level = 2;
                  }
               }
               if(this.h != 0 && this.canSitOn == false)
               {
                  if(this.surfaceMap.placeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot,this.itemDataVo.uid,this.index) == false)
                  {
                     this.reset();
                     return;
                  }
               }
            }
         }
         catch(e:Error)
         {
         }
         this.dispatchEvent(new DraggingEvent(DraggingEvent.INIT,this));
      }
      
      public function newInHouse() : *
      {
         this.newInHouseFlag = true;
         this.originalX = -1;
         this.originalY = -1;
         HouseConstants.MY_STAGE.addEventListener(MouseEvent.MOUSE_MOVE,this.dragging);
         this.isDragging = true;
      }
      
      public function get depth2() : Number
      {
         if(this.h == 0)
         {
            return this.y - 200;
         }
         if(this._isStackedOn == null)
         {
            return this.y;
         }
         return this._isStackedOn.depth2 + this.level * 10;
      }
      
      public function set depth2(param1:Number) : void
      {
         this._depth2 = param1;
      }
      
      public function avoidParadox(param1:SwfItem) : *
      {
         if(this.isStackedOnMe(param1) == true)
         {
            this.removeStackedItem(param1);
         }
      }
      
      public function getMyName() : String
      {
         return this.itemDataVo.name;
      }
      
      public function get canDrag() : Boolean
      {
         return this._canDrag;
      }
      
      public function set canDrag(param1:Boolean) : void
      {
         if(this._canDrag == true && param1 == false)
         {
         }
         this._canDrag = param1;
         if(this._canDrag == true)
         {
            this.dispatchEvent(new DraggingEvent(DraggingEvent.DRAGGING,this));
            this.startDrag2();
         }
      }
      
      public function get isStackedOn() : SwfItem
      {
         return this._isStackedOn;
      }
      
      public function set isStackedOn(param1:SwfItem) : void
      {
         if(this._isStackedOn != param1 && this._isStackedOn != null)
         {
            this._isStackedOn.removeStackedItem(this);
         }
         if(this.isStackedOnMe(param1) == true)
         {
            this.removeStackedItem(param1);
         }
         this._isStackedOn = param1;
      }
      
      public function get h() : Number
      {
         return this._h;
      }
      
      public function set h(param1:Number) : void
      {
         this._h = param1;
      }
      
      public function get w() : Number
      {
         return this._w;
      }
      
      public function set w(param1:Number) : void
      {
         this._w = param1;
      }
      
      public function get l() : Number
      {
         return this._l;
      }
      
      public function set l(param1:Number) : void
      {
         this._l = param1;
      }
      
      public function get numberOfRots() : Number
      {
         return this._numberOfRots;
      }
      
      public function set numberOfRots(param1:Number) : void
      {
         this._numberOfRots = param1;
      }
      
      public function get canStackOn() : Boolean
      {
         return this._canStackOn;
      }
      
      public function set canStackOn(param1:Boolean) : void
      {
         this._canStackOn = param1;
      }
      
      public function get isStackable() : Boolean
      {
         return this._isStackable;
      }
      
      public function set isStackable(param1:Boolean) : void
      {
         this._isStackable = param1;
      }
      
      public function get canSitOn() : Boolean
      {
         return this._canSitOn;
      }
      
      public function set canSitOn(param1:Boolean) : void
      {
         this._canSitOn = param1;
      }
      
      public function get specialAction() : String
      {
         return this._specialAction;
      }
      
      public function set specialAction(param1:String) : void
      {
         this._specialAction = param1;
      }
      
      public function get type() : String
      {
         return this._type;
      }
      
      public function set type(param1:String) : void
      {
         this._type = param1;
      }
      
      public function get obj() : MovieClip
      {
         return this._obj;
      }
      
      public function set obj(param1:MovieClip) : void
      {
         this._obj = param1;
      }
      
      public function get hitBox() : MovieClip
      {
         return this._hitBox;
      }
      
      public function set hitBox(param1:MovieClip) : void
      {
         this._hitBox = param1;
      }
      
      public function get itemID() : Number
      {
         return this._itemID;
      }
      
      public function set itemID(param1:Number) : void
      {
         this._itemID = param1;
      }
      
      public function get itemTileVo() : ITileVo
      {
         return this._itemTileVo;
      }
      
      public function set itemTileVo(param1:ITileVo) : void
      {
         this._itemTileVo = param1;
      }
      
      public function get itemDataVo() : ItemDataVo
      {
         return this._itemDataVo;
      }
      
      public function set itemDataVo(param1:ItemDataVo) : void
      {
         this._itemDataVo = param1;
      }
      
      public function get yy() : Number
      {
         return this._yy;
      }
      
      public function set yy(param1:Number) : void
      {
         this._yy = param1;
      }
      
      public function get zz() : Number
      {
         return this._zz;
      }
      
      public function set zz(param1:Number) : void
      {
         this._zz = param1;
      }
      
      public function get xx() : Number
      {
         return this._xx;
      }
      
      public function set xx(param1:Number) : void
      {
         this._xx = param1;
      }
      
      private function stopTheDrag(param1:MouseEvent) : void
      {
         this.stopDrag();
         this.fixDepthsOnStackedItems();
         this.houseController.itemIsBeingDragged(false);
         if(this.isDragging == true)
         {
            this.dispatchEvent(new DraggingEvent(DraggingEvent.RELEASED,this));
            HouseConstants.MY_STAGE.removeEventListener(MouseEvent.MOUSE_MOVE,this.dragging);
            this.canDrag = false;
            if(this.newInHouseFlag == true)
            {
               this.houseController.registerSwf(new SwfVo(this.itemID,this.h,this.w,this.l,this.canStackOn,this.isStackable));
            }
         }
         this.filters = [];
         this.isDragging = false;
         this.newInHouseFlag = false;
         this.houseController.setDragItem(null);
      }
      
      public function putDown(param1:MouseEvent) : *
      {
         if(this.isDragging == true)
         {
            this.dispatchEvent(new DraggingEvent(DraggingEvent.RELEASED,this));
            HouseConstants.MY_STAGE.removeEventListener(MouseEvent.MOUSE_MOVE,this.dragging);
            this.canDrag = false;
         }
      }
      
      public function setInPlace() : *
      {
         this.stopDrag();
         this.fixDepthsOnStackedItems();
         this.houseController.itemIsBeingDragged(false);
         if(this.newInHouseFlag == true)
         {
            this.houseController.registerSwf(new SwfVo(this.itemID,this.h,this.w,this.l,this.canStackOn,this.isStackable));
         }
      }
      
      private function fixDepthsOnStackedItems() : *
      {
         var _loc3_:StackedItemVo = null;
         var _loc1_:Number = this.stackArray.length;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            _loc3_ = this.stackArray[_loc2_];
            if(_loc3_ != null)
            {
               _loc3_.item.depth = this.depth + _loc2_ * 20;
            }
            _loc2_++;
         }
      }
      
      public function passPressToMe(param1:MouseEvent) : *
      {
         this.pressed(param1);
      }
      
      private function pressed(param1:MouseEvent) : *
      {
         if(this.houseModel.currentLock == true)
         {
            return;
         }
         this.resetFlag = false;
         if(this._isStackedOn != null)
         {
         }
         if(this.houseModel.itemBeingDragged != null)
         {
            if(this.houseModel.itemBeingDragged != this)
            {
               this.houseModel.itemBeingDragged.passPressToMe(param1);
               return;
            }
         }
         this.houseController.setCurrentItem(this);
         if(this.isDragging == true)
         {
            this.stopTheDrag(param1);
         }
         else if(this._canDrag == true)
         {
            this.startDrag2();
         }
         else if(this.houseModel.itemIsBeingDragged == false)
         {
            this.showPopOutButtons();
         }
      }
      
      private function startTheDrag(param1:MouseEvent) : void
      {
         this.startDrag2();
      }
      
      public function startDrag2() : *
      {
         if(this._isStackedOn != null)
         {
         }
         this.resetInfo();
         this.debugController.updatedInfo();
         this.houseController.itemIsBeingDragged(true);
         HouseConstants.MY_STAGE.addEventListener(MouseEvent.MOUSE_MOVE,this.dragging);
         this.startDrag(false);
         this.houseController.setDragItem(this);
         this.isDragging = true;
         if(this.itemDataVo != null)
         {
            if(this.itemDataVo.area == "#floor")
            {
               this.dispatchEvent(new Event(HouseConstants.SHOW_NOT_BLOCKED,true));
            }
         }
      }
      
      public function setTheItem() : *
      {
      }
      
      public function resetInfo() : *
      {
         if(this.surfaceMap == null)
         {
            return;
         }
         if(this.itemDataVo.area == "#floor")
         {
            if(this.isStacked == true)
            {
               if(this.level < 2)
               {
                  this.level = 2;
               }
            }
            this.surfaceMap.removeItem(this.level,this.xx,this.zz,this.w,this.l,this._rot);
            this.yy = 1;
            if(this.h == 0)
            {
               this.level = 0;
            }
            else
            {
               this.level = 1;
            }
            this.debugController.updatedInfo();
         }
         if(this.itemDataVo.area == "#wall")
         {
            this.surfaceMap.clearItemFromMap(this.level,this.index);
         }
      }
      
      private function dragging(param1:Event) : *
      {
         var _loc2_:Number = NaN;
         var _loc3_:Number = NaN;
         if(this.isDragging == true)
         {
            _loc2_ = Math.abs(this.originalX - this.x);
            _loc3_ = Math.abs(this.originalY - this.y);
            if(_loc2_ > 20 || _loc3_ > 20)
            {
            }
            this.debugController.updatedInfo();
            this.dispatchEvent(new DraggingEvent(DraggingEvent.DRAGGING,this));
         }
      }
      
      private function itemSelected(param1:Event) : *
      {
         if(this.houseModel.currentItem == this)
         {
            if(this.houseModel.editMode == true)
            {
            }
         }
         else if(this.editMode == true)
         {
         }
      }
      
      private function over(param1:MouseEvent) : *
      {
         this.showGreen();
      }
      
      private function out(param1:MouseEvent) : *
      {
         this.noHighlight();
      }
      
      public function showRed() : *
      {
         var _loc1_:GlowFilter = new GlowFilter(16711680,1,6,6,4);
         this.filters = [_loc1_];
      }
      
      public function showGreen() : *
      {
         var _loc1_:GlowFilter = new GlowFilter(65280,0.5,6,6,4);
         this.filters = [_loc1_];
      }
      
      public function noHighlight() : *
      {
         this.filters = [];
      }
      
      private function findMyPlace() : *
      {
      }
      
      private function findMyWallPlace() : *
      {
      }
      
      public function zoomInPlace() : *
      {
         this.zoomTweenY = new Tween(this,"y",None.easeNone,-500,this.y,5,false);
      }
      
      public function setLight(param1:Boolean) : *
      {
         if(this.obj.light != null)
         {
            this.obj.light.visible = param1;
         }
      }
      
      public function flipVid(param1:Boolean = true) : *
      {
         var _loc3_:String = null;
         var _loc2_:VideoChooser = new VideoChooser();
         if(this.obj.player != null)
         {
            if(param1 == true)
            {
               _loc3_ = _loc2_.getVideo();
               this.obj.player.load(_loc3_);
               this.obj.player.play();
               this.vidIsPlaying = true;
            }
            else
            {
               this.vidIsPlaying = false;
               this.obj.player.stop();
            }
         }
      }
      
      public function resetStacked() : void
      {
         if(this._isStackedOn != null)
         {
            this._isStackedOn.removeStackedItem(this);
         }
         this.isStacked = false;
         this._isStackedOn = null;
      }
      
      public function loadEditFile() : void
      {
         var _loc1_:ByteArray = this.houseModel.editData;
         this.loader.loadBytes(_loc1_);
         this.itemDataVo.area = "#floor";
      }
      
      public function get clip() : Sprite
      {
         return this as Sprite;
      }
   }
}

