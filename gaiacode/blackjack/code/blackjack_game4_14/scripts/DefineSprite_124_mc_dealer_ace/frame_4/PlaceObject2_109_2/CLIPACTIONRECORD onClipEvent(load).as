onClipEvent(load){
   text = _root.textOb.aceIntro;
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
   };
}
