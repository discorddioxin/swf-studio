class code.letterTile extends MovieClip
{
   var active;
   var amountToIncreasePowerball;
   var animDepth;
   var col;
   var columnsTouchedArray;
   var destY;
   var dy;
   var frameCount;
   var goldenFlag;
   var gravity;
   var groupNum;
   var letter;
   var mcGoldenBg;
   var mcHilite;
   var mcItemGrantIcon;
   var mcLetter;
   var mcLetterBg;
   var mcPowerBall;
   var normalDepth;
   var onEnactPower;
   var onEnterFrame;
   var origX;
   var origY;
   var pGameController;
   var power;
   var powerUpArr;
   var powerUpsToApply;
   var row;
   var shakingFlag;
   var speedFactor;
   var splitPodArray;
   var subLetter;
   var targetCol;
   var targetRow;
   var timeToRemovePower;
   var timesToShake;
   var type;
   var velocityX;
   var velocityXMax;
   var velocityY;
   var xTarget;
   var xTargetArr;
   var xTargetArrIndex;
   var yMax;
   var yMin;
   var yOrig;
   function letterTile()
   {
      super();
      this.mcHilite._visible = false;
   }
   function initLetterTile(initParams)
   {
      this.pGameController = initParams.gameController;
      this.cacheAsBitmap = true;
      this.normalDepth = initParams.normalDepth;
      this.animDepth = initParams.animDepth;
      this.active = true;
   }
   function setLetterGraphics()
   {
      this.mcLetterBg.gotoAndStop(this.groupNum + 1);
      this.gotoAndStop(this.type);
      this._visible = true;
      this.mcHilite._visible = false;
   }
   function testGolden()
   {
      return this.goldenFlag;
   }
   function setTile(letterObj)
   {
      this.groupNum = letterObj.groupNum;
      this.letter = letterObj.char;
      if(this.letter == "Q")
      {
         this.subLetter = "U";
      }
      else
      {
         this.subLetter = "";
      }
      this.type = "normal";
      switch(this.groupNum)
      {
         case 4:
            this.gotoAndStop("goldenLetter");
            this.type = "goldenLetter";
            this.goldenFlag = true;
            this._visible = true;
            this.pGameController.goldenLetterArray.push(this);
            this.pGameController.addDockedLetter(this);
            break;
         case 5:
            this.type = "item";
            this.gotoAndStop("item");
            this.goldenFlag = true;
            this.pGameController.goldenLetterArray[this.col] = this;
            this.addItemGrantIcon(this.pGameController.itemGrantData.thumbUrl);
            this.pGameController.addDockedLetter(this);
      }
      this.setLetterGraphics();
   }
   function addItemGrantIcon(url)
   {
      this.createEmptyMovieClip("mcItemGrantIcon",this.getNextHighestDepth());
      var _loc2_ = new Date();
      this.mcItemGrantIcon.loadMovie(url + "?" + _loc2_.getTime());
      this.mcItemGrantIcon._x -= 15;
      this.mcItemGrantIcon._y -= 15;
   }
   function setDockLetter(mcLetterToMirror)
   {
      this._x = mcLetterToMirror._x;
      this._y = this.pGameController.originPt.y - this.pGameController.unitY - 1;
      this.type = mcLetterToMirror.type + " dock";
      this.gotoAndStop(this.type);
      this.groupNum = -1;
      this.letter = mcLetterToMirror.letter;
      this.subLetter = "";
      if(mcLetterToMirror.groupNum == 5)
      {
         this.addItemGrantIcon(this.pGameController.itemGrantData.thumbUrl);
         this.mcItemGrantIcon._alpha = 50;
      }
   }
   function setAsDisplayLetter(initParams)
   {
      var _loc2_ = initParams.mcLetterToMirror;
      this.groupNum = _loc2_.groupNum;
      this.mcHilite._visible = true;
      this.mcHilite.gotoAndStop(this.groupNum + 1);
      this.letter = _loc2_.letter;
      this.subLetter = _loc2_.subLetter;
      this.mcLetterBg._visible = false;
   }
   function castLetterAwayIfNotGolden()
   {
      _root.mcDebug.dTrace("clear letter:" + this.col + ", " + this.row + ", " + this.letter + ", " + this.type);
      if(!this.goldenFlag)
      {
         this.castLetterAway();
      }
   }
   function clearLetterByPowerUp()
   {
      _root.mcDebug.dTrace("clear letter:" + this.col + ", " + this.row + ", " + this.letter + ", " + this.type);
      if(this.goldenFlag)
      {
         this.shakeLetterUp({numTimes:3});
         this.pGameController.letterTileArray[this.col][this.row - 1].castLetterAway();
      }
      else
      {
         this.castLetterAway();
      }
   }
   function shakeLetterUp(initParams)
   {
      this.timesToShake = initParams.numTimes;
      if(this.shakingFlag == undefined)
      {
         this.dy = 5;
         this.shakingFlag = true;
         this.yMax = this._y + this.dy;
         this.yMin = this._y - this.dy * 2;
         this.yOrig = this._y;
         this.timesToShake = this.timesToShake;
         this.onEnterFrame = function()
         {
            with(this)
            {
               _rotation = random(10) - 5;
               _y += dy;
               if(_y >= yMax and dy > 0 or _y <= yMin and dy < 0)
               {
                  dy = - dy;
               }
               if(_y == yOrig)
               {
                  if(timesToShake > 0)
                  {
                     timesToShake--;
                  }
                  else
                  {
                     _rotation = 0;
                     delete onEnterFrame;
                     shakingFlag = undefined;
                  }
               }
            }
         };
      }
   }
   function castLetterAway()
   {
      this.pGameController.letterTileArray[this.col][this.row] = "";
      this.swapDepths(this.animDepth);
      this.active = false;
      this.mcHilite._visible = false;
      this.velocityX = -15 + Math.random() * 30;
      this.velocityY = -15;
      this.gravity = 3;
      this.speedFactor = 1;
      this.onEnterFrame = function()
      {
         with(this)
         {
            velocityY += gravity * speedFactor;
            newX = _x + velocityX * speedFactor;
            newY = _y + velocityY * speedFactor;
            _x = newX;
            _y = newY;
            if(!pGameController.boardRect.containsPoint(new flash.geom.Point(_x,_y)))
            {
               removeMovieClip();
            }
         }
      };
   }
   function checkGoldenLetterInDanger()
   {
      var _loc2_;
      if(this.row >= this.pGameController.numVisibleRows - 3 and this.power != "sticky")
      {
         _loc2_ = "danger" + String(3 - (this.pGameController.numVisibleRows - this.row));
         this.mcGoldenBg.gotoAndPlay(_loc2_);
      }
      else
      {
         this.mcGoldenBg.gotoAndPlay("normal");
      }
   }
   function onArrivedAtArrayPos()
   {
      if(this.pGameController.letterTileArray[this.col][this.row] == this)
      {
         this.pGameController.letterTileArray[this.col][this.row] = "";
      }
      this.pGameController.letterTileArray[this.targetCol][this.targetRow] = this;
      this.col = this.targetCol;
      this.row = this.targetRow;
      this.pGameController.removeFromMovingArray(this);
      if(this.goldenFlag)
      {
         this.checkGoldenLetterInDanger();
      }
   }
   function onArrivedAtDock()
   {
      this.pGameController.sendGoldenLetterToDock(this);
   }
   function clearStickyPower()
   {
      this.mcGoldenBg.gotoAndPlay("sticky close");
      this.power = "none";
   }
   function enactPowerUp(pwr)
   {
      var _loc3_;
      delete this.onEnterFrame;
      this.power = pwr;
      this.pGameController.addToMovingArray(this);
      this.swapDepths(this.animDepth);
      this.pGameController.gameState = "enactingPowerUps";
      this.pGameController.alignBallToLetter(this.pGameController.mcBoard.mcLaunchedPowerBall,this);
      var _loc4_;
      var _loc5_;
      var _loc2_;
      var _loc6_;
      switch(this.power)
      {
         case "sticky":
            this.mcGoldenBg.gotoAndPlay("sticky");
            this.timeToRemovePower = getTimer() + 10000;
            _loc3_ = 0;
            this.pGameController.mcSound.playSound("powerup stick");
            break;
         case "bump":
            this.mcGoldenBg.gotoAndPlay("bump");
            this.velocityXMax = 15;
            this.velocityX = 0;
            this.speedFactor = 1.5;
            _loc4_ = this.pGameController.arrayPositionToScreenLoc(this.pGameController.numColumns - 1,this.row).x;
            _loc5_ = this.pGameController.arrayPositionToScreenLoc(0,this.row).x;
            this.xTargetArr = new Array();
            if(this.col < this.pGameController.numColumns - 1)
            {
               this.xTargetArr.push(_loc4_ - this.pGameController.unitX / 3);
            }
            if(this.col > 0)
            {
               this.xTargetArr.push(_loc5_ + this.pGameController.unitX / 3 + 10);
            }
            this.mcGoldenBg.mcJetLeft.gotoAndPlay("open");
            this.mcGoldenBg.mcJetRight.gotoAndPlay("open");
            _loc2_ = 0;
            while(_loc2_ < 2)
            {
               this.xTargetArr.push(this._x);
               _loc2_ = _loc2_ + 1;
            }
            this.columnsTouchedArray = new Array();
            this.xTargetArrIndex = 0;
            this.xTarget = this.xTargetArr[0];
            this.origX = this._x;
            this.frameCount = 0;
            _loc3_ = 1;
            this.onEnterFrame = this.iterateBumpAnim;
            this.pGameController.mcSound.playSound("powerup bump");
            break;
         case "split":
            this.mcGoldenBg.gotoAndPlay("split");
            _loc6_ = new Array(-1,1);
            this.onEnactPower = this.enactSplit;
            _loc3_ = 2;
            this.pGameController.mcSound.playSound("powerup split");
            break;
         case "announce":
            this.origY = this._y;
            this.destY = this.pGameController.dockLetterArray[this.col]._y;
            this.pGameController.letterTileArray[this.col][this.row] = "";
            this.mcGoldenBg.gotoAndPlay("announce");
            this.mcGoldenBg.mcJet.gotoAndPlay("open");
            _loc3_ = 3;
            this.onEnterFrame = this.iterateAnnounceAnim;
      }
      this.pGameController.needToCheckGoldenMatches = true;
   }
   function enactSplit()
   {
      this.splitPodArray = new Array();
      var _loc4_;
      var _loc5_;
      if(this.col > 0)
      {
         this.pGameController.mcBoard.attachMovie("mcSplitPod","mcSplitPod0",this.pGameController.initialDepths.splitPods);
         _loc4_ = new code.splitPod({mc:this.pGameController.mcBoard.mcSplitPod0,mcLetter:this,x:this._x,y:this._y,dirX:-1,dirY:-1,gameController:this.pGameController});
         this.splitPodArray.push(_loc4_);
         this.pGameController.mcBoard.attachMovie("mcSplitPod","mcSplitPod1",this.pGameController.initialDepths.splitPods + 1);
         _loc5_ = new code.splitPod({mc:this.pGameController.mcBoard.mcSplitPod1,mcLetter:this,x:this._x,y:this._y,dirX:-1,dirY:1,gameController:this.pGameController});
         this.splitPodArray.push(_loc5_);
      }
      var _loc2_;
      var _loc3_;
      if(this.col < this.pGameController.numColumns - 1)
      {
         this.pGameController.mcBoard.attachMovie("mcSplitPod","mcSplitPod2",this.pGameController.initialDepths.splitPods + 2);
         _loc2_ = new code.splitPod({mc:this.pGameController.mcBoard.mcSplitPod2,mcLetter:this,x:this._x,y:this._y,dirX:1,dirY:-1,gameController:this.pGameController});
         this.splitPodArray.push(_loc2_);
         this.pGameController.mcBoard.attachMovie("mcSplitPod","mcSplitPod3",this.pGameController.initialDepths.splitPods + 3);
         _loc3_ = new code.splitPod({mc:this.pGameController.mcBoard.mcSplitPod3,mcLetter:this,x:this._x,y:this._y,dirX:1,dirY:1,gameController:this.pGameController});
         this.splitPodArray.push(_loc3_);
      }
      this.onEnterFrame = this.checkIfAllPodsComplete;
      this.pGameController.mcSound.playSound("fire");
   }
   function checkIfAllPodsComplete()
   {
      var _loc5_ = this.splitPodArray.length;
      var _loc4_ = true;
      _root.debugGH = this.splitPodArray[0].pActive;
      var _loc3_ = 0;
      while(_loc3_ < _loc5_)
      {
         if(this.splitPodArray[_loc3_].pActive)
         {
            _loc4_ = false;
         }
         _loc3_ = _loc3_ + 1;
      }
      if(_loc4_)
      {
         delete this.onEnterFrame;
         this.goldenLetterPowerUpAnimComplete();
         this.pGameController.initContractLettersUp();
      }
   }
   function iterateAnnounceAnim()
   {
      this.mcGoldenBg._rotation = -5 + Math.random() * 10;
      var _loc3_ = this._y - this.destY;
      var _loc2_ = _loc3_ / (this.origY - this.destY);
      this.velocityY = (0.6 - Math.abs(0.5 - _loc2_)) * 40;
      this.velocityY = Math.max(this.velocityY,1);
      this._y -= this.velocityY;
      this.mcGoldenBg.mcJet.mcSteam._xscale = this.velocityY * 5;
      this.mcGoldenBg.mcJet.mcSteam._yscale = this.velocityY * 5;
      this.pGameController.clearTileAtScreenLoc({pt:new flash.geom.Point(this._x,this._y + 10),minDistance:100});
      this.pGameController.alignBallToLetter(this.pGameController.mcBoard.mcLaunchedPowerBall,this);
      if(this._y < this.destY)
      {
         delete this.onEnterFrame;
         this._y = this.destY;
         this.mcGoldenBg._rotation = 0;
         this.pGameController.sendGoldenLetterToDock(this);
         this.pGameController.initContractLettersUp(this.col);
         this.goldenLetterPowerUpAnimComplete();
      }
   }
   function iterateBumpAnim()
   {
      var _loc2_ = this.xTarget - this._x;
      var _loc6_ = Math.abs(_loc2_);
      var _loc7_ = 10 / _loc2_;
      _loc7_ = _loc2_ / Math.abs(_loc2_) * 2.5;
      if(_loc6_ < 30)
      {
         _loc7_ *= 1 + (30 - _loc6_) / 15;
      }
      this.velocityX += _loc7_;
      this.velocityX = Math.min(this.velocityX,this.velocityXMax);
      this.velocityX = Math.max(this.velocityX,- this.velocityXMax);
      var _loc5_ = this._x + this.velocityX * this.speedFactor;
      this.mcGoldenBg._rotation = - (this.velocityX + Math.random() * 5);
      var _loc3_ = this.pGameController.screenToArrayCoords(this._x,this._y);
      var _loc4_;
      if(this.columnsTouchedArray[_loc3_.col] == undefined)
      {
         _loc4_ = this.pGameController.letterTileArray[_loc3_.col][_loc3_.row];
         this.columnsTouchedArray[_loc3_.col] = true;
         if(_loc4_ != "" and _loc4_ != this)
         {
            _loc4_.clearLetterByPowerUp();
            this.pGameController.initContractLettersUp(_loc4_.col);
         }
      }
      var _loc8_ = (this._x - this.xTarget) * (_loc5_ - this.xTarget) < 0;
      this._x = _loc5_;
      if(_loc8_)
      {
         if(this.xTargetArrIndex < this.xTargetArr.length - 1)
         {
            this.xTargetArrIndex = this.xTargetArrIndex + 1;
            this.xTarget = this.xTargetArr[this.xTargetArrIndex];
         }
         else
         {
            this._x = this.xTarget;
            delete this.onEnterFrame;
            this.mcGoldenBg._rotation = 0;
            this.mcGoldenBg.mcJetRight.gotoAndPlay("close");
            this.mcGoldenBg.mcJetLeft.gotoAndPlay("close");
            this.mcGoldenBg.mcJetRight.mcSteam._xscale = 0;
            this.mcGoldenBg.mcJetRight.mcSteam._yscale = 0;
            this.goldenLetterPowerUpAnimComplete();
         }
      }
      this.pGameController.alignBallToLetter(this.pGameController.mcBoard.mcLaunchedPowerBall,this);
      if(_loc2_ > 0)
      {
         this.mcGoldenBg.mcJetLeft.xScaleNew = Math.min(100,_loc2_ * 1.5);
         this.mcGoldenBg.mcJetRight.xScaleNew = Math.max(this.mcGoldenBg.mcJetRight.xScaleNew,0);
      }
      else
      {
         this.mcGoldenBg.mcJetRight.xScaleNew = Math.min(100,Math.abs(_loc2_ * 1.5));
         this.mcGoldenBg.mcJetLeft.xScaleNew = Math.max(this.mcGoldenBg.mcJetLeft.xScaleNew,0);
      }
      this.mcGoldenBg.mcJetLeft.mcSteam._xscale = this.mcGoldenBg.mcJetLeft.xScaleNew;
      this.mcGoldenBg.mcJetLeft.mcSteam._yscale = this.mcGoldenBg.mcJetLeft.xScaleNew;
      this.mcGoldenBg.mcJetRight.mcSteam._xscale = this.mcGoldenBg.mcJetRight.xScaleNew;
      this.mcGoldenBg.mcJetRight.mcSteam._yscale = this.mcGoldenBg.mcJetRight.xScaleNew;
   }
   function onDisplayLetterReachPowerBall()
   {
      this.mcPowerBall.increaseLevel(this.amountToIncreasePowerball);
      this.mcPowerBall.mcGlow._visible = true;
      this.mcPowerBall.mcGlow.play();
      this.removeMovieClip();
   }
   function initiatePowerUpEnactment(powerUpStr)
   {
      var _loc6_ = this.pGameController.powerNameArray[powerUpStr];
      this.powerUpArr = _loc6_.toString().split(",");
      _root.mcDebug.dTrace("initiatePowerUpEnactmentL:" + this + "," + this.powerUpArr + "," + powerUpStr);
      this.pGameController.mcActiveGoldenLetter = this;
      this.powerUpsToApply = this.powerUpArr;
      this.checkApplyNextPowerUp();
      this.pGameController.gameState = "enactingPowerUps";
      var _loc5_ = "";
      var _loc3_ = 0;
      while(_loc3_ < powerUpStr.length)
      {
         _loc5_ += powerUpStr.charAt(_loc3_);
         _loc3_ = _loc3_ + 1;
      }
      _root.requestHandler("applyPowerUp",new Array(_loc5_,this.col,this.row));
   }
   function checkApplyNextPowerUp()
   {
      var _loc2_;
      if(this.powerUpsToApply.length > 0)
      {
         _loc2_ = this.powerUpsToApply.splice(0,1)[0];
         this.enactPowerUp(_loc2_);
      }
      else
      {
         this.pGameController.gameState = "normal";
      }
   }
   function goldenLetterPowerUpAnimComplete()
   {
      this.pGameController.mcBoard.mcLaunchedPowerBall.mcLetter = this;
      if(this.powerUpsToApply.length == 0)
      {
         this.pGameController.mcBoard.mcLaunchedPowerBall.onEnterFrame = function()
         {
            this._alpha -= 5;
            _root.gGameController.alignBallToLetter(this,this.mcLetter);
            if(this._alpha <= 0)
            {
               delete this.onEnterFrame;
            }
         };
      }
      if(this.power != "sticky")
      {
         this.checkGoldenLetterInDanger();
      }
      this.pGameController.removeFromMovingArray(this);
      this.swapDepths(this.normalDepth);
      this.pGameController.checkPuzzleSolved();
   }
   function letterClicked()
   {
      if(this.groupNum >= 0)
      {
         this.pGameController.letterClicked(this);
      }
   }
}
