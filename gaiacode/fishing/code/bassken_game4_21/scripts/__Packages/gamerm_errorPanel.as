class gamerm_errorPanel extends MovieClip
{
   var errorMsg_txt;
   var ok_btn;
   var play_btn;
   var popPanelType;
   var quit_btn;
   var register_btn;
   var retry_btn;
   var theMessage;
   function gamerm_errorPanel()
   {
      super();
      this._x = 324;
      this._y = 287;
      this.errorMsg_txt = this.theMessage;
   }
   function loadButtonActions()
   {
      if(this.popPanelType == "register")
      {
         this.register_btn.onRelease = function()
         {
            _root.getURL("http://www.gaiaonline.com","_blank");
         };
         this.ok_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
      }
      if(this.popPanelType == "connection")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.startLogIn();
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "loginConnection")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "sushiconnect")
      {
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "quit")
      {
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "newgame")
      {
         this.play_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.main.loadFishData(_root.main.baitSelected,1);
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "saving")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.savingGame();
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "bait")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.main.loadBaitData();
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "fish")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.main.loadFishData(_root.main.baitSelected,0);
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "game")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.loadGetData();
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "logan")
      {
         iDrift = 260;
         this._x += Math.round(Math.random() * iDrift - iDrift / 2);
         this._y += Math.round(Math.random() * iDrift - iDrift / 2);
         _root.colorRandomize(this.ok_btn);
         iButtonDrift = 110;
         this.ok_btn._x += Math.random() * iButtonDrift - iButtonDrift / 2;
         this.ok_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
      }
      else if(this.popPanelType == "loganNoBait")
      {
         this.ok_btn.onRelease = function()
         {
            _root.loadGetData();
            this._parent.removeMovieClip();
         };
      }
      else if(this.popPanelType == "user")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.loadGetUserData();
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else if(this.popPanelType == "ok")
      {
         this.ok_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
      }
      else if(this.popPanelType == "retryOrQuit")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
         this.quit_btn.onRelease = function()
         {
            _root.getURL("javascript:window.close();");
         };
      }
      else
      {
         this.theMessage += "/nUNKOWN WINDOW TYPE: " + this.popPanelType;
         this.ok_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
      }
   }
}
