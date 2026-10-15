function init()
{
   var _loc2_ = this;
   _root.s_s = _loc2_;
   _loc2_.requestList = new Array();
   _loc2_.lastRequest = "";
   _loc2_.accountVarList = ["visitorID","vmk","charSet","visitorNamespace","cookieDomainPeriods","cookieLifetime","pageName","pageURL","referrer","currencyCode","purchaseID","variableProvider","channel","server","pageType","transactionID","campaign","state","zip","events","products"];
   var _loc1_ = 1;
   while(_loc1_ <= 50)
   {
      _loc2_.accountVarList.push("prop" + _loc1_);
      _loc2_.accountVarList.push("eVar" + _loc1_);
      _loc2_.accountVarList.push("hier" + _loc1_);
      _loc1_ = _loc1_ + 1;
   }
   _loc2_.accountConfigList = ["trackDownloadLinks","trackExternalLinks","trackClickMap","linkLeaveQueryString","trackingServer","trackingServerSecure","dc","movieID","autoTrack","delayTracking","trackLocal","debugTracking"];
   movie = _root;
}
function isSet(val)
{
   §§push(_loc1_);
   var _loc1_ = val;
   var _loc0_ = _loc1_ != undefined && _loc1_ != false && _loc1_ != "" && _loc1_ != 0;
   _loc1_ = §§pop();
   return _loc0_;
}
function isNumber(num)
{
   return parseInt(num) != NaN;
}
function makeRequest(cacheBusting, queryString)
{
   var _loc1_ = this;
   var _loc3_;
   var _loc2_;
   if(!_loc1_.isSet(_loc1_.trackingServer))
   {
      _loc2_ = _loc1_.visitorNamespace;
      var ci;
      if(!_loc1_.isSet(_loc2_))
      {
         _loc2_ = _loc1_.account;
         ci = _loc2_.indexOf(",");
         if(ci >= 0)
         {
            _loc2_ = _loc2_.substr(0,ci);
         }
         _loc2_ = _loc2_.split("_").join("-");
      }
      if(!_loc1_.isSet(_loc1_.dc))
      {
         _loc1_.dc = 112;
      }
      _loc1_.trackingServer = _loc2_ + "." + _loc1_.dc + ".2o7.net";
   }
   if(_loc1_.isSet(_loc1_.trackingServer) && !_loc1_.isSet(_loc1_.trackingServerSecure))
   {
      _loc1_.trackingServerSecure = _loc1_.trackingServer;
   }
   if(_loc1_.isSet(_loc1_.movie) && _loc1_.isSet(_loc1_.movie._url) && _loc1_.movie._url.toLowerCase().substr(0,6) == "https:")
   {
      _loc3_ = "https://" + _loc1_.trackingServerSecure;
   }
   else
   {
      _loc3_ = "http://" + _loc1_.trackingServer;
   }
   _loc3_ += "/b/ss/" + _loc1_.account + "/0/" + _loc1_.version + "/" + cacheBusting + "?[AQB]&ndh=1&" + queryString + "&[AEQ]";
   var versionInfo = getVersion().split(" ");
   var version = versionInfo[1].substr(0,1);
   if(_loc1_.isSet(_loc1_.trackLocal) || !_loc1_.isSet(version) || version < 8 || !_loc1_.isSet(_loc1_.movie) || !_loc1_.isSet(_loc1_.movie._url) || _loc1_.movie._url.toLowerCase().substr(0,4) == "http")
   {
      _loc1_.requestList.push(_loc3_);
      if(!_loc1_.isSet(_loc1_.delayTracking) || _loc1_.isSet(_loc1_.delayTrackingStage) && _loc1_.delayTrackingStage == 2)
      {
         _loc1_.flushRequestList();
      }
      else if(_loc1_.isSet(_loc1_.delayTracking) && !_loc1_.isSet(_loc1_.delayTrackingStage))
      {
         _loc1_.delayTrackingStage = 1;
         _loc1_.delayTrackingInterval = setInterval(_loc1_,"delayTrackingDone",_loc1_.delayTracking);
      }
   }
}
function flushRequestList()
{
   var _loc1_ = this;
   var send = new LoadVars();
   var recv = new LoadVars();
   var _loc3_;
   var _loc2_;
   while(_loc1_.requestNum < _loc1_.requestList.length)
   {
      if(_loc1_.isSet(_loc1_.debugTracking))
      {
         var debug = "ActionSource Debug: " + _loc1_.requestList[_loc1_.requestNum];
         _loc3_ = _loc1_.requestList[_loc1_.requestNum].split("&");
         _loc2_ = 0;
         while(_loc2_ < _loc3_.length)
         {
            debug += "\n\t" + unescape(_loc3_[_loc2_]);
            _loc2_ = _loc2_ + 1;
         }
         trace(debug);
      }
      send.sendAndLoad(_loc1_.requestList[_loc1_.requestNum],recv,"GET");
      _loc1_.lastRequest = _loc1_.requestList[_loc1_.requestNum];
      _loc1_.requestNum = _loc1_.requestNum + 1;
   }
}
function delayTrackingDone()
{
   var _loc1_ = this;
   clearInterval(_loc1_.delayTrackingInterval);
   _loc1_.delayTrackingStage = 2;
   _loc1_.flushRequestList();
}
function resetAccountVariables()
{
   var _loc1_ = this;
   var _loc2_;
   var _loc3_;
   _loc2_ = 0;
   while(_loc2_ < accountVarList.length)
   {
      _loc3_ = _loc1_.accountVarList[_loc2_];
      _loc1_[_loc3_] = undefined;
      if(_loc1_.isSet(_loc1_.wrapperObject))
      {
         _loc1_.wrapperObject[_loc3_] = undefined;
      }
      _loc2_ = _loc2_ + 1;
   }
}
function pushVars(wrapperObject)
{
   var _loc3_ = wrapperObject;
   var _loc1_;
   var _loc2_;
   if(s.isSet(_loc3_))
   {
      _loc1_ = 0;
      while(_loc1_ < s.accountVarList.length)
      {
         _loc2_ = s.accountVarList[_loc1_];
         s[_loc2_] = _loc3_[_loc2_];
         _loc1_ = _loc1_ + 1;
      }
      _loc1_ = 0;
      while(_loc1_ < s.accountconfigList.length)
      {
         _loc2_ = s.accountConfigList[_loc1_];
         s[_loc2_] = _loc3_[_loc2_];
         _loc1_ = _loc1_ + 1;
      }
   }
}
function queryStringAccountVariables()
{
   var _loc3_ = this;
   var queryString = "";
   var varNum;
   var _loc1_;
   var _loc2_;
   var varPrefix;
   var varSuffix;
   varNum = 0;
   while(varNum < accountVarList.length)
   {
      _loc1_ = _loc3_.accountVarList[varNum];
      _loc2_ = _loc3_[_loc1_];
      varPrefix = _loc1_.substr(0,4);
      varSuffix = _loc1_.substr(4);
      if(_loc3_.isSet(_loc2_))
      {
         switch(_loc1_)
         {
            case "visitorID":
               _loc1_ = "vid";
               break;
            case "pageURL":
               _loc1_ = "g";
               if(!_loc3_.isSet(_loc2_))
               {
                  _loc2_ = _root._url;
               }
               break;
            case "referrer":
               _loc1_ = "r";
               break;
            case "vmk":
               _loc1_ = "vmt";
               break;
            case "charSet":
               _loc1_ = "ce";
               break;
            case "visitorNamespace":
               _loc1_ = "ns";
               break;
            case "cookieDomainPeriods":
               _loc1_ = "cdp";
               break;
            case "cookieLifetime":
               _loc1_ = "cl";
               break;
            case "currencyCode":
               _loc1_ = "cc";
               break;
            case "channel":
               _loc1_ = "ch";
               break;
            case "transactionID":
               _loc1_ = "xact";
               break;
            case "campaign":
               _loc1_ = "v0";
               break;
            default:
               if(_loc3_.isNumber(varSuffix))
               {
                  if(varPrefix == "prop")
                  {
                     _loc1_ = "c" + varSuffix;
                  }
                  else if(varPrefix == "eVar")
                  {
                     _loc1_ = "v" + varSuffix;
                  }
                  else if(varPrefix == "hier")
                  {
                     _loc1_ = "h" + varSuffix;
                     _loc2_ = _loc2_.substr(0,255);
                  }
               }
         }
         if(_loc3_.isSet(_loc2_))
         {
            queryString += "&" + escape(_loc1_) + "=" + escape(_loc2_);
         }
      }
      varNum++;
   }
   return queryString;
}
function queryStringLinkTracking()
{
   var _loc1_ = this;
   var _loc2_ = "";
   var _loc3_;
   if(_loc1_.isSet(_loc1_.linkType) && (_loc1_.isSet(_loc1_.linkURL) || _loc1_.isSet(_loc1_.linkName)))
   {
      _loc1_.linkType = _loc1_.linkType.toLowerCase();
      if(_loc1_.linkType != "d" && _loc1_.linkType != "e")
      {
         _loc1_.linkType = "o";
      }
      if(_loc1_.isSet(_loc1_.linkURL) && !_loc1_.isSet(_loc1_.linkLeaveQueryString))
      {
         _loc3_ = _loc1_.linkURL.indexOf("?");
         if(_loc3_ >= 0)
         {
            _loc1_.linkURL = _loc1_.linkURL.substr(0,_loc3_);
         }
      }
      _loc2_ += "&pe=lnk_" + escape(_loc1_.linkType.toLowerCase());
      _loc2_ += !_loc1_.isSet(_loc1_.linkURL) ? "" : "&pev1=" + escape(_loc1_.linkURL);
      _loc2_ += !_loc1_.isSet(_loc1_.linkName) ? "" : "&pev2=" + escape(_loc1_.linkName);
   }
   return _loc2_;
}
function onMouseDown()
{
   var _loc1_ = this.getHitTarget(_root);
   if(_loc1_ != null)
   {
      sendClickMapEvent(_loc1_);
   }
}
function getHitTarget(tree, pref)
{
   var tcx = _root._xmouse;
   var tcy = _root._ymouse;
   var _loc1_;
   var _loc2_;
   var _loc3_;
   for(var name in tree)
   {
      _loc1_ = tree[name];
      if(_loc1_._parent == tree)
      {
         _loc2_ = false;
         var chx = _loc1_._x;
         _loc3_ = _loc1_._y;
         var chw = _loc1_._width;
         var chh = _loc1_._height;
         if(tcx > chx && tcx < chx + chw)
         {
            if(tcy > _loc3_ && tcy < _loc3_ + chh)
            {
               _loc2_ = true;
            }
         }
         if((typeof _loc1_ == "movieclip" || _loc1_ instanceof MovieClip) && _loc1_.hitTest(_root._xmouse,_root._ymouse,true))
         {
            var target = this.getHitTarget(_loc1_);
            if(target != null)
            {
               return target;
            }
            §§push(_loc1_);
         }
         if(_loc1_ instanceof Button && _loc1_.onPress != this.buttonHandler)
         {
            _loc1_.__ClickMapOldHandler = btn.onPress;
            _loc1_.onPress = this.buttonHandler;
         }
         else if(typeof _loc1_ == "object" && _loc2_ == true)
         {
            var target = this.getHitTarget(_loc1_);
            if(target != null)
            {
               return target;
            }
            §§push(_loc1_);
         }
      }
   }
   return null;
}
function buttonHandler()
{
   _root.s_s.sendClickMapEvent(this);
   this.__ClickMapOldHandler();
}
function sendClickMapEvent(id)
{
   var _loc1_ = this;
   _loc1_.objectID = id;
   tString = _loc1_.objectID + "";
   tLen = tString.length;
   var tmpExt = tString.substr(tLen - 4,4);
   if(tmpExt == ".frs" || tmpExt == ".fds")
   {
      _loc1_.objectID = tString.substr(0,tLen - 4);
   }
   var _loc3_;
   if(!_loc1_.isSet(_loc1_.movieID) && _loc1_.isSet(_loc1_.movie) && _loc1_.isSet(_loc1_.movie._url))
   {
      var si = _loc1_.movie._url.lastIndexOf("/");
      _loc3_ = _loc1_.movie._url.lastIndexOf(".");
      if(si >= 0)
      {
         si++;
      }
      else
      {
         si = 0;
      }
      if(_loc3_ >= 0)
      {
         _loc3_ -= si;
      }
      else
      {
         _loc3_ = _loc1_.movie._url.length;
      }
      _loc1_.movieID = _loc1_.movie._url.substr(si,_loc3_);
   }
   if(!_loc1_.isSet(_loc1_.movieID))
   {
      _loc1_.movieID = "movieID undefined";
   }
   _loc1_.objectID = (!_loc1_.isSet(_loc1_.movieID) ? "" : _loc1_.movieID) + ":" + _loc1_.objectID;
   var _loc2_;
   if(_loc1_.autoTrack)
   {
      var url = !_loc1_.isSet(_loc1_.movie) ? "" : _loc1_.movie._url;
      _loc2_ = url;
      var qi;
      qi = _loc2_.indexOf("?");
      if(qi >= 0)
      {
         _loc2_ = _loc2_.substr(0,qi);
      }
      if(_loc2_.length > 77)
      {
         _loc2_ = _loc2_.substr(-77);
      }
      trackLink(url,"o","ActionSource.AutoTrack:" + _loc2_);
   }
}
function indexMovie()
{
   var _loc1_ = this.buildIndex(_root);
   _loc1_ = Stage.width + "," + Stage.height + "|" + _loc1_;
   this.index = _loc1_;
   _root.s_s.index = _loc1_;
   return _loc1_;
}
function getGeom(clip)
{
   var _loc1_ = clip;
   var _loc3_ = _loc1_._parent.getBounds();
   var _loc2_ = {x:_loc1_._x,y:_loc1_._y};
   var pt2 = {x:_loc1_._x,y:_loc1_._y};
   _loc1_._x = _loc3_.xMin;
   _loc1_._y = _loc3_.yMin;
   var b2 = _loc1_._parent.getBounds();
   _loc1_._x = _loc3_.xMax;
   _loc1_._y = _loc3_.yMax;
   var b3 = _loc1_._parent.getBounds();
   _loc1_._x = _loc2_.x;
   _loc1_._y = _loc2_.y;
   _loc2_.x += b2.xMin - _loc3_.xMin;
   _loc2_.y += b2.yMin - _loc3_.yMin;
   pt2.x += b3.xMax - _loc3_.xMax;
   pt2.y += b3.yMax - _loc3_.yMax;
   _loc1_._parent.localToGlobal(_loc2_);
   _loc1_._parent.localToGlobal(pt2);
   var geom = {x:Math.round(_loc2_.x),y:Math.round(_loc2_.y),w:Math.ceil(pt2.x - _loc2_.x),h:Math.ceil(pt2.y - _loc2_.y)};
   return geom;
}
function buildIndex(node)
{
   var nodeId = eval(node) + ".";
   var str = "";
   for(var i in node)
   {
      var obj = node[i];
      if(obj != null && obj._name == i)
      {
         var id = eval(obj) + "";
         if(id == nodeId + i)
         {
            var g = getGeom(obj);
            str += eval(obj) + "," + g.x + "," + g.y + "," + g.w + "," + g.h + "|";
            str += this.buildIndex(obj);
         }
      }
   }
   return str;
}
function queryStringClickMap()
{
   var _loc1_ = this;
   var _loc2_ = "";
   var _loc3_ = _loc1_.pageName;
   var pageIDType = 1;
   var objectID = _loc1_.objectID;
   var objectIDType = 1;
   var objectType = "FLASH";
   if(!_loc1_.isSet(_loc3_))
   {
      _loc3_ = _loc1_.pageURL;
      pageIDType = 0;
   }
   if(_loc1_.isSet(_loc1_.trackClickMap) && _loc1_.isSet(_loc3_) && _loc1_.isSet(objectID) && _loc1_.isSet(objectType))
   {
      _loc2_ += "&pid=" + escape(_loc3_);
      _loc2_ += !_loc1_.isSet(pageIDType) ? "" : "&pidt=" + escape(pageIDType);
      _loc2_ += "&oid=" + escape(objectID.substr(0,100));
      _loc2_ += !_loc1_.isSet(objectIDType) ? "" : "&oidt=" + escape(objectIDType);
      _loc2_ += "&ot=" + escape(objectType);
   }
   return _loc2_;
}
function queryStringTechnology()
{
   var _loc1_ = this;
   var _loc2_ = "";
   if(_loc1_.isSet(System) && _loc1_.isSet(System.capabilities) && _loc1_.isSet(System.capabilities.screenResolutionX) && _loc1_.isSet(System.capabilities.screenResolutionY))
   {
      _loc2_ += "&s=" + System.capabilities.screenResolutionX + "x" + System.capabilities.screenResolutionY;
   }
   return _loc2_;
}
function track()
{
   var _loc1_ = this;
   var _loc2_ = new Date();
   var sed = Math.floor(Math.random() * 10000000000000);
   var cacheBusting = "s" + Math.floor(_loc2_.getTime() / 10800000) % 10 + sed;
   var time = "" + _loc2_.getDate() + "/" + _loc2_.getMonth() + "/" + _loc2_.getFullYear() + " " + _loc2_.getHours() + ":" + _loc2_.getMinutes() + ":" + _loc2_.getSeconds() + " " + _loc2_.getDay() + " " + _loc2_.getTimezoneOffset();
   var _loc3_ = "t=" + escape(time);
   _loc1_.pushVars(_loc1_.wrapperObject);
   if(_loc1_.isSet(_loc1_.account))
   {
      _loc3_ += queryStringAccountVariables();
      _loc3_ += queryStringLinkTracking();
      _loc3_ += queryStringClickMap();
      _loc3_ += queryStringTechnology();
      _loc1_.makeRequest(cacheBusting,_loc3_);
      _loc1_.linkURL = undefined;
      _loc1_.linkName = undefined;
      _loc1_.linkType = undefined;
      _loc1_.objectID = undefined;
   }
}
function trackLink(linkURL, linkType, linkName)
{
   var _loc1_ = this;
   _loc1_.linkURL = linkURL;
   _loc1_.linkType = linkType;
   _loc1_.linkName = linkName;
   _loc1_.track();
}
var s = this;
var version = "FAS-1.3";
var requestList;
var lastRequest;
var requestNum = 0;
var delayTracking;
var delayTrackingStage;
var delayTrackingInterval;
var accountVarList;
var accountConfigList;
var movie;
var wrapperObject;
s.init();
