package com.gaiaonline.games.tiles
{
   import flash.display.InteractiveObject;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   
   public class TitleScreen extends Sprite
   {
      
      public function TitleScreen()
      {
         super();
         var am:AssetManager = AssetManager.inst();
         this.addChild(am.newBackgroundImage());
         var logo:Sprite = am.newLogo();
         Utils.centerChildInRect(logo,Consts.APP_AREA);
         logo.y = 10;
         this.addChild(logo);
         var prompt:Sprite = am.newBackgroundBevel();
         prompt.height = 170;
         var promptParent:Sprite = new Sprite();
         promptParent.addChild(prompt);
         Utils.centerChild(promptParent,this);
         promptParent.y = 243;
         var title:ShadowTextField = new ShadowTextField(20,16777215,3,3);
         title.text = "Welcome to Gaia Tiles!";
         Utils.centerChild(title,prompt);
         title.y = 6;
         promptParent.addChild(title);
         var playButton:InteractiveObject = am.newTilesButton("Play");
         var instructionsButton:InteractiveObject = am.newTilesButton("Instructions");
         playButton.width = 120;
         instructionsButton.width = playButton.width;
         Utils.centerChild(playButton,prompt);
         playButton.y -= 5;
         instructionsButton.x = playButton.x;
         instructionsButton.y = playButton.y + playButton.height + 10;
         instructionsButton.width = playButton.width;
         promptParent.addChild(playButton);
         promptParent.addChild(instructionsButton);
         addChild(promptParent);
         Utils.addFooterText(this,"client " + Consts.VERSION);
         Utils.listen(playButton,MouseEvent.CLICK,onPlay);
         Utils.listen(instructionsButton,MouseEvent.CLICK,onInstructions);
      }
      
      private function onPlay(e:Event) : void
      {
         dispatchEvent(new TitleScreenEvent(TitleScreenEvent.PLAY));
      }
      
      private function onInstructions(e:Event) : void
      {
         dispatchEvent(new TitleScreenEvent(TitleScreenEvent.INSTRUCTIONS));
         addChild(HelpScreen.instance);
      }
   }
}

