package com.gaiaonline.events
{
   import flash.events.ProgressEvent;
   
   public class DownloadAssetManagerEvent extends ProgressEvent
   {
      
      public static const PROGRESS:String = "progress";
      
      public static const COMPLETE:String = "complete";
      
      private var _asset:Object;
      
      public function DownloadAssetManagerEvent(param1:String, param2:Boolean = false, param3:Boolean = false, param4:uint = 0, param5:uint = 0)
      {
         super(param1,param2,param3,param4,param5);
      }
      
      public function set asset(param1:Object) : void
      {
         _asset = param1;
      }
      
      public function get asset() : Object
      {
         return _asset;
      }
   }
}

