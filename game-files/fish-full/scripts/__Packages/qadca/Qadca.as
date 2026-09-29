class qadca.Qadca
{
   static var awesome = null;
   static var bol = new Array();
   static var bolmax = 100;
   static var bolc = 0;
   function Qadca()
   {
   }
   static function e0(id, s)
   {
      var _loc1_;
      _loc1_ = qadca.Qadca.e1(id,s);
      _loc1_ = qadca.Qadca.e2(id,_loc1_);
      _loc1_ = qadca.Qadca.e3(id,_loc1_);
      return _loc1_;
   }
   static function d0(id, s)
   {
      var _loc1_ = new Object();
      if(qadca.Qadca.iih(s))
      {
         _loc1_.b = false;
         return _loc1_;
      }
      s = qadca.Qadca.d3(id,s);
      s = qadca.Qadca.d2(id,s);
      _loc1_ = qadca.Qadca.d1(id,s);
      return _loc1_;
   }
   static function e1(id, s)
   {
      var _loc1_ = qadca.Qadca.e1iMod(id);
      var _loc2_ = _loc1_ + s + _loc1_;
      return _loc2_;
   }
   static function e1iMod(id)
   {
      var _loc1_ = id % 80;
      _loc1_ += 19;
      return _loc1_;
   }
   static function d1(id, s)
   {
      var _loc1_ = s.split("");
      var _loc5_ = _loc1_.pop();
      _loc1_.pop();
      _loc1_.reverse();
      var _loc6_ = _loc1_.pop();
      _loc1_.pop();
      var _loc4_ = _loc6_ + "" + _loc5_;
      var _loc8_ = qadca.Qadca.e1iMod(id);
      var _loc3_ = false;
      if(_loc4_ == _loc8_)
      {
         _loc3_ = true;
      }
      _loc1_.reverse();
      var _loc7_ = _loc1_.join("");
      var _loc2_ = new Object();
      _loc2_.b = _loc3_;
      _loc2_.s = _loc7_;
      return _loc2_;
   }
   static function e2(id, s)
   {
      var _loc4_ = s.split("");
      var _loc3_ = new Array();
      var _loc5_ = id % 3;
      var _loc1_ = 0;
      var _loc2_;
      while(_loc1_ < s.length)
      {
         if(_loc1_ % 3 == _loc5_)
         {
            _loc2_ = chr(Math.round(Math.random() * 200) + 33);
            _loc3_.push(_loc2_);
         }
         _loc3_.push(_loc4_[_loc1_]);
         _loc1_ = _loc1_ + 1;
      }
      var _loc7_ = _loc3_.join("");
      return _loc7_;
   }
   static function d2(id, s)
   {
      var _loc2_ = s.split("");
      var _loc5_ = new Array();
      var _loc6_ = id % 3;
      var _loc3_ = 0;
      var _loc8_ = 0;
      var _loc1_ = 0;
      while(_loc1_ < s.length)
      {
         if(_loc1_ % 3 == _loc6_)
         {
            _loc2_[_loc1_ + _loc3_] = qadca.Qadca.awesome;
            _loc3_ = _loc3_ + 1;
         }
         _loc1_ = _loc1_ + 1;
      }
      _loc1_ = 0;
      while(_loc1_ < s.length)
      {
         if(_loc2_[_loc1_] != qadca.Qadca.awesome)
         {
            _loc5_.push(_loc2_[_loc1_]);
         }
         _loc1_ = _loc1_ + 1;
      }
      var _loc7_ = _loc5_.join("");
      return _loc7_;
   }
   static function e3(id, s)
   {
      var _loc3_ = s.split("");
      var _loc1_ = 0;
      var _loc2_;
      var _loc4_;
      while(_loc1_ < _loc3_.length)
      {
         _loc2_ = ord(_loc3_[_loc1_]);
         _loc4_ = id % 10 + 10;
         _loc2_ -= _loc4_;
         _loc3_[_loc1_] = chr(_loc2_);
         _loc1_ = _loc1_ + 1;
      }
      var _loc6_ = _loc3_.join("");
      return _loc6_;
   }
   static function d3(id, s)
   {
      var _loc3_ = s.split("");
      var _loc1_ = 0;
      var _loc2_;
      var _loc4_;
      while(_loc1_ < _loc3_.length)
      {
         _loc2_ = ord(_loc3_[_loc1_]);
         _loc4_ = id % 10 + 10;
         _loc2_ += _loc4_;
         _loc3_[_loc1_] = chr(_loc2_);
         _loc1_ = _loc1_ + 1;
      }
      var _loc6_ = _loc3_.join("");
      return _loc6_;
   }
   static function iih(s)
   {
      var _loc2_ = false;
      var _loc1_ = 0;
      while(_loc1_ < qadca.Qadca.bolmax)
      {
         if(qadca.Qadca.bol[_loc1_] == s)
         {
            _loc2_ = true;
         }
         _loc1_ = _loc1_ + 1;
      }
      qadca.Qadca.bol[qadca.Qadca.bolc++ % qadca.Qadca.bolmax] = s;
      return _loc2_;
   }
   static function tracee(s)
   {
   }
}
