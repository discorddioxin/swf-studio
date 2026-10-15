package com.gaiaworld.npc.view
{
   import com.gaiaworld.hangouts.constants.QuestConstants;
   import flash.display.MovieClip;
   import flash.display.SimpleButton;
   import flash.events.Event;
   import flash.events.MouseEvent;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol27")]
   public class DialogActionButton extends MovieClip
   {
      
      public var btnNext:SimpleButton;
      
      public var btnNo:SimpleButton;
      
      public var btnYes:SimpleButton;
      
      private var actionArray:Array = ["",QuestConstants.ACTION_NEXT,QuestConstants.ACTION_CLOSE,QuestConstants.ACTION_SAVE,"",QuestConstants.ACTION_BEGIN];
      
      private var buttonIndex:Number;
      
      public function DialogActionButton()
      {
         super();
         addFrameScript(0,this.frame1,1,this.frame2,2,this.frame3,3,this.frame4,4,this.frame5);
      }
      
      public function setButtons(param1:Number) : *
      {
         this.buttonIndex = param1;
         this.gotoAndStop(param1);
         switch(param1)
         {
            case QuestConstants.BUTTON_NEXT:
            case QuestConstants.BUTTON_CLOSE:
            case QuestConstants.BUTTON_SAVE:
            case QuestConstants.BUTTON_BEGIN:
               this.btnNext.addEventListener(MouseEvent.MOUSE_DOWN,this.doAction);
               break;
            case QuestConstants.BUTTON_YES_NO:
               this.btnYes.addEventListener(MouseEvent.MOUSE_DOWN,this.sayYes);
               this.btnNo.addEventListener(MouseEvent.MOUSE_DOWN,this.sayNo);
         }
      }
      
      private function doAction(param1:MouseEvent) : void
      {
         param1.stopPropagation();
         this.dispatchEvent(new Event(this.actionArray[this.buttonIndex],true));
      }
      
      private function sayYes(param1:MouseEvent) : *
      {
         param1.stopPropagation();
         this.dispatchEvent(new Event(QuestConstants.ACTION_SAY_YES,true));
      }
      
      private function sayNo(param1:MouseEvent) : *
      {
         param1.stopPropagation();
         this.dispatchEvent(new Event(QuestConstants.ACTION_SAY_NO,true));
      }
      
      internal function frame1() : *
      {
         stop();
      }
      
      internal function frame2() : *
      {
         stop();
      }
      
      internal function frame3() : *
      {
         stop();
      }
      
      internal function frame4() : *
      {
         stop();
      }
      
      internal function frame5() : *
      {
         stop();
      }
   }
}

