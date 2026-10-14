removeLoadingBar();
Key.removeListener(keyListener);
var keyListener = new Object();
keyListener.onKeyDown = function()
{
   if(Key.getCode() == 83)
   {
      buttonPressed("single_player");
   }
   if(Key.getCode() == 77)
   {
      buttonPressed("multi_player");
   }
};
Key.addListener(keyListener);
