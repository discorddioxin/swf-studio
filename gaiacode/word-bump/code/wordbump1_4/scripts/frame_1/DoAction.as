function startPreLoaderInit()
{
   _global.game_nms = "Gaia WordBump";
   _global.sGSECSVersion = "2.9";
   _global.preLoaderVersion = "1.0";
   _global.stageSize = new Array(640,580);
   _global.codebase = String(_root._url);
   _global.codebase = _global.codebase.substring(0,_global.codebase.lastIndexOf("/") + 1);
   _global.swf_nms = new Array();
   _global.swf_nms[0] = _global.codebase + "wordbump_game1.4.swf?gsiUrl=" + _root.gsiUrl;
   _global.swf_nms[1] = _global.codebase + "../sharedsource/GSECS/gsecs" + sGSECSVersion + ".swf";
   _global.swf_nms[2] = _global.codebase + "content/word_list.swf";
   _global.swf_nms[3] = _global.codebase + "content/sound1.3.swf";
   _global.main_swf = _global.swf_nms[0];
   _root.loadMovie(_global.codebase + "../sharedsource/preloader/preloader.swf?gsiUrl=" + _root.gsiUrl);
   cachebust = 0;
}
stop();
var ExpressInstall = function()
{
   this.needsUpdate = _root.MMplayerType != undefined ? true : false;
};
ExpressInstall.prototype = {init:function()
{
   if(this.needsUpdate)
   {
      this.loadUpdater();
      return true;
   }
   return false;
},loadUpdater:function()
{
   System.security.allowDomain("fpdownload.macromedia.com");
   this.updater = _root.createEmptyMovieClip("expressInstallHolder",10000000);
   var _self = this;
   this.updater.installStatus = _self.onInstallStatus;
   this.hold = this.updater.createEmptyMovieClip("hold",1);
   this.updater.onEnterFrame = function()
   {
      if(typeof this.hold.startUpdate == "function")
      {
         _self.initUpdater();
         this.onEnterFrame = null;
      }
   };
   var _loc3_ = Math.random();
   this.hold.loadMovie("http://fpdownload.macromedia.com/pub/flashplayer/update/current/swf/autoUpdater.swf?" + _loc3_);
},initUpdater:function()
{
   this.hold.redirectURL = _root.MMredirectURL;
   this.hold.MMplayerType = _root.MMplayerType;
   this.hold.MMdoctitle = _root.MMdoctitle;
   this.hold.startUpdate();
},onInstallStatus:function(msg)
{
   if(msg != "Download.Complete")
   {
      if(msg == "Download.Cancelled")
      {
         getURL("javascript:alert(\'This content requires a more recent version of the Macromedia Flash Player.\')");
      }
      else if(msg == "Download.Failed")
      {
         getURL("javascript:alert(\'There was an error downloading the Flash Player update. Please try again later, or visit macromedia.com to download the latest version of the Flash plugin.\')");
      }
   }
}};
var needFlashPlayerUpdate = false;
var flashVersion = getVersion();
var spaceIndex = flashVersion.indexOf(" ");
if(spaceIndex != -1)
{
   flashVersion = flashVersion.substr(0,spaceIndex) + "," + flashVersion.substr(spaceIndex + 1,flashVersion.length);
}
var flashVerArray = flashVersion.split(",");
var versionMajorMinor = Number(flashVerArray[1] + "." + flashVerArray[3]) + 0;
if(Number(versionMajorMinor) < Number(fla_required_version))
{
   needFlashPlayerUpdate = true;
}
var ExpressInstall = new ExpressInstall();
if((needFlashPlayerUpdate || fla_required_usingie == 1) && ExpressInstall.needsUpdate)
{
   ExpressInstall.init();
}
else
{
   startPreLoaderInit();
}
