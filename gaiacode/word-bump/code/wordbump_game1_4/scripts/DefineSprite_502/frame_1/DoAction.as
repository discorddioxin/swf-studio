function setGuestOrRegistered()
{
   if(_root.playAsGuest == true)
   {
      gotoAndStop("guest");
      play();
   }
   else if(_global.gDemoMode)
   {
      gotoAndStop("demo");
      play();
   }
   else
   {
      gotoAndStop("registered");
      play();
   }
}
