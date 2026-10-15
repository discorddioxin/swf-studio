onClipEvent(load){
   noFade = true;
   text = _root.textOb.botBribe;
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
      _root.slayDealer();
   };
}
