package com.gaiaonline.games.tiles
{
   import flash.display.InteractiveObject;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.filters.DropShadowFilter;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   
   public class DialogTicketTotal extends Sprite
   {
      
      private static const VGAP:Number = 10;
      
      public function DialogTicketTotal(message:String, tickets:int)
      {
         super();
         var am:AssetManager = AssetManager.inst();
         var messageField:TextField = am.newEmbeddedFontTextField(am.newBoulderTextFormat(16),0);
         messageField.wordWrap = true;
         messageField.text = message;
         messageField.width = 330;
         messageField.y = VGAP;
         messageField.filters = Consts.DIALOGTEXT_DROPSHADOW;
         addChild(messageField);
         var ticketParent:Sprite = new Sprite();
         var ticketImg:Sprite = am.newGaiaTicket();
         ticketImg.scaleX = 3;
         ticketImg.scaleY = 3;
         var ticketTotal:TextField = am.newEmbeddedFontTextField(am.newBoulderTextFormat(60),0);
         ticketTotal.textColor = 16777215;
         ticketTotal.filters = [new DropShadowFilter(5)];
         ticketTotal.autoSize = TextFieldAutoSize.LEFT;
         ticketTotal.text = String(tickets);
         ticketTotal.x = ticketImg.x + ticketImg.width;
         ticketTotal.y = 10;
         ticketParent.addChild(ticketImg);
         ticketParent.addChild(ticketTotal);
         ticketParent.y = messageField.y + messageField.height + VGAP * 4;
         addChild(ticketParent);
         var buttonParent:Sprite = new Sprite();
         var playAgain:InteractiveObject = am.newTilesButton("Play Again");
         var claimPrizes:InteractiveObject = am.newTilesButton("Claim Prizes");
         var quit:InteractiveObject = am.newTilesButton("Quit");
         quit.width = playAgain.width = claimPrizes.width;
         claimPrizes.y = playAgain.height + 5;
         quit.y = claimPrizes.y + claimPrizes.height + 5;
         buttonParent.addChild(playAgain);
         buttonParent.addChild(claimPrizes);
         buttonParent.addChild(quit);
         buttonParent.y = messageField.y + messageField.height + VGAP;
         buttonParent.x = messageField.x + messageField.width - buttonParent.width - 10;
         ticketParent.x = (buttonParent.x - ticketParent.width) / 2;
         addChild(buttonParent);
         Utils.listen(playAgain,MouseEvent.CLICK,onPlayAgain);
         Utils.listen(claimPrizes,MouseEvent.CLICK,onClaimPrizes);
         Utils.listen(quit,MouseEvent.CLICK,onQuit);
      }
      
      private function onQuit(e:Event) : void
      {
         dispatchEvent(new DialogEvent(DialogEvent.QUIT));
      }
      
      private function onPlayAgain(e:Event) : void
      {
         dispatchEvent(new DialogEvent(DialogEvent.PLAYAGAIN));
      }
      
      private function onClaimPrizes(e:Event) : void
      {
         dispatchEvent(new DialogEvent(DialogEvent.CLAIMPRIZES));
      }
   }
}

