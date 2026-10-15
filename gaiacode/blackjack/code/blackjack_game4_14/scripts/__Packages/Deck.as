class Deck
{
   var deckArray;
   var iNextCard;
   function Deck()
   {
      this.deckArray = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52];
      this.iNextCard = 0;
   }
   function shuffleDeck()
   {
      var _loc7_ = 70;
      var _loc6_;
      var _loc5_ = this.deckArray.length;
      var _loc4_;
      var _loc3_;
      this.traceDeckVerbose();
      var _loc2_ = 0;
      while(_loc2_ < _loc7_)
      {
         _loc4_ = random(_loc5_);
         _loc3_ = random(_loc5_);
         _loc6_ = this.deckArray[_loc4_];
         this.deckArray[_loc4_] = this.deckArray[_loc3_];
         this.deckArray[_loc3_] = _loc6_;
         _loc2_ = _loc2_ + 1;
      }
      this.iNextCard = 0;
      this.traceDeckVerbose();
   }
   function getNextCard()
   {
      this.iNextCard = this.iNextCard + 1;
      if(this.iNextCard > this.deckArray.length)
      {
         return 0;
      }
      var _loc2_ = this.deckArray[this.iNextCard];
      return this.deckArray[this.iNextCard];
   }
   function cardString(i)
   {
      var _loc4_ = Math.floor(i / 13);
      var _loc2_ = i % 13;
      var _loc6_ = ["diamond","club","heart","spade"];
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
      _loc1_ += _loc6_[_loc4_];
      _loc1_ += "s.";
      _loc1_ += " (" + i + ")";
      return _loc1_;
   }
   function traceDeckVerbose()
   {
      var _loc2_;
      while(_loc2_ < this.deckArray.length)
      {
         _loc2_ = _loc2_ + 1;
      }
   }
}
