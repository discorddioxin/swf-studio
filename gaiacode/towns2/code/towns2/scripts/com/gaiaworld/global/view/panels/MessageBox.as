package com.gaiaworld.global.view.panels
{
   import com.gaiaworld.global.constants.MessageConstants;
   import com.gaiaworld.global.model.MessageModel;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.text.TextField;
   import flash.text.TextFormat;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol513")]
   public class MessageBox extends Sprite
   {
      
      public var btnClose:SimpleButton;
      
      public var text1:TextField;
      
      private var messageModel:MessageModel = MessageModel.getInstance();
      
      public function MessageBox()
      {
         super();
         this.visible = false;
         this.messageModel.addEventListener(MessageConstants.NEW_MESSAGE,this.showMessage);
         this.btnClose.addEventListener(MouseEvent.MOUSE_DOWN,this.close);
      }
      
      private function close(param1:MouseEvent) : void
      {
         this.visible = false;
      }
      
      private function showMessage(param1:Event) : *
      {
         var _loc2_:TextFormat = new TextFormat();
         _loc2_.size = this.messageModel.fontSize;
         this.text1.defaultTextFormat = _loc2_;
         this.text1.htmlText = this.messageModel.message;
         this.visible = true;
         if(this.messageModel.showCloseButton == false)
         {
            this.btnClose.visible = false;
         }
         else
         {
            this.btnClose.visible = true;
         }
      }
   }
}

