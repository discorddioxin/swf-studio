onClipEvent(load){
   function init()
   {
      var t = 1;
      while(t <= 18)
      {
         mc = eval("fish" + t);
         mc.gotoAndStop(1);
         t++;
      }
   }
   function setIcons(arr)
   {
      var t = 0;
      while(t < arr.length)
      {
         var mc = eval("fish" + (t + 1));
         mc.gotoAndStop(arr[t] + 10);
         t++;
      }
      var t = arr.length;
      while(t <= 18)
      {
         var mc = eval("fish" + (t + 1));
         mc.gotoAndStop(1);
         t++;
      }
   }
}
