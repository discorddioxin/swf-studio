class code.timer extends MovieClip
{
   var dangerLevel;
   var dangerLevelPcts;
   var mcTimerArrow;
   var onEnterFrame;
   var pct;
   var timeBetweenBumps;
   var timeOfLastBump;
   function timer()
   {
      super();
   }
   function init(initParams)
   {
      this.timeBetweenBumps = initParams.timeBetweenBumps;
      var _loc2_ = initParams.levelType;
      if(_loc2_ == "chatterBox" or _loc2_ == "spam" or _loc2_ == "itemGrant")
      {
         this.mcTimerArrow.gotoAndStop(2);
      }
      else
      {
         this.mcTimerArrow.gotoAndStop(1);
      }
      this.dangerLevelPcts = new Array(0.8,0.9000000000000002,0.9500000000000001);
   }
   function startTimer(paramObj)
   {
      this.timeOfLastBump = getTimer();
      if(paramObj.delayBeforeStart != undefined)
      {
         this.timeOfLastBump += paramObj.delayBeforeStart;
      }
      this.play();
      this.update();
      this.onEnterFrame = this.update;
   }
   function reset()
   {
      this.timeOfLastBump = getTimer();
      this.update();
   }
   function stopTimer()
   {
      delete this.onEnterFrame;
   }
   function tweakBumpTime(amt)
   {
   }
   function update()
   {
      this.pct = (getTimer() - this.timeOfLastBump) / this.timeBetweenBumps;
      var _loc2_ = Math.floor(this.pct * 50);
      _loc2_ = Math.max(1,_loc2_);
      if(_loc2_ != this.mcTimerArrow.mcTimerElement._currentframe)
      {
         this.mcTimerArrow.mcTimerElement.gotoAndStop(_loc2_);
      }
   }
   function dangerAnimComplete()
   {
      this.calcNewDangerLevel();
      this.gotoAndPlay("danger " + String(this.dangerLevel));
   }
   function calcNewDangerLevel()
   {
      this.dangerLevel = 0;
      var _loc2_ = 0;
      while(_loc2_ < this.dangerLevelPcts.length)
      {
         if(this.pct > this.dangerLevelPcts[_loc2_])
         {
            this.dangerLevel = _loc2_ + 1;
         }
         _loc2_ = _loc2_ + 1;
      }
   }
   function timerComplete()
   {
      return this.pct >= 1;
   }
   function forceBump()
   {
      this.timeOfLastBump = -1000000;
   }
}
