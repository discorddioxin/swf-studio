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
   _root.createEmptyMovieClip("mLoginHolder",401);
   var _loc3_ = _global.baseUrl + "sharedsource/GSECS/gsecs" + sGSECSVersion + ".swf";
   _root.mLoginHolder.loadMovie(_loc3_);
   if(singleRoom)
   {
      _root.mLoginHolder._y = -50;
   }
}
function startGameSingle()
{
   _root.play();
}
function startGameMulti()
{
}
function resultUserDataGameInit()
{
   _root.mcDebug.dTrace("[GSECS DATA] resultUserDataGameInit()");
}
function populateGameSpcificData(userData)
{
   _root.mcDebug.dTrace("[GSECS_EXAMPLE] populateGameSpecificData(" + userData + ")");
}
function cb_onRemoveMember(id, teamID, roomID)
{
   avatar_onRemoveMember(id,teamID,roomID);
   chat_onRemoveMember(id,teamID,roomID);
   game_onRemoveMember(id,teamID,roomID);
}
function cb_onUpdateMember(id, data)
{
   avatar_onUpdateMember(id,data);
   chat_onUpdateMember(id,data);
   game_onUpdateMember(id,data);
}
function cb_onMemberChangesRoom(id, newRoomID, oldRoomID, data)
{
   chat_onMemberChangesRoom(id,newRoomID,oldRoomID,data);
}
function cb_onChatMessage(senderID, routing, targetID, txt)
{
   var _loc1_ = new Object();
   _loc1_ = qadca.Qadca.d0(senderID,txt);
   if(_loc1_.b)
   {
      chat_onChatMessage(senderID,routing,targetID,_loc1_.s);
   }
}
function cb_onSystemMessage(s)
{
   chat_onSystemMessage(s);
   game_onSystemMessage(s);
}
function game_onSystemMessage(m)
{
   _root.attachMovie("mcDialogue","mcDialogue",988888,{whereToGo:"server message",messageText:m});
}
_global.sushi = new com.rawfishsoftware.sushi.SushiAPI();
if(_global.sushi == undefined)
{
   _root.attachMovie("mcDialogue","mcDialogue",988888,{whereToGo:"server message",messageText:"Unable to connect to server."});
}
sushi.enableLogging(true);
var hex_chr = "0123456789abcdef";
var gaiaApplicationID = "11";
var sGameNameString = "WordBump";
var sGameVersionNumber = "1.4";
var sGSECSVersion = "2.9";
var singleRoom = true;
var noChat = true;
var userCreateRoom = false;
var showPlayerMode = false;
var alwaysLogIn = false;
var allowGuestLogin = true;
var testOnLocalHostGameServer = false;
var serverListing = ["72.5.72.143"];
var port = 8080;
var dynamicServerListing = true;
var session = "gamename";
var serverNameScheme = "sessionname";
var dynamicRoomName = "roomname";
var initUserGameData = [0,0,0,0,0,0,0,0,0,0];
var gsiUrl = !(_root.gsiUrl == undefined || _root.gsiUrl == 0) ? _root.gsiUrl : "www";
_global.gsiUrl = gsiUrl;
var gsiMethod = new GSItools.GSIGateway(_global.gsiUrl + ".gaiaonline.com");
var iGSIMethodToCallAfterAuth = 0;
var gsiUserData = new Object();
var popPanelX = Stage.width / 2;
var popPanelY = (Stage.height + 100) / 2;
var LoadingBarX = popPanelX;
var LoadingBarY = 460;
var gsecsWidth = 770;
_global.codebase = String(_root._url);
_global.codebase = _global.codebase.substring(0,_global.codebase.lastIndexOf("/") + 1);
_root.mcDebug.dTrace("_global.codebase:" + _global.codebase);
startLogIn();
var DATA_AVATAR_URL = 0;
var DATA_PLAYER_NUMBER = 1;
if(_root.playAsGuest != true)
{
   sushi.event.onUpdateMember.setCallback(cb_onUpdateMember);
   sushi.event.onRemoveMember.setCallback(cb_onRemoveMember);
   sushi.event.onMemberChangesRoom.setCallback(cb_onMemberChangesRoom);
   sushi.event.onChatMessage.setCallback(cb_onChatMessage);
}
sushi.event.onSystemMessage.setCallback(cb_onSystemMessage);
stop();
