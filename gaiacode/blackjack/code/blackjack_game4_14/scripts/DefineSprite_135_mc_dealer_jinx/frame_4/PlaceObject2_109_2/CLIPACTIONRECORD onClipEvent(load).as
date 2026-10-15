onClipEvent(load){
   text = _root.textOb.jinxIntro;
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
   };
}
