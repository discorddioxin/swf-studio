class gaiaWordFilter.WordFilter
{
   static var BAD_WORD = 0;
   static var CLEAN_WORD = 1;
   static var FILTER_LV = 2;
   static var WORD_LEN = 2;
   static var wordListCache = {};
   static var MASTER_WORD_LIST = [["asshole","a*****e",1],["bitch","b***h",1],["cunt","c**t",1],["fuck","f**k",1],["shit","s**t",1],["twat","t**t",1],["asswad","a****d",1],["chink","c***k",4],["clit","c**t",4],["cum","c**",4],["cock","c**k",4],["dick","d**k",4],["dildo","d***o",4],["fag","f**",4],["fuk","f**",4],["penis","p***s",4],["nipple","n****e",4],["nigger","n****r",4],["vagina","v****a",4],["nigga","n***a",4],["kunt","k**t",4],["jizz","j**z",4],["prick","p***k",4]];
   function WordFilter()
   {
   }
   static function cleanBadWords(raw, filterLv)
   {
      if(isNaN(filterLv))
      {
         filterLv = Infinity;
      }
      var _loc6_ = gaiaWordFilter.WordFilter.wordListCache["lessThan" + filterLv];
      var _loc1_;
      var _loc7_ = _loc6_.length;
      var _loc3_ = new String(raw);
      var _loc5_ = new String(_loc3_.toLowerCase());
      var _loc2_;
      if(_loc6_ == undefined)
      {
         _loc6_ = gaiaWordFilter.WordFilter.makeWordList(filterLv);
         _loc7_ = _loc6_.length;
      }
      var _loc4_ = 0;
      while(_loc4_ < _loc7_)
      {
         _loc2_ = _loc6_[_loc4_];
         _loc1_ = _loc5_.indexOf(_loc2_[gaiaWordFilter.WordFilter.BAD_WORD]);
         while(_loc1_ != -1)
         {
            _loc3_ = new String(_loc3_.substr(0,_loc1_) + _loc2_[gaiaWordFilter.WordFilter.CLEAN_WORD] + _loc3_.substr(_loc1_ + _loc2_[gaiaWordFilter.WordFilter.WORD_LEN]));
            _loc1_ = _loc5_.indexOf(_loc2_[0],_loc1_ + 1);
         }
         _loc4_ = _loc4_ + 1;
      }
      return _loc3_;
   }
   static function cleanBrackets(raw)
   {
      var _loc1_;
      var _loc2_ = new String(raw);
      _loc1_ = _loc2_.indexOf(">");
      while(_loc1_ != -1)
      {
         _loc2_ = new String(_loc2_.substr(0,_loc1_) + "&gt;" + _loc2_.substr(_loc1_ + 1));
         _loc1_ = _loc2_.indexOf(">",_loc1_ + 1);
      }
      _loc1_ = _loc2_.indexOf("<");
      while(_loc1_ != -1)
      {
         _loc2_ = new String(_loc2_.substr(0,_loc1_) + "&lt;" + _loc2_.substr(_loc1_ + 1));
         _loc1_ = _loc2_.indexOf("<",_loc1_ + 1);
      }
      return _loc2_;
   }
   static function cleanBracketsAndBadWords(raw, filterLv)
   {
      return gaiaWordFilter.WordFilter.cleanBrackets(gaiaWordFilter.WordFilter.cleanBadWords(raw,filterLv));
   }
   static function noBadWords(raw, filterLv)
   {
      if(isNaN(filterLv))
      {
         filterLv = Infinity;
      }
      var _loc5_ = gaiaWordFilter.WordFilter.wordListCache["lessThan" + filterLv];
      var _loc2_ = _loc5_.length;
      var _loc4_;
      var _loc3_;
      var _loc7_ = new String(raw.toLowerCase());
      var _loc6_ = true;
      if(_loc5_ == undefined)
      {
         _loc5_ = gaiaWordFilter.WordFilter.makeWordList(filterLv);
         _loc2_ = _loc5_.length;
      }
      var _loc1_ = 0;
      while(_loc1_ < _loc2_)
      {
         _loc4_ = _loc5_[_loc1_];
         _loc3_ = _loc7_.indexOf(_loc4_[gaiaWordFilter.WordFilter.BAD_WORD]);
         if(_loc3_ != -1)
         {
            _loc6_ = false;
            _loc1_ = _loc2_;
         }
         _loc1_ = _loc1_ + 1;
      }
      return _loc6_;
   }
   static function noBrackets(raw)
   {
      var _loc1_;
      var _loc2_ = true;
      _loc1_ = raw.indexOf(">");
      if(_loc1_ != -1)
      {
         _loc2_ = false;
      }
      _loc1_ = raw.indexOf("<");
      if(_loc1_ != -1)
      {
         _loc2_ = false;
      }
      return _loc2_;
   }
   static function noBracketsOrBadWords(raw, filterLv)
   {
      return gaiaWordFilter.WordFilter.noBadWords(raw,filterLv) && gaiaWordFilter.WordFilter.noBrackets(raw);
   }
   static function makeWordList(filterLv)
   {
      var _loc4_ = gaiaWordFilter.WordFilter.MASTER_WORD_LIST.length;
      var _loc2_ = new Array();
      if(isNaN(filterLv))
      {
         filterLv = Infinity;
      }
      var _loc1_ = 0;
      while(_loc1_ < _loc4_)
      {
         if(gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.FILTER_LV] <= filterLv)
         {
            _loc2_.push([gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.BAD_WORD],gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.CLEAN_WORD],gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.BAD_WORD].length]);
         }
         _loc1_ = _loc1_ + 1;
      }
      gaiaWordFilter.WordFilter.wordListCache["lessThan" + filterLv] = _loc2_;
      return _loc2_;
   }
   static function getBadWords(filterLv)
   {
      var _loc2_ = new Array();
      var _loc4_ = gaiaWordFilter.WordFilter.MASTER_WORD_LIST.length;
      if(isNaN(filterLv))
      {
         filterLv = Infinity;
      }
      var _loc1_ = 0;
      while(_loc1_ < _loc4_)
      {
         if(gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.FILTER_LV] <= filterLv)
         {
            _loc2_.push(gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.BAD_WORD]);
         }
         _loc1_ = _loc1_ + 1;
      }
      return _loc2_;
   }
   static function getBadWordData(filterLv)
   {
      var _loc3_ = new Array();
      var _loc2_;
      var _loc5_ = gaiaWordFilter.WordFilter.MASTER_WORD_LIST.length;
      if(isNaN(filterLv))
      {
         filterLv = Infinity;
      }
      var _loc1_ = 0;
      while(_loc1_ < _loc5_)
      {
         if(gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.FILTER_LV] <= filterLv)
         {
            _loc2_ = new Object();
            _loc2_.word = gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.BAD_WORD];
            _loc2_.cleanedWord = gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.CLEAN_WORD];
            _loc2_.filterLevel = gaiaWordFilter.WordFilter.MASTER_WORD_LIST[_loc1_][gaiaWordFilter.WordFilter.FILTER_LV];
            _loc3_.push(_loc2_);
         }
         _loc1_ = _loc1_ + 1;
      }
      return _loc3_;
   }
}
