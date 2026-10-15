onClipEvent(enterFrame){
   daCount++;
   if(daCount > 50)
   {
      _parent._parent.main.resetThrow();
      daCount = 0;
      _parent.fishIcon.gotoAndStop(1);
      _parent.gotoAndStop(1);
   }
}
