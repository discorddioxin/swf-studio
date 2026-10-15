class code.splitPod
{
   var mc;
   var pActive;
   function splitPod(paramObj)
   {
      this.mc = paramObj.mc;
      this.mc.mcLetter = paramObj.mcLetter;
      this.mc.pGameController = paramObj.gameController;
      this.mc._x = paramObj.x;
      this.mc._y = paramObj.y;
      this.mc.deltaX = paramObj.dirX * this.mc.pGameController.unitX / 4;
      this.mc.deltaY = paramObj.dirY * this.mc.pGameController.unitY / 4;
      this.mc.numSteps = 4;
      this.mc.obj = this;
      this.pActive = true;
      this.mc.onEnterFrame = this.update;
   }
   function update()
   {
      with(this)
      {
         if(pGameController.gameState != "paused")
         {
            _x += deltaX;
            _y += deltaY;
            loc = new flash.geom.Point(_x,_y);
            pGameController.clearTileAtScreenLoc({pt:loc,letterToExclude:mcLetter,minDistance:15});
            var leftBoundary = pGameController.arrayPositionToScreenLoc(0,0).x - 5;
            var rightBoundary = pGameController.arrayPositionToScreenLoc(pGameController.numColumns - 1,0).x + 5;
            var topBoundary = pGameController.arrayPositionToScreenLoc(0,0).y - 5;
            var bottomBoundary = pGameController.arrayPositionToScreenLoc(0,pGameController.numVisibleRows - 1).y + 5;
            if(_x + deltaX < leftBoundary or _x + deltaX > rightBoundary)
            {
               deltaX *= -1;
            }
            numSteps--;
            if(numSteps == 0 or _y < topBoundary or _y > bottomBoundary)
            {
               obj.pActive = false;
               removeMovieClip();
            }
         }
      }
   }
}
