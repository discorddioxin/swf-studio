on(rollOver){
   if(this._alpha < 88)
   {
      this.myFadedAlpha = this._alpha;
   }
   this._alpha = 88;
   _parent.tooltip.topic = "music";
   _parent.tooltip.gotoAndPlay("tray");
}
