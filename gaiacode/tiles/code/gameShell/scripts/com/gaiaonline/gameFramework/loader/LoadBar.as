package com.gaiaonline.gameFramework.loader
{
   import flash.display.MovieClip;
   import flash.events.ProgressEvent;
   import flash.text.TextField;
   import flash.text.TextFormat;
   import flash.text.TextFormatAlign;
   
   public class LoadBar extends MovieClip
   {
      
      public var LoadingBarAsset:Class = LoadBar_LoadingBarAsset;
      
      public var mcBar:MovieClip = null;
      
      public var msgTxt:TextField = null;
      
      public function LoadBar()
      {
         super();
         drawUI();
      }
      
      private function setLoadPct(param1:Number) : void
      {
         var _loc2_:uint = Math.floor(mcBar.totalFrames * param1);
         _loc2_ = Math.max(1,_loc2_);
         if(_loc2_ != mcBar.currentFrame)
         {
            mcBar.gotoAndStop(_loc2_);
         }
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[Load Bar]";
         trace(_loc2_ + param1);
      }
      
      public function setMessage(param1:String) : void
      {
         msgTxt.text = param1;
      }
      
      private function drawUI() : void
      {
         msgTxt = new TextField();
         msgTxt.width = 256;
         msgTxt.height = 20;
         msgTxt.x = 25;
         msgTxt.y = 28;
         var _loc1_:TextFormat = new TextFormat("Arial",14,16777215,true);
         _loc1_.align = TextFormatAlign.CENTER;
         msgTxt.defaultTextFormat = _loc1_;
         addChild(msgTxt);
         mcBar = new LoadingBarAsset();
         mcBar.x = 82;
         mcBar.y = 6.5;
         addChild(mcBar);
      }
      
      public function onProgress(param1:ProgressEvent) : void
      {
         setLoadPct(param1.bytesLoaded / param1.bytesTotal);
      }
   }
}

