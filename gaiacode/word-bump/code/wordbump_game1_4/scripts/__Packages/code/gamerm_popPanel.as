class code.gamerm_popPanel extends MovieClip
{
   var cancel_btn;
   var check_btn;
   var drag_btn;
   var ok_btn;
   var popPanelType;
   var quit_btn;
   var retry_btn;
   var single_btn;
   var theMessage;
   var theMessage_txt;
   function gamerm_popPanel()
   {
      super();
      this._x = _root.popPanelX;
      this._y = _root.popPanelY;
      this.theMessage_txt = this.theMessage;
   }
   function loadButtonActions()
   {
      this.drag_btn.onPress = function()
      {
         this._parent.startDrag(false);
      };
      this.drag_btn.onRelease = function()
      {
         this._parent.stopDrag();
      };
      if(this.popPanelType == "connection")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.startLogIn();
         };
         this.quit_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.getURL("javascript:window.close();");
         };
      }
      if(this.popPanelType == "pluginSIDError")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.blackGameRequestHandler("setSID");
         };
         this.quit_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.getURL("javascript:window.close();");
         };
      }
      if(this.popPanelType == "reset")
      {
         this.cancel_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
         this.ok_btn.onRelease = function()
         {
            _root.okDoTheReset();
            this._parent.removeMovieClip();
         };
      }
      if(this.popPanelType == "noToken")
      {
         this.check_btn.onRelease = function()
         {
            _root.blackGameRequestHandler("update_inventory");
            this._parent.removeMovieClip();
         };
         this.quit_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.getURL("javascript:window.close();");
         };
      }
      if(this.popPanelType == "sushiconnect")
      {
         this.single_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.gsecs.gotoAndStop("blank_frame");
            _root.startGameSingle();
         };
         this.quit_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.getURL("javascript:window.close();");
         };
      }
      if(this.popPanelType == "quit")
      {
         this.quit_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.getURL("javascript:window.close();");
         };
      }
      if(this.popPanelType == "retryOrQuit")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
         this.quit_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.getURL("javascript:window.close();");
         };
      }
      if(this.popPanelType == "saving")
      {
         this.retry_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.savingGame();
         };
         this.quit_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
            _root.getURL("javascript:window.close();");
         };
      }
      if(this.popPanelType == "ok")
      {
         this.ok_btn.onRelease = function()
         {
            this._parent.removeMovieClip();
         };
      }
   }
}
