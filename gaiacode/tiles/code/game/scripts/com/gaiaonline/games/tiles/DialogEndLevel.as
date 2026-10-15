package com.gaiaonline.games.tiles
{
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.text.TextField;
   
   public class DialogEndLevel extends Sprite
   {
      
      private static const VGAP:Number = 10;
      
      public function DialogEndLevel(message:String)
      {
         var quit:Sprite = null;
         var more:Sprite = null;
         super();
         var am:AssetManager = AssetManager.inst();
         var messageField:TextField = am.newEmbeddedFontTextField(am.newBoulderTextFormat(16),0);
         messageField.wordWrap = true;
         messageField.text = message;
         messageField.width = 330;
         messageField.y = VGAP;
         messageField.filters = Consts.DIALOGTEXT_DROPSHADOW;
         addChild(messageField);
         quit = am.newTilesButton("Take my tickets and STOP");
         more = am.newTilesButton("Risk them all and go for MORE!");
         var maxWidth:int = Math.max(quit.width,more.width);
         quit.width = maxWidth;
         more.width = maxWidth;
         Utils.centerChild(more,this);
         more.y = messageField.y + messageField.height + 3 * VGAP;
         quit.x = more.x;
         quit.y = more.y + more.height + VGAP;
         Utils.listen(quit,MouseEvent.CLICK,onQuit);
         Utils.listen(more,MouseEvent.CLICK,onMore);
         addChild(quit);
         addChild(more);
      }
      
      private function onMore(e:Event) : void
      {
         GlobalGameEvents.inst().UIClick();
         dispatchEvent(new DialogEvent(DialogEvent.MORE));
      }
      
      private function onQuit(e:Event) : void
      {
         GlobalGameEvents.inst().UIClick();
         dispatchEvent(new DialogEvent(DialogEvent.QUIT));
      }
   }
}

