class code.localDataWordBump
{
   var sharedObj;
   function localDataWordBump()
   {
      this.sharedObj = SharedObject.getLocal("gaiaOnlineWordBump","/");
      if(this.sharedObj.data.soundEnabled == undefined)
      {
         this.sharedObj.data.soundEnabled = true;
         this.saveData();
      }
   }
   function getProp(pName)
   {
      return this.sharedObj.data[pName];
   }
   function setProp(pName, val)
   {
      this.sharedObj.data[pName] = val;
      this.saveData();
   }
   function saveData()
   {
      this.sharedObj.flush();
   }
}
