package com.gaiaonline.gameFramework.tracking
{
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.net.URLLoader;
   import flash.net.URLRequest;
   import flash.utils.Dictionary;
   
   public class Tracking implements ITracking
   {
      
      private static const s_baseUrl:String = "http://www.gaiaonline.com/internal/fls_t.php";
      
      private static const s_appidArg:String = "fid";
      
      private static const s_eventArg:String = "cls";
      
      private static const s_timeArg:String = "tm";
      
      private static const INUSE:Object = {};
      
      private static const FREE:Object = {};
      
      private var _loaders:Dictionary = new Dictionary();
      
      private var _enabled:Boolean;
      
      private var _appID:String;
      
      public function Tracking()
      {
         super();
      }
      
      private function checkInLoader(param1:URLLoader) : void
      {
         param1.removeEventListener(Event.COMPLETE,onComplete);
         param1.removeEventListener(IOErrorEvent.IO_ERROR,onError);
         _loaders[param1] = FREE;
      }
      
      private function onComplete(param1:Event) : void
      {
         checkInLoader(URLLoader(param1.target));
      }
      
      private function onError(param1:Event) : void
      {
         checkInLoader(URLLoader(param1.target));
      }
      
      public function track(param1:String) : void
      {
         var _loc3_:int = 0;
         if(!_appID)
         {
            throw new Error("Tracking app id not yet set");
         }
         if(param1.length > 15)
         {
            trace("Tracking warning",param1,"is longer than the allowed 15 characters");
         }
         var _loc2_:URLLoader = checkOutLoader();
         _loc2_.addEventListener(Event.COMPLETE,onComplete);
         _loc2_.addEventListener(IOErrorEvent.IO_ERROR,onError);
         _loc3_ = Math.floor(new Date().time / 1000);
         var _loc4_:String = s_baseUrl + "?" + s_appidArg + "=" + _appID + "&" + s_eventArg + "=" + encodeURIComponent(param1) + "&" + s_timeArg + "=" + _loc3_;
         _loc2_.load(new URLRequest(_loc4_));
      }
      
      public function set appID(param1:String) : void
      {
         _appID = param1;
      }
      
      private function checkOutLoader() : URLLoader
      {
         var _loc1_:URLLoader = null;
         var _loc2_:Object = null;
         for(_loc2_ in _loaders)
         {
            _loc1_ = URLLoader(_loc2_);
            if(_loaders[_loc1_] == FREE)
            {
               break;
            }
         }
         if(!_loc1_)
         {
            _loc1_ = new URLLoader();
         }
         _loaders[_loc1_] = INUSE;
         return _loc1_;
      }
   }
}

