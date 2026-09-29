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
   _root.mLoginHolder.loadMovie(sGSECS_SWF_LOC);
}
function startGameSingle()
{
   _root.fromGameRoom = false;
   gsecs.gotoAndStop("blank_frame");
   gotoAndStop("loadgamedata");
   play();
}
function startGameMulti()
{
   _root.fromGameRoom = true;
   gotoAndStop("loadgamedata");
   play();
}
function resultUserDataGameInit()
{
}
function populateGameSpcificData(userData)
{
}
function gsecsQuitButtonPressed()
{
   saveAndQuit();
}
function saveAndQuit()
{
   if(_root.playAsGuest)
   {
      _root.attachMovie("errorPanelOk","errorPanelOk",430,{theMessage:_root.gameAlertText.reg,popPanelType:"ok"});
   }
   else if(_root.main.myFish.length < 1)
   {
      _root.getURL("javascript:window.close();");
   }
   else
   {
      _root.main.rodPlacement.char.gotoAndStop("off");
      _root.quitConfirm.gotoAndStop("on");
   }
}
function userWantsHelp()
{
   getURL(gameHelpURL,"_blank");
}
var whichLake = "bassken";
stop();
_root.attachMovie("splashScreen","splashScreen",400);
_root.splashScreen._x = -233;
var gaiaID = "";
var fromGameRoom = false;
var choosenSushiServer = "";
_global.sushi = new com.rawfishsoftware.sushi.SushiAPI();
sushi.enableLogging(true);
var gameAlertText = new Object();
gameAlertText.reg = "<U><A HREF=\'http://www.gaiaonline.com/profile/character.php\' TARGET=\'_blank\'>Register with Gaia now</A></U> to play the full version of this game. Create a custom avatar, win prizes and chat with others. Registering is quick, easy and free.";
gameAlertText.goldMountain = "<b>You will need at least one token or win credit to play. You can buy tokens at the booth inside Johnny K. Gambino\'s Gold Mountain Casino lobby. <U><A HREF=\'http://www.gaiaonline.com/gaia/store.php?id=14f247\' TARGET=\'_blank\'>Go there now</A></U></b>";
var reportAbuseInformation = new Object();
reportAbuseInformation.introMessage = "<font color=\'#0000FF\'>Reminder! Room Names and in-game chat must follow the <font color=\'#FF0000\'><u><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'>Terms of Service</a></u></font> and <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/info/tos.php?info=rules\' TARGET=\'_blank\'>Rules & Guidelines</A></U></font>. <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/forum/viewtopic.php?t=11856831\' TARGET=\'_blank\'>Click here to read more</A></U></font>.</font></b>";
reportAbuseInformation.fullWarning = "<font color=\'#FF4444\' size=\'9\'>";
reportAbuseInformation.fullWarning += "Please only report instances that fall under the following:";
reportAbuseInformation.fullWarning += "<br> - Trolling/Abuse - Material that is offensive or promotes unfriendly replies.";
reportAbuseInformation.fullWarning += "<br> - Offsite Advertising - Users promoting sites other than Gaia Online.";
reportAbuseInformation.fullWarning += "<br> - Password Phishing - Requests for your password.";
reportAbuseInformation.fullWarning += "<br> - Sexually Explicit Material - Explicitly sexual or violent content.";
reportAbuseInformation.fullWarning += "<br> - Items not listed here but are covered in the <font color=\'#0000FF\'><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'><u>Gaia Terms of Service</u></A></font> (ToS)";
reportAbuseInformation.fullWarning += "<br>";
reportAbuseInformation.fullWarning += "Do not submit reports for swearing, attitude, or issues not covered in the <font color=\'#0000FF\'><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'><u>Gaia Online ToS</u></A></font>.";
reportAbuseInformation.fullWarning += "</font>";
var hex_chr = "0123456789abcdef";
if(_root.gsiUrl == undefined)
{
   var gsiURL = "www";
}
else
{
   var gsiURL = _root.gsiUrl;
}
var gsiMethod = new GSItools.GSIGateway(gsiURL + ".gaiaonline.com");
var iGSIMethodToCallAfterAuth = 0;
var dynamicServerListing = true;
var testOnLocalHostGameServer = false;
var alwaysLogIn = false;
if(whichLake == "bassken")
{
   var session = "gaiafishing001";
   var serverNameScheme = "Gaia Fishing - Barton";
}
else if(whichLake == "gambino")
{
   var session = "gaiafishing002";
   var serverNameScheme = "Gaia Fishing - Durem";
}
else if(whichLake == "durem")
{
   var session = "gaiafishing003";
   var serverNameScheme = "Gaia Fishing - Gambino";
}
else
{
   var session = "gaiafishing001";
   var serverNameScheme = "Gaia Fishing - Barton";
}
var dynamicRoomName = "fishinggame";
var port = 8080;
var gaiaApplicationID = "1";
var gsiUserData = new Object();
var popPanelX = Stage.width / 2;
var popPanelY = (Stage.height + 100) / 2;
var LoadingBarX = popPanelX;
var LoadingBarY = 460;
var initUserGameData = [0,0,0,0,0,0,0,0,0,0];
var singleRoom = false;
var userCreateRoom = true;
var showPlayerMode = false;
var sGameNameString = "fishing";
var sGameVersionNumber = "4.20";
var sGSECSVersion = "2.9";
_global.codebase = String(_root._url);
_global.codebase = _global.codebase.substring(0,_global.codebase.lastIndexOf("/") + 1);
var sGSECS_SWF_LOC = codebase + "../sharedsource/GSECS/gsecs" + sGSECSVersion + ".swf";
var gameHelpURL = "http://www.gaiaonline.com/info/help.php?view=category&id=23";
var gameExchangeURL = "http://www.gaiaonline.com/gaia/shopping.php?key=alpltfbdnxgowsfn";
startLogIn();
chat("<br><br><br><br><br><br><br><br><br><br><b><font color=\'#0000FF\'>Reminder! Room Names and in-game chat must follow the <font color=\'#FF0000\'><u><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'>Terms of Service</a></u></font> and <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/info/tos.php?info=rules\' TARGET=\'_blank\'>Rules & Guidelines</A></U></font>. <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/forum/viewtopic.php?t=11856831\' TARGET=\'_blank\'>Click here to read more</A></U></font>.</font></b><br><br>");
var welcomeChatInstructionString = "<font color=\'#119911\'>Welcome to Gaia Fishing! You will need a rod and some bait available at the <U><A HREF=\'" + gameExchangeURL + "\' TARGET=\'_blank\'>fishing shop</A></U>. Click on one type of bait then click the mouse to begin casting. Watch the power meter and click again to cast. If you catch a fish, move your mouse side to side to keep it between the lines.</font>";
var my_cm = new ContextMenu();
my_cm.builtInItems.quality = false;
my_cm.builtInItems.print = false;
my_cm.builtInItems.play = false;
my_cm.builtInItems.zoom = false;
my_cm.builtInItems.save = false;
my_cm.builtInItems.loop = false;
my_cm.builtInItems.rewind = false;
my_cm.builtInItems.forward_back = false;
var menuItem_cmi = new ContextMenuItem("Help",userWantsHelp);
my_cm.customItems.push(menuItem_cmi);
this.menu = my_cm;
