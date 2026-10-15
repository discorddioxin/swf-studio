package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.text.*;
   import flash.display.*;
   import flash.events.*;
   import flash.filters.BitmapFilterQuality;
   import flash.filters.DropShadowFilter;
   import flash.text.*;
   import flash.ui.Keyboard;
   
   public class Dialogue extends MovieClip
   {
      
      private var DialogueClickBlockerMC:Class = Dialogue_DialogueClickBlockerMC;
      
      public var textContentManager:TextContentManager = TextContentManager.getInstance();
      
      protected var dialogBG:Sprite = null;
      
      protected var btnClickBlocker:DisplayObject;
      
      protected var dialogHolder:Sprite = null;
      
      private var focusObject:InteractiveObject = null;
      
      protected var titleTxt:TextField = null;
      
      private var DialogueBG:Class = Dialogue_DialogueBG;
      
      public function Dialogue()
      {
         super();
         drawUI();
         dTrace("constructor");
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[Dialogue]";
         trace(_loc2_ + param1);
      }
      
      public function close() : void
      {
         dTrace("close()");
         if(Boolean(parent) && Boolean(parent.parent) && Boolean(parent.parent["focusGame"]))
         {
            parent.parent["focusGame"]();
         }
         dispatchEvent(new Event("DIALOGUE_CLEARED"));
         if(parent)
         {
            parent.removeChild(this);
         }
      }
      
      protected function removeChildFromDialog(param1:DisplayObject) : void
      {
         dialogHolder.removeChild(param1);
      }
      
      public function setEnterClickedFunction(param1:Function) : void
      {
         addEventListener("ENTERCLICKED",param1);
      }
      
      public function init() : void
      {
         if(Boolean(dialogHolder) && Boolean(stage))
         {
            dialogHolder.x = stage.stageWidth / 2 - dialogHolder.width / 2;
            dialogHolder.y = stage.stageHeight / 2 - dialogHolder.height / 2;
         }
         dTrace("stage:" + stage);
         addEventListener(KeyboardEvent.KEY_DOWN,checkKeyDown);
      }
      
      public function checkKeyDown(param1:KeyboardEvent) : void
      {
         switch(param1.keyCode)
         {
            case 13:
            case Keyboard.ENTER:
               dispatchEvent(new Event("ENTERCLICKED"));
         }
      }
      
      protected function addChildToDialog(param1:DisplayObject) : void
      {
         dialogHolder.addChild(param1);
      }
      
      protected function drawUI() : void
      {
         btnClickBlocker = new DialogueClickBlockerMC();
         addChild(btnClickBlocker);
         dialogHolder = new Sprite();
         addChild(dialogHolder);
         dialogBG = new DialogueBG();
         dialogBG.width = 412;
         dialogBG.filters = [new DropShadowFilter(1,45,0,0.85,5,5,1,BitmapFilterQuality.HIGH)];
         addChildToDialog(dialogBG);
         titleTxt = new TextField();
         titleTxt.defaultTextFormat = new TextFormat(null,14,0,false);
         titleTxt.multiline = false;
         titleTxt.x = 9;
         titleTxt.y = 6;
         titleTxt.width = 200;
         addChildToDialog(titleTxt);
      }
   }
}

