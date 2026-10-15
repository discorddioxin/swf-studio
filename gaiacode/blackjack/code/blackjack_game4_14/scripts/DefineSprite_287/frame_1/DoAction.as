function update()
{
   var iNumCards = aCards.length;
   gotoAndStop(iNumCards);
   var i = 0;
   while(i < iNumCards)
   {
      eval("mCard" + (i + 1)).gotoAndStop(getCardOffsetFrame(aCards[i]));
      i++;
   }
   iHandValueDisplay = getHandValue();
   iCardsShowing = aCards.length;
}
function updateAfterDealOnly()
{
   gotoAndStop(2);
   var i = 0;
   while(i < 2)
   {
      eval("mCard" + (i + 1)).gotoAndStop(getCardOffsetFrame(aCards[i]));
      i++;
   }
   iCardsShowing = 2;
   iHandValueDisplay = getHandValue(2);
}
function wipe()
{
   aCards = new Array();
}
function flip()
{
   gotoAndStop("fFlip");
   play();
}
function doneFlipping()
{
   gotoAndStop(2);
   unHideSecondCard();
}
function unHideSecondCard()
{
   bFlipped = true;
   mCard2.gotoAndStop(getCardOffsetFrame(aCards[1]));
   iHandValueDisplay = getHandValue(2);
   _root.g_oDealer.doneRevealCard();
}
function updateNextCardOnly()
{
   iCardsShowing++;
   gotoAndStop(iCardsShowing);
   var myCard = eval("mCard" + iCardsShowing);
   var gotoFrame = getCardOffsetFrame(aCards[iCardsShowing - 1]);
   eval("mCard" + iCardsShowing).gotoAndStop(getCardOffsetFrame(aCards[iCardsShowing - 1]));
   iHandValueDisplay = getHandValue(iCardsShowing);
}
function cleanUp()
{
   gotoAndStop("blank");
   bFlipped = false;
}
function getCardOffsetFrame(i)
{
   if(i == 0)
   {
      return 2;
   }
   var _loc3_ = _root.getSuit(i);
   var _loc5_ = _root.getCardType(i);
   var _loc2_ = (_loc3_ + 1) * 20 + _loc5_;
   return _loc2_;
}
function getHandValue(iP1)
{
   if(aCards[1] == 0)
   {
      return "?";
   }
   var _loc2_;
   var _loc4_ = 0;
   var _loc5_ = 0;
   var _loc6_ = aCards.length;
   if(iP1 > 1)
   {
      _loc6_ = iP1;
   }
   var _loc3_ = 0;
   while(_loc3_ < _loc6_)
   {
      _loc2_ = _root.getCardType(aCards[_loc3_]);
      if(_loc2_ == 1)
      {
         _loc5_ = _loc5_ + 1;
         _loc2_ = 11;
      }
      else if(_loc2_ > 10)
      {
         _loc2_ = 10;
      }
      _loc4_ += _loc2_;
      _loc3_ = _loc3_ + 1;
   }
   while(_loc4_ > 21 && _loc5_ > 0)
   {
      _loc4_ -= 10;
      _loc5_ = _loc5_ - 1;
   }
   if(isNaN(_loc4_))
   {
      return "";
   }
   return _loc4_;
}
stop();
var aCards = new Array();
var iCardsShowing = 0;
var iHandValueDisplay = "";
var bFlipped = false;
