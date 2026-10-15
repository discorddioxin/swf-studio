onClipEvent(load){
   text = _root.textOb.botIntro;
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
   };
}
