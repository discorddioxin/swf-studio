class Preloader extends MovieClip
{
   var currentBytes;
   var delayTimer;
   var filesCounter;
   var lastByte;
   var listeners;
   var loadTimer;
   var onEnterFrame;
   var parentClass;
   var percentLoad;
   var progressAvailable;
   var resources;
   var thisClass;
   var totalBytesOverall;
   var noError = true;
   function Preloader(file_names, mainContainer)
   {
      super();
      mainContainer._visible = false;
      this.thisClass = this;
      this.loadTimer = getTimer();
      this.currentBytes = this.totalBytesOverall = this.percentLoad = 0;
      this.resources = this.listeners = new Array();
      this.filesCounter = file_names.length;
      var _loc4_ = 0;
      while(_loc4_ < file_names.length)
      {
         this.resources[_loc4_] = new Object();
         this.listeners[_loc4_] = new Object();
         this.listeners[_loc4_].indx = _loc4_;
         this.listeners[_loc4_].progressAvailable = false;
         this.listeners[_loc4_].parentClass = this.thisClass;
         this.listeners[_loc4_].file_name = file_names[_loc4_];
         this.listeners[_loc4_].container = mainContainer.createEmptyMovieClip("container" + _loc4_,_loc4_);
         this.listeners[_loc4_].onLoadComplete = function()
         {
            if(!--this.parentClass.filesCounter)
            {
               this.parentClass.cleanUpAndComplete(this.parentClass);
            }
         };
         this.listeners[_loc4_].onLoadProgress = function(target, loadedBytes, totalBytes)
         {
            if(totalBytes != undefined && this.progressAvailable == false)
            {
               this.progressAvailable = true;
               this.parentClass.totalBytesOverall += totalBytes;
            }
            if(this.lastByte == undefined)
            {
               this.lastByte = 0;
            }
            this.parentClass.currentBytes += loadedBytes - this.lastByte;
            this.lastByte = loadedBytes;
            this.parentClass.percentLoad = this.parentClass.currentBytes / this.parentClass.totalBytesOverall;
            _root.bgContainer.percentLoadd = this.parentClass.percentLoad;
         };
         this.resources[_loc4_].clipLoader = new MovieClipLoader();
         this.resources[_loc4_].clipLoader.addListener(this.listeners[_loc4_]);
         this.resources[_loc4_].clipLoader.loadClip(file_names[_loc4_],this.listeners[_loc4_].container);
         _loc4_ = _loc4_ + 1;
      }
   }
   function errorMsg(mc, errCode, errMsg)
   {
      _root.loadBar._visible = false;
      _root.attachMovie("errorPanel","errorPanel",_root.getNextHighestDepth());
      _root.errorPanel._x = Stage.width / 2;
      _root.errorPanel._y = Stage.height / 2;
      _root.errorPanel.info = "Method: Failed to Load\n";
      _root.errorPanel.info += "Error Code: " + errCode + "\n";
      _root.errorPanel.info += "Error: " + errMsg + "\n\n";
      _root.errorPanel.info += "Please copy and paste the above message and send it to games@gaiaonline.com";
      this.noError = false;
   }
   function delayFinish()
   {
      this.delayTimer = setInterval(this,"closePreloader",3000);
   }
   function delayFinishQuick()
   {
      this.delayTimer = setInterval(this,"closePreloader",1000);
   }
   function cleanUpAndComplete(listenerScope)
   {
      delete listenerScope.resources;
      delete listenerScope.listeners;
      if(this.loadTimer < 1000)
      {
         this.delayFinish();
      }
      else
      {
         this.delayFinishQuick();
      }
   }
   function closePreloader()
   {
      clearInterval(this.delayTimer);
      delete this.delayTimer;
      var _loc3_;
      var _loc4_;
      for(var _loc5_ in _root.bgContainer)
      {
         _loc3_ = _root.bgContainer[_loc5_] + "";
         _loc4_ = _loc3_.split(".");
         if(_loc4_[2].substr(0,7) == "balloon")
         {
            _root.bgContainer[_loc5_].removeMovieClip();
         }
      }
      _root.bgContainer.box6.removeMovieClip();
      _root.bgContainer.box5.removeMovieClip();
      _root.bgContainer.gameName.text = "";
      _root.bgContainer.loadedTxt.text = "";
      this.fadeOut();
   }
   function fadeOut()
   {
      var thisClass = this;
      var startGame = _global.main_swf;
      for(var _loc4_ in _global)
      {
         delete _global[_loc4_];
      }
      _root.bgContainer.bgSky.gotoAndPlay("fadeOut");
      _root.bgContainer.bgSky.onEnterFrame = function()
      {
         if(this._currentframe == 18)
         {
            delete this.onEnterFrame;
            if(thisClass.noError == true)
            {
               if(startGame != undefined)
               {
                  _root.loadMovie(startGame);
               }
            }
         }
      };
   }
}
