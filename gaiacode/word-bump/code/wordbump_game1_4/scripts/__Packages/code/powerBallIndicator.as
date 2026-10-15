class code.powerBallIndicator extends MovieClip
{
   var col;
   var gameController;
   var groupNum;
   var level;
   var mcBall;
   var mcBallLauncher;
   var mcPowerLevel;
   var onEnterFrame;
   var targetLevel;
   function powerBallIndicator()
   {
      super();
   }
   function initPowerBallIndicator(initParams)
   {
      this.gameController = initParams.gameController;
      this.mcBallLauncher = initParams.ballLauncher;
      this.groupNum = initParams.groupNum;
      this.level = 1;
      this.setPowerLevel();
   }
   function increaseLevel(amt)
   {
      this.targetLevel = Math.min(100,this.targetLevel + 5 * amt);
      this.onEnterFrame = this.iterateIncrease;
   }
   function iterateIncrease()
   {
      this.level += 1.5;
      if(this.level >= this.targetLevel)
      {
         this.level = this.targetLevel;
         delete this.onEnterFrame;
      }
      this.setPowerLevel();
   }
   function forceFull()
   {
      this.level = 100;
      this.setPowerLevel();
   }
   function reset()
   {
      this.level = 0;
      this.setPowerLevel();
   }
   function setPowerLevel()
   {
      if(this.level >= 100)
      {
         this.gotoAndPlay("drop");
         this.level = 1;
         this.col = 1;
         this.mcPowerLevel._visible = false;
         this.gameController.mcSound.playSound("drop ball");
      }
      this.mcPowerLevel.gotoAndStop(Math.ceil(this.level / 2));
   }
   function powerBallDropAnimComplete()
   {
      this.mcBall.origX = this.mcBall._x;
      this.mcBall.mcTargetBall = this.gameController.mcBoard.mcBallLauncher.mcBall;
      var loc = this.gameController.arrayPositionToScreenLoc(0,0);
      this.mcBall.destX = loc.x;
      this.gameController.mcSound.playSound("ball settle");
      this.mcBall.onEnterFrame = function()
      {
         with(this)
         {
            if(mcTargetBall != undefined)
            {
               var destX = mcTargetBall._x - 20;
            }
            var distanceToTarget = _x - destX;
            var pct = distanceToTarget / (origX - destX);
            var velocityX = 4 * (0.6 - Math.abs(0.5 - pct)) * 40;
            velocityX = Math.max(velocityX,1);
            var oldX = _x;
            _x += velocityX;
            _parent.mcBallBlur._x = oldX;
            if(_x > destX)
            {
               delete onEnterFrame;
               _x = destX;
               _parent.mcPowerLevel._visible = true;
               _parent.mcBallLauncher.addBallToLauncher(_parent.groupNum);
               _parent.gotoAndPlay("normal");
            }
         }
      };
   }
}
