on(rollOut){
   if(this.myFadedAlpha > 0 && this.myFadedAlpha < 88)
   {
      this._alpha = this.myFadedAlpha;
   }
   _parent.tooltip.topic = 2;
   _parent.tooltip.gotoAndStop("tray");
}
