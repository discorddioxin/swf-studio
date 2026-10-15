onClipEvent(load){
   noFade = true;
   text = _root.textOb.jinxFarewell;
   this.btn_ok.onRelease = function()
   {
      _parent.gotoAndPlay("bribe_frame");
   };
}
