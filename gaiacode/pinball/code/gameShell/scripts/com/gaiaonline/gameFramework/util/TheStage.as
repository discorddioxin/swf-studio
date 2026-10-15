package com.gaiaonline.gameFramework.util
{
   import flash.display.Sprite;
   import flash.display.Stage;
   import flash.display.StageAlign;
   import flash.display.StageScaleMode;
   
   public class TheStage extends Sprite
   {
      
      public static var instance:TheStage = null;
      
      public function TheStage()
      {
         super();
      }
      
      public static function getStage() : Stage
      {
         return getInstance().stage;
      }
      
      public static function getInstance() : TheStage
      {
         if(instance == null)
         {
            instance = new TheStage();
         }
         return instance;
      }
      
      public static function init(param1:Stage) : void
      {
         param1.addChild(TheStage.getInstance());
         param1.scaleMode = StageScaleMode.NO_SCALE;
         param1.align = StageAlign.TOP_LEFT;
      }
   }
}

