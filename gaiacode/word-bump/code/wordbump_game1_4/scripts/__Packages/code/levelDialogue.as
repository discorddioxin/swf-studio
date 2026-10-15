class code.levelDialogue extends MovieClip
{
   var creditsGranted;
   var creditsHeader;
   var degreeName;
   var goldEarned;
   var goldEarnedHeader;
   var itemGrantIntroText;
   var itemGrantName;
   var itemGrantPrice;
   var itemWonHeader;
   var levelNumTxt;
   var pGameController;
   function levelDialogue()
   {
      super();
      this.pGameController = _root.gGameController;
      _root.mcDebug.dTrace("[levelDialogue] pGameController:" + this.pGameController);
   }
   function setDialogue(whereToGo)
   {
      this.gotoAndPlay(whereToGo);
      this.levelNumTxt.text = "LEVEL " + String(this.pGameController.levelNum);
      this.centerDialogue();
      this.goldEarned = "";
      switch(Number(this.pGameController.goldToGrant))
      {
         case 0:
            if(!_root.playAsGuest)
            {
               this.goldEarnedHeader = "You\'ll start earning gold after completing the next level.";
            }
            else
            {
               this.goldEarnedHeader = "Registered users earn gold after solving next level.";
            }
            break;
         case -99:
            if(!_root.playAsGuest)
            {
               this.goldEarnedHeader = "Gold granting temporarily disabled. Apologies for the inconvenience.";
            }
            else
            {
               this.goldEarnedHeader = "Registered users earn gold after solving next level.";
            }
            break;
         default:
            this.goldEarned = this.pGameController.goldToGrant;
            if(!_root.playAsGuest)
            {
               this.goldEarnedHeader = "GOLD EARNED:";
               break;
            }
            this.goldEarnedHeader = "Gold earned if registered:";
      }
      var _loc3_ = 0;
      while(_loc3_ < 3)
      {
         if(this.pGameController.creditsToGrant[_loc3_] != 0)
         {
            this.degreeName = this.pGameController.degreeNames[_loc3_];
            this.creditsGranted = this.pGameController.creditsToGrant[_loc3_];
            if(!_root.playAsGuest)
            {
               this.creditsHeader = "YOU EARNED";
            }
            else
            {
               this.creditsHeader = "Registered users earn:";
            }
         }
         _loc3_ = _loc3_ + 1;
      }
      this.itemGrantName = this.pGameController.itemGrantData.name;
      if(Number(this.pGameController.itemGrantData.price < 0))
      {
         this.itemGrantPrice = "???";
      }
      else
      {
         this.itemGrantPrice = this.pGameController.itemGrantData.price + " Gold";
      }
      if(!_root.playAsGuest)
      {
         this.itemGrantIntroText = "Get the item to the top and it\'s yours!";
         this.itemWonHeader = "YOU WON:";
      }
      else
      {
         this.itemGrantIntroText = "Get item to top. (Registered users win it.)";
         this.itemWonHeader = "Registered users win:";
      }
   }
   function centerDialogue()
   {
      var _loc3_ = _root.mcInterface.mcPlayArea._x + _root.mcInterface.mcPlayArea._width / 2 - 1;
      this._x = _loc3_;
   }
}
