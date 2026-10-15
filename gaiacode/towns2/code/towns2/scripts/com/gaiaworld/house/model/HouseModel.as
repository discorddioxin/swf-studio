package com.gaiaworld.house.model
{
   import com.gaiaworld.global.interfaces.ISurface;
   import com.gaiaworld.house.constants.HouseConstants;
   import com.gaiaworld.house.controller.DebugController;
   import com.gaiaworld.house.controller.events.MoveEvent;
   import com.gaiaworld.house.controller.events.StackEvent;
   import com.gaiaworld.house.data.SurfaceMap;
   import com.gaiaworld.house.util.WallPatterns2;
   import com.gaiaworld.house.view.items.SwfItem;
   import com.gaiaworld.house.vo.ItemDataVo;
   import com.gaiaworld.house.vo.ItemVo;
   import com.gaiaworld.house.vo.RoomItemVo;
   import com.gaiaworld.house.vo.SwfVo;
   import com.gaiaworld.user.vo.UserVo;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.utils.ByteArray;
   
   public class HouseModel extends EventDispatcher
   {
      
      private static var instance:HouseModel;
      
      public var houseW:Number = 14;
      
      public var houseH:Number = 12;
      
      public var thumbPath:String;
      
      public var imagespath:String;
      
      public var roomimagepath:String = "";
      
      public var avatarpath:String;
      
      public var user_id:Number;
      
      public var house_id:Number = 31609365;
      
      public var floorTileID:Number;
      
      public var rightWallTileID:Number;
      
      public var leftWallTileID:Number;
      
      private var _floorTile:String;
      
      private var _leftWallTile:String;
      
      private var _rightWallTile:String;
      
      private var _rWallVo:ItemDataVo;
      
      private var _lWallVo:ItemDataVo;
      
      private var _floorVo:ItemDataVo;
      
      private var _leftWallPattern:Number = 4;
      
      private var _rightWallPattern:Number = 1;
      
      private var _floorPattern:Number = 1;
      
      public var itemIsBeingDragged:Boolean = false;
      
      public var isNight:Boolean = false;
      
      public var houseMapID:int = -1;
      
      public var wp:WallPatterns2 = new WallPatterns2();
      
      private var itemArray:Array = new Array();
      
      private var _itemCat:String = "#floor";
      
      private var _currentItem:SwfItem;
      
      private var _debugText:String;
      
      private var _debugFlag:Boolean;
      
      private var _definitionArray:Array = new Array();
      
      public var mapArray:Array = new Array();
      
      public var swfArray:Array = new Array();
      
      public var clipArray:Array = new Array();
      
      public var surfaceArray:Array = new Array();
      
      public var userVo:UserVo;
      
      public var sid:String = "";
      
      public var saveDate:Number = 0;
      
      private var _newItem:ItemDataVo;
      
      private var debugController:DebugController = new DebugController();
      
      public var wallSwitch:String = "left";
      
      public var currentArea:String = "#floor";
      
      public var editMode:Boolean = true;
      
      private var _currentLock:Boolean = false;
      
      public var houseStyle:String = "0a1";
      
      private var _loadingMessage:String;
      
      private var _itemTrans:Number = 1;
      
      private var _colFlag:Boolean = false;
      
      private var _dragWorld:Boolean = false;
      
      private var _dragMode:Boolean = false;
      
      private var _currentTab:Object;
      
      private var _itemStatus:Number;
      
      private var _percentLoaded:Number = 0;
      
      public var bubbleMessage:String = "";
      
      public var mDifX:Number;
      
      public var mDifY:Number;
      
      public var itemBeingDragged:SwfItem;
      
      public var serialView:Number = -1;
      
      public var wallMapX:Number;
      
      public var wallMapY:Number;
      
      public var house:Sprite;
      
      public var alwaysDark:Boolean = false;
      
      public var alwaysLight:Boolean = false;
      
      public var doorX:Number = 0;
      
      public var doorY:Number = 0;
      
      public var doorR:Number = 0;
      
      public var hood:Number = 0;
      
      public var address:String;
      
      public var enableStacking:Boolean = true;
      
      public var editData:ByteArray;
      
      private var _tooltipText:String = "";
      
      private var _houseName:String = null;
      
      public function HouseModel()
      {
         super();
      }
      
      public static function getInstance() : HouseModel
      {
         if(instance == null)
         {
            instance = new HouseModel();
         }
         return instance;
      }
      
      public function addItemToRoom(param1:RoomItemVo) : *
      {
         this.itemArray.push(param1);
      }
      
      public function getItem(param1:Number) : RoomItemVo
      {
         return this.itemArray[param1] as RoomItemVo;
      }
      
      public function findItem(param1:Number) : RoomItemVo
      {
         var _loc4_:RoomItemVo = null;
         var _loc2_:Number = this.itemArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.itemArray[_loc3_];
            if(_loc4_.uniqueID == param1)
            {
               return _loc4_;
            }
            _loc3_++;
         }
         return null;
      }
      
      public function setSize(param1:Number, param2:Number) : void
      {
         this.houseW = param1;
         this.houseH = param2;
         this.dispatchEvent(new Event(HouseConstants.HOUSE_SIZE_SET,true));
      }
      
      public function findSwfItem(param1:Number) : SwfItem
      {
         var _loc4_:SwfItem = null;
         var _loc2_:Number = this.itemArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.clipArray[_loc3_];
            if(_loc4_ != null)
            {
               if(_loc4_.itemDataVo.uid == param1)
               {
                  return _loc4_;
               }
            }
            _loc3_++;
         }
         return null;
      }
      
      public function addInfo(param1:ItemVo) : *
      {
         var _loc4_:RoomItemVo = null;
         var _loc2_:Number = this.itemArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.itemArray[_loc3_];
            if(_loc4_.itemID == param1.itemID)
            {
               _loc4_.itemVo = param1;
            }
            _loc3_++;
         }
      }
      
      public function initWallTiles(param1:Number, param2:Number) : *
      {
         this._leftWallPattern = param1;
         this._rightWallPattern = param2;
      }
      
      public function getFloorTile(param1:Number, param2:Number) : String
      {
         if(this.floorVo == null)
         {
            this.floorVo = new ItemDataVo(3172,0,"blank",["0501/12741f9d_wtile_01a_r1.png","0501/12741f9d_wtile_01a_r2.png","0501/12741f9d_wtile_01a_r1.png","0501/12741f9d_wtile_01a_r3.png","0501/12741f9d_wtile_01a_r4.png"],"wall","",true,"");
         }
         var _loc3_:Number = this.wp.getFloorTile(param1,param2,this.floorVo.imageArray.length,this.floorPattern);
         var _loc4_:String = this.roomimagepath + this.floorVo.imageArray[_loc3_];
         var _loc5_:Number = _loc4_.indexOf(".png");
         if(_loc5_ == -1)
         {
            _loc4_ = this.roomimagepath + "tiles/" + this.floorVo.imageArray[_loc3_] + ".png";
         }
         return _loc4_;
      }
      
      public function getLWallTile(param1:Number, param2:Number) : String
      {
         if(this.lWallVo == null)
         {
            this.lWallVo = new ItemDataVo(3172,0,"blank",["0501/12741f9d_wtile_01a_r1.png","0501/12741f9d_wtile_01a_r2.png","0501/12741f9d_wtile_01a_r1.png","0501/12741f9d_wtile_01a_r3.png","0501/12741f9d_wtile_01a_r4.png"],"wall","",true,"");
         }
         var _loc3_:Number = this.wp.getTile(param1,param2,this.lWallVo.imageArray.length,this.leftWallPattern);
         var _loc4_:String = this.roomimagepath + this.lWallVo.imageArray[_loc3_];
         var _loc5_:Number = _loc4_.indexOf(".png");
         if(_loc5_ == -1)
         {
            _loc4_ = this.roomimagepath + "tiles/" + this._lWallVo.imageArray[_loc3_] + ".png";
         }
         return _loc4_;
      }
      
      public function getRWallTile(param1:Number, param2:Number) : String
      {
         if(this.rWallVo == null)
         {
            this.rWallVo = new ItemDataVo(3172,0,"blank",["0501/12741f9d_wtile_01a_r1.png","0501/12741f9d_wtile_01a_r2.png","0501/12741f9d_wtile_01a_r1.png","0501/12741f9d_wtile_01a_r3.png","0501/12741f9d_wtile_01a_r4.png"],"wall","",true,"");
         }
         var _loc3_:Number = this.wp.getTile(param1,param2,this.rWallVo.imageArray.length,this.rightWallPattern);
         var _loc4_:String = this.roomimagepath + this._rWallVo.imageArray[_loc3_];
         var _loc5_:Number = _loc4_.indexOf(".png");
         if(_loc5_ == -1)
         {
            _loc4_ = this.roomimagepath + "tiles/" + this._rWallVo.imageArray[_loc3_] + ".png";
         }
         return _loc4_;
      }
      
      public function get debugText() : String
      {
         return this._debugText;
      }
      
      public function set debugText(param1:String) : void
      {
         this._debugText = param1;
         this.dispatchEvent(new Event(HouseConstants.NEW_DEBUG_TEXT,true));
      }
      
      public function get numberOfItems() : Number
      {
         return this.itemArray.length;
      }
      
      public function get debugFlag() : Boolean
      {
         return this._debugFlag;
      }
      
      public function set debugFlag(param1:Boolean) : void
      {
         this._debugFlag = param1;
         this.dispatchEvent(new Event(HouseConstants.TEXT_FLAG_UPDATED,true));
      }
      
      public function get currentItem() : SwfItem
      {
         return this._currentItem;
      }
      
      public function set currentItem(param1:SwfItem) : void
      {
         if(this.currentLock == false)
         {
            this._currentItem = param1;
            this.dispatchEvent(new Event(HouseConstants.CURRENT_ITEM_SELECTED,true));
         }
      }
      
      public function get itemCat() : String
      {
         return this._itemCat;
      }
      
      public function set itemCat(param1:String) : void
      {
         this._itemCat = param1;
         this.dispatchEvent(new Event(HouseConstants.CATEGORY_CHANGED,true));
      }
      
      public function get definitionArray() : Array
      {
         return this._definitionArray;
      }
      
      public function set definitionArray(param1:Array) : void
      {
         this._definitionArray = param1;
         this._definitionArray.sortOn("uid",Array.NUMERIC,Array.DESCENDING);
         this._definitionArray.reverse();
      }
      
      public function getTiles() : Array
      {
         var _loc4_:ItemDataVo = null;
         var _loc1_:Array = new Array();
         var _loc2_:Number = this._definitionArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this._definitionArray[_loc3_];
            if(_loc4_.isTile == true)
            {
               _loc1_.push(_loc4_);
            }
            _loc3_++;
         }
         return _loc1_;
      }
      
      public function getDefByCat(param1:String) : Array
      {
         var _loc5_:ItemDataVo = null;
         var _loc2_:Array = new Array();
         var _loc3_:Number = this._definitionArray.length;
         var _loc4_:int = 0;
         while(_loc4_ < _loc3_)
         {
            _loc5_ = this._definitionArray[_loc4_];
            if(this.isInHouse(_loc5_.uid) == false)
            {
               _loc5_.onFloor = false;
            }
            if(_loc5_.area == param1)
            {
               _loc2_.push(_loc5_);
            }
            _loc4_++;
         }
         return _loc2_.slice();
      }
      
      public function listInventory() : *
      {
         var _loc3_:ItemDataVo = null;
         var _loc1_:Number = this._definitionArray.length;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            _loc3_ = this._definitionArray[_loc2_];
            _loc2_++;
         }
      }
      
      public function getDefByUid(param1:Number) : ItemDataVo
      {
         var _loc4_:ItemDataVo = null;
         var _loc2_:Number = this._definitionArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this._definitionArray[_loc3_];
            if(_loc4_.uid == param1)
            {
               return _loc4_;
            }
            _loc3_++;
         }
         return null;
      }
      
      public function get newItem() : ItemDataVo
      {
         return this._newItem;
      }
      
      public function set newItem(param1:ItemDataVo) : void
      {
         this._newItem = param1;
         this.dispatchEvent(new Event(HouseConstants.ENABLE_SAVE,false));
         this.dispatchEvent(new Event(HouseConstants.ADD_NEW_ITEM_TO_HOUSE,true));
      }
      
      public function get floorTile() : String
      {
         return this._floorTile;
      }
      
      public function set floorTile(param1:String) : void
      {
         this._floorTile = param1;
         this.dispatchEvent(new Event(HouseConstants.FLOOR_TILE_CHANGED,true));
      }
      
      public function get leftWallPattern() : Number
      {
         return this._leftWallPattern;
      }
      
      public function set leftWallPattern(param1:Number) : void
      {
         this._leftWallPattern = param1;
         this.enableSave();
         this.dispatchEvent(new Event(HouseConstants.WALL_TILE_CHANGED_LEFT,true));
      }
      
      public function get rightWallPattern() : Number
      {
         return this._rightWallPattern;
      }
      
      public function set rightWallPattern(param1:Number) : void
      {
         this._rightWallPattern = param1;
         this.enableSave();
         this.dispatchEvent(new Event(HouseConstants.WALL_TILE_CHANGED_RIGHT,true));
      }
      
      public function get floorPattern() : Number
      {
         return this._floorPattern;
      }
      
      public function set floorPattern(param1:Number) : void
      {
         this._floorPattern = param1;
         this.enableSave();
         this.dispatchEvent(new Event(HouseConstants.FLOOR_TILE_CHANGED,true));
      }
      
      public function get floorVo() : ItemDataVo
      {
         return this._floorVo;
      }
      
      public function set floorVo(param1:ItemDataVo) : void
      {
         this._floorVo = param1;
         this.dispatchEvent(new Event(HouseConstants.FLOOR_TILE_CHANGED,true));
      }
      
      public function get lWallVo() : ItemDataVo
      {
         return this._lWallVo;
      }
      
      public function set lWallVo(param1:ItemDataVo) : void
      {
         this._lWallVo = param1;
         this.dispatchEvent(new Event(HouseConstants.WALL_TILE_CHANGED_LEFT,true));
      }
      
      public function get rWallVo() : ItemDataVo
      {
         return this._rWallVo;
      }
      
      public function set rWallVo(param1:ItemDataVo) : void
      {
         this._rWallVo = param1;
         this.dispatchEvent(new Event(HouseConstants.WALL_TILE_CHANGED_RIGHT,true));
      }
      
      public function get dragWorld() : Boolean
      {
         return this._dragWorld;
      }
      
      public function set dragWorld(param1:Boolean) : void
      {
         if(this._dragWorld == false && param1 == true)
         {
            this.dispatchEvent(new Event(HouseConstants.START_DRAG_WORLD,true));
         }
         if(this._dragWorld == true && param1 == false)
         {
            this.dispatchEvent(new Event(HouseConstants.STOP_DRAG_WORLD,true));
         }
         this._dragWorld = param1;
      }
      
      public function get dragMode() : Boolean
      {
         return this._dragMode;
      }
      
      public function set dragMode(param1:Boolean) : void
      {
         this._dragMode = param1;
         this.dispatchEvent(new Event(HouseConstants.DRAG_MODE_CHANGED,true));
      }
      
      public function get currentTab() : Object
      {
         return this._currentTab;
      }
      
      public function set currentTab(param1:Object) : void
      {
         this._currentTab = param1;
         this.dispatchEvent(new Event(HouseConstants.TAB_PANEL_CHANGED,true));
      }
      
      public function get colFlag() : Boolean
      {
         return this._colFlag;
      }
      
      public function set colFlag(param1:Boolean) : void
      {
         this._colFlag = param1;
         this.dispatchEvent(new Event(HouseConstants.COLLISION_UPDATED,true));
      }
      
      public function get itemStatus() : Number
      {
         return this._itemStatus;
      }
      
      public function set itemStatus(param1:Number) : void
      {
         this._itemStatus = param1;
         this.dispatchEvent(new Event(HouseConstants.STATUS_CHANGED,true));
      }
      
      public function get itemTrans() : Number
      {
         return this._itemTrans;
      }
      
      public function set itemTrans(param1:Number) : void
      {
         this._itemTrans = param1;
         this.dispatchEvent(new Event(HouseConstants.ALPHA_CHANGED,true));
      }
      
      public function get percentLoaded() : Number
      {
         return this._percentLoaded;
      }
      
      public function set percentLoaded(param1:Number) : void
      {
         this._percentLoaded = param1;
         this.dispatchEvent(new Event(HouseConstants.PERCENT_CHANGED,true));
      }
      
      public function get loadingMessage() : String
      {
         return this._loadingMessage;
      }
      
      public function set loadingMessage(param1:String) : void
      {
         this._loadingMessage = param1;
         this.dispatchEvent(new Event(HouseConstants.LOADING_MESSAGE_UPDATED,true));
      }
      
      public function get currentLock() : Boolean
      {
         return this._currentLock;
      }
      
      public function set currentLock(param1:Boolean) : void
      {
         this._currentLock = param1;
         this.debugController.debugFlag(this._currentLock);
      }
      
      public function get houseName() : String
      {
         return this._houseName;
      }
      
      public function set houseName(param1:String) : void
      {
         this._houseName = param1;
         this.dispatchEvent(new Event(HouseConstants.HOUSE_NAME_SET,true));
      }
      
      public function get tooltipText() : String
      {
         return this._tooltipText;
      }
      
      public function set tooltipText(param1:String) : void
      {
         this._tooltipText = param1;
         this.dispatchEvent(new Event(HouseConstants.SHOW_TOOL_TIPS,true));
      }
      
      public function hideTooltip() : *
      {
         this.dispatchEvent(new Event(HouseConstants.HIDE_TOOL_TIPS,true));
      }
      
      public function getItemDef(param1:Number) : ItemDataVo
      {
         var _loc4_:ItemDataVo = null;
         var _loc2_:Number = this.definitionArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.definitionArray[_loc3_];
            if(_loc4_.id == param1)
            {
               return _loc4_;
            }
            _loc3_++;
         }
         return new ItemDataVo();
      }
      
      public function addDef(param1:ItemDataVo) : void
      {
         var _loc4_:ItemDataVo = null;
         var _loc2_:Number = this.definitionArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.definitionArray[_loc3_];
            if(param1.uid == _loc4_.uid)
            {
               return;
            }
            _loc3_++;
         }
         this.definitionArray.push(_loc4_);
      }
      
      public function addDefFromHouse(param1:Number, param2:Number) : *
      {
         var _loc3_:ItemDataVo = this.getItemDef(param1).clone();
         _loc3_.uid = param2;
         this.definitionArray.push(_loc3_);
      }
      
      public function registerMap(param1:String, param2:SurfaceMap) : void
      {
         this.mapArray[param1] = param2;
      }
      
      public function getMap(param1:String) : SurfaceMap
      {
         return this.mapArray[param1];
      }
      
      public function registerSwf(param1:SwfVo) : *
      {
         this.swfArray.push(param1);
      }
      
      public function getSwf(param1:Number) : SwfVo
      {
         var _loc4_:SwfVo = null;
         var _loc2_:Number = this.swfArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.swfArray[_loc3_];
            if(_loc4_ != null)
            {
               if(_loc4_.itemID == param1)
               {
                  return _loc4_;
               }
            }
            _loc3_++;
         }
         return new SwfVo(0,0,0,0,false,false);
      }
      
      public function registerSwfItem(param1:SwfItem) : void
      {
         this.clipArray.push(param1);
         if(param1.itemDataVo != null)
         {
         }
      }
      
      public function getSwfItem(param1:Number) : SwfItem
      {
         return this.clipArray[param1];
      }
      
      public function removeSwfItem(param1:Number) : void
      {
         this.clipArray[param1] = null;
      }
      
      public function getSwfItemsByArea(param1:String) : Array
      {
         var _loc5_:SwfItem = null;
         var _loc2_:Array = new Array();
         var _loc3_:Number = this.clipArray.length;
         var _loc4_:int = 0;
         while(_loc4_ < _loc3_)
         {
            _loc5_ = this.clipArray[_loc4_];
            if(_loc5_ != null)
            {
               if(_loc5_.itemDataVo != null)
               {
                  if(_loc5_.itemDataVo.area == param1 || param1 == "all")
                  {
                     _loc2_.push(_loc5_);
                  }
               }
            }
            _loc4_++;
         }
         return _loc2_;
      }
      
      public function getSwfItemsByType(param1:String) : Array
      {
         var _loc5_:SwfItem = null;
         var _loc2_:Array = new Array();
         var _loc3_:Number = this.clipArray.length;
         var _loc4_:int = 0;
         while(_loc4_ < _loc3_)
         {
            _loc5_ = this.clipArray[_loc4_];
            if(_loc5_ != null)
            {
               if(_loc5_.itemDataVo != null)
               {
                  if(_loc5_.type == param1)
                  {
                     _loc2_.push(_loc5_);
                  }
               }
            }
            _loc4_++;
         }
         return _loc2_;
      }
      
      public function updatePos(param1:Number, param2:Number, param3:Number) : void
      {
         var _loc4_:RoomItemVo = null;
         if(param2 != -1 && param3 != -1)
         {
            _loc4_ = this.itemArray[param1];
            if(_loc4_ != null)
            {
               _loc4_.x = param2;
               _loc4_.z = param3;
            }
         }
      }
      
      public function updateTruePos(param1:Number, param2:Number, param3:Number) : void
      {
         var _loc4_:RoomItemVo = this.itemArray[param1];
         if(_loc4_ != null)
         {
            _loc4_.x2 = param2;
            _loc4_.y2 = param3;
         }
      }
      
      public function updateRelPos(param1:Number, param2:Number, param3:Number) : void
      {
         var _loc4_:RoomItemVo = this.itemArray[param1];
         if(_loc4_ != null)
         {
            _loc4_.relX = param2;
            _loc4_.relY = param3;
         }
      }
      
      public function updateRotation(param1:Number, param2:Number) : *
      {
         var _loc3_:RoomItemVo = this.itemArray[param1];
         if(_loc3_ != null)
         {
            _loc3_.rotation = param2;
         }
      }
      
      public function updateWall(param1:Number, param2:Boolean) : *
      {
         var _loc3_:RoomItemVo = this.itemArray[param1];
         if(_loc3_ != null)
         {
            _loc3_.rightWall = param2;
         }
      }
      
      public function updateYPos(param1:Number, param2:Number) : *
      {
         var _loc3_:RoomItemVo = this.itemArray[param1];
         _loc3_.y = param2;
      }
      
      public function assignUid(param1:Number, param2:Number) : *
      {
         var _loc3_:RoomItemVo = this.itemArray[param1];
         _loc3_.uniqueID = param2;
      }
      
      public function isInHouse(param1:Number) : Boolean
      {
         var _loc4_:RoomItemVo = null;
         var _loc2_:Number = this.itemArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.itemArray[_loc3_];
            if(_loc4_ != null)
            {
               if(_loc4_.uniqueID == param1)
               {
                  return true;
               }
            }
            _loc3_++;
         }
         return false;
      }
      
      public function putBackInItems(param1:Number) : *
      {
         var _loc4_:RoomItemVo = null;
         var _loc2_:Number = this.itemArray.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            _loc4_ = this.itemArray[_loc3_];
            if(_loc4_ != null)
            {
               if(_loc4_.uniqueID == param1)
               {
                  _loc4_.uniqueID = -1;
                  this.itemArray[_loc3_] = _loc4_;
               }
            }
            _loc3_++;
         }
         this.dispatchEvent(new Event(HouseConstants.PUT_BACK_IN_ITEMS,true));
      }
      
      public function listItems() : *
      {
         var _loc3_:RoomItemVo = null;
         var _loc1_:Number = this.itemArray.length;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            _loc3_ = this.itemArray[_loc2_];
            if(_loc3_ != null)
            {
            }
            _loc2_++;
         }
      }
      
      public function refreshInv() : *
      {
         this.dispatchEvent(new Event(HouseConstants.PUT_BACK_IN_ITEMS2,true));
      }
      
      public function putBackInItems2(param1:Number) : *
      {
         this.putBackInItems(param1);
      }
      
      public function moveItem(param1:Number, param2:Number, param3:SwfItem) : *
      {
         this.dispatchEvent(new MoveEvent(MoveEvent.MOVE_ITEM,param3,param1,param2,true));
      }
      
      public function moveWallItem(param1:Number, param2:Number, param3:SwfItem) : *
      {
         this.dispatchEvent(new MoveEvent(MoveEvent.MOVE_WALL_ITEM,param3,param1,param2,true));
      }
      
      public function registerSurface(param1:String, param2:ISurface) : *
      {
         this.surfaceArray[param1] = param2;
      }
      
      public function getSurface(param1:String) : *
      {
         return this.surfaceArray[param1];
      }
      
      public function moveToWall(param1:SwfItem, param2:SwfItem) : void
      {
         this.dispatchEvent(new StackEvent(StackEvent.MOVE_TO_WALL,param1.index,param2.index,this.getSwf(param2.itemDataVo.id)));
      }
      
      public function clearHouse() : *
      {
         this.enableSave();
         this.dispatchEvent(new Event(HouseConstants.CLEAR_HOUSE,true));
      }
      
      public function clearCurrentItem() : *
      {
         this.dispatchEvent(new Event(HouseConstants.CLEAR_CURRENT,true));
      }
      
      public function destroyItems() : *
      {
         this.swfArray = [];
         this.itemArray = [];
         this.clipArray = [];
      }
      
      public function destroyCurrentItem() : *
      {
         this.putBackInItems(this._currentItem.itemDataVo.uid);
         this.swfArray[this._currentItem.index] = null;
         this.itemArray[this._currentItem.index] = null;
         this.clipArray[this._currentItem.index] = null;
         this.currentItem = null;
         this.dispatchEvent(new Event(HouseConstants.PUT_BACK_IN_ITEMS,true));
      }
      
      public function houseIsBuilt() : void
      {
         this.dispatchEvent(new Event(HouseConstants.HOUSE_IS_BUILT,true));
      }
      
      public function fakeItemIsDragging() : *
      {
         this.dispatchEvent(new Event(HouseConstants.FAKE_ITEM_DRAGGING,true));
      }
      
      public function itemIsPlaced() : void
      {
         this.dispatchEvent(new Event(HouseConstants.ITEM_IS_PLACED,true));
      }
      
      public function houseIsDragging() : *
      {
         this.dispatchEvent(new Event(HouseConstants.WORLD_IS_DRAGGING,true));
      }
      
      public function setDay() : void
      {
         this.isNight = false;
         this.dispatchEvent(new Event(HouseConstants.SHOW_DAY,true));
      }
      
      public function setNight() : void
      {
         this.isNight = true;
         this.dispatchEvent(new Event(HouseConstants.SHOW_NIGHT,true));
      }
      
      public function setBubble(param1:String) : *
      {
         this.bubbleMessage = param1;
         this.dispatchEvent(new Event(HouseConstants.BUBBLE_MESSAGE,true));
      }
      
      public function hideBubble() : void
      {
         this.dispatchEvent(new Event(HouseConstants.HIDE_BUBBLE_MESSAGE,true));
      }
      
      public function enableSave() : *
      {
         this.dispatchEvent(new Event(HouseConstants.ENABLE_SAVE,false));
      }
      
      public function showHouse() : void
      {
         this.dispatchEvent(new Event(HouseConstants.SHOW_HOUSE,true));
      }
      
      public function addAvatarItems(param1:Array) : void
      {
         param1.sortOn("uid",Array.NUMERIC,Array.DESCENDING);
         param1.reverse();
         var _loc2_:Number = param1.length;
         var _loc3_:int = 0;
         while(_loc3_ < _loc2_)
         {
            this._definitionArray.push(param1[_loc3_]);
            _loc3_++;
         }
         this.dispatchEvent(new Event(HouseConstants.ITEMS_LOADED,true));
      }
      
      public function houseDataIsReady() : void
      {
         this.dispatchEvent(new Event(HouseConstants.HOUSE_DATA_READY,true));
      }
   }
}

