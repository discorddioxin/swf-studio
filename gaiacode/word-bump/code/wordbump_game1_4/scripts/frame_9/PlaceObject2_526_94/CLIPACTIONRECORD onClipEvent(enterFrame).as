onClipEvent(enterFrame){
   var loaded = _root.getBytesLoaded() + _root.mcWordList.getBytesLoaded() + _root.mcSound.getBytesLoaded();
   var total = _root.getBytesTotal() + _root.mcWordList.getBytesTotal() + _root.mcSound.getBytesTotal();
   if(loaded >= total)
   {
      _root.mcDebug.dTrace("finished loading:" + loaded + "," + total);
      _root.gotoAndPlay("login");
   }
   pct = Math.floor(loaded / total * 100);
   newFrame = Math.floor(pct / 2);
   gotoAndStop(newFrame);
}
