onClipEvent(load){
   noFade = true;
   text = _root.textOb.botFarewell;
   this.btn_ok.onRelease = function()
   {
      _parent.gotoAndPlay("bribe_frame");
   };
}
