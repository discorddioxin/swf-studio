package com.gaiaonline.games.tiles
{
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.text.TextField;
   import gs.TweenMax;
   
   public final class Dialog extends Sprite
   {
      
      private static const MARGIN:Number = 10;
      
      private var _titleText:TextField;
      
      private var _background:Sprite = AssetManager.inst().newGenericDialogBG();
      
      public function Dialog()
      {
         super();
         _background.width = 20;
         _background.height = 20;
         addChild(_background);
      }
      
      public function set title(text:String) : void
      {
         if(!_titleText)
         {
            _titleText = AssetManager.inst().newEmbeddedFontTextField(AssetManager.inst().newBoulderTextFormat(24),0);
            _titleText.width = this.width;
            _titleText.x = 15;
            _titleText.y = 13;
            _titleText.filters = Consts.DIALOGTEXT_DROPSHADOW;
            addChild(_titleText);
         }
         _titleText.text = text;
         updateBackgroundSize();
      }
      
      public function set body(bodyObj:DisplayObject) : void
      {
         if(_titleText)
         {
            bodyObj.y = _titleText.y + _titleText.height;
         }
         if(bodyObj.width < width)
         {
            bodyObj.x = (width - bodyObj.width) / 2;
         }
         else
         {
            bodyObj.x = MARGIN;
         }
         addChild(bodyObj);
         updateBackgroundSize();
      }
      
      private function updateBackgroundSize() : void
      {
         _background.width = width + MARGIN;
         _background.height = height + 2 * MARGIN;
      }
      
      public function startStarBurstAnimations() : void
      {
         for(var i:int = 0; i < 4; i++)
         {
            TweenMax.delayedCall(Math.random() * 1,playOneStarburst);
         }
      }
      
      private function playOneStarburst() : void
      {
         var starBurst:DisplayObject = AssetManager.inst().newStarBurst();
         starBurst.x = Math.random() * width;
         starBurst.y = Math.random() * height;
         addChild(starBurst);
         Utils.removeThyselfLater(starBurst,Consts.STARBURST_DURATION);
      }
   }
}

