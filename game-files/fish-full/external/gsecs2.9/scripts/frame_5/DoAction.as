removeLoadingBar();
Key.removeListener(keyListener);
var keyListener = new Object();
keyListener.onKeyDown = function()
{
   if(Key.getCode() == 13)
   {
      buttonPressed("login");
   }
};
Key.addListener(keyListener);
