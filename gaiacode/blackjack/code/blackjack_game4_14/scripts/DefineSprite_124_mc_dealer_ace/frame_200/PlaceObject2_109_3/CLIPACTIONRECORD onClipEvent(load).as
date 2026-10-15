onClipEvent(load){
   noFade = true;
   text = _root.textOb.aceFarewell;
   this.btn_ok.onRelease = function()
   {
      _parent.gotoAndPlay("bribe_frame");
   };
}
