function createTheGameAndGo()
{
   if(usersCanCreatedRooms)
   {
      var _loc13_ = new GSECSWordFilter.BadWordFilter(_root.gsiUserData.filter_level);
      _root.sRoomCreatedName = _loc13_.cleanString(mCreator.roomName_txt.text);
   }
   else
   {
      _root.sRoomCreatedName = _root.GSECS_userCreatedRoomNameDude;
   }
   var _loc3_ = undefined;
   var _loc4_ = _root.sRoomCreatedName.indexOf(cDivChar);
   var _loc5_ = undefined;
   _loc3_ = _root.sRoomCreatedName;
   while(_loc4_ != -1)
   {
      _loc5_ = _loc3_;
      _loc3_ = _loc5_.substring(0,_loc4_);
      _loc3_ += cSubChar;
      _loc3_ += _loc5_.substring(_loc4_ + 1,_loc5_.length);
      _loc4_ = _loc3_.indexOf(cDivChar);
   }
   _root.sRoomCreatedName = _loc3_ + cDivChar + _root.gsiUserData.gaia_id;
   var _loc11_ = 0;
   var _loc8_ = sushi.session.getRoomIDs();
   var _loc6_ = undefined;
   var _loc12_ = _loc8_.length;
   var _loc2_ = 0;
   while(_loc2_ < _loc12_)
   {
      if(_loc8_[_loc2_] != 1)
      {
         _loc6_ = sushi.room.getName(_loc8_[_loc2_]);
         if(_root.sRoomCreatedName == _loc6_)
         {
            _loc11_ = 1;
            var _loc7_ = "The room name " + sRoomCreatedName + " already exists. \n\nPlease re-enter a different room name.";
            _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:_loc7_,popPanelType:"ok"});
         }
      }
      _loc2_ = _loc2_ + 1;
   }
   if(_loc11_ == 0)
   {
      sPassWord = mCreator.passWord_txt.text;
      if(sPassWord.length > 0)
      {
         sushi.me.createRoomPassword(_root.sRoomCreatedName,sPassWord,_root.dynamicRoomName,createRoomCallBack);
      }
      else
      {
         sushi.me.createRoom(_root.sRoomCreatedName,_root.dynamicRoomName,createRoomCallBack);
      }
   }
}
function createRoomCallBack(s)
{
   hideLoadingBar();
   if(!s)
   {
      clearCallbacks();
   }
   else
   {
      clearCallbacks();
      var _loc2_ = "Only two rooms can be created per user.";
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:_loc2_,popPanelType:"ok"});
   }
}
function creationCheck(roomID, roomCreator, roomLimit)
{
   if(roomCreator == _root.sRoomCreatedName)
   {
      iMyRoomID = roomID;
      bar.mc_LockButon._visible = true;
      if(sPassWord.length > 0)
      {
         mc_password_display._visible = true;
         sushi.me.changeRoomPassword(roomID,sPassWord,sushi.me.data,joinRoomCallBack);
      }
      else
      {
         sushi.me.changeRoom(roomID,sushi.me.data,joinRoomCallBack);
      }
   }
}
function joinRoomCallBack(s)
{
   removeLoadingBar();
   if(!s)
   {
      bar.maintitle = removeUIDFromRoomName(sushi.room.getName(sushi.me.room));
      startMultiPlayerGame();
   }
}
function clearCallbacks()
{
   sushi.event.onNewMember.clearCallback();
   sushi.event.onRemoveMember.clearCallback();
   sushi.event.onMemberChangesRoom.clearCallback();
}
if(_global.isInNeedOfAutoRoom)
{
   _root.GSECS_userCreatedRoomNameDude = _root.gsiUserData.username + "\'s Room";
   createTheGameAndGo();
}
var sRoomCreatedName;
var bPassWordLock = false;
var sPassWord = "";
var usersCanCreatedRooms = false;
removeLoadingBar();
sushi.event.onNewRoom.setCallback(creationCheck);
Key.removeListener(keyListener);
var keyListener = new Object();
if(usersCanCreatedRooms == false && !_global.isAutoAndCreateNew)
{
   _root.GSECS_userCreatedRoomNameDude = _root.gsiUserData.username + "\'s Room";
}
keyListener.onKeyDown = function()
{
   if(Key.getCode() == 13)
   {
      createTheGameAndGo();
   }
};
Key.addListener(keyListener);
mCreator.createNewGame_btn.onRelease = function()
{
   showLoadingBar();
   createTheGameAndGo();
};
mCreator.cancel_btn.onRelease = function()
{
   clearCallbacks();
   gotoAndStop("selectGame_frame");
   play();
};
