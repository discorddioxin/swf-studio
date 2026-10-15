package com.gaiaonline.managers
{
   import com.gaiaonline.events.DownloadAssetManagerEvent;
   import flash.display.DisplayObject;
   import flash.display.Loader;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.IOErrorEvent;
   import flash.events.ProgressEvent;
   import flash.events.SecurityErrorEvent;
   import flash.utils.Dictionary;
   import mx.events.PropertyChangeEvent;
   
   public class DownloadedAssetManager extends EventDispatcher
   {
      
      private static var _instance:DownloadedAssetManager;
      
      private var _isDownloading:Boolean = false;
      
      private var _parentObjectHash:Dictionary;
      
      private var _bytesLoaded:Number = 0;
      
      private var _assetsToDownload:Array;
      
      private var _bytesTotalHash:Dictionary;
      
      private var _bytesTotal:Number = 0;
      
      private var _bytesLoadedHash:Dictionary;
      
      public function DownloadedAssetManager()
      {
         super();
         reset();
      }
      
      private function onAssetInit(param1:Event) : void
      {
         var _loc2_:Object = getActualLoaderInfoObject(param1.target);
      }
      
      private function updateBytesTotal(param1:Object) : void
      {
         var _loc2_:Object = getActualLoaderInfoObject(param1);
         if(!_bytesTotalHash[_loc2_])
         {
            _bytesTotalHash[_loc2_] = _loc2_.bytesTotal;
            bytesTotal += _loc2_.bytesTotal;
         }
      }
      
      private function updateBytesLoaded(param1:Object) : void
      {
         var _loc3_:Number = NaN;
         var _loc2_:Object = getActualLoaderInfoObject(param1);
         if(_loc2_.bytesLoaded)
         {
            if(!_bytesLoadedHash[_loc2_])
            {
               _bytesLoadedHash[_loc2_] = _loc2_.bytesLoaded;
               _loc3_ = Number(_loc2_.bytesLoaded);
            }
            else
            {
               _loc3_ = _loc2_.bytesLoaded - _bytesLoadedHash[_loc2_];
            }
            bytesLoaded += _loc3_;
            _bytesLoadedHash[_loc2_] = _loc2_.bytesLoaded;
         }
      }
      
      public function set isDownloading(param1:Boolean) : void
      {
         var _loc2_:Object = this.isDownloading;
         if(_loc2_ !== param1)
         {
            this._1673805520isDownloading = param1;
            this.dispatchEvent(PropertyChangeEvent.createUpdateEvent(this,"isDownloading",_loc2_,param1));
         }
      }
      
      public function reset() : void
      {
         _bytesTotal = 0;
         _bytesLoaded = 0;
         _assetsToDownload = new Array();
         _bytesTotalHash = new Dictionary(true);
         _bytesLoadedHash = new Dictionary(true);
         _parentObjectHash = new Dictionary(true);
      }
      
      private function set _1382331801bytesTotal(param1:int) : void
      {
         _bytesTotal = param1;
      }
      
      private function onAssetIOError(param1:IOErrorEvent) : void
      {
         dequeueAsset(param1.target);
      }
      
      public function get bytesTotal() : Number
      {
         return _bytesTotal;
      }
      
      private function registerListeners(param1:Object) : void
      {
         var _loc2_:Object = getActualLoaderInfoObject(param1);
         _loc2_.addEventListener(Event.INIT,onAssetInit,false,0,false);
         _loc2_.addEventListener(Event.OPEN,onAssetInit,false,0,false);
         _loc2_.addEventListener(Event.COMPLETE,onAssetComplete,false,0,false);
         _loc2_.addEventListener(ProgressEvent.PROGRESS,onAssetProgress,false,0,false);
         _loc2_.addEventListener(IOErrorEvent.IO_ERROR,onAssetIOError,false,0,false);
         _loc2_.addEventListener(SecurityErrorEvent.SECURITY_ERROR,onAssetSecurityError,false,0,false);
         _parentObjectHash[_loc2_] = param1;
      }
      
      private function onAssetProgress(param1:ProgressEvent) : void
      {
         updateBytesTotal(param1.target);
         updateBytesLoaded(param1.target);
      }
      
      private function queueAsset(param1:Object) : void
      {
         isDownloading = true;
         registerListeners(param1);
         _assetsToDownload.push(param1);
      }
      
      private function dequeueAsset(param1:Object) : void
      {
         var _loc2_:int = _assetsToDownload.indexOf(_parentObjectHash[param1]);
         unregisterListeners(param1);
         if(_loc2_ != -1)
         {
            _assetsToDownload.splice(_loc2_,1);
         }
         if(_assetsToDownload.length == 0)
         {
            isDownloading = false;
         }
         delete _bytesTotalHash[param1];
         delete _bytesLoadedHash[param1];
      }
      
      private function unregisterListeners(param1:Object) : void
      {
         var _loc2_:Object = getActualLoaderInfoObject(param1);
         _loc2_.removeEventListener(Event.INIT,onAssetInit);
         _loc2_.removeEventListener(Event.OPEN,onAssetInit);
         _loc2_.removeEventListener(Event.COMPLETE,onAssetComplete);
         _loc2_.removeEventListener(ProgressEvent.PROGRESS,onAssetProgress);
         _loc2_.removeEventListener(IOErrorEvent.IO_ERROR,onAssetIOError);
         _loc2_.removeEventListener(SecurityErrorEvent.SECURITY_ERROR,onAssetSecurityError);
         delete _parentObjectHash[param1];
      }
      
      private function getActualLoaderInfoObject(param1:Object) : Object
      {
         if(param1 is Loader)
         {
            return param1.contentLoaderInfo;
         }
         if(param1 is DisplayObject)
         {
            return param1.loaderInfo;
         }
         return param1;
      }
      
      public function set bytesLoaded(param1:Number) : void
      {
         var _loc2_:Object = this.bytesLoaded;
         if(_loc2_ !== param1)
         {
            this._326983600bytesLoaded = param1;
            this.dispatchEvent(PropertyChangeEvent.createUpdateEvent(this,"bytesLoaded",_loc2_,param1));
         }
      }
      
      public function get bytesLoaded() : Number
      {
         return _bytesLoaded;
      }
      
      private function onAssetComplete(param1:Event) : void
      {
         var _loc2_:DownloadAssetManagerEvent = null;
         var _loc3_:Object = _parentObjectHash[param1.target];
         updateBytesLoaded(param1.target);
         dequeueAsset(param1.target);
         if(!isDownloading)
         {
            _loc2_ = new DownloadAssetManagerEvent(DownloadAssetManagerEvent.COMPLETE);
            reset();
         }
         else
         {
            _loc2_ = new DownloadAssetManagerEvent(DownloadAssetManagerEvent.PROGRESS);
         }
         _loc2_.asset = _loc3_;
         _loc2_.bytesTotal = _bytesTotal;
         _loc2_.bytesLoaded = _bytesLoaded;
         dispatchEvent(_loc2_);
      }
      
      private function onAssetSecurityError(param1:SecurityErrorEvent) : void
      {
         dequeueAsset(param1.target);
      }
      
      public function register(param1:Object) : void
      {
         queueAsset(param1);
      }
      
      private function set _1673805520isDownloading(param1:Boolean) : void
      {
         _isDownloading = param1;
      }
      
      public function set bytesTotal(param1:Number) : void
      {
         var _loc2_:Object = this.bytesTotal;
         if(_loc2_ !== param1)
         {
            this._1382331801bytesTotal = param1;
            this.dispatchEvent(PropertyChangeEvent.createUpdateEvent(this,"bytesTotal",_loc2_,param1));
         }
      }
      
      private function set _326983600bytesLoaded(param1:int) : void
      {
         _bytesLoaded = param1;
      }
      
      public function get isDownloading() : Boolean
      {
         return _isDownloading;
      }
   }
}

