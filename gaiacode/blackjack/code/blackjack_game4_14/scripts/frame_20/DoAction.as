function loadChatSWF()
{
   _root.createEmptyMovieClip("chatArea",250);
   _root.chatArea.loadMovie("../sharedsource/game_chat/game_chat.swf");
   _root.chatArea._y = 480;
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
function tellSushiAboutMyAvatar()
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   var _loc2_ = sushi.me.data;
   _loc2_[DATA_AVATAR_URL] = gsiUserData.avatar;
   sushi.me.update(_loc2_);
}
function updateAvatars()
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   var _loc4_ = sushi.room.getMemberIDs(sushi.me.room);
   var _loc2_ = 0;
   var _loc5_;
   var _loc6_;
   while(_loc2_ < _loc4_.length)
   {
      if(_loc4_[_loc2_] != sushi.me.id)
      {
         var data = sushi.member.getData(_loc4_[_loc2_]);
         _loc5_ = parseInt(data[DATA_PLAYER_NUMBER]);
         _loc6_ = _loc5_ - 1;
         placePlayer[_loc6_] = _loc4_[_loc2_];
         addAvatar(_loc6_,data[DATA_AVATAR_URL],_loc4_[_loc2_],false);
      }
      _loc2_ = _loc2_ + 1;
   }
   var _loc3_ = 0;
   while(_loc3_ < placePlayer.length)
   {
      if(placePlayer[_loc3_] == 0)
      {
         placePlayer[_loc3_] = sushi.me.id;
         _loc5_ = _loc3_ + 1;
         var data = sushi.me.data;
         data[DATA_PLAYER_NUMBER] = _loc5_;
         _root.myPlayerNumber = _loc5_;
         addAvatar(_loc3_,gsiUserData.avatar,sushi.me.id,true);
         sushi.me.update(data);
         break;
      }
      _loc3_ = _loc3_ + 1;
   }
}
function addAvatar(iSlot, avatarURL, id, bIsItMe)
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   var pNumber = iSlot + 1;
   var currentPlacement = 50 - pNumber;
   if(bIsItMe)
   {
      _root.avatarGroup.attachMovie("avatar","avatarp1",currentPlacement);
      var mAvatar = _root.avatarGroup.avatarp1;
   }
   else
   {
      _root.avatarGroup.attachMovie("avatar","avatar" + id,currentPlacement);
      var mAvatar = eval("_root.avatarGroup.avatar" + id);
      if(_root.sGameNameString == "blackjack" or _root.sGameNameString == "jigsaw")
      {
         var sAvatarReporter_SWF_LOC = codebase + "../sharedsource/gameSushiUtils/avatar_reporting_low.swf";
      }
      else
      {
         var sAvatarReporter_SWF_LOC = codebase + "../sharedsource/gameSushiUtils/avatar_reporting.swf";
      }
      mAvatar.createEmptyMovieClip("mReporter",99);
      mAvatar.mReporter.loadMovie(sAvatarReporter_SWF_LOC);
   }
   mAvatar.avImage.loadMovie(avatarURL);
   mAvatar.pMarker.gotoAndStop(pNumber);
   mAvatar._x = 100 * pNumber;
   game_addAvatar(mAvatar,id,pNumber,bIsItMe);
   mAvatar.id = id;
   mAvatar.avatarName = sushi.member.getName(id);
}
function avatar_onUpdateMember(id, data)
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   if(data[DATA_AVATAR_URL] != 0)
   {
      var whichAvatar = eval("_root.avatarGroup.avatar" + id);
      if(whichAvatar == null)
      {
         n = 0;
         while(n < placePlayer.length)
         {
            if(placePlayer[n] == 0)
            {
               placePlayer[n] = id;
               addAvatar(n,data[DATA_AVATAR_URL],id,false);
               break;
            }
            n++;
         }
      }
   }
}
function avatar_onRemoveMember(id, teamID, roomID)
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   if(roomID == sushi.me.room)
   {
      var slotNumber;
      n = 0;
      while(n < placePlayer.length)
      {
         if(placePlayer[n] == id)
         {
            slotNumber = n + 1;
            placePlayer[n] = 0;
            break;
         }
         n++;
      }
      var whichAvatar = eval("_root.avatarGroup.avatar" + id);
      whichAvatar.removeMovieClip();
      var whichMiniStation = eval("_root.miniStation" + slotNumber);
      whichMiniStation.cleanUp();
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
function cb_onDisconnect()
{
   _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"Oh no! You just lost your connection to the game server. Stupid game server.",popPanelType:"quit"});
}
function sessionAlive()
{
   gsiMethod.invoke("107",[gsiUserData.gaiaSID],sessionKeepAlive);
}
function sessionKeepAlive(noError, userData)
{
   if(noError == false)
   {
      if(userData[0] == -3 || userData[0] == "-3")
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:userData[1],popPanelType:"quit"});
         _root.sushi.disconnectFomServer();
         _root.onEnterFrame = function()
         {
         };
      }
      else if(++numFails >= maxFails)
      {
         _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:"Cannot connect to keep your session alive. \n\nPlease try again at a later time.",popPanelType:"quit"});
      }
   }
   else
   {
      _root.KEEPALIVE_CALLBACK_COUNTER = _root.KEEPALIVE_CALLBACK_COUNTER + 1;
      numFails = 0;
   }
}
function game_onUpdateMember(id, data)
{
   var mc_miniHandP = eval("mc_minihand" + data[DATA_AVATAR_SLOT] + "p");
   var mc_miniHandD = eval("mc_minihand" + data[DATA_AVATAR_SLOT] + "d");
   mc_miniHandP.aCards = data[DATA_PLAYER_HAND].split("_");
   mc_miniHandP.update();
   mc_miniHandD.aCards = data[DATA_DEALER_HAND].split("_");
   mc_miniHandD.update();
   mc_miniHandD.mcDlrIcon.gotoAndStop(data[DATA_DEALER_TYPE]);
   if(data[DATA_BUBBLE_TYPE].length > 0)
   {
      var whichAvatar = eval("_root.avatarGroup.avatar" + id);
      whichAvatar.wordBubble.gotoAndPlay(data[DATA_BUBBLE_TYPE]);
   }
}
function game_onRemoveMember(id)
{
   var _loc2_;
   n = 0;
   while(n < placePlayer.length)
   {
      if(placePlayer[n] == id)
      {
         _loc2_ = n + 1;
         break;
      }
      n++;
   }
}
function sushiPluginKeepAlive()
{
}
function updateSushiWithMyGameData()
{
   var _loc2_ = sushi.me.data;
   if(_root.g_bCashedOut)
   {
      _loc2_[DATA_PLAYER_HAND] = "0_0";
      _loc2_[DATA_DEALER_HAND] = "0_0";
      _loc2_[DATA_DEALER_TYPE] = "n";
   }
   else
   {
      _loc2_[DATA_PLAYER_HAND] = getHandString(_root.gameDataObject.playerCardsArray);
      _loc2_[DATA_DEALER_HAND] = getHandString(_root.gameDataObject.dealerCardsArray);
      aTemp = ["a","j","b"];
      _loc2_[DATA_DEALER_TYPE] = aTemp[g_oDealer.iDealer];
   }
   _loc2_[DATA_BUBBLE_TYPE] = "";
   sushi.me.update(_loc2_);
}
function broadcastBubble(s)
{
   var _loc2_ = sushi.me.data;
   _loc2_[DATA_BUBBLE_TYPE] = s;
   sushi.me.update(_loc2_);
   _root.avatarGroup.avatarp1.wordBubble.gotoAndPlay(s);
}
function game_addAvatar(mAvatar, id, pNumber, bIsItMe)
{
   var _loc1_ = Math.abs(pNumber * 2 - 7) - 5;
   mAvatar._y += _loc1_ * 2;
   mAvatar._y += 2;
}
function playSound(whichFile, loop)
{
   if(SOUND_STATE == true)
   {
      soundFile = eval("oSounds." + whichFile);
      if(loop == "bg")
      {
         soundFile.start(0,999);
      }
      else
      {
         soundFile.start();
      }
   }
}
function soundControl(state)
{
   SOUND_STATE = state;
   if(SOUND_STATE == true)
   {
      if(BGSOUND_STATE == true)
      {
         oSounds.bgMusic.setVolume(30);
      }
   }
   else
   {
      oSounds.bgMusic.setVolume(0);
   }
}
function bgsoundControl(state)
{
   BGSOUND_STATE = state;
   if(BGSOUND_STATE == true)
   {
      oSounds.bgMusic.setVolume(30);
   }
   else
   {
      oSounds.bgMusic.setVolume(0);
   }
}
function stopSound(whichFile)
{
   if(SOUND_STATE == true)
   {
      oSounds.soundFile.stop();
   }
}
loadChatSWF();
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
var placePlayer = new Array(0,0,0,0,0,0,0);
var myPlayerNumber = 0;
tellSushiAboutMyAvatar();
updateAvatars();
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
sushi.event.onDisconnect.setCallback(cb_onDisconnect);
var SESSION_COUNTER = 0;
var KEEPALIVE_CALLBACK_COUNTER = 0;
var PING_SERVER = 5000;
var numFails = 0;
var maxFails = 3;
_root.onEnterFrame = function()
{
   if(_root.playAsGuest)
   {
      return undefined;
   }
   SESSION_COUNTER++;
   if(SESSION_COUNTER % PING_SERVER == 0)
   {
      sessionAlive();
      sushiPluginKeepAlive();
   }
};
var DATA_AVATAR_SLOT = 1;
var DATA_PLAYER_HAND = 2;
var DATA_DEALER_HAND = 3;
var DATA_BUBBLE_TYPE = 4;
var DATA_DEALER_TYPE = 5;
SOUND_STATE = true;
BGSOUND_STATE = true;
oSounds = new Object();
oSounds.win = new Sound();
oSounds.win.attachSound("win");
oSounds.aww = new Sound();
oSounds.aww.attachSound("aww");
oSounds.money_pit = new Sound();
oSounds.money_pit.attachSound("money_pit");
oSounds.gong = new Sound();
oSounds.gong.attachSound("gong");
oSounds.error = new Sound();
oSounds.error.attachSound("error");
oSounds.coinSound = new Sound();
oSounds.coinSound.attachSound("coinSound");
oSounds.coinSound2 = new Sound();
oSounds.coinSound2.attachSound("coinSound2");
oSounds.coinSound3 = new Sound();
oSounds.coinSound3.attachSound("coinSound3");
_root.createEmptyMovieClip("bgMusic_mc",-10);
oSounds.bgMusic = new Sound(_root.bgMusic_mc);
oSounds.bgMusic.attachSound("bgMusic");
oSounds.bgMusic.setVolume(30);
oSounds.bgMusic.start(0,999);
stop();
blackGameRequestHandler("init");
startBlackJack();
