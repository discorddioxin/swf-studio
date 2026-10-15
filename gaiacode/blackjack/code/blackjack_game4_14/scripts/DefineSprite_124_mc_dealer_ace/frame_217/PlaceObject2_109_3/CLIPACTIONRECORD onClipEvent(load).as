onClipEvent(load){
   noFade = true;
   text = _root.textOb.aceBribe;
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
      _root.slayDealer();
   };
}
