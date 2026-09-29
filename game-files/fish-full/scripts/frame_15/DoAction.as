function launchLogan()
{
   if(_root.playAsGuest)
   {
      _root.attachMovie("errorPanelLogan","errorPanelLogan",430,{theMessage:_root.gameAlertText.reg + " Once you are registered, you can buy more bait, sell your fish in the marketplace, and even upgrade your rod.",popPanelType:"logan"});
      return undefined;
   }
   if(_root.errorPanelLogan)
   {
      return undefined;
   }
   if(_root.loganTextCounter < loganText.length)
   {
      _root.attachMovie("errorPanelLogan","errorPanelLogan",430,{theMessage:loganText[loganTextCounter],popPanelType:"logan"});
   }
   else
   {
      _root.attachMovie("errorPanelLogan","errorPanelLogan",430,{theMessage:loganTextRandom[Math.floor(Math.random() * loganTextRandom.length)],popPanelType:"logan"});
   }
   _root.loganTextCounter = _root.loganTextCounter + 1;
}
function launchLoganNoBait()
{
   _root.attachMovie("errorPanelLogan","errorPanelLogan",430,{theMessage:loganTextNoBait,popPanelType:"loganNoBait"});
}
function colorRandomize(ob)
{
   var _loc2_ = new Color(ob);
   var _loc1_ = new Object();
   _loc1_.ra = 100;
   _loc1_.rb = Math.round(Math.random() * 120);
   _loc1_.ga = 100;
   _loc1_.gb = Math.round(Math.random() * 120);
   _loc1_.ba = 100;
   _loc1_.bb = Math.round(Math.random() * 120);
   _loc1_.aa = 100;
   _loc1_.ab = 0;
   _loc2_.setTransform(_loc1_);
}
function loadGetData(firstTime)
{
   user.firstTime = firstTime;
   var _loc3_;
   var _loc5_;
   var _loc6_;
   var _loc4_;
   if(_root.playAsGuest)
   {
      _root.guestloadGetDataCount = _root.guestloadGetDataCount + 1;
      _loc3_ = "100001:10";
      _loc5_ = "2523|2525|2527|2529";
      _loc6_ = (guestloadGetDataCount - 1) % 4;
      _loc4_ = "501\x01\x05\x01" + _loc3_ + "\x01" + _loc5_ + "\x01" + _loc6_;
      loadGetData_CB(_loc4_);
      return undefined;
   }
   var _loc2_ = new Array();
   _loc2_[0] = "501";
   _loc2_[1] = _root.calcMD5(_root.sGameNameString + sGameVersionNumber);
   _loc2_[2] = _root.gsiUserData.gaiaSID;
   sushi.callPlugin("G_FISH_PLUGIN",_loc2_,loadGetData_CB,_root);
}
function loadGetData_CB(loadedData)
{
   if(checkForGSIError(loadedData))
   {
      return undefined;
   }
   var _loc6_ = unescape(loadedData);
   var _loc4_ = _loc6_.split("\x01");
   var _loc12_;
   var _loc10_;
   var _loc5_;
   var _loc7_;
   var _loc3_;
   var _loc2_;
   var _loc8_;
   if(_loc4_[1] == "\x06")
   {
      _loc12_ = _loc4_[2];
      _loc10_ = _loc4_[3];
      _loc5_ = _loc10_ + "\n\nPlease try again at a later time.";
      _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:_loc5_,popPanelType:"quit"});
   }
   else
   {
      _loc7_ = _loc4_[2].split("|");
      user.bait = _loc7_;
      user.baitA = 0;
      user.baitAID = null;
      user.baitD = 0;
      user.baitDID = null;
      user.baitF = 0;
      user.baitFID = null;
      _loc3_ = 0;
      while(_loc3_ < user.bait.length)
      {
         _loc2_ = user.bait[_loc3_].split(":");
         if(_loc2_[0] == "100003")
         {
            user.baitA = _loc2_[1];
            user.baitAID = _loc2_[0];
         }
         if(_loc2_[0] == "100002")
         {
            user.baitD = _loc2_[1];
            user.baitDID = _loc2_[0];
         }
         if(_loc2_[0] == "100001")
         {
            user.baitF = _loc2_[1];
            user.baitFID = _loc2_[0];
         }
         _loc3_ = _loc3_ + 1;
      }
      _root.styleSheetId = _loc4_[_loc4_.length - 1];
      _root.main.displayBaitDialog();
      if(_loc4_[3] == "")
      {
         _loc5_ = "You have no rods in your inventory to go fishing. \n\nYou can go buy a rod at the fishing store located on Bass\'ken Lake map.";
         _root.loadingBar.removeMovieClip();
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:_loc5_,popPanelType:"quit"});
      }
      else if(user.firstTime)
      {
         _loc8_ = _loc4_[3].split("|");
         user.rodIDs = _loc8_;
         user.timeOfDay = _loc4_[4];
         _root.gotoAndPlay("loaduserdata");
      }
      else
      {
         user.timeOfDay = _loc4_[4];
      }
   }
}
function chatInit()
{
   _root.chatname = sushi.room.getName(sushi.me.room);
   chatArea.chatText.html = true;
   chatArea.chatText.text = "";
   Key.addListener(keyListener);
   updateUserListing();
}
function welcomeMessage()
{
   if(didWelcomeMessage)
   {
      return undefined;
   }
   didWelcomeMessage = true;
   if(_root.gsiUserData.user_active == -999 || _root.playAsGuest)
   {
      informToRegister();
   }
   else
   {
      chat("<br><br><br><br><br><br><br><br><br><br><b><font color=\'#0000FF\'>Reminder! Room Names and in-game chat must follow the <font color=\'#FF0000\'><u><A HREF=\'http://www.gaiaonline.com/info/tos.php\' TARGET=\'_blank\'>Terms of Service</a></u></font> and <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/info/tos.php?info=rules\' TARGET=\'_blank\'>Rules & Guidelines</A></U></font>. <font color=\'#FF0000\'><U><A HREF=\'http://www.gaiaonline.com/forum/viewtopic.php?t=11856831\' TARGET=\'_blank\'>Click here to read more</A></U></font>.</font></b>");
      if(_root.welcomeChatInstructionString.length > 0)
      {
         chat(_root.welcomeChatInstructionString);
      }
   }
}
function chat_onChatMessage(senderID, routing, targetID, txt)
{
   var _loc2_ = 0;
   while(_loc2_ < aIgnoreList.length)
   {
      if(senderID == aIgnoreList[_loc2_])
      {
         return undefined;
      }
      _loc2_ = _loc2_ + 1;
   }
   if(!bwf)
   {
      bwf = new GSECSWordFilter.BadWordFilter(_root.gsiUserData.filter_level);
   }
   txt = bwf.starString(txt);
   if(txt == undefined)
   {
      return undefined;
   }
   saveChatRecord(sushi.member.getName(senderID) + ": " + txt);
   chat("<b>" + sushi.member.getName(senderID) + ": </b>" + txt);
   updateUserListing();
}
function chat(txt)
{
   chatArea.chatText.htmlText += txt + "<br>";
   chatArea.chatText.scroll = chatArea.chatText.maxscroll;
}
function switchSize(sSize)
{
   tempTransferChatText = chatArea.chatText.htmlText;
   chatArea.gotoAndPlay(sSize);
}
function doneSwitchingSizes()
{
   chatArea.chatText.htmlText = tempTransferChatText;
   chatArea.chatText.scroll = chatArea.chatText.maxscroll;
   updateUserListing();
}
function chat_onSystemMessage(s)
{
   chat("<b><font color=\'#FF0000\'>System Message:</b> " + s + "</font>");
}
function chat_onUpdateMember(id, data)
{
   updateUserListing();
}
function informToRegister()
{
   chat("<font color=\'#0000FF\'>" + gameAlertText.reg + "</font>");
}
function submitChatString()
{
   if(chatArea.mess == undefined || chatArea.mess == "" || chatArea.mess == " ")
   {
      return undefined;
   }
   if(_root.gsiUserData.user_active == -999)
   {
      informToRegister();
      chatArea.mess = "";
      return undefined;
   }
   if(_root.gsiUserData.user_active != 1)
   {
      chat("<font color=\'#0000FF\'>Check your e-mail from Gaia Online and complete your registration to enable chatting in Gaia games.</font>");
      return undefined;
   }
   var _loc2_ = chatArea.mess;
   var _loc3_ = 0;
   var _loc4_;
   while(_loc3_ < _loc2_.length)
   {
      _loc4_ = _loc2_.charAt(_loc3_);
      if(_loc4_ == "<")
      {
         _loc2_ = _loc2_.substring(0,_loc3_) + "&lt;" + _loc2_.substring(_loc3_ + 1);
      }
      if(_loc4_ == ">")
      {
         _loc2_ = _loc2_.substring(0,_loc3_) + "&gt;" + _loc2_.substring(_loc3_ + 1);
      }
      _loc3_ = _loc3_ + 1;
   }
   if(_loc2_ == "/verinfo" || _loc2_ == "/vinfo")
   {
      chat("<i> " + _root.sGameNameString + " " + _root.sGameVersionNumber + " </i>");
      chat("<i> GSECS " + _root.sGSECSVersion + "</i>");
      chatArea.mess = "";
      return undefined;
   }
   if(_loc2_ == "/sid" || _loc2_ == "/sidinfo")
   {
      chat("<i> " + _root.gsiUserData.gaiaSID + "</i>");
      chatArea.mess = "";
      return undefined;
   }
   _loc3_ = _loc2_.indexOf("/setcolor");
   if(_loc3_ != -1)
   {
      setColor(_loc2_.substring(_loc3_ + 10));
      chatArea.mess = "";
      return undefined;
   }
   _loc2_ = applyStyle(_loc2_);
   _loc2_ = applyMyColor(_loc2_);
   var _loc5_ = qadca.Qadca.e0(sushi.me.id,_loc2_);
   sushi.room.chat(sushi.me.room,_loc5_);
   chatArea.mess = "";
   Selection.setFocus("chatArea.mess");
}
function applyStyle(s)
{
   var _loc2_ = s.indexOf("[");
   if(_loc2_ == -1)
   {
      return s;
   }
   s = strReplace(s,"[i]","<i>");
   s = strReplace(s,"[/i]","</i>");
   s = strReplace(s,"[b]","<b>");
   s = strReplace(s,"[/b]","</b>");
   _loc2_ = 0;
   while(_loc2_ != -1)
   {
      _loc2_ = s.indexOf("[color=");
      if(_loc2_ != -1)
      {
         s = s.substring(0,_loc2_) + "<font color=\'#" + s.substring(_loc2_ + 7);
         s = s.substring(0,_loc2_ + 20) + "\'>" + s.substring(_loc2_ + 21);
      }
   }
   s = strReplace(s,"[/color]","</font>");
   s = strReplace(s,"[rose]","&nbsp;<b><font color=\'#055511\'>--\'--,--</font><font color=\'#FF0000\'>@</font></b>&nbsp;");
   s = strReplace(s,"[rainbow]","&nbsp;<b><font color=\'#FF0000\'>#</font><font color=\'#FFFF00\'>#</font><font color=\'#00FF00\'>#</font><font color=\'#00FFFF\'>#</font><font color=\'#0000FF\'>#</font><font color=\'#FF00FF\'>#</font></b>&nbsp;");
   s = strReplace(s,"[grunny]","&nbsp;<b><font color=\'#00AA22\'>^ </b></font><font color=\'#FF0000\'>o</font><font color=\'#999999\'>,</font><font color=\'#00DD33\'>_</font><font color=\'#999999\'>,</font><font color=\'#FF0000\'>o</font><b><font color=\'#00AA22\'> ^</font></b>&nbsp;");
   s = strReplace(s,"[kiki]","&nbsp;<font color=\'#AAAADD\'>=</font><font color=\'#0000FF\'>o</font><font color=\'#FF6666\'>.</font><font color=\'#0000FF\'>o</font><font color=\'#AAAADD\'>=</font>&nbsp;");
   s = strReplace(s,"[koko]","&nbsp;<font color=\'#111111\'>=</font><font color=\'#FF6600\'>o</font><font color=\'#FF6666\'>.</font><font color=\'#FF6600\'>o</font><font color=\'#111111\'>=</font>&nbsp;");
   s = strReplace(s,"[kiss]","&nbsp;<font color=\'#554444\'>></font><font color=\'#FF0000\'>3</font><font color=\'#554444\'><</font>&nbsp;");
   s = strReplace(s,"[heart]","&nbsp;<font color=\'#FF0000\'><3</font>&nbsp;");
   s += "</font></i></b>";
   return s;
}
function applyMyColor(s)
{
   s = "<font color=\'#" + myTextColor + "\'>" + s + "</font>";
   return s;
}
function isHexString(s)
{
   var _loc2_ = 0;
   var _loc1_;
   while(_loc2_ < s.length)
   {
      _loc1_ = s.charAt(_loc2_);
      if(!(_loc1_ == "0" || _loc1_ == "1" || _loc1_ == "2" || _loc1_ == "3" || _loc1_ == "4" || _loc1_ == "5" || _loc1_ == "6" || _loc1_ == "7" || _loc1_ == "8" || _loc1_ == "9" || _loc1_ == "A" || _loc1_ == "B" || _loc1_ == "C" || _loc1_ == "D" || _loc1_ == "E" || _loc1_ == "F"))
      {
         return false;
      }
      _loc2_ = _loc2_ + 1;
   }
   return true;
}
function strReplace(s, sReplaceThis, sWithThis)
{
   var _loc1_ = 0;
   while(_loc1_ != -1)
   {
      _loc1_ = s.indexOf(sReplaceThis);
      if(_loc1_ != -1)
      {
         s = s.substring(0,_loc1_) + sWithThis + s.substring(_loc1_ + sReplaceThis.length);
      }
   }
   return s;
}
function updateUserListing()
{
   _root.chatArea.userList_lt.removeAll();
   var _loc5_ = sushi.room.getMemberNames(sushi.me.room);
   var _loc6_ = sushi.room.getMemberIDs(sushi.me.room);
   var _loc2_ = 0;
   var _loc3_;
   var _loc4_;
   while(_loc2_ < _loc5_.length)
   {
      _loc3_ = sushi.member.getData(_loc6_[_loc2_]);
      _loc4_ = _loc3_[DATA_PLAYER_NUMBER];
      chatArea.userList_lt.addItem("P" + _loc4_ + ": " + _loc5_[_loc2_]);
      _loc2_ = _loc2_ + 1;
   }
}
function chat_onMemberChangesRoom(id, newRoomID, oldRoomID, data)
{
   if(newRoomID == sushi.me.room)
   {
      chat("<i>" + sushi.member.getName(id) + " enters the chat.</i>");
      saveChatRecord(sushi.member.getName(id) + " enters the chat.");
      updateUserListing();
   }
   else if(oldRoomID == sushi.me.room)
   {
      chat("<i>" + sushi.member.getName(id) + " leaves the chat.</i>");
      saveChatRecord(sushi.member.getName(id) + " leaves the chat.");
      updateUserListing();
   }
}
function chat_onRemoveMember(id, teamID, roomID)
{
   if(roomID == sushi.me.room)
   {
      chat("<i>" + sushi.member.getName(id) + " leaves the chat.</i>");
      updateUserListing();
   }
}
function ignoreUser(id, avName)
{
   aIgnoreList.push(id);
   chat("<i>Now ignoring " + avName + ".</i>");
   saveChatRecord("Now ignoring " + avName);
}
function stopIgnoring(id, avName)
{
   chat("<i>No longer ignoring " + avName + ".</i>");
   saveChatRecord("No longer ignoring " + avName);
   var _loc1_ = 0;
   var _loc2_ = new Array();
   while(aIgnoreList[_loc1_++])
   {
      if(aIgnoreList[_loc1_] == id)
      {
         _loc2_[_loc1_] = aIgnoreList[_loc1_];
      }
   }
   aIgnoreList = _loc2_;
}
function saveChatRecord(txt)
{
   var _loc1_ = iChatCounter++ % SAVED_RECORDS;
   txt = removeHTML(txt);
   aChatRecord[_loc1_] = new Array();
   aChatRecord[_loc1_][0] = iChatCounter;
   aChatRecord[_loc1_][1] = txt;
}
function removeHTML(s)
{
   i = 0;
   while(i != -1)
   {
      i = s.indexOf("<font color=\'#");
      if(i != -1)
      {
         s = s.substring(0,i) + s.substring(i + 22);
      }
   }
   s = strReplace(s,"</font>","");
   s = strReplace(s,"<b>","");
   s = strReplace(s,"</b>","");
   s = strReplace(s,"<i>","");
   s = strReplace(s,"</i>","");
   return s;
}
function getChatRecord()
{
   var _loc4_ = 0;
   var _loc5_ = -1;
   var _loc1_ = 0;
   while(_loc1_ < SAVED_RECORDS)
   {
      if(aChatRecord[_loc1_][0] > _loc4_)
      {
         _loc4_ = aChatRecord[_loc1_][0];
         _loc5_ = _loc1_;
      }
      _loc1_ = _loc1_ + 1;
   }
   sReturn = "Chat History (" + SAVED_RECORDS + "):";
   _loc1_ = 0;
   var _loc3_;
   var _loc2_;
   while(_loc1_ < SAVED_RECORDS)
   {
      _loc3_ = (_loc5_ = _loc5_ + 1) % SAVED_RECORDS;
      _loc2_ = aChatRecord[_loc3_][1];
      if(_loc2_ != undefined)
      {
         sReturn += "\n" + _loc2_;
      }
      _loc1_ = _loc1_ + 1;
   }
   return sReturn;
}
function setColor(s)
{
   if(isHexString(s))
   {
      myTextColor = s;
   }
   else
   {
      s = s.toLowerCase();
      switch(s)
      {
         case "aqua":
            myTextColor = "00FFFF";
            return;
         case "aquamarine":
            myTextColor = "7FFFD4";
            return;
         case "black":
            myTextColor = "000000";
            return;
         case "blue":
            myTextColor = "0000FF";
            return;
         case "blue violet":
            myTextColor = "8A2BE2";
            return;
         case "brown":
            myTextColor = "A52A2A";
            return;
         case "burlywood":
            myTextColor = "DEB887";
            return;
         case "cadet blue":
            myTextColor = "5F9EA0";
            return;
         case "chartreuse":
            myTextColor = "7FFF00";
            return;
         case "chocolate":
            myTextColor = "D2691E";
            return;
         case "coral":
            myTextColor = "FF7F50";
            return;
         case "cornflower blue":
            myTextColor = "6495ED";
            return;
         case "crimson":
            myTextColor = "DC143C";
            return;
         case "cyan":
            myTextColor = "00FFFF";
            return;
         case "dark blue":
            myTextColor = "00008B";
            return;
         case "dark cyan":
            myTextColor = "008B8B";
            return;
         case "dark goldenrod":
            myTextColor = "B8860B";
            return;
         case "dark gray":
         case "dark grey":
            myTextColor = "A9A9A9";
            return;
         case "dark green":
            myTextColor = "006400";
            return;
         case "dark khaki":
            myTextColor = "BDB76B";
            return;
         case "dark magenta":
            myTextColor = "8B008B";
            return;
         case "dark olive green":
            myTextColor = "556B2F";
            return;
         case "dark orange":
            myTextColor = "FF8C00";
            return;
         case "dark orchid":
            myTextColor = "9932CC";
            return;
         case "dark red":
            myTextColor = "8B0000";
            return;
         case "dark salmon":
            myTextColor = "E9967A";
            return;
         case "dark seagreen":
            myTextColor = "8DBC8F";
            return;
         case "dark slate blue":
            myTextColor = "483D8B";
            return;
         case "dark slate gray":
            myTextColor = "2F4F4F";
            return;
         case "dark turquoise":
            myTextColor = "00DED1";
            return;
         case "dark violet":
         case "dark purple":
            myTextColor = "9400D3";
            return;
         case "deep pink":
            myTextColor = "FF1493";
            return;
         case "deep sky blue":
            myTextColor = "00BFFF";
            return;
         case "dim gray":
            myTextColor = "696969";
            return;
         case "firebrick":
            myTextColor = "B22222";
            return;
         case "forest green":
            myTextColor = "228B22";
            return;
         case "fuchsia":
            myTextColor = "FF00FF";
            return;
         case "gainsboro":
            myTextColor = "DCDCDC";
            return;
         case "gold":
            myTextColor = "FFD700";
            return;
         case "goldenrod":
            myTextColor = "DAA520";
            return;
         case "gray":
         case "grey":
            myTextColor = "808080";
            return;
         case "green":
            myTextColor = "008000";
            return;
         case "green yellow":
            myTextColor = "ADFF2F";
            return;
         case "hot pink":
            myTextColor = "FF69B4";
            return;
         case "indian red":
            myTextColor = "CD5C5C";
            return;
         case "indigo":
            myTextColor = "4B0082";
            return;
         case "khaki":
            myTextColor = "F0E68C";
            return;
         case "lavender":
            myTextColor = "E6E6FA";
            return;
         case "lawngreen":
            myTextColor = "7CFC00";
            return;
         case "light blue":
            myTextColor = "ADD8E6";
            return;
         case "light coral":
            myTextColor = "F08080";
            return;
         case "light green":
            myTextColor = "90EE90";
            return;
         case "light grey":
            myTextColor = "D3D3D3";
            return;
         case "light pink":
            myTextColor = "FFB6C1";
            return;
         case "light salmon":
            myTextColor = "FFA07A";
            return;
         case "light seagreen":
            myTextColor = "20B2AA";
            return;
         case "light sky blue":
            myTextColor = "87CEFA";
            return;
         case "light slate gray":
            myTextColor = "778899";
            return;
         case "light steel blue":
            myTextColor = "B0C4DE";
            return;
         case "lime":
            myTextColor = "00FF00";
            return;
         case "lime green":
            myTextColor = "32CD32";
            return;
         case "magenta":
            myTextColor = "FF00FF";
            return;
         case "maroon":
            myTextColor = "800000";
            return;
         case "medium aquamarine":
            myTextColor = "66CDAA";
            return;
         case "medium blue":
            myTextColor = "0000CD";
            return;
         case "medium orchid":
            myTextColor = "BA55D3";
            return;
         case "medium purple":
            myTextColor = "9370DB";
            return;
         case "medium sea green":
            myTextColor = "3CB371";
            return;
         case "medium slate blue":
            myTextColor = "7B68EE";
            return;
         case "medium spring green":
            myTextColor = "00FA9A";
            return;
         case "medium turquoise":
            myTextColor = "48D1CC";
            return;
         case "medium violet red":
            myTextColor = "C71585";
            return;
         case "midnight blue":
            myTextColor = "191970";
            return;
         case "moccasin":
            myTextColor = "FFE4B5";
            return;
         case "navy":
            myTextColor = "000080";
            return;
         case "olive":
            myTextColor = "808000";
            return;
         case "olive drab":
            myTextColor = "6B8E23";
            return;
         case "orange":
            myTextColor = "FFA500";
            return;
         case "orange red":
            myTextColor = "FF4500";
            return;
         case "orchid":
            myTextColor = "DA70D6";
            return;
         case "pale goldenrod":
            myTextColor = "EEE8AA";
            return;
         case "pale green":
            myTextColor = "98FB98";
            return;
         case "pale turquoise":
            myTextColor = "AFEEEE";
            return;
         case "pale violet red":
            myTextColor = "DB7093";
            return;
         case "peach puff":
         case "peach":
            myTextColor = "FFDAB9";
            return;
         case "peru":
            myTextColor = "CD853F";
            return;
         case "pink":
            myTextColor = "FFC8CB";
            return;
         case "plum":
            myTextColor = "DDA0DD";
            return;
         case "powder blue":
            myTextColor = "B0E0E6";
            return;
         case "purple":
            myTextColor = "800080";
            return;
         case "red":
            myTextColor = "FF0000";
            return;
         case "rosy brown":
            myTextColor = "BC8F8F";
            return;
         case "royal blue":
            myTextColor = "4169E1";
            return;
         case "saddle brown":
            myTextColor = "8B4513";
            return;
         case "salmon":
            myTextColor = "FA8072";
            return;
         case "sandy brown":
            myTextColor = "F4A460";
            return;
         case "sea green":
            myTextColor = "2E8B57";
            return;
         case "sea shell":
            myTextColor = "FFF5EE";
            return;
         case "sienna":
            myTextColor = "A0522D";
            return;
         case "silver":
            myTextColor = "C0C0C0";
            return;
         case "sky blue":
            myTextColor = "87CEEB";
            return;
         case "slate blue":
            myTextColor = "6A5ACD";
            return;
         case "spring green":
            myTextColor = "00FF7F";
            return;
         case "steelblue":
         case "steel blue":
            myTextColor = "4682B4";
            return;
         case "tan":
            myTextColor = "D2B48C";
            return;
         case "teal":
            myTextColor = "008080";
            return;
         case "thistle":
            myTextColor = "D8BFD8";
            return;
         case "tomato":
            myTextColor = "FF6347";
            return;
         case "turquoise":
            myTextColor = "40E0D0";
            return;
         case "violet":
            myTextColor = "EE82EE";
            return;
         case "wheat":
            myTextColor = "F5DEB3";
            return;
         case "yellow":
            myTextColor = "FFFF00";
            return;
         case "yellow green":
            myTextColor = "9ACD32";
            return;
         case "dri":
            myTextColor = "009900";
            return;
         case "coco":
            myTextColor = "FF6600";
            return;
         case "duck":
            myTextColor = "108812";
            return;
         case "rockpuppy":
            myTextColor = "999999";
            return;
         case "ian":
            myTextColor = "996633";
            return;
         case "vanessa":
            myTextColor = "FFCC33";
            return;
         case "moira":
            myTextColor = "9933CC";
            return;
         case "azure":
            myTextColor = "0080FF";
            return;
         case "blood red":
            myTextColor = "BE1111";
            return;
         case "baby blue":
            myTextColor = "B0EDFC";
            return;
         case "fuschia":
            myTextColor = "F10B9F";
            return;
         case "hot pink":
            myTextColor = "E91684";
            return;
         case "cobalt":
         case "cobalt blue":
            myTextColor = "1E03A2";
            return;
         case "coral":
            myTextColor = "EC7C7C";
            return;
         case "periwinkle":
            myTextColor = "AFAFFF";
            return;
         case "hunter green":
            myTextColor = "224422";
            return;
         default:
            chat("<b><font color=\'#000000\'>\'" + s + "\' is not a valid color. <font color=\'#FF0000\'><u><A HREF=\'http://www.gaiaonline.com/forum/viewtopic.php?t=12536937\' TARGET=\'_blank\'>Open color guide</font></u>.</b>");
            return;
      }
   }
}
loganText = new Array();
loganText[0] = "Ey Bub, ya like fishing eh? Spare the rod spoil the fish, right? <br>When yer all done, don\'t forget to visit the <U><A HREF=\'" + gameExchangeURL + "\' TARGET=\'_blank\'>exchange desk</A></U> at my <U><A HREF=\'http://www.gaiaonline.com/gaia/shopping.php?key=alpltfbdnxgowsfn\' TARGET=\'_blank\'>shop</A></U> to see what I kin offer ya for ya catch.";
loganText[1] = "Ey, you again. You must really like this lake, eh? Ey, but didcha know that there are two other lakes to fish in? You can find them on the <U><A HREF=\'http://www.gaiaonline.com/gaia/map.php?\' TARGET=\'_blank\'>world map</A></U>.";
loganText[2] = "So, ya think you know a think or two about fishing, eh?<br><br>Well, ya might wanna <U><A HREF=\'http://www.gaiaonline.com/forum/viewforum.php?f=124\' TARGET=\'_blank\'>join the fishing discussion</A></U> when the they stop bite\'n. Ya just might learn some new tricks there.";
loganTextRandom = new Array();
loganTextRandom[0] = "Ey, are you looking at my rod?<br><br>Well, are ya?";
loganTextRandom[1] = "Ey, fishing is addicting eh? Try not to get hooked.";
loganTextRandom[2] = "In th\' mornin\' I always grab my wooden rod!";
loganTextRandom[3] = "Ey, once I caught a fish as big as Leon... Well, maybe not THAT big.";
loganTextRandom[4] = "I dated a mermaid once. I took her out to sushi, but she never called me back.";
loganTextRandom[5] = "G-Team assemble! <br><br>Eh, never mind.";
loganTextRandom[6] = "I\'m the best there is at what I do, and what I do is...<br><br><b>FISHING!!!</b>";
loganTextRandom[7] = "Some bastard keeps throwing cans into the lakes! When I catch \'em I promise I won\'t be throwing \'em back.";
loganTextRandom[8] = "I got this silver platter I bring out and fill with grubbin\' sushi at parties. However, I\'ve never washed it. Let me tell ya, my sushi server STINKS!";
loganTextRandom[9] = "Never bite a fish before its been scaled.";
loganTextRandom[10] = "Have you ever done the fish dance? You put your left foot forward, then your right foot back, then you drop 3 guppies down ya waiters.";
loganTextRandom[11] = "Don\'t like the smell? Get off the pier.";
loganTextRandom[12] = "Fish ain\'t stupid. Seen em swim for the middle of th\' lake when th\' fishers come out. I think they learn that in... school. What? Ya never heard of a school o\' fish?!";
loganTextRandom[13] = "Ya ever wonder if there are other lakes out there?";
loganTextRandom[14] = "Remember dat better bait used at th\' right time kin up yer chances of gettin\' rare fish. Trust me. I\'m the master baiter.";
loganTextRandom[15] = "Drunken sailors always be swearing n brag\'n \'bout enormous ocean catches! Ha! I tell ya - I really dinna like the taste of dem salty sea men.";
loganTextNoBait = "Ey, looks like ya ran outta bait, eh? No problem, ya can always get more at <U><A HREF=\'" + gameExchangeURL + "\' TARGET=\'_blank\'>my shop</A></U>. <U><A HREF=\'" + gameExchangeURL + "\' TARGET=\'_blank\'>Click here to go to Logan\'s shop</A></U>.<br><br>Buy some bait, then click OK, OK?";
var loganTextCounter = 0;
user = new Object();
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
var aIgnoreList = new Array();
var keyListener = new Object();
var bwf;
var SAVED_RECORDS = 50;
var aChatRecord = new Array();
var iChatCounter = 0;
var myTextColor = "000000";
keyListener.onKeyDown = function()
{
   var _loc0_;
   if((_loc0_ = Key.getCode()) === 13)
   {
      submitChatString();
   }
   if(!gsecs.bTextEntryOnScreen)
   {
      if(Selection.getFocus() != "_level0.chatArea.chatInput")
      {
         if(_root.chatArea.enabled)
         {
            Selection.setFocus("_root.chatArea.mess");
         }
      }
   }
};
chatInit();
var sceneSWF = whichLake + "_scene.swf";
var overviewMapSWF = whichLake + "_overview.swf";
var pierSWF = whichLake + "_pier.swf";
var fishSWF = whichLake + "_fish4.20.swf";
_root.attachMovie("loadingBar","loadingBar",420);
_root.loadingBar._x = 182;
_root.loadingBar._y = 521;
_root.loadingBar.mask._width = 0;
_root.createEmptyMovieClip("avatarScreen",301);
_root.createEmptyMovieClip("mapOverview",300);
var my_mcl = new MovieClipLoader();
var myListener = new Object();
myListener.onLoadComplete = function(target_mc)
{
   _root.loadingBar.mask._width = 270.3;
   loadGetData(true);
};
my_mcl.addListener(myListener);
var my_mcl2 = new MovieClipLoader();
var myListener = new Object();
myListener.onLoadComplete = function(target_mc)
{
   _root.mapOverview._x = -1;
   _root.mapOverview._y = 199;
   _root.mapOverview.map.coast.enabled = false;
   _root.loadingBar.mask._width = 202.7;
   my_mcl.loadClip(sceneSWF,_root.view);
};
my_mcl2.addListener(myListener);
var my_mcl3 = new MovieClipLoader();
var myListener = new Object();
myListener.onLoadComplete = function(target_mc)
{
   _root.avatarScreen._y = 25;
   _root.attachMovie("avatarGroup","avatarGroup",303);
   _root.avatarGroup._x = -82;
   _root.avatarGroup._y = 22;
   _root.loadingBar.mask._width = 202.7;
   my_mcl2.loadClip(overviewMapSWF,_root.mapOverview);
};
my_mcl3.addListener(myListener);
var my_mcl4 = new MovieClipLoader();
var myListener = new Object();
myListener.onLoadComplete = function(target_mc)
{
   _root.gotoneAlert.fishIcon._xscale = 200;
   _root.gotoneAlert.fishIcon._yscale = 200;
   var t = 1;
   while(t <= 18)
   {
      var invSlot = eval("_root.inventory.fish" + t);
      invSlot.loadMovie(fishSWF);
      t++;
   }
   var sChatSWFLink = _global.codebase + "../sharedsource/game_chat/game_chat.swf";
   _root.createEmptyMovieClip("chatArea",305);
   _root.chatArea.loadMovie(sChatSWFLink);
   _root.chatArea._y = 480;
   _root.loadingBar.mask._width = 67.6;
   my_mcl3.loadClip(pierSWF,_root.avatarScreen);
};
my_mcl4.addListener(myListener);
my_mcl4.loadClip(fishSWF,_root.gotoneAlert.fishIcon);
stop();
