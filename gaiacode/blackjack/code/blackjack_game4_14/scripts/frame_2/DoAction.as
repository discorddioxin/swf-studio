function bitOR(a, b)
{
   var _loc1_ = a & 1 | b & 1;
   var _loc2_ = a >>> 1 | b >>> 1;
   return _loc2_ << 1 | _loc1_;
}
function bitXOR(a, b)
{
   var _loc1_ = a & 1 ^ b & 1;
   var _loc2_ = a >>> 1 ^ b >>> 1;
   return _loc2_ << 1 | _loc1_;
}
function bitAND(a, b)
{
   var _loc1_ = a & 1 & (b & 1);
   var _loc2_ = a >>> 1 & b >>> 1;
   return _loc2_ << 1 | _loc1_;
}
function addme(x, y)
{
   var _loc1_ = (x & 0xFFFF) + (y & 0xFFFF);
   var _loc2_ = (x >> 16) + (y >> 16) + (_loc1_ >> 16);
   return _loc2_ << 16 | _loc1_ & 0xFFFF;
}
function rhex(num)
{
   var _loc2_ = "";
   j = 0;
   while(j <= 3)
   {
      _loc2_ += hex_chr.charAt(num >> j * 8 + 4 & 0x0F) + hex_chr.charAt(num >> j * 8 & 0x0F);
      j++;
   }
   return _loc2_;
}
function str2blks_MD5(str)
{
   var _loc3_ = (str.length + 8 >> 6) + 1;
   var _loc2_ = new Array(_loc3_ * 16);
   i = 0;
   while(i < _loc3_ * 16)
   {
      _loc2_[i] = 0;
      i++;
   }
   i = 0;
   while(i < str.length)
   {
      _loc2_[i >> 2] |= str.charCodeAt(i) << (str.length * 8 + i) % 4 * 8;
      i++;
   }
   _loc2_[i >> 2] |= 128 << (str.length * 8 + i) % 4 * 8;
   var _loc4_ = str.length * 8;
   _loc2_[_loc3_ * 16 - 2] = _loc4_ & 0xFF;
   _loc2_[_loc3_ * 16 - 2] |= (_loc4_ >>> 8 & 0xFF) << 8;
   _loc2_[_loc3_ * 16 - 2] |= (_loc4_ >>> 16 & 0xFF) << 16;
   _loc2_[_loc3_ * 16 - 2] |= (_loc4_ >>> 24 & 0xFF) << 24;
   return _loc2_;
}
function rol(num, cnt)
{
   return num << cnt | num >>> 32 - cnt;
}
function cmn(q, a, b, x, s, t)
{
   return addme(rol(addme(addme(a,q),addme(x,t)),s),b);
}
function ff(a, b, c, d, x, s, t)
{
   return cmn(bitOR(bitAND(b,c),bitAND(~b,d)),a,b,x,s,t);
}
function gg(a, b, c, d, x, s, t)
{
   return cmn(bitOR(bitAND(b,d),bitAND(c,~d)),a,b,x,s,t);
}
function hh(a, b, c, d, x, s, t)
{
   return cmn(bitXOR(bitXOR(b,c),d),a,b,x,s,t);
}
function ii(a, b, c, d, x, s, t)
{
   return cmn(bitXOR(c,bitOR(b,~d)),a,b,x,s,t);
}
function calcMD5(str)
{
   x = str2blks_MD5(str);
   a = 1732584193;
   b = -271733879;
   c = -1732584194;
   d = 271733878;
   var _loc1_;
   i = 0;
   while(i < x.length)
   {
      olda = a;
      oldb = b;
      oldc = c;
      oldd = d;
      _loc1_ = 0;
      a = ff(a,b,c,d,x[i + 0],7,-680876936);
      d = ff(d,a,b,c,x[i + 1],12,-389564586);
      c = ff(c,d,a,b,x[i + 2],17,606105819);
      b = ff(b,c,d,a,x[i + 3],22,-1044525330);
      a = ff(a,b,c,d,x[i + 4],7,-176418897);
      d = ff(d,a,b,c,x[i + 5],12,1200080426);
      c = ff(c,d,a,b,x[i + 6],17,-1473231341);
      b = ff(b,c,d,a,x[i + 7],22,-45705983);
      a = ff(a,b,c,d,x[i + 8],7,1770035416);
      d = ff(d,a,b,c,x[i + 9],12,-1958414417);
      c = ff(c,d,a,b,x[i + 10],17,-42063);
      b = ff(b,c,d,a,x[i + 11],22,-1990404162);
      a = ff(a,b,c,d,x[i + 12],7,1804603682);
      d = ff(d,a,b,c,x[i + 13],12,-40341101);
      c = ff(c,d,a,b,x[i + 14],17,-1502002290);
      b = ff(b,c,d,a,x[i + 15],22,1236535329);
      a = gg(a,b,c,d,x[i + 1],5,-165796510);
      d = gg(d,a,b,c,x[i + 6],9,-1069501632);
      c = gg(c,d,a,b,x[i + 11],14,643717713);
      b = gg(b,c,d,a,x[i + 0],20,-373897302);
      a = gg(a,b,c,d,x[i + 5],5,-701558691);
      d = gg(d,a,b,c,x[i + 10],9,38016083);
      c = gg(c,d,a,b,x[i + 15],14,-660478335);
      b = gg(b,c,d,a,x[i + 4],20,-405537848);
      a = gg(a,b,c,d,x[i + 9],5,568446438);
      d = gg(d,a,b,c,x[i + 14],9,-1019803690);
      c = gg(c,d,a,b,x[i + 3],14,-187363961);
      b = gg(b,c,d,a,x[i + 8],20,1163531501);
      a = gg(a,b,c,d,x[i + 13],5,-1444681467);
      d = gg(d,a,b,c,x[i + 2],9,-51403784);
      c = gg(c,d,a,b,x[i + 7],14,1735328473);
      b = gg(b,c,d,a,x[i + 12],20,-1926607734);
      a = hh(a,b,c,d,x[i + 5],4,-378558);
      d = hh(d,a,b,c,x[i + 8],11,-2022574463);
      c = hh(c,d,a,b,x[i + 11],16,1839030562);
      b = hh(b,c,d,a,x[i + 14],23,-35309556);
      a = hh(a,b,c,d,x[i + 1],4,-1530992060);
      d = hh(d,a,b,c,x[i + 4],11,1272893353);
      c = hh(c,d,a,b,x[i + 7],16,-155497632);
      b = hh(b,c,d,a,x[i + 10],23,-1094730640);
      a = hh(a,b,c,d,x[i + 13],4,681279174);
      d = hh(d,a,b,c,x[i + 0],11,-358537222);
      c = hh(c,d,a,b,x[i + 3],16,-722521979);
      b = hh(b,c,d,a,x[i + 6],23,76029189);
      a = hh(a,b,c,d,x[i + 9],4,-640364487);
      d = hh(d,a,b,c,x[i + 12],11,-421815835);
      c = hh(c,d,a,b,x[i + 15],16,530742520);
      b = hh(b,c,d,a,x[i + 2],23,-995338651);
      a = ii(a,b,c,d,x[i + 0],6,-198630844);
      d = ii(d,a,b,c,x[i + 7],10,1126891415);
      c = ii(c,d,a,b,x[i + 14],15,-1416354905);
      b = ii(b,c,d,a,x[i + 5],21,-57434055);
      a = ii(a,b,c,d,x[i + 12],6,1700485571);
      d = ii(d,a,b,c,x[i + 3],10,-1894986606);
      c = ii(c,d,a,b,x[i + 10],15,-1051523);
      b = ii(b,c,d,a,x[i + 1],21,-2054922799);
      a = ii(a,b,c,d,x[i + 8],6,1873313359);
      d = ii(d,a,b,c,x[i + 15],10,-30611744);
      c = ii(c,d,a,b,x[i + 6],15,-1560198380);
      b = ii(b,c,d,a,x[i + 13],21,1309151649);
      a = ii(a,b,c,d,x[i + 4],6,-145523070);
      d = ii(d,a,b,c,x[i + 11],10,-1120210379);
      c = ii(c,d,a,b,x[i + 2],15,718787259);
      b = ii(b,c,d,a,x[i + 9],21,-343485551);
      a = addme(a,olda);
      b = addme(b,oldb);
      c = addme(c,oldc);
      d = addme(d,oldd);
      i += 16;
   }
   return rhex(a) + rhex(b) + rhex(c) + rhex(d);
}
function startLogIn()
{
   _root.createEmptyMovieClip("mLoginHolder",399);
   _root.mLoginHolder.loadMovie(sGSECS_SWF_LOC);
}
function startGameSingle()
{
   _root.singlePlayer = true;
   _root.gotoAndPlay("gameMulti");
}
function startGameMulti()
{
   _root.gotoAndPlay("gameMulti");
}
function gsecsQuitButtonPressed()
{
   _root.bjButton("quit");
}
function bjButton(s, p1)
{
   if(g_oDealer.bActive)
   {
      playErrorSound("busy");
      return undefined;
   }
   if(_root.gameDataObject.bCurrentGameResolved)
   {
      switch(s)
      {
         case "deal":
            requestDeal();
            break;
         case "bet":
            requestBetIncrease(p1);
            break;
         case "quit":
            requestCashOutAndQuit();
            break;
         case "cash":
            requestCashTickets();
            break;
         default:
            playErrorSound("resolved");
      }
   }
   else
   {
      switch(s)
      {
         case "hit":
            requestHit();
            return;
         case "double":
            requestDouble();
            return;
         case "stand":
            requestStand();
            return;
         case "pow1":
            requestPow(1);
            return;
         case "reset":
            requestReset();
            return;
         default:
            _root.attachMovie("errorPanelOk","errorPanelOk",alertYLocation,{theMessage:"Please finish this hand before you cash out.",popPanelType:"ok"});
            return;
      }
   }
}
function requestCashOutAndQuit()
{
   _root.expectingSaveUpdate = true;
   _root.blackGameRequestHandler("saveAndQuit");
   _root.g_bCashedOut = true;
   updateMyMiniCards();
   updateSushiWithMyGameData();
}
function requestCashTickets()
{
   if(gameDataObject.credits <= 0)
   {
      playErrorSound("nobet");
      return undefined;
   }
   _root.cashTicketsOnly = true;
   _root.expectingSaveUpdate = true;
   _root.blackGameRequestHandler("cash");
}
function requestDeal()
{
   if(_root.gameDataObject.iCurrentBet < 1)
   {
      playErrorSound("nobet");
      return undefined;
   }
   if(_root.gameDataObject.bCurrentGameResolved == false)
   {
      playErrorSound("notresolved");
      return undefined;
   }
   g_iNumDeals++;
   g_bGameResolved = false;
   _root.showButtons();
   _root.blackGameRequestHandler("deal",g_aBetArray);
   updateMyMiniCards();
}
function requestHit()
{
   if(_root.gameDataObject.bCurrentGameResolved == true)
   {
      playErrorSound("resolved");
      return undefined;
   }
   if(_root.gameDataObject.bCardsDealt == false)
   {
      playErrorSound("nodeal");
      return undefined;
   }
   if(_root.gameDataObject.iCurrentBet == 0)
   {
      playErrorSound("nobet");
      return undefined;
   }
   _root.blackGameRequestHandler("hit");
   _root.showButtons();
}
function requestDouble()
{
   if(_root.gameDataObject.bCurrentGameResolved == true)
   {
      playErrorSound("resolved");
      return undefined;
   }
   if(!_root.gameDataObject.bCardsDealt)
   {
      playErrorSound("nodeal");
      return undefined;
   }
   if(_root.gameDataObject.bPlayerDoubled)
   {
      playErrorSound("nodouble");
      return undefined;
   }
   if(_root.gameDataObject.bHasPlayerHit)
   {
      playErrorSound("nodouble");
      return undefined;
   }
   if(!_root.getMoneyForDoubleDown())
   {
      _root.attachMovie("errorPanelOk","errorPanelOk",alertYLocation,{theMessage:"You do not have enough tokens or winnings to double down at this time.",popPanelType:"ok"});
      playErrorSound("nodouble");
      return undefined;
   }
   _root.mc_bet.gotoAndStop(_root.gameDataObject.iCurrentBet + 10);
   _root.updateDisplay();
   _root.playerTurnOverNow();
   _root.blackGameRequestHandler("double");
}
function requestStand()
{
   if(_root.gameDataObject.bCardsDealt == false)
   {
      playErrorSound("nodeal");
      return undefined;
   }
   if(_root.gameDataObject.bPlayerDoubled)
   {
      playErrorSound("nostand");
      return undefined;
   }
   _root.playerTurnOverNow();
   _root.blackGameRequestHandler("stand");
}
function requestPow(iPowType)
{
   if(iPowType == 1)
   {
      _root.blackGameRequestHandler("powReveal");
   }
   if(iPowType == 2)
   {
      _root.blackGameRequestHandler("powForceReDraw");
   }
}
function requestBetIncrease(cType)
{
   if(!_root.gameDataObject.bCurrentGameResolved)
   {
      playErrorSound("noresolve");
      return undefined;
   }
   if(_root.gameDataObject.iCurrentBet >= _root.gameDataObject.iMaxBet)
   {
      playErrorSound("nobet");
      return undefined;
   }
   if(cType == "t")
   {
      if(_root.gameDataObject.tokens <= 0)
      {
         playErrorSound("nocash");
         return undefined;
      }
      _root.gameDataObject.tokens--;
      updateDisplayText();
      playCoinSound();
   }
   else
   {
      if(cType != "w")
      {
         return undefined;
      }
      if(_root.gameDataObject.credits <= 0)
      {
         playErrorSound("nocash");
         return undefined;
      }
      _root.gameDataObject.credits--;
      updateDisplayText();
   }
   var _loc2_ = ++_root.gameDataObject.iCurrentBet;
   g_aBetArray[_loc2_ - 1] = cType;
   _root.showButtons();
   _root.showDealButon();
   _root.clearTable();
   _root.mc_start_help.gotoAndStop("empty");
   if(_loc2_ == 1)
   {
      _root.mc_bet.gotoAndStop(2);
      _root.playSound("coinSound","fx");
   }
   if(_loc2_ == 2)
   {
      _root.mc_bet.gotoAndStop(3);
      _root.playSound("coinSound2","fx");
   }
   else
   {
      _root.mc_bet.gotoAndStop(_loc2_ + 1);
      _root.playSound("coinSound3","fx");
   }
}
function requestReset()
{
   _root.attachMovie("errorPanelCancel","errorPanelCancel",alertYLocation,{theMessage:_root.textOb.reset,popPanelType:"reset"});
}
function okDoTheReset()
{
   _root.mc_dealBot.gotoAndStop(2);
   _root.blackGameRequestHandler("reset");
}
function doForceQuit()
{
   _root.mc_dealBot.gotoAndStop(2);
   _root.blackGameRequestHandler("forceQuit");
}
function powClick(mc)
{
   if(_root.gameDataObject.bCurrentGameResolved == true)
   {
      playErrorSound("resolved");
      return false;
   }
   if(_root.gameDataObject.bCardsDealt == false)
   {
      playErrorSound("nodeal");
      return false;
   }
   if(g_iNumClicksPowButton++ > 0)
   {
      mc.gotoAndStop("pow_choice");
   }
   else
   {
      mc.gotoAndStop("pow_tut");
   }
}
function dealerAnimationFinished()
{
   drawFX();
   updateMyMiniCards();
   updateSushiWithMyGameData();
   powHelp();
   if(g_bGameResolved)
   {
      resolveGame();
   }
   else
   {
      mc_button_hit.gotoAndStop(2);
      mc_button_stand.gotoAndStop(2);
      if(_root.gameDataObject.playerCardsArray.length == 2)
      {
         mc_button_double.gotoAndStop(2);
      }
      else
      {
         mc_button_double.gotoAndStop(1);
      }
   }
}
function updateMyMiniCards()
{
   var mc_miniHandP = eval("mc_minihand" + sushi.me.data[1] + "p");
   var mc_miniHandD = eval("mc_minihand" + sushi.me.data[1] + "d");
   if(_root.gameDataObject.playerCardsArray.length <= 0)
   {
      mc_miniHandP.aCards = [0,0];
      mc_miniHandD.aCards = [0,0];
   }
   else
   {
      mc_miniHandP.aCards = _root.gameDataObject.playerCardsArray;
      mc_miniHandD.aCards = _root.gameDataObject.dealerCardsArray;
   }
   mc_miniHandP.update();
   mc_miniHandD.update();
}
function resolveGame()
{
   g_bGameResolved = true;
   mPlayerHand.aCards = new Array();
   mDealerHand.aCards = new Array();
   _root.gameDataObject.playerCardsArray = new Array();
   _root.gameDataObject.dealerCardsArray = new Array();
   g_oDealer.bHaveDealt = false;
   showButtons();
   _root.updateDisplay();
}
function drawFX()
{
   if(_root.gameDataObject.bCurrentGameResolved == false)
   {
      return undefined;
   }
   updateBetDisplayGraphics();
   var _loc2_;
   if(_root.gameDataObject.bPlayerBusted == true)
   {
      _root.mc_fx.gotoAndPlay("bust_frame");
      ulose("bust");
   }
   else if(_root.gameDataObject.playerCardsArray.length == 2 && getHandValue(_root.gameDataObject.playerCardsArray) == 21)
   {
      _root.mc_fx.gotoAndPlay("blackjack_frame");
      uwin("blackjack");
   }
   else if(getHandValue(_root.gameDataObject.dealerCardsArray) > 21)
   {
      _root.mc_fx.gotoAndPlay("win_frame");
      uwin("win");
   }
   else
   {
      _loc2_ = getHandValue(_root.gameDataObject.dealerCardsArray) - getHandValue(_root.gameDataObject.playerCardsArray);
      if(_loc2_ == 0)
      {
         _root.mc_fx.gotoAndPlay("push_frame");
         broadcastBubble("push");
      }
      else if(_loc2_ > 0)
      {
         _root.mc_fx.gotoAndPlay("lose_frame");
         ulose("lose");
      }
      else if(_loc2_ < 0)
      {
         _root.mc_fx.gotoAndPlay("win_frame");
         uwin("win");
      }
   }
}
function drawFXAnimationDone()
{
   if(_root.gameDataObject.tokens + _root.gameDataObject.credits < 1)
   {
      outOfMoneyAlert();
      return undefined;
   }
   if(_root.gameDataObject.iDealerLife <= 0)
   {
      g_oDealer.sayGoodbye();
   }
   else
   {
      g_oDealer.talk();
   }
}
function outOfMoneyAlert()
{
   _root.attachMovie("errorPanelNoToken","errorPanelNoToken",alertYLocation,{theMessage:textOb.broke,popPanelType:"noToken"});
   _root.mc_fx.gotoAndStop("blank_frame");
}
function uwin(sBubbleType)
{
   broadcastBubble(sBubbleType);
   g_oDealer.lookSad();
   if(sBubbleType == "blackjack")
   {
      _root.playSound("money_pit","fx");
   }
   else
   {
      _root.playSound("money_pit","fx");
   }
}
function ulose(sBubbleType)
{
   broadcastBubble(sBubbleType);
   g_oDealer.lookHappy();
   _root.playSound("aww","fx");
}
function playErrorSound()
{
   _root.playSound("error","fx");
}
function updateDisplay()
{
   updateDisplayText();
   updateLifeAndRageBars();
   displayPowButton();
}
function updateDisplayText()
{
   _root.tickets_txt = gameDataObject.tickets;
   _root.tokens_txt = gameDataObject.tokens;
   _root.winnings_txt = gameDataObject.credits;
}
function updateLifeAndRageBars()
{
   var _loc2_;
   if(_root.initialTokenTotal <= 0)
   {
      _root.initialTokenTotal = gameDataObject.tokens + gameDataObject.credits;
      if(_root.initialTokenTotal < 10)
      {
         _root.initialTokenTotal = 10;
      }
   }
   _loc2_ = Math.round((gameDataObject.tokens + gameDataObject.credits) / _root.initialTokenTotal * 100);
   if(_loc2_ > 500)
   {
      _loc2_ = 500;
   }
   mcPlayerStatus.mcLife.gotoAndStop(_loc2_ + 1);
   mcPlayerStatus.mcRage.gotoAndStop(gameDataObject.iPlayerRage);
   _loc2_ = Math.round(gameDataObject.iDealerLife / g_oDealer.DLR_LIFE[g_oDealer.iDealer] * 100);
   mcDealerStatus.mcLife.gotoAndStop(_loc2_ + 1);
   mcDealerStatus.mcRage.gotoAndStop(gameDataObject.iDealerRage);
}
function newDealerFixLifeAndRageBars()
{
   mcDealerStatus.mcLife.gotoAndStop(101);
   mcDealerStatus.mcRage.gotoAndStop(0);
}
function updateBetDisplayGraphics()
{
   if(_root.gameDataObject.bPlayerDoubled)
   {
      _root.mc_bet.gotoAndStop(_root.gameDataObject.iCurrentBet / 2 + 10);
   }
   else
   {
      _root.mc_bet.gotoAndStop(_root.gameDataObject.iCurrentBet + 1);
   }
   _root.mc_carryOverStack.iNumDisplay = _root.gameDataObject.iCarryOverBet;
   _root.mc_carryOverStack.gotoAndStop(_root.gameDataObject.iCarryOverBet + 1);
}
function getSuit(i)
{
   return Math.floor((i - 1) / 13);
}
function getCardType(i)
{
   return (i - 1) % 13 + 1;
}
function getCardString(i)
{
   var _loc4_ = getSuit(i);
   var _loc2_ = getCardType(i);
   var _loc5_ = ["diamond","club","heart","spade"];
   var _loc3_ = ["Ace","Jack","Queen","King"];
   var _loc1_;
   _loc1_ = "";
   if(_loc2_ == 1)
   {
      _loc1_ += _loc3_[0];
   }
   else if(_loc2_ > 10)
   {
      _loc1_ += _loc3_[_loc2_ - 10];
   }
   else
   {
      _loc1_ += _loc2_;
   }
   _loc1_ += " of ";
   _loc1_ += _loc5_[_loc4_];
   _loc1_ += "s.";
   return _loc1_;
}
function getHandValue(cardArray)
{
   var _loc1_;
   var _loc3_ = 0;
   var _loc4_ = 0;
   var _loc2_ = 0;
   while(_loc2_ < cardArray.length)
   {
      _loc1_ = getCardType(cardArray[_loc2_]);
      if(_loc1_ == 1)
      {
         _loc4_ = _loc4_ + 1;
         _loc1_ = 11;
      }
      else if(_loc1_ > 10)
      {
         _loc1_ = 10;
      }
      _loc3_ += _loc1_;
      _loc2_ = _loc2_ + 1;
   }
   while(_loc3_ > 21 && _loc4_ > 0)
   {
      _loc3_ -= 10;
      _loc4_ = _loc4_ - 1;
   }
   return _loc3_;
}
function getHandString(cardArray)
{
   var _loc3_ = "";
   if(cardArray[0] == 0)
   {
      return _loc3_;
   }
   _loc3_ += cardArray[0];
   var _loc1_ = 1;
   while(_loc1_ < cardArray.length)
   {
      if(!(cardArray[_loc1_] != 0 || _loc1_ == 1))
      {
         break;
      }
      _loc3_ += "_";
      _loc3_ += cardArray[_loc1_];
      _loc1_ = _loc1_ + 1;
   }
   if(_loc3_ == NaN)
   {
      _loc3_ = "";
   }
   return _loc3_;
}
function showButtons()
{
   if(g_bGameResolved)
   {
      mc_button_deal.gotoAndStop(1);
      mc_button_hit.gotoAndStop(1);
      mc_button_stand.gotoAndStop(1);
      mc_button_double.gotoAndStop(1);
      displayPowButton();
      mc_bet_buttons.gotoAndStop(1);
   }
   else
   {
      mc_button_hit.gotoAndStop(2);
      mc_button_stand.gotoAndStop(2);
      displayPowButton();
      if(g_oDealer.bHaveDealt)
      {
         mc_bet_buttons.gotoAndStop(2);
      }
      else
      {
         mc_bet_buttons.gotoAndStop(1);
      }
      if(_root.gameDataObject.playerCardsArray.length == 2)
      {
         mc_button_double.gotoAndStop(2);
      }
      else
      {
         mc_button_double.gotoAndStop(1);
      }
   }
}
function showDealButon()
{
   mc_button_deal.gotoAndStop(2);
}
function displayPowButton()
{
   if(gameDataObject.iPlayerRage >= 100)
   {
      mcPlayerStatus.mcRage.gotoAndStop("pow_frame");
   }
   else
   {
      mcPlayerStatus.mcRage.gotoAndStop(gameDataObject.iPlayerRage);
   }
}
function playerTurnOverNow()
{
   _root.showButtons();
}
function clearTable()
{
   _root.mDealerHand.cleanUp();
   _root.mPlayerHand.cleanUp();
}
function clearDealerCards()
{
   _root.mDealerHand.cleanUp();
}
function slayDealer()
{
   g_oDealer.promote();
}
function getMoneyForDoubleDown()
{
   var _loc3_ = _root.gameDataObject.iCurrentBet;
   var _loc4_ = _root.gameDataObject.tokens;
   var _loc2_ = _root.gameDataObject.credits;
   var _loc5_;
   if(_loc4_ + _loc2_ >= _loc3_)
   {
      if(_loc2_ >= _loc3_)
      {
         _loc2_ = _loc2_ - 1;
      }
      else
      {
         _loc5_ = _loc3_ - _loc2_;
         _root.gameDataObject.credits = 0;
         _root.gameDataObject.tokens -= _loc5_;
      }
      _root.gameDataObject.iCurrentBet *= 2;
      _root.updateDisplay();
      return true;
   }
   return false;
}
function startBlackJack()
{
   mc_fx.gotoAndPlay("loading_frame");
   drawPlayerFaceInLifeBar();
   _root.username_txt = sushi.member.getName(sushi.me.id);
}
function drawPlayerFaceInLifeBar()
{
   _root.mcPlayerStatus.mc_avatar_face.loadMovie(gsiUserData.avatar);
   _root.mcPlayerStatus.mc_avatar_face._xscale = -100;
   _root.mcPlayerStatus.mc_avatar_face._x = 93;
   _root.mcPlayerStatus.mc_avatar_face._y = -28;
}
function loadPowInfoBub()
{
   _root.infoBub.gotoAndPlay(1);
   _root.infoBub.text = _root.textOb.powInfo;
   _root.infoBub._x = 375;
   _root.infoBub._y = 228;
   _root.infoBub.btn_ok.onRelease = function()
   {
      _root.infoBub.gotoAndStop("empty");
   };
}
function loadPlayInfoBub()
{
   _root.infoBub.gotoAndPlay(1);
   _root.infoBub.text = _root.textOb.playTip;
   _root.infoBub._x = 303;
   _root.infoBub._y = 324;
   _root.infoBub.btn_ok.onRelease = function()
   {
      _root.infoBub.gotoAndStop("empty");
   };
}
function dealerTalk(s)
{
   _root.infoBub.gotoAndPlay(1);
   _root.infoBub.text = s;
   _root.infoBub._x = 452;
   _root.infoBub._y = 151;
   _root.infoBub.btn_ok.onRelease = function()
   {
      _root.infoBub.gotoAndStop("empty");
   };
}
function powHelp()
{
   if(_root.gameDataObject.iPlayerRage >= 100)
   {
      if(!g_bPowHelpDisplayed)
      {
         _root.infoBub.gotoAndPlay(1);
         _root.infoBub.text = _root.textOb.powHelp;
         _root.infoBub._x = 214;
         _root.infoBub._y = 100;
         _root.infoBub.btn_ok.onRelease = function()
         {
            _root.infoBub.gotoAndStop("empty");
         };
         g_bPowHelpDisplayed = true;
      }
   }
}
function stuffFadeOutForSuper(iAlpha, noFadeBot)
{
   if(noFadeBot != true)
   {
      _root.mc_dealBot._alpha = iAlpha;
   }
   _root.mc_carryOverStack._alpha = iAlpha;
}
function endlessLoading()
{
   if(_root.gameDataObject.iErrorCode == ERROR_DATA_FAILURE)
   {
      return undefined;
   }
   _root.attachMovie("errorPanelCancel","errorPanelCancel",alertYLocation,{theMessage:_root.textOb.forceQuit,popPanelType:"forceQuit"});
}
function checkRoomName()
{
   trae("checkRoomName()");
   var _loc2_ = ["poop"];
   sushi.callPlugin("G_TRC_PLUGIN",_loc2_,cb_onRoomCheckPlugInResult,_root);
}
function cb_onRoomCheckPlugInResult(p)
{
}
function blackGameRequestHandler(s, p1)
{
   if(g_updateCounter == 0)
   {
      if(s != "init")
      {
         _root.chat("please wait... " + g_updateCounter);
         return undefined;
      }
   }
   if(g_bCashedOut)
   {
      _root.attachMovie("errorPanelQuit","errorPanelQuit",alertYLocation,{theMessage:"You have cashed out and quit. Please reload the game to play again.",popPanelType:"quit"});
      return undefined;
   }
   _root.gsecs.showLoadingBar();
   var _loc2_;
   if(g_bSushiPlugInMode)
   {
      _loc2_ = new Array();
      switch(s)
      {
         case "deal":
            _loc2_[0] = 1;
            _loc2_[1] = p1[0];
            _loc2_[2] = p1[1];
            _loc2_[3] = p1[2];
            break;
         case "hit":
            _loc2_[0] = 2;
            break;
         case "double":
            _loc2_[0] = 3;
            break;
         case "stand":
            _loc2_[0] = 4;
            break;
         case "update":
            _loc2_[0] = 5;
            break;
         case "powReveal":
            _loc2_[0] = 6;
            break;
         case "powForceReDraw":
            _loc2_[0] = 7;
            break;
         case "cash":
            _loc2_[0] = 10;
            break;
         case "init":
            _loc2_[0] = 11;
            _loc2_[1] = _root.gsiUserData.gaiaSID;
            _loc2_[2] = _root.sGameVersionNumber;
            if(_root.playAsGuest)
            {
               _loc2_[3] = "0";
            }
            break;
         case "saveAndQuit":
            _loc2_[0] = 12;
            break;
         case "tickle":
            _loc2_[0] = 13;
            break;
         case "reset":
            _loc2_[0] = 14;
            break;
         case "forceQuit":
            _loc2_[0] = 16;
            _loc2_[1] = _root.gsiUserData.gaiaSID;
            _loc2_[2] = _root.sGameVersionNumber;
            break;
         case "update_inventory":
            _loc2_[0] = 15;
            break;
         case "curve":
            _loc2_[0] = 69;
            break;
         default:
            return undefined;
      }
      sushi.callPlugin("G_BJ_PLUGIN",_loc2_,cb_onPlugInResult,_root);
   }
   else
   {
      switch(s)
      {
         case "deal":
            bjg.deal(p1);
            return;
         case "hit":
            bjg.playerHits();
            return;
         case "double":
            bjg.playerDoubles();
            return;
         case "stand":
            bjg.playerStand();
            return;
         case "surrender":
            bjg.playerSurrender();
            return;
         case "update":
            bjg.updateClient();
            return;
         case "powReveal":
            bjg.powReveal();
            return;
         default:
            return;
      }
   }
}
function updateBJUI()
{
   _root.gsecs.removeLoadingBar();
   var _loc8_;
   var _loc6_;
   var _loc9_;
   if(_root.expectingSaveUpdate)
   {
      if(_root.gameDataObject.iErrorCode > 0)
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",alertYLocation,{theMessage:"Trouble cashing out your credits.\n Please contact Gaia support.",popPanelType:"quit"});
      }
      else
      {
         _loc8_ = "<b>Your winnings have been cashed into tickets.\nTickets can be traded for items at <color=#0000FF><u><A HREF=\'http://www.gaiaonline.com/gaia/shopping.php/?key=ndroctlqvprghqqy\' TARGET=\'_blank\'>Prize and Joy</A></u></color></b>";
         if(_root.cashTicketsOnly)
         {
            _loc6_ = "cashoutPanelOk";
            _loc9_ = "ok";
            _root.cashTicketsOnly = false;
         }
         else
         {
            _loc6_ = "cashoutPanel";
            _loc9_ = "quit";
         }
         _root.attachMovie(_loc6_,_loc6_,alertYLocation,{theMessage:_loc8_,popPanelType:_loc9_});
         _root.updateDisplay();
      }
      _root.expectingSaveUpdate = false;
      return undefined;
   }
   var _loc7_;
   var _loc0_;
   var _loc4_;
   if(_root.gameDataObject.iErrorCode > 0)
   {
      _root.updateDisplay();
      switch(_root.gameDataObject.iErrorCode)
      {
         case ERROR_BAD_SID:
            _root.attachMovie("errorPanelQuit","errorPanelQuit",alertYLocation,{theMessage:aErrorMessages[_root.gameDataObject.iErrorCode],popPanelType:"pluginSIDError"});
            return undefined;
         case ERROR_NO_TOKENS:
            _root.outOfMoneyAlert();
            return undefined;
         case ERROR_WAIT_FOR_INIT:
            _root.attachMovie("errorPanelOk","errorPanelOk",alertYLocation,{theMessage:aErrorMessages[_root.gameDataObject.iErrorCode],popPanelType:"ok"});
            return undefined;
         case ERROR_PROBLEM_BET:
            _root.attachMovie("errorPanelOk","errorPanelOk",alertYLocation,{theMessage:aErrorMessages[ERROR_PROBLEM_BET],popPanelType:"ok"});
            return undefined;
         case ERROR_NOTREG:
            _loc7_ = 10;
            _root.errorNotRegCounter = _loc0_ = _root.errorNotRegCounter + 1;
            if(_loc0_ == 1 || _root.errorNotRegCounter % _loc7_ == 0)
            {
               _root.attachMovie("registerPanel","registerPanel",432,{theMessage:aErrorMessages[ERROR_NOTREG],popPanelType:"register"});
            }
            break;
         default:
            _loc4_ = aErrorMessages[_root.gameDataObject.iErrorCode];
            if(_loc4_.length <= 0)
            {
               _loc4_ = "Server error (" + _root.gameDataObject.iErrorCode + ")\n\n Sorry, please quit and restart the game. If problem persists please contact Gaia support.";
            }
            _root.attachMovie("errorPanelQuit","errorPanelQuit",alertYLocation,{theMessage:_loc4_,popPanelType:"quit"});
            return undefined;
      }
   }
   if(g_oDealer.iDealer != _root.gameDataObject.iDealer)
   {
      if(g_oDealer.iDealer == -1)
      {
         mc_fx.gotoAndPlay("done_loading");
      }
      g_oDealer.initDealer(_root.gameDataObject.iDealer);
   }
   if(g_bGameResolved == false && _root.gameDataObject.bCurrentGameResolved == true)
   {
      g_aBetArray = new Array();
      g_bGameResolved = true;
   }
   g_bGameResolved = _root.gameDataObject.bCurrentGameResolved;
   if(_root.g_updateCounter == 1)
   {
      updateBetDisplayGraphics();
      if(_root.gameDataObject.bCurrentGameResolved && _root.gameDataObject.playerCardsArray.length > 0)
      {
         return undefined;
      }
   }
   if(_root.gameDataObject.playerCardsArray.length <= 0)
   {
      return undefined;
   }
   if(_root.gameDataObject.playerCardsArray.length == 2 && mPlayerHand.aCards.length == 0 && _root.gameDataObject.dealerCardsArray.length == 2 && mDealerHand.aCards.length == 0 && g_oDealer.bHaveDealt == false)
   {
      g_oDealer.addToQeue("deal");
   }
   var _loc2_;
   if(_root.gameDataObject.iSpellType == 2)
   {
      _root.mDealerHand.wipe();
      g_oDealer.addToQeue("special" + _root.gameDataObject.iSpellType);
      _loc2_ = 0;
      while(_loc2_ < _root.gameDataObject.dealerCardsArray.length)
      {
         mDealerHand.aCards[_loc2_] = _root.gameDataObject.dealerCardsArray[_loc2_];
         _loc2_ = _loc2_ + 1;
      }
   }
   if(_root.gameDataObject.iSpellType == 3)
   {
      g_oDealer.reDealToDealer();
   }
   if(_root.gameDataObject.playerCardsArray.length > 2 && _root.gameDataObject.playerCardsArray.length > mPlayerHand.aCards.length)
   {
      g_oDealer.addToQeue("hitPlayer");
   }
   if(mDealerHand.aCards[1] == 0 && _root.gameDataObject.dealerCardsArray[1] != 0)
   {
      if(_root.gameDataObject.iSpellType != 2)
      {
         g_oDealer.addToQeue("revealCard");
      }
   }
   mDealerHand.aCards = new Array();
   mPlayerHand.aCards = new Array();
   var _loc12_;
   _loc2_ = 0;
   while(_loc2_ < _root.gameDataObject.dealerCardsArray.length)
   {
      mDealerHand.aCards[_loc2_] = _root.gameDataObject.dealerCardsArray[_loc2_];
      _loc2_ = _loc2_ + 1;
   }
   _loc2_ = 0;
   while(_loc2_ < _root.gameDataObject.playerCardsArray.length)
   {
      mPlayerHand.aCards[_loc2_] = _root.gameDataObject.playerCardsArray[_loc2_];
      _loc2_ = _loc2_ + 1;
   }
   if(_root.gameDataObject.iSpellType == 1)
   {
      g_oDealer.addToQeue("special" + _root.gameDataObject.iSpellType);
   }
   var _loc5_ = _root.gameDataObject.dealerCardsArray.length;
   var _loc3_;
   if(_loc5_ == 2)
   {
      if(mDealerHand.aCards[1] != 0)
      {
      }
   }
   else
   {
      _loc3_ = _loc5_ - g_oDealer.iNumCardsBeforeUpdate;
      if(_loc3_ > 0)
      {
         _loc2_ = 0;
         while(_loc2_ < _loc3_)
         {
            g_oDealer.addToQeue("hitDealer");
            _loc2_ = _loc2_ + 1;
         }
      }
   }
   g_oDealer.executeNextDealerOperation();
   g_oDealer.iNumCardsBeforeUpdate = Number(_root.gameDataObject.dealerCardsArray.length);
   if(g_oDealer.iNumCardsBeforeUpdate < 2)
   {
      g_oDealer.iNumCardsBeforeUpdate = 2;
   }
}
function cb_onPlugInResult(p)
{
   g_updateCounter++;
   _root.gameDataObject = new Object();
   var _loc2_ = new Array();
   _loc2_ = p.split("|");
   var _loc3_ = 0;
   _root.gameDataObject.iErrorCode = int(_loc2_[_loc3_++]);
   _root.gameDataObject.playerCardsArray = _loc2_[_loc3_++].split("_");
   _root.gameDataObject.dealerCardsArray = _loc2_[_loc3_++].split("_");
   _root.gameDataObject.iCurrentBet = int(_loc2_[_loc3_++]);
   _root.gameDataObject.tickets = int(_loc2_[_loc3_++]);
   _root.gameDataObject.tokens = int(_loc2_[_loc3_++]);
   _root.gameDataObject.cacheTokens = int(_loc2_[_loc3_++]);
   _root.gameDataObject.credits = int(_loc2_[_loc3_++]);
   _root.gameDataObject.iCarryOverBet = int(_loc2_[_loc3_++]);
   _root.gameDataObject.iDealer = int(_loc2_[_loc3_++]);
   _root.gameDataObject.iPlayerRage = int(_loc2_[_loc3_++]);
   _root.gameDataObject.iDealerRage = int(_loc2_[_loc3_++]);
   _root.gameDataObject.iDealerLife = int(_loc2_[_loc3_++]);
   _root.gameDataObject.iSpellType = int(_loc2_[_loc3_++]);
   _root.gameDataObject.bCardsDealt = int(_loc2_[_loc3_++]);
   _root.gameDataObject.bHasPlayerHit = int(_loc2_[_loc3_++]);
   _root.gameDataObject.bPlayerDoubled = int(_loc2_[_loc3_++]);
   _root.gameDataObject.bPlayerBusted = int(_loc2_[_loc3_++]);
   _root.gameDataObject.bCurrentGameResolved = int(_loc2_[_loc3_++]);
   _root.gameDataObject.iMaxBet = 3;
   updateBJUI();
   if(_root.gameDataObject.iErrorCode == ERROR_DATA_FAILURE)
   {
      sushi.disconnectFromServer();
   }
}
function goApeShit()
{
   if(_root.goingFuckingApeShit != true)
   {
      _root.goingFuckingApeShit = true;
      _root.onEnterFrame = function()
      {
         var _loc2_ = new Array();
         var _loc3_ = 0;
         _loc2_[_loc3_++] = "deal";
         _loc2_[_loc3_++] = "hit";
         _loc2_[_loc3_++] = "double";
         _loc2_[_loc3_++] = "stand";
         _loc2_[_loc3_++] = "powReveal";
         _loc2_[_loc3_++] = "powForceReDraw";
         _loc2_[_loc3_++] = "cash";
         _loc2_[_loc3_++] = "init";
         _loc2_[_loc3_++] = "tickle";
         _loc2_[_loc3_++] = "unSync";
         _loc2_[_loc3_++] = "flood";
         var _loc5_;
         var _loc4_;
         if(Math.random() < 0.1)
         {
            _loc5_ = Math.round(Math.random() * (_loc2_.length - 1));
            _loc4_ = _loc2_[_loc5_];
            if(_loc4_ == "deal")
            {
               _root.bjButton("bet","t");
               _root.bjButton("bet","t");
               _root.bjButton("bet","t");
            }
            blackGameRequestHandler(_loc4_);
            _root.chat(_loc5_ + " " + _loc4_);
         }
      };
   }
   else
   {
      _root.goingFuckingApeShit = false;
      _root.onEnterFrame = function()
      {
      };
   }
}
function userWantsHelp()
{
   getURL(gameHelpURL,"_blank");
}
_global.sushi = new com.rawfishsoftware.sushi.SushiAPI();
var hex_chr = "0123456789abcdef";
var gameAlertText = new Object();
gameAlertText.reg = "<U><A HREF=\'http://www.gaiaonline.com/profile/character.php\' TARGET=\'_blank\'>Register with Gaia now</A></U> to play the full version of this game. Create a custom avatar, win prizes and chat with others. Registering is quick, easy and free.";
gameAlertText.goldMountain = "<b>You will need at least one token or win credit to play. You can buy tokens at the booth inside Johnny K. Gambino\'s Gold Mountain Casino lobby. <U><A HREF=\'http://www.gaiaonline.com/gaia/store.php?id=14f247\' TARGET=\'_blank\'>Go there now</A></U></b>";
var reportAbuseInformation = new Object();
reportAbuseInformation.introMessage = "<font color=\'#0000FF\'>Reminder! Room Names and in-game chat must follow the <font color=\'#FF0000\'><u><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'>Terms of Service</a></u></font> and <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/info/tos.php?info=rules\' TARGET=\'_blank\'>Rules & Guidelines</A></U></font>. <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/forum/viewtopic.php?t=11856831\' TARGET=\'_blank\'>Click here to read more</A></U></font>.</font></b>";
reportAbuseInformation.fullWarning = "<font color=\'#FF4444\' size=\'9\'>";
reportAbuseInformation.fullWarning += "Please only report instances that fall under the following:";
reportAbuseInformation.fullWarning += "<br> - Trolling/Abuse - Material that is offensive or promotes unfriendly replies.";
reportAbuseInformation.fullWarning += "<br> - Offsite Advertising - Users promoting sites other than Gaia Online.";
reportAbuseInformation.fullWarning += "<br> - Password Phishing - Requests for your password.";
reportAbuseInformation.fullWarning += "<br> - Sexually Explicit Material - Explicitly sexual or violent content.";
reportAbuseInformation.fullWarning += "<br> - Items not listed here but are covered in the <font color=\'#0000FF\'><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'><u>Gaia Terms of Service</u></A></font> (ToS)";
reportAbuseInformation.fullWarning += "<br>";
reportAbuseInformation.fullWarning += "Do not submit reports for swearing, attitude, or issues not covered in the <font color=\'#0000FF\'><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'><u>Gaia Online ToS</u></A></font>.";
reportAbuseInformation.fullWarning += "</font>";
var gsiURL;
if(_global.gsiUrl)
{
   gsiURL = _global.gsiUrl;
}
else if(_root.gsiUrl)
{
   gsiURL = _root.gsiUrl;
}
else
{
   gsiURL = "www";
}
var gsiMethod = new GSItools.GSIGateway(gsiURL + ".gaiaonline.com");
var serverListing = ["127.0.0.1"];
var dynamicServerListing = true;
var testOnLocalHostGameServer = false;
var gaiaApplicationID = "14";
var port = 8080;
var session = "gamename";
var serverNameScheme = "sessionname";
var dynamicRoomName = "roomname";
var gsiUserData = new Object();
var iGSIMethodToCallAfterAuth = 0;
var popPanelX = Stage.width / 2;
var popPanelY = (Stage.height + 100) / 2;
var LoadingBarX = popPanelX;
var LoadingBarY = 460;
var initUserGameData = [0,0,0,0,0,0,0,0,0,0];
var singleRoom = false;
var noChat = false;
var userCreateRoom = true;
var showPlayerMode = false;
var alwaysLogIn = false;
var sGameNameString = "blackjack";
var sGameVersionNumber = "4.14";
var sGSECSVersion = "2.9";
_global.codebase = String(_root._url);
_global.codebase = _global.codebase.substring(0,_global.codebase.lastIndexOf("/") + 1);
var sGSECS_SWF_LOC = codebase + "../sharedsource/GSECS/gsecs" + sGSECSVersion + ".swf";
var gameHelpURL = "http://www.gaiaonline.com/forum/viewtopic.php?t=12582052";
g_iNumClicksPowButton = 0;
var textOb = new Object();
textOb.bettingTip = "<b>Tip:</b> Start by placing your bet using these buttons. This maximum bet is 3.";
textOb.playTip = "<b>Tip:</b> Click here to <i>hit</i>, <i>stand</i>, and <i>double down</i>.";
textOb.powHelp = "<b>Tip:</b> When your rage meter is full, press this button to use a power.";
textOb.powInfo = "<b>Tip:</b> Click to activate one of your powers.";
textOb.aceIntro = "<b>Russell:</b> Welcome to my table, but beware, my powers make me invincible!";
textOb.aceTaunt = "<b>Russell:</b> I will concentrate, and use my powers to beat you!";
textOb.aceWorried = "<b>Russell:</b> Oh no, the pit boss is watching me. I hate this kind of pressure.";
textOb.aceFarewell = "<b>Russell:</b> I am so humiliated. I\'ve been asked by management to step aside.";
textOb.aceBribe = "<b>Russell:</b> Please take these tickets and don\'t tell anybody. Especially Becky.";
textOb.jinxIntro = "<b>Jinx:</b> You think you\'re good? Ha, you won\'t beat me, I always get my way.";
textOb.jinxTaunt = "<b>Jinx:</b> Didn\'t I tell you that I always get what I want?";
textOb.jinxWorried = "<b>Jinx:</b> No! I won\'t let you tarnish my perfect record!";
textOb.jinxFarewell = "<b>Jinx:</b> OMG! OMG! WTH?!";
textOb.jinxBribe = "<b>Jinx:</b> Well, this stack of tickets here says I beat you ;) Gotta run! Ta-ta!";
textOb.botIntro = "<b>Cardbot:</b> 010001110110 ... prepare for extermination.";
textOb.botTaunt = "<b>Cardbot:</b> 100101110111 ... there is a 9" + (Math.round(Math.random() * 500) / 100 + 2.5) + "% chance that you will be defeated.";
textOb.botWorried = "<b>Cardbot:</b> 010110100101 ... b-b-bots do not f-f-feel pain.";
textOb.botFarewell = "<b>Cardbot:</b> SYSTEM ERROR [32] Must reboot. Press any key to continue.";
textOb.botBribe = "<b>Cardbot:</b> Ticket payout authorized. Security will now escort you to the exit.";
textOb.reset = "Reset game will cause you to lose all of your progress. You will start back from the beginning against Ace. You will not lose any tickets or tokens.\n\nAre you sure you want to reset?";
textOb.broke = gameAlertText.goldMountain;
textOb.forceQuit = "There seems to be a problem loading your game. We are very sorry for the inconvenience. Press \'ok\' to force a re-load. You may lose some progress.";
var g_bDebug = true;
var g_bSushiPlugInMode = true;
var g_aBetArray = new Array(0,0,0);
var ticketWinnings = 0;
var g_iMaxBet = 3;
var g_bGameResolved = true;
var g_iDataInputCounter = 0;
var g_iNumDeals = 0;
var g_bCashedOut = false;
var alertYLocation = 620;
var gameDataObject = new Object();
gameDataObject.iMaxBet = 3;
var g_oDealer = new BJDealer();
if(!g_bDebug)
{
}
var g_updateCounter = 0;
var ERROR_BAD_REQUEST = 1;
var ERROR_BAD_SID = 2;
var ERROR_WAIT_FOR_INIT = 4;
var ERROR_SHUTTING_DOWN = 32;
var ERROR_DATA_FAILURE = 64;
var ERROR_IDLE_DEATH = 128;
var ERROR_PROBLEM_BET = 256;
var ERROR_NO_TOKENS = 512;
var ERROR_BAD_CLIENT = 2048;
var ERROR_NOTREG = 4096;
var ERROR_NO_ECON = 8192;
var aErrorMessages = new Array();
aErrorMessages[ERROR_WAIT_FOR_INIT] = ERROR_WAIT_FOR_INIT + " The server is loading your user info... Try again in a few seconds. If problem persists, or if you have been idle for several minutes, please quit and re-start Gaia Cards.";
aErrorMessages[ERROR_DATA_FAILURE] = ERROR_DATA_FAILURE + " Error loading your token/ticket/winnings information. (" + ERROR_DATA_FAILURE + ")\n\nPlease quit and try again later.";
aErrorMessages[ERROR_BAD_SID] = ERROR_BAD_SID + " Error authenticating your session id.\n\nPlease try again.";
aErrorMessages[ERROR_PROBLEM_BET] = ERROR_PROBLEM_BET + " The Gaia Cards server is busy loading your token information.\n\nPlease wait 10 seconds and try again.";
aErrorMessages[ERROR_IDLE_DEATH] = ERROR_IDLE_DEATH + " Sorry, you have been idle too long. Your game has been saved. Please restart to continue playing.";
aErrorMessages[ERROR_BAD_CLIENT] = ERROR_BAD_CLIENT + " There is a new version of this game avaialbe, Please quit and restart to continue playing.";
aErrorMessages[ERROR_NO_ECON] = ERROR_NO_ECON + " The Gaia economy has been disabled. Please quit and try again in a few minutes.";
aErrorMessages[ERROR_SHUTTING_DOWN] = ERROR_SHUTTING_DOWN + " The Cards server is trying to finalize the last game you played. Please wait a few minutes and try again.";
aErrorMEssages[ERROR_NOTREG] = ERROR_NOTREG + " " + "<U><A HREF=\'http://" + _global.gsiUrl + ".gaiaonline.com/register/flash/\' TARGET=\'_blank\'>Register with Gaia now</A></U> to play the full version of this game. Create a custom avatar, win prizes and chat with others. Registering is quick, easy and free.";
if(!_root.g_bSushiPlugInMode)
{
}
startLogIn();
var my_cm = new ContextMenu();
my_cm.builtInItems.quality = false;
my_cm.builtInItems.print = false;
my_cm.builtInItems.play = false;
my_cm.builtInItems.zoom = false;
my_cm.builtInItems.save = false;
my_cm.builtInItems.loop = false;
my_cm.builtInItems.rewind = false;
my_cm.builtInItems.forward_back = false;
var menuItem_cmi = new ContextMenuItem("Help",userWantsHelp);
my_cm.customItems.push(menuItem_cmi);
this.menu = my_cm;
