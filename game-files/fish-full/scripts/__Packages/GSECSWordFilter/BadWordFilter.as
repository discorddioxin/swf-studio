class GSECSWordFilter.BadWordFilter
{
   var aBadWordsChat;
   var aBadWordsForRoomNames;
   function BadWordFilter(iFilterSettings)
   {
      var _loc2_ = 0;
      this.aBadWordsForRoomNames = new Array();
      this.aBadWordsChat = new Array();
      var _loc4_ = ["asshole","bitch","cunt","fuck","shit","twat"];
      var _loc3_ = ["chink","clit","cum","cock","dick","dildo","fag","fuk","penis","nipple","nigger","vagina","nigga","kunt","jizz","prick"];
      _loc2_ = 0;
      while(_loc2_ < _loc4_.length)
      {
         this.aBadWordsForRoomNames.push(_loc4_[_loc2_]);
         _loc2_ = _loc2_ + 1;
      }
      _loc2_ = 0;
      while(_loc2_ < _loc3_.length)
      {
         this.aBadWordsForRoomNames.push(_loc3_[_loc2_]);
         _loc2_ = _loc2_ + 1;
      }
      if(iFilterSettings == 0)
      {
      }
      if(iFilterSettings >= 1)
      {
         _loc2_ = 0;
         while(_loc2_ < _loc4_.length)
         {
            this.aBadWordsChat.push(_loc4_[_loc2_]);
            _loc2_ = _loc2_ + 1;
         }
      }
      if(iFilterSettings >= 4)
      {
         _loc2_ = 0;
         while(_loc2_ < _loc3_.length)
         {
            this.aBadWordsChat.push(_loc3_[_loc2_]);
            _loc2_ = _loc2_ + 1;
         }
      }
   }
   function cleanString(s)
   {
      var _loc4_;
      var _loc3_ = -1;
      _loc4_ = s.toLowerCase();
      var _loc2_ = 0;
      while(_loc2_ < this.aBadWordsForRoomNames.length)
      {
         _loc3_ = _loc4_.indexOf(this.aBadWordsForRoomNames[_loc2_]);
         if(_loc3_ != -1)
         {
            return "game " + random(9999999);
         }
         _loc2_ = _loc2_ + 1;
      }
      return s;
   }
   function starString(s)
   {
      var _loc4_ = s;
      var _loc7_;
      _loc7_ = s.toLowerCase();
      var _loc6_ = -1;
      var _loc2_ = 0;
      var _loc8_;
      var _loc3_;
      while(_loc2_ < this.aBadWordsChat.length)
      {
         _loc6_ = _loc7_.indexOf(this.aBadWordsChat[_loc2_]);
         if(_loc6_ != -1)
         {
            _loc8_ = this.aBadWordsChat[_loc2_].length - 2;
            _loc4_ = s.substring(0,_loc6_ + 1);
            _loc3_ = 0;
            while(_loc3_ < this.aBadWordsChat[_loc2_].length - 2)
            {
               _loc4_ += "*";
               _loc3_ = _loc3_ + 1;
            }
            _loc4_ += s.substring(_loc6_ + this.aBadWordsChat[_loc2_].length - 1,s.length);
            s = _loc4_;
            _loc7_ = _loc4_.toLowerCase();
         }
         _loc2_ = _loc2_ + 1;
      }
      return _loc4_;
   }
}
