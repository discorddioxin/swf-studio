onClipEvent(load){
   text = _root.textOb.bettingTip;
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
      _root.loadPlayInfoBub();
   };
}
