onClipEvent(load){
   noFade = true;
   text = _root.textOb.jinxBribe;
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
      _root.slayDealer();
   };
}
