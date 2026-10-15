onClipEvent(load){
   text = "<i>v." + _root.sGameVersionNumber + "</i> Thank you for testing! Please submit any bugs and ideas <u><a href=\'http://www.gaiaonline.com/admin/bugs/index.php?tasks=all&project=29\'>here</a></u>.";
   this.btn_ok.onRelease = function()
   {
      gotoAndStop("empty");
   };
}
