package com.gaiaonline.games.tiles
{
   import flash.display.DisplayObject;
   import flash.display.Loader;
   import flash.display.LoaderInfo;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.net.URLRequest;
   
   public class HelpScreen extends Sprite
   {
      
      private static var s_instance:HelpScreen;
      
      private var _loader:Loader;
      
      public function HelpScreen(singletonizer:SINGLETON_HELPER)
      {
         super();
         if(!singletonizer)
         {
            throw "this class is a singleton, use HelpScreen.instance instead";
         }
         _loader = new Loader();
         Utils.listen(_loader.contentLoaderInfo,Event.COMPLETE,onInstructionsLoaded);
         _loader.load(new URLRequest(AssetManager.ASSET_URL + "helpscreen.png"));
      }
      
      public static function get instance() : HelpScreen
      {
         if(!s_instance)
         {
            s_instance = new HelpScreen(new SINGLETON_HELPER());
         }
         return s_instance;
      }
      
      private function onInstructionsLoaded(e:Event) : void
      {
         var loader:DisplayObject = LoaderInfo(e.target).loader;
         addChild(loader);
         Utils.centerChildInRect(this,Consts.APP_AREA);
         Utils.listen(this,MouseEvent.CLICK,onCloseInstructions);
      }
      
      private function onCloseInstructions(e:Event) : void
      {
         parent.removeChild(this);
      }
   }
}

class SINGLETON_HELPER
{
   
   public function SINGLETON_HELPER()
   {
      super();
   }
}
