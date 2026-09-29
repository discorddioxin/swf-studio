class com.omniture.ActionSource extends MovieClip
{
   var broadcaster;
   var s;
   function ActionSource()
   {
      super();
      this._visible = false;
      this.broadcaster = new com.omniture.events.EventBroadcaster();
   }
   function set version(version)
   {
   }
   function get version()
   {
      return this.s.version;
   }
   function set account(account)
   {
      this.s.account = account;
   }
   function get account()
   {
      return this.s.account;
   }
   function set charSet(charSet)
   {
      this.s.charSet = charSet;
   }
   function get charSet()
   {
      return this.s.charSet;
   }
   function set pageName(pageName)
   {
      this.s.pageName = pageName;
   }
   function get pageName()
   {
      return this.s.pageName;
   }
   function set pageURL(pageURL)
   {
      this.s.pageURL = pageURL;
   }
   function get pageURL()
   {
      return this.s.pageURL;
   }
   function set trackClickMap(trackClickMap)
   {
      this.s.trackClickMap = trackClickMap;
   }
   function get trackClickMap()
   {
      return this.s.trackClickMap;
   }
   function set movieID(movieID)
   {
      this.s.movieID = movieID;
   }
   function get movieID()
   {
      return this.s.movieID;
   }
   function set autoTrack(autoTrack)
   {
      this.s.autoTrack = autoTrack;
   }
   function get autoTrack()
   {
      return this.s.autoTrack;
   }
   function loadActionSource(path)
   {
      var _loc1_ = this;
      _loc1_.s = _loc1_.createEmptyMovieClip("s",100);
      _loc1_.s.loadMovie(path);
      _loc1_.loadInterval = setInterval(_loc1_,"checkActionSourceLoaded",10);
   }
   function checkActionSourceLoaded()
   {
      var _loc1_ = this;
      if(_loc1_.s.track.toString() == "[type Function]")
      {
         _loc1_.s.movie = _loc1_;
         _loc1_.s.wrapperObject = _loc1_;
         clearInterval(_loc1_.loadInterval);
         _loc1_.broadcastEvent("loaded");
      }
   }
   function addEventListener(event, obj, method)
   {
      this.broadcaster.addEventListener(event,obj,method);
   }
   function removeEventListener(event, obj, method)
   {
      this.broadcaster.removeEventListener(event,obj,method);
   }
   function broadcastEvent(event, data)
   {
      this.broadcaster.broadcastEvent(event,data);
   }
   function track()
   {
      this.s.track();
   }
   function trackLink(linkURL, linkType, linkName)
   {
      this.s.trackLink(linkURL,linkType,linkName);
   }
}
