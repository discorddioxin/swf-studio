function getActiveRoom()
{
   var _loc4_ = sushi.session.getRoomIDs();
   var _loc5_ = _loc4_.length;
   var _loc6_ = new Array();
   var _loc2_ = 0;
   while(_loc2_ < _loc5_)
   {
      var _loc3_ = sushi.room.getNumberOfMembers(_loc4_[_loc2_]);
      if(_loc3_ > ROOM_MIN && _loc3_ < ROOM_MAX)
      {
         return _loc4_[_loc2_];
      }
      _loc2_ = _loc2_ + 1;
   }
   gotoAndStop("createGame_frame");
   _global.isAutoConnect = true;
   _global.isInNeedOfAutoRoom = true;
   return undefined;
}
function joinGame()
{
   if(!autoJoin)
   {
      selectedGameID = mChooser.gameListing_lt.getSelectedItem().data;
   }
   autoJoin = false;
   if(sushi.room.getNumberOfMembers(selectedGameID) >= 6)
   {
      if(_global.isAutoAndCreateNew)
      {
         gotoAndStop("createGame_frame");
         _global.isAutoConnect = true;
         _global.isInNeedOfAutoRoom = true;
         return undefined;
      }
      gotoAndStop("selectServer_frame");
      _root.IP = _root.room_id = undefined;
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:"Room is full, or no longer exists. \n\nPlease try another room, or create a new one of you own.\n\n",popPanelType:"ok"});
      return undefined;
   }
   if(sushi.room.hasPassword(selectedGameID) == 1)
   {
      mChooser.gotoAndStop("enterPassword_f");
   }
   else if(selectedGameID)
   {
      showLoadingBar();
      sushi.me.changeRoom(selectedGameID,sushi.me.data,changeRoomCallBack);
   }
}
function changeRoomCallBack(s)
{
   if(!s)
   {
      bar.maintitle = removeUIDFromRoomName(sushi.room.getName(sushi.me.room));
      startMultiPlayerGame();
   }
}
function tryPassword(sPW)
{
   if(selectedGameID)
   {
      showLoadingBar();
      sushi.me.changeRoomPassword(selectedGameID,sPW,sushi.me.data,changeRoomCallBackPassword);
   }
}
function changeRoomCallBackPassword(s)
{
   if(!s)
   {
      bar.maintitle = removeUIDFromRoomName(sushi.room.getName(sushi.me.room)) + sLockString;
      startMultiPlayerGame();
   }
   else
   {
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:"Password incorrect. \n\nPlease try again.\n\n",popPanelType:"ok"});
   }
}
function listGames()
{
   mChooser.gameListing_lt.removeAll();
   var _loc2_ = sushi.session.getRoomIDs();
   var _loc9_ = _loc2_.length;
   var _loc5_ = new Array();
   var _loc6_ = false;
   var _loc1_ = 0;
   while(_loc1_ < _loc9_)
   {
      _loc6_ = false;
      if(_loc2_[_loc1_] != 1)
      {
         if(!sushi.room.isLocked(_loc2_[_loc1_]))
         {
            if(sushi.room.getName(_loc2_[_loc1_]) != undefined)
            {
               var _loc3_ = 0;
               while(_loc3_ < _loc5_.length)
               {
                  if(_loc2_[_loc1_] == _loc5_[_loc3_])
                  {
                     _loc6_ = true;
                     break;
                  }
                  _loc3_ = _loc3_ + 1;
               }
               if(_loc6_ == false)
               {
                  var _loc7_ = sushi.room.getNumberOfMembers(_loc2_[_loc1_]);
                  var _loc8_ = 6;
                  var _loc4_ = "(" + _loc7_ + "/" + _loc8_;
                  if(sushi.room.hasPassword(_loc2_[_loc1_]) == 1)
                  {
                     _loc4_ += " pw";
                  }
                  _loc4_ = _loc4_ + ") " + removeUIDFromRoomName(sushi.room.getName(_loc2_[_loc1_]));
                  mChooser.gameListing_lt.addItem(_loc4_,_loc2_[_loc1_]);
                  _loc5_.push(_loc2_[_loc1_]);
               }
            }
         }
      }
      _loc1_ = _loc1_ + 1;
   }
}
ROOM_MIN = 0;
ROOM_MAX = 5;
if(_root.room_id != undefined && _root.room_id != "undefined")
{
   autoJoin = true;
   selectedGameID = _root.room_id;
   _global.isAutoConnect = false;
   mChooser._visible = false;
   joinGame();
}
else
{
   var selectedGameID = 0;
}
if(_global.isAutoConnect)
{
   autoJoin = true;
   selectedGameID = getActiveRoom();
   mChooser._visible = false;
   joinGame();
}
var reportRoomName = "";
removeLoadingBar();
Key.removeListener(keyListener);
if(_root.userCreateRoom == false)
{
   mChooser.createGame_btn._visible = false;
   mChooser.create_txt._visible = false;
   mChooser.joinGame_btn._x = 0;
   mChooser.join_txt._x = 0;
}
mChooser.gameListing_lt.setStyle("borderStyle","solid");
_global.style.setStyle("themeColor","haloBlue");
sushi.event.onNewRoom.setCallback(listGames);
sushi.event.onRemoveRoom.setCallback(listGames);
sushi.event.onRoomLocked.setCallback(listGames);
if(_root.serverListing.length == 1)
{
   mChooser.goBack_btn._visible = false;
   mChooser.mc_goBackArrow._visible = false;
}
listGames();
mChooser.joinGame_btn.onRelease = function()
{
   joinGame();
};
mChooser.goBack_btn.onRelease = function()
{
   sushi.disconnectFromServer();
   openSelectServerScreen();
};
mChooser.createGame_btn.onRelease = function()
{
   gotoAndStop("createGame_frame");
   play();
};
mChooser.refresh_btn.onRelease = function()
{
   listGames();
};
mChooser.reportAbuse_btn.onRelease = function()
{
   var _loc1_ = mChooser.gameListing_lt.getSelectedItem().data;
   reportRoomName = sushi.room.getName(_loc1_);
   reportRoomNameDisplay = removeUIDFromRoomName(reportRoomName);
   mChooser.gotoAndStop("report_f");
};
