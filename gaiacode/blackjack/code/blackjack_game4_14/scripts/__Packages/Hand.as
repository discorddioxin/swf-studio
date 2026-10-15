class Hand
{
   var bHiddenSecondCard;
   var cardArray;
   var value;
   function Hand()
   {
      this.cardArray = new Array();
      this.bHiddenSecondCard = false;
   }
   function addCard(iCardNum)
   {
      this.cardArray.push(iCardNum);
      this.value = this.getHandValue();
   }
   function hideSecondCard()
   {
      this.bHiddenSecondCard = true;
   }
   function showSecondCard()
   {
      this.bHiddenSecondCard = false;
   }
   function getCardArray()
   {
      var _loc3_ = new Array();
      _loc3_[0] = this.cardArray[0];
      if(this.bHiddenSecondCard)
      {
         _loc3_[1] = 0;
      }
      else
      {
         _loc3_[1] = this.cardArray[1];
      }
      var _loc2_ = 2;
      while(_loc2_ < this.cardArray.length)
      {
         _loc3_[_loc2_] = this.cardArray[_loc2_];
         _loc2_ = _loc2_ + 1;
      }
      return _loc3_;
   }
   function getHandValue()
   {
      var _loc2_;
      var _loc4_ = 0;
      var _loc5_ = 0;
      var _loc3_ = 0;
      while(_loc3_ < this.cardArray.length)
      {
         _loc2_ = this.getCardType(this.cardArray[_loc3_]);
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
      if(_loc4_ > 21 && _loc5_ > 0)
      {
         _loc4_ -= 10;
         _loc5_ = _loc5_ - 1;
      }
      if(_loc4_ > 21)
      {
         _loc4_ = -1;
      }
      return _loc4_;
   }
   function getCardType(iCardNumber)
   {
      return (iCardNumber - 1) % 13 + 1;
   }
}
