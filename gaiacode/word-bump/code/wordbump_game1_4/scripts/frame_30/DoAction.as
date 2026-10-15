function handleReply(success, itemData)
{
   mcDebug.dTrace("[handleReply] success:" + success);
   if(success)
   {
      mcDebug.dTrace("itemData:" + itemData[0].item_id);
      mcDebug.dTrace(itemData);
   }
   else
   {
      mcDebug.dTrace("GSI METHOD FAILED");
   }
   gGameController.itemGrantData = itemData[0];
   gGameController.itemGrantData.thumbUrl = "http://graphics.gaiaonline.com/images/thumbnails/" + gGameController.itemGrantData.thumbfile;
   delete handleReply;
   delete gsi;
   gotoAndStop("level loaded");
   play();
}
var gsi = new GSItools.GSIGateway("www.gaiaonline.com");
gsi.invoke("712",[gGameController.itemToGrantId],handleReply,this);
stop();
