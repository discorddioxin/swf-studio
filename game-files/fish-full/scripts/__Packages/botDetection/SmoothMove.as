class botDetection.SmoothMove
{
   var aClickCoordList;
   var aMoveCoordList;
   var clickSample;
   var iLastClickTime;
   var moveSample;
   var numClicks;
   var numMoves;
   var prevX;
   var prevY;
   var iMinMove = 60;
   function SmoothMove()
   {
      this.aClickCoordList = new Array();
      this.aMoveCoordList = new Array();
      this.numClicks = 0;
      this.clickSample = 24;
      this.numMoves = 0;
      this.moveSample = 16;
      Mouse.addListener(this);
   }
   function onMouseMove()
   {
      var _loc3_ = Math.round(_xmouse);
      var _loc2_ = Math.round(_ymouse);
      var _loc6_ = Math.abs(_loc3_ - this.prevX);
      var _loc5_ = Math.abs(_loc2_ - this.prevY);
      var _loc4_;
      if(_loc6_ + _loc5_ > this.iMinMove)
      {
         _loc4_ = ++this.numMoves % this.moveSample;
         if(_loc3_ == this.prevX)
         {
            if(_loc5_ > this.iMinMove)
            {
               this.aMoveCoordList[_loc4_] = _loc3_ + "_" + _loc2_;
            }
         }
         else if(_loc2_ == this.prevY)
         {
            if(_loc6_ > this.iMinMove)
            {
               this.aMoveCoordList[_loc4_] = _loc3_ + "_" + _loc2_;
            }
         }
         else
         {
            this.aMoveCoordList[_loc4_] = 0;
         }
         if(_loc4_ == 0)
         {
            this.anylizeMoves();
         }
      }
      this.prevX = _loc3_;
      this.prevY = _loc2_;
   }
   function onMouseDown()
   {
      var _loc4_ = getTimer();
      if(getTimer() < this.iLastClickTime + 500)
      {
      }
      this.iLastClickTime = getTimer();
      var _loc3_ = ++this.numClicks % this.clickSample;
      this.aClickCoordList[_loc3_] = Math.round(_root._xmouse) + "_" + Math.round(_root._ymouse);
      if(_loc3_ == 0)
      {
         this.anylizeClicks();
      }
   }
   function anylizeClicks()
   {
      var _loc7_ = 0;
      var _loc5_ = new Array();
      var _loc3_ = 0;
      var _loc4_;
      while(_loc3_ < this.clickSample)
      {
         _loc4_ = _loc3_ + 1;
         while(_loc4_ < this.clickSample)
         {
            if(!this.isInList(this.aClickCoordList[_loc3_],_loc5_))
            {
               _loc5_.push(this.aClickCoordList[_loc3_]);
            }
            _loc4_ = _loc4_ + 1;
         }
         _loc3_ = _loc3_ + 1;
      }
      var _loc6_;
      if(_loc5_.length < 5)
      {
         _loc6_ = _root.sGameNameString + ". UPC: " + _loc5_.length + ". S: " + this.clickSample + ". L: " + this.aClickCoordList;
         this.sendBotReport(_loc6_,1);
      }
      return undefined;
   }
   function anylizeMoves()
   {
      var _loc5_ = 0;
      var _loc4_ = new Array();
      var _loc3_ = 0;
      while(_loc3_ < this.moveSample)
      {
         if(this.aMoveCoordList[_loc3_] != 0)
         {
            _loc5_ = _loc5_ + 1;
            if(!this.isInList(this.aMoveCoordList[_loc3_],_loc4_))
            {
               _loc4_.push(this.aMoveCoordList[_loc3_]);
            }
         }
         _loc3_ = _loc3_ + 1;
      }
      var _loc6_ = _loc5_ - _loc4_.length;
      var _loc7_;
      if(_loc5_ > 12 && _loc6_ > 3)
      {
         _loc7_ = _root.sGameNameString + ". MM: " + _loc5_ + ". S: " + this.moveSample + ". T: " + this.moveSample + ". D: " + _loc6_ + ". L: " + this.aMoveCoordList;
         this.sendBotReport(_loc7_,2);
      }
   }
   function isInList(iValue, aArray)
   {
      var _loc1_ = 0;
      while(_loc1_ < aArray.length)
      {
         if(iValue == aArray[_loc1_])
         {
            return true;
         }
         _loc1_ = _loc1_ + 1;
      }
      return false;
   }
   function sendBotReport(sInfo, iBotType)
   {
      var _loc5_ = 7;
      var _loc4_ = _root.calcMD5(_root.gsiUserData.gaiaSID + iBotType);
      var _loc3_ = _root.sGameNameString + _root.sGameVersionNumber + ". " + _root.gsecs.sMyRoomName + " (" + _root.gsecs.iMyRoomID + ")";
      _root.gsiMethod.invoke(1000,[_root.gsiUserData.gaiaSID,_loc5_,_loc3_,sInfo,_loc4_],this.cb_4gsi);
   }
   function cb_4gsi()
   {
   }
}
