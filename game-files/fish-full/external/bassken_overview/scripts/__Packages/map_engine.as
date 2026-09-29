class map_engine extends MovieClip
{
   var selectPoint;
   var previousPoint;
   var currentVelocity;
   var markedPoint;
   var maxVelocity;
   var overviewMap;
   var totalRefPoints;
   var moveMarker;
   var xspot;
   var refPoint = new Array();
   function map_engine()
   {
      super();
      this.selectPoint = this.previousPoint = this.currentVelocity = this.markedPoint = 0;
      this.maxVelocity = 0.05;
      this.overviewMap = this;
      this.totalRefPoints = 12;
      this.moveMarker = false;
      var t = 0;
      while(t < this.totalRefPoints)
      {
         var currentRefPoint = eval(this.overviewMap + ".ref_" + t);
         var currentRefPointX = currentRefPoint._x;
         var currentRefPointY = currentRefPoint._y;
         this.refPoint.push([currentRefPointX,currentRefPointY]);
         t++;
      }
      this.overviewMap.coast.onRelease = function()
      {
         _root.main.showRod(false);
         this._parent.markedPoint = this._parent.selectPoint;
         this._parent.xspot._x = this._parent.pointer._x;
         this._parent.xspot._y = this._parent.pointer._y;
         this._parent.moveMarker = true;
      };
   }
   function movePointer(mouseX, mouseY)
   {
      var _loc26_ = false;
      var _loc7_ = 100000;
      var _loc3_ = -99;
      var _loc2_ = 0;
      while(_loc2_ < this.totalRefPoints)
      {
         var _loc6_ = (mouseX - this.refPoint[_loc2_][0]) * (mouseX - this.refPoint[_loc2_][0]);
         var _loc5_ = (mouseY - this.refPoint[_loc2_][1]) * (mouseY - this.refPoint[_loc2_][1]);
         var _loc4_ = Math.sqrt(_loc6_ + _loc5_);
         if(_loc4_ < _loc7_)
         {
            _loc7_ = _loc4_;
            _loc3_ = _loc2_;
         }
         _loc2_ = _loc2_ + 1;
      }
      var _loc27_ = this.mapGetNeighbourRefId(_loc3_,-1);
      var _loc28_ = this.mapGetNeighbourRefId(_loc3_,1);
      var _loc12_ = this.refPoint[_loc27_][0] - this.refPoint[_loc3_][0];
      var _loc11_ = this.refPoint[_loc27_][1] - this.refPoint[_loc3_][1];
      var _loc18_ = mouseX - this.refPoint[_loc3_][0];
      var _loc16_ = mouseY - this.refPoint[_loc3_][1];
      var _loc25_ = Math.sqrt(_loc12_ * _loc12_ + _loc11_ * _loc11_);
      var _loc14_ = _loc12_ / _loc25_;
      var _loc15_ = _loc11_ / _loc25_;
      var _loc10_ = _loc14_ * _loc18_ + _loc15_ * _loc16_;
      if(_loc10_ >= 0)
      {
         _loc26_ = true;
         var _loc19_ = this.refPoint[_loc3_][0] + _loc10_ * _loc14_;
         var _loc17_ = this.refPoint[_loc3_][1] + _loc10_ * _loc15_;
         this.overviewMap.pointer._x = _loc19_;
         this.overviewMap.pointer._y = _loc17_;
         var _loc32_ = Math.sqrt(_loc12_ * _loc12_ + _loc11_ * _loc11_);
         var _loc13_ = _loc3_ - _loc10_ / _loc32_;
         if(_loc13_ < 0)
         {
            _loc13_ += this.totalRefPoints;
         }
         else if(_loc13_ > this.totalRefPoints)
         {
            _loc13_ -= this.totalRefPoints;
         }
         this.selectPoint = _loc13_;
      }
      if(!_loc26_)
      {
         var _loc21_ = this.refPoint[_loc28_][0] - this.refPoint[_loc3_][0];
         var _loc20_ = this.refPoint[_loc28_][1] - this.refPoint[_loc3_][1];
         var _loc29_ = Math.sqrt(_loc21_ * _loc21_ + _loc20_ * _loc20_);
         var _loc30_ = _loc21_ / _loc29_;
         var _loc31_ = _loc20_ / _loc29_;
         var _loc22_ = _loc30_ * _loc18_ + _loc31_ * _loc16_;
         var _loc23_ = 0;
         var _loc24_ = 0;
         _loc10_ = _loc14_ * _loc18_ + _loc15_ * _loc16_;
         if(_loc10_ >= 0)
         {
            _loc19_ = this.refPoint[_loc3_][0] + _loc10_ * _loc14_;
            _loc17_ = this.refPoint[_loc3_][1] + _loc10_ * _loc15_;
         }
         else
         {
            _loc19_ = this.refPoint[_loc3_][0];
            _loc17_ = this.refPoint[_loc3_][1];
         }
         if(_loc22_ >= 0)
         {
            _loc23_ = this.refPoint[_loc3_][0] + _loc22_ * _loc30_;
            _loc24_ = this.refPoint[_loc3_][1] + _loc22_ * _loc31_;
         }
         else
         {
            _loc23_ = this.refPoint[_loc3_][0];
            _loc24_ = this.refPoint[_loc3_][1];
         }
         this.overviewMap.pointer._x = _loc23_;
         this.overviewMap.pointer._y = _loc24_;
         _loc32_ = Math.sqrt(_loc12_ * _loc12_ + _loc11_ * _loc11_);
         _loc13_ = _loc3_ - _loc10_ / _loc32_;
         if(_loc13_ < 0)
         {
            _loc13_ += this.totalRefPoints;
         }
         else if(_loc13_ > this.totalRefPoints)
         {
            _loc13_ -= this.totalRefPoints;
         }
         this.selectPoint = _loc13_;
      }
   }
   function mapGetNeighbourRefId(id, dir)
   {
      var _loc2_ = id + dir;
      if(_loc2_ >= this.totalRefPoints)
      {
         _loc2_ = 0;
      }
      else if(_loc2_ < 0)
      {
         _loc2_ = this.totalRefPoints - 1;
      }
      return _loc2_;
   }
   function mapGetMapPos(lPos)
   {
      var _loc2_ = Math.floor(lPos);
      var _loc5_ = this.mapGetNeighbourRefId(_loc2_,1);
      var _loc3_ = lPos - _loc2_;
      var _loc4_ = new Array();
      var _loc7_ = this.refPoint[_loc2_][0] + _loc3_ * (this.refPoint[_loc5_][0] - this.refPoint[_loc2_][0]);
      var _loc6_ = this.refPoint[_loc2_][1] + _loc3_ * (this.refPoint[_loc5_][1] - this.refPoint[_loc2_][1]);
      _loc4_.push([_loc7_,_loc6_]);
      return _loc4_;
   }
   function onEnterFrame()
   {
      if(this.moveMarker == true)
      {
         if(this.markedPoint != this.previousPoint)
         {
            var _loc3_ = this.previousPoint - this.markedPoint;
            if(Math.abs(_loc3_) < 0.02)
            {
               this.xspot._x = -2000;
               this.previousPoint = this.markedPoint;
               this.moveMarker = false;
               _root.main.showRod(true);
               _root.main.CSorgX = _root.view._x;
               _root.main.CSorgY = _root.view._y;
               if(_root.fromGameRoom == true)
               {
                  _root.tellSushiAboutMyMapStuff();
               }
            }
            else
            {
               if(_loc3_ > this.totalRefPoints / 2)
               {
                  _loc3_ -= this.totalRefPoints;
               }
               else if(_loc3_ < (- this.totalRefPoints) / 2)
               {
                  _loc3_ += this.totalRefPoints;
               }
               this.currentVelocity = this.currentVelocity / 10 - _loc3_ * 0.1;
               if(this.currentVelocity > this.maxVelocity)
               {
                  this.currentVelocity = this.maxVelocity;
               }
               else if(this.currentVelocity < - this.maxVelocity)
               {
                  this.currentVelocity = - this.maxVelocity;
               }
               this.previousPoint += this.currentVelocity;
               if(this.previousPoint >= this.totalRefPoints)
               {
                  this.previousPoint -= this.totalRefPoints;
               }
               else if(this.previousPoint < 0)
               {
                  this.previousPoint += this.totalRefPoints;
               }
               var _loc4_ = this.mapGetMapPos(this.previousPoint);
               _root.mapOverview.map.p1._x = _loc4_[0][0];
               _root.mapOverview.map.p1._y = _loc4_[0][1];
               this.sceneScroll(this.previousPoint);
            }
         }
         else
         {
            this.xspot._x = -2000;
            this.moveMarker = false;
         }
      }
   }
   function sceneScroll(playerPosition)
   {
      _root.view._x = - (1533 - playerPosition * 1533 / 12) + 240;
   }
}
