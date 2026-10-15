class code.ballLauncher extends MovieClip
{
   var ballLaunchingFlag;
   var col;
   var groupCode;
   var groupNumArr;
   var mcBall;
   var mcBeam;
   var mcColumn;
   var mcLaunchUpGraphic;
   var mcLaunchedPowerBall;
   var mcLauncher0;
   var mcLetterGlow;
   var pGameController;
   var setBeam;
   function ballLauncher()
   {
      super();
   }
   function initBallLauncher(initParams)
   {
      this.pGameController = initParams.gameController;
      this.clearBallLauncherGroup();
      _root.mcDebug.dTrace("pGameController.initialDepths.ballLauncher:" + this.pGameController.initialDepths.ballLauncher);
      this.swapDepths(this.pGameController.initialDepths.ballLauncher);
      this.mcBeam.setBeam = function(mcGoldenLetter)
      {
         this.mcColumn._height = this.mcColumn._y - mcGoldenLetter._y - this._parent.pGameController.unitY / 2;
         this.mcLetterGlow._y = mcGoldenLetter._y;
      };
      this.setWidth(this.pGameController.numColumns);
   }
   function setWidth(numColumns)
   {
      this.gotoAndStop(numColumns - 2);
      var _loc2_ = 0;
      var _loc3_;
      while(_loc2_ < 5)
      {
         _loc3_ = this["mcLauncher" + _loc2_];
         if(_loc2_ < numColumns)
         {
            _loc3_._y = this.pGameController.originPt.y + this.pGameController.unitY * (this.pGameController.originPt.numVisibleRows + 1);
            _loc3_._visible = true;
         }
         else
         {
            _loc3_._visible = false;
         }
         _loc2_ = _loc2_ + 1;
      }
   }
   function reset()
   {
      this.clearBallLauncherGroup();
      this.mcBall.removeMovieClip();
   }
   function clearBallLauncherGroup()
   {
      this.groupNumArr = new Array("","","");
      this.groupCode = undefined;
   }
   function addBallToLauncher(groupNum)
   {
      var _loc2_ = "";
      var _loc3_ = 0;
      if(this.mcBall != undefined)
      {
         _loc2_ = this.groupCode + String(groupNum);
         this.mcBall.removeMovieClip();
         _loc3_ = this.col;
      }
      this.groupNumArr[groupNum] = String(groupNum);
      this.groupCode = this.groupNumArr[0] + this.groupNumArr[1] + this.groupNumArr[2];
      var _loc5_ = "mcBall" + this.groupCode;
      this.attachMovie(_loc5_,"mcBall",this.getNextHighestDepth());
      this.mcBall._y = this.mcLauncher0._y - 10;
      this.mcBall.gotoAndPlay("settleLauncher" + _loc2_);
      this.setPowerBallColumn(_loc3_);
      if(this.mcBeam._visible == true)
      {
         this.setPowerPath();
      }
   }
   function powerBallColumnRollOver(mcPowerColumn)
   {
      var _loc2_ = Number(mcPowerColumn._name.charAt(mcPowerColumn._name.length - 1));
      if(this.testValidColumn(_loc2_))
      {
         if(this.pGameController.gameState == "normal" and this.groupCode != undefined)
         {
            this.setPowerBallColumn(_loc2_);
            this.setPowerPath();
         }
      }
   }
   function powerBallColumnRollOut(mcPowerColumn)
   {
      this.clearPowerPath();
   }
   function powerBallColumnRelease(mcPowerColumn)
   {
      if(this.mcBall._visible)
      {
         this.initiateLaunchBall();
      }
   }
   function setPowerBallColumn(column)
   {
      this.col = column;
      this.mcBall._x = this["mcLauncher" + this.col]._x;
      this.mcLaunchUpGraphic._x = this.mcBall._x;
   }
   function clearPowerPath()
   {
      this.mcBeam._visible = false;
      this.mcBeam._x = -1000;
      delete this.mcBeam.onEnterFrame;
   }
   function setPowerPath()
   {
      var _loc3_ = this.col;
      var _loc2_ = this.mcBeam;
      _loc2_._visible = true;
      _loc2_._x = this.mcBall._x;
      _loc2_.gotoAndPlay("g" + this.groupCode);
      var mcGoldenLetter = this.pGameController.goldenLetterArray[this.col];
      if(mcGoldenLetter.row >= 0)
      {
         _loc2_.setBeam(mcGoldenLetter);
         _loc2_.mcGoldenLetter = mcGoldenLetter;
         _loc2_.onEnterFrame = function()
         {
            this.setBeam(mcGoldenLetter);
         };
         this.pGameController.mcSound.playSound2("beam");
      }
      else
      {
         _loc2_.mcColumn._height = 0;
      }
   }
   function initiateLaunchBall()
   {
      if(this.pGameController.gameState != "addInitialLetters" and this.pGameController.gameState != "levelOver")
      {
         if(this.testValidColumn(this.col))
         {
            this.ballLaunchingFlag = true;
            this.mcBall.gotoAndPlay("launch");
            if(this.pGameController.gameState == "normal")
            {
               this.pGameController.gameState = "enactingPowerUps";
            }
         }
      }
   }
   function getBallCurrentlyLaunching()
   {
      return this.ballLaunchingFlag;
   }
   function testValidColumn(c)
   {
      return this.pGameController.goldenLetterArray[c].row != -1 and this.pGameController.goldenLetterArray[c] != undefined;
   }
   function launchPowerBall()
   {
      if(this.testValidColumn(this.col))
      {
         this.pGameController.mcBoard.attachMovie("mcBall" + this.groupCode,"mcLaunchedPowerBall",this.pGameController.initialDepths.powerBall);
         this.mcLaunchedPowerBall = this.pGameController.mcBoard.mcLaunchedPowerBall;
         this.mcLaunchedPowerBall.velocityY = -30;
         this.mcLaunchedPowerBall.powerNum = this.groupCode;
         this.mcLaunchedPowerBall._x = this.mcBall._x;
         this.mcLaunchedPowerBall._y = this.mcBall._y;
         this.mcLaunchedPowerBall.gotoAndStop("inflight");
         this.mcLaunchedPowerBall._alpha = 100;
         this.mcLaunchedPowerBall.groupNum = this.groupCode;
         this.mcLaunchedPowerBall.pGameController = this.pGameController;
         this.mcLaunchedPowerBall.onEnterFrame = this.updateLaunchedPowerBall;
         this.mcLaunchedPowerBall.mcBallLauncher = this;
         this.mcLaunchedPowerBall.col = this.col;
         this.mcBall.removeMovieClip();
         this.mcBeam._visible = false;
         this.clearBallLauncherGroup();
         this.pGameController.mcSound.playSound("fire");
      }
   }
   function updateLaunchedPowerBall()
   {
      with(this)
      {
         newY = _y + velocityY;
         var mcTileHit;
         var tileCoords;
         if(newY < pGameController.goldenLetterArray[col]._y)
         {
            mcGoldenLetter = pGameController.goldenLetterArray[col];
            if(!pGameController.itemsInMotionTest())
            {
               mcGoldenLetter.initiatePowerUpEnactment(_parent.mcLaunchedPowerBall.powerNum);
               gotoAndPlay("settleTile");
               score += 50;
               delete onEnterFrame;
            }
            else
            {
               pGameController.alignBallToLetter(this,mcGoldenLetter);
            }
            mcBallLauncher.ballLaunchingFlag = false;
         }
         else
         {
            _y = newY;
         }
         if(_y < pGameController.boardRect.top)
         {
            delete onEnterFrame;
         }
      }
   }
}
