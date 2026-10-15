class BJDealer
{
   var aDealerQeue;
   var bActive;
   var bDealerTaunted;
   var bDealerWorriedSpoke;
   var bHaveDealt;
   var iDealer;
   var iLifeMax;
   var iNumDeals;
   var mc;
   var sCurrentSpell;
   var DLR_LIFE = [100,110,200];
   var DLR_PAYOUT = [50,100,250];
   function BJDealer()
   {
      this.aDealerQeue = new Array();
      this.bHaveDealt = false;
      this.bActive = false;
      this.iDealer = -1;
   }
   function initDealer(sType)
   {
      this.bDealerTaunted = false;
      this.bDealerWorriedSpoke = false;
      var _loc3_ = _root.mc_dealerHolder;
      switch(sType)
      {
         case "tutorial":
         case 99:
            _loc3_.attachMovie("mc_dealer_tutorial","mc_dealer",100);
            this.mc = _root.mc_dealerHolder.mc_dealer;
            this.setLifeBarFace("tutorial");
            _root.dealername_txt = "tutor bot";
            this.iDealer = 99;
            this.iLifeMax = 100;
            break;
         case "ace":
         case 0:
            _loc3_.attachMovie("mc_dealer_ace","mc_dealer",100);
            this.mc = _root.mc_dealerHolder.mc_dealer;
            this.setLifeBarFace("ace");
            _root.dealername_txt = "Russell Ace";
            this.iDealer = 0;
            this.iLifeMax = this.DLR_LIFE[0];
            break;
         case "jinx":
         case 1:
            _loc3_.attachMovie("mc_dealer_jinx","mc_dealer",100);
            this.mc = _root.mc_dealerHolder.mc_dealer;
            this.setLifeBarFace("jinx");
            _root.dealername_txt = "Jinx";
            this.iDealer = 1;
            this.iLifeMax = this.DLR_LIFE[1];
            break;
         case "bot":
         case 2:
            _root.mc_dealerHolder.attachMovie("mc_empty","mc_dealer",100);
            this.mc = _root.mc_dealBot;
            this.mc.gotoAndPlay("intro");
            this.setLifeBarFace("bot");
            _root.dealername_txt = "Cardbot";
            this.iDealer = 2;
            this.iLifeMax = this.DLR_LIFE[2];
      }
      _root.updateDisplay();
   }
   function talk()
   {
      if(_root.gameDataObject.iDealerLife < 75 && _root.gameDataObject.iDealerLife > 50 && this.bDealerTaunted == false)
      {
         aTemp = [textOb.aceTaunt,textOb.jinxTaunt,textOb.botTaunt];
         _root.dealerTalk(aTemp[this.iDealer]);
         this.bDealerTaunted = true;
      }
   }
   function fret()
   {
      if(this.bDealerWorriedSpoke == false)
      {
         aTemp = [textOb.aceWorried,textOb.jinxWorried,textOb.botWorried];
         _root.dealerTalk(aTemp[this.iDealer]);
         this.bDealerWorriedSpoke = true;
      }
   }
   function promote()
   {
      this.iDealer = this.iDealer + 1;
      if(this.iDealer == 3)
      {
         this.iDealer = 0;
         _root.mc_dealBot.gotoAndStop(2);
      }
      this.initDealer(this.iDealer);
      _root.gameDataObject.iDealerRage = 0;
      _root.newDealerFixLifeAndRageBars();
      _root.clearTable();
   }
   function deal()
   {
      this.mc.gotoAndPlay("deal");
      this.iNumDeals = this.iNumDeals + 1;
      this.bHaveDealt = true;
      _root.clearTable();
      mc_bet_buttons.gotoAndStop(2);
      _root.mDealerHand.aHideCardsArray[1] = 0;
   }
   function reDealToDealer()
   {
      clearDealerCards();
      this.mc.gotoAndPlay("dealDealer");
   }
   function hitPlayer()
   {
      this.mc.gotoAndPlay("HitPlayerF");
   }
   function hitDealer()
   {
      this.mc.gotoAndPlay("HitDealerF");
   }
   function revealCard()
   {
      this.mc.gotoAndPlay("fRevealCard");
      _root.mDealerHand.flip();
   }
   function donePlayerDeal()
   {
      _root.mPlayerHand.update();
   }
   function donePlayerHit()
   {
      _root.mPlayerHand.update();
      this.executeNextDealerOperation();
   }
   function doneDealerDeal()
   {
      if(this.sCurrentSpell == "special2")
      {
         _root.mDealerHand.updateAfterDealOnly();
      }
      else
      {
         _root.mDealerHand.update();
      }
      this.executeNextDealerOperation();
   }
   function doneDealerHit()
   {
      _root.mDealerHand.updateNextCardOnly();
      this.executeNextDealerOperation();
   }
   function doneRevealCard()
   {
      this.executeNextDealerOperation();
   }
   function doSpell(s)
   {
      this.sCurrentSpell = s;
      this.mc.gotoAndPlay(s);
      _root.playSound("gong","fx");
   }
   function spellDone()
   {
      if(_root.gameDataObject.iSpellType == 1)
      {
         this.executeNextDealerOperation();
      }
      else if(_root.gameDataObject.iSpellType == 2)
      {
         this.reDealToDealer();
      }
   }
   function addToQeue(sCommand)
   {
      var _loc2_;
      if(this.aDealerQeue.length > 0)
      {
         _loc2_ = this.aDealerQeue.length;
         while(_loc2_ > 0)
         {
            this.aDealerQeue[_loc2_] = this.aDealerQeue[_loc2_ - 1];
            _loc2_ = _loc2_ - 1;
         }
      }
      this.aDealerQeue[0] = sCommand;
   }
   function lookHappy()
   {
      this.mc.gotoAndPlay("happy_frame");
   }
   function lookSad()
   {
      this.mc.gotoAndPlay("sad_frame");
   }
   function sayGoodbye()
   {
      this.mc.gotoAndPlay("farewell_frame");
   }
   function executeNextDealerOperation()
   {
      this.bActive = true;
      var _loc2_ = null;
      _loc2_ = this.aDealerQeue.pop();
      switch(_loc2_)
      {
         case "deal":
            this.deal();
            return;
         case "hitDealer":
            this.hitDealer();
            return;
         case "hitPlayer":
            this.hitPlayer();
            return;
         case "revealCard":
            this.revealCard();
            return;
         case "special1":
         case "special2":
            this.doSpell(_loc2_);
            return;
         default:
            this.dealerDone();
            return;
      }
   }
   function dealerDone()
   {
      this.bActive = false;
      if(_root.gameDataObject.iDealerLife < 9)
      {
         this.mc.gotoAndPlay("worried");
      }
      this.sCurrentSpell = "";
      _root.dealerAnimationFinished();
   }
   function setLifeBarFace(s)
   {
      _root.mcDealerStatus.mcDealerFace.gotoAndStop(s);
   }
}
