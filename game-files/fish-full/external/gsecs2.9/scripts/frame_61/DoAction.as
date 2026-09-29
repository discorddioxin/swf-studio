function getAppropriateIP()
{
   var _loc2_ = randRange(0,_root.serverListing.length);
   _root.serverListing[_loc2_];
}
function randRange(min, max)
{
   var _loc1_ = Math.round(Math.random() * (max - min)) + min;
   return _loc1_;
}
function listServers()
{
   var _loc9_ = new Array();
   if(_root.aCuteServerNames.length > 1)
   {
      _loc9_ = _root.aCuteServerNames;
   }
   else
   {
      _loc9_ = ["Angelic","Demonic","Grunny","Kiki","Coco","Rock Puppy","Ian\'s","Moria\'s","Rina\'s","Gambino\'s"];
   }
   var _loc3_ = new Array();
   var _loc2_ = 0;
   while(_loc2_ < _root.serverListing.length)
   {
      _loc3_[_loc2_] = _loc2_;
      _loc2_ = _loc2_ + 1;
   }
   _loc2_ = 0;
   while(_loc2_ < _root.serverListing.length * 2)
   {
      var _loc7_ = Math.floor(Math.random() * _root.serverListing.length);
      var _loc6_ = Math.floor(Math.random() * _root.serverListing.length);
      var _loc8_ = _loc3_[_loc7_];
      _loc3_[_loc7_] = _loc3_[_loc6_];
      _loc3_[_loc6_] = _loc8_;
      _loc2_ = _loc2_ + 1;
   }
   mc_ServerChooser.serverListing_lt.removeAll();
   var _loc4_ = 0;
   while(_loc4_ < _root.serverListing.length)
   {
      var _loc5_ = _root.sGameNameString;
      if(_loc5_ == "blackjack")
      {
         _loc5_ = "cards";
      }
      mc_ServerChooser.serverListing_lt.addItem(_loc9_[_loc3_[_loc4_]] + " " + _loc5_,_root.serverListing[_loc3_[_loc4_]]);
      _loc4_ = _loc4_ + 1;
   }
}
removeLoadingBar();
if(_root.server != undefined && _root.server != "undefined")
{
   mc_ServerChooser._visible = false;
   _root.GSECS_SelectedServerIP = _root.server;
   _root.GSECS_SelectedServerName = _root.server;
   showLoadingBar();
   connectToSushi(_root.server);
}
else if(_global.isAutoConnect)
{
   var newIP = getAppropriateIP();
   _root.server = newIP;
   mc_ServerChooser._visible = false;
   _root.GSECS_SelectedServerIP = _root.server;
   _root.GSECS_SelectedServerName = _root.server;
   showLoadingBar();
   connectToSushi(_root.server);
}
else if(_global.isChooseNewRoom)
{
   var newIP = getAppropriateIP();
   _root.server = newIP;
   mc_ServerChooser._visible = false;
   _root.GSECS_SelectedServerIP = _root.server;
   _root.GSECS_SelectedServerName = _root.server;
   showLoadingBar();
   connectToSushi(_root.server);
}
else
{
   listServers();
}
mc_ServerChooser.join_btn.onRelease = function()
{
   _root.GSECS_SelectedServerIP = mc_ServerChooser.serverListing_lt.getSelectedItem().data;
   _root.GSECS_SelectedServerName = mc_ServerChooser.serverListing_lt.getSelectedItem().label;
   showLoadingBar();
   connectToSushi(_root.GSECS_SelectedServerIP);
};
