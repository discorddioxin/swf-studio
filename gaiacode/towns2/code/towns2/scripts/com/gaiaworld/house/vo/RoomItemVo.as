package com.gaiaworld.house.vo
{
   import com.gaiaworld.house.controller.DebugController;
   import com.gaiaworld.house.util.StringFunctions;
   
   public class RoomItemVo
   {
      
      public var itemID:Number;
      
      public var uniqueID:Number;
      
      public var z:Number;
      
      public var x:Number;
      
      public var y:Number;
      
      public var rotation:Number;
      
      public var itemVo:ItemVo;
      
      public var rightWall:Boolean;
      
      private var debugController:DebugController = new DebugController();
      
      public var x2:Number = -1;
      
      public var y2:Number = -1;
      
      public var stackedID:Number = -1;
      
      public var relX:Number = -1;
      
      public var relY:Number = -1;
      
      public var h:Number = -1;
      
      public var w:Number = -1;
      
      public function RoomItemVo(param1:Number = 0, param2:Number = 0, param3:Number = 0, param4:Number = 0, param5:Number = 0, param6:Number = 0, param7:Boolean = false)
      {
         super();
         this.itemID = param1;
         this.uniqueID = param2;
         this.z = param3;
         this.x = param4;
         this.y = param5;
         this.rotation = param6;
         this.rightWall = param7;
      }
      
      public function fromString(param1:String) : void
      {
         var _loc5_:Array = null;
         param1 = StringFunctions.findReplace("]",param1,"");
         param1 = StringFunctions.findReplace("[",param1,"");
         var _loc2_:Array = param1.split(",");
         this.itemID = Number(StringFunctions.findReplace("\"",_loc2_[0],""));
         this.uniqueID = Number(_loc2_[1]);
         this.x = Number(_loc2_[2]);
         this.z = Number(_loc2_[3]);
         this.y = Number(_loc2_[4]);
         this.rotation = Number(_loc2_[5]);
         this.rightWall = _loc2_[6] == 1 ? true : false;
         var _loc3_:String = _loc2_[7];
         if(_loc3_ != null)
         {
            _loc5_ = _loc3_.split("qq");
            this.x2 = Number(_loc5_[0]);
            this.y2 = Number(_loc5_[1]);
         }
         var _loc4_:String = _loc2_[8];
         if(_loc4_ != null)
         {
            this.stackedID = Number(_loc4_);
         }
      }
      
      public function toString() : String
      {
         var _loc1_:String = "[";
         _loc1_ += String.fromCharCode(34) + String(this.itemID) + String.fromCharCode(34) + ", ";
         _loc1_ += String(this.uniqueID) + ", ";
         _loc1_ += String(this.x) + ", ";
         _loc1_ += String(this.z) + ", ";
         _loc1_ += String(this.y) + ", ";
         _loc1_ += String(this.rotation) + ", ";
         var _loc2_:Number = this.rightWall == true ? 1 : 0;
         _loc1_ += String(_loc2_);
         var _loc3_:String = String(this.x2) + "qq" + String(this.y2);
         _loc1_ += ", " + _loc3_;
         _loc1_ += "," + String(this.stackedID);
         return _loc1_ + "]";
      }
      
      public function toArray() : Array
      {
         var _loc1_:Array = new Array();
         _loc1_.push(String(this.itemID));
         _loc1_.push(this.uniqueID);
         _loc1_.push(this.z);
         _loc1_.push(this.x);
         _loc1_.push(this.y);
         _loc1_.push(this.rotation);
         var _loc2_:Number = this.rightWall == true ? 0 : 1;
         _loc1_.push(_loc2_);
         return _loc1_;
      }
   }
}

