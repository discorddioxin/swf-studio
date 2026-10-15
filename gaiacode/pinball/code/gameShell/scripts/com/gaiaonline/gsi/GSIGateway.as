package com.gaiaonline.gsi
{
   import com.gaiaonline.serializers.SushiSerializer;
   import flash.events.*;
   import flash.net.*;
   import flash.utils.Dictionary;
   import mx.utils.Base64Encoder;
   
   public class GSIGateway extends EventDispatcher
   {
      
      private var _loaders:Dictionary = null;
      
      public var subdomain:String;
      
      public var serializerClass:Object = SushiSerializer;
      
      private var _useNonEncodedURL:Boolean = false;
      
      private var aQueuedMethods:Array;
      
      public var password:String;
      
      private const DELAY:uint = 1500;
      
      private const RETRIES:uint = 3;
      
      public const GATEWAY_NONENCODED_URL:String = "gaiaonline.com/chat/gsi/index.php";
      
      public const GATEWAY_URL:String = "gaiaonline.com/chat/gsi/gateway.php";
      
      public var userName:String;
      
      public function GSIGateway(param1:String = "www")
      {
         super();
         this.subdomain = param1;
         this.aQueuedMethods = new Array();
         _loaders = new Dictionary(true);
      }
      
      private function clearLoader(param1:URLLoader) : void
      {
         param1.removeEventListener(Event.COMPLETE,onComplete);
         param1.removeEventListener(IOErrorEvent.IO_ERROR,onIOError);
         delete _loaders[param1];
      }
      
      private function onIOError(param1:IOErrorEvent) : void
      {
         var _loc2_:URLLoader = URLLoader(param1.target);
         if(!(_loaders[_loc2_] as RequestRetry).doRetry())
         {
            clearLoader(_loc2_);
            dispatchEvent(param1);
         }
      }
      
      private function onComplete(param1:Event) : void
      {
         var aReturnMethods:Array;
         var totalMethods:uint;
         var x:uint;
         var raw:String = null;
         var unserialized:Array = null;
         var pack:Array = null;
         var method:int = 0;
         var success:Boolean = false;
         var data:Object = null;
         var event:Event = param1;
         var loader:URLLoader = URLLoader(event.target);
         clearLoader(loader);
         raw = unescape(loader.data.toString());
         if(hasEventListener(GSIEvent.RAW_LOADED))
         {
            dispatchEvent(new GSIEvent(GSIEvent.RAW_LOADED,0,raw));
         }
         try
         {
            unserialized = this.serializerClass.unserialize(raw);
         }
         catch(e:Error)
         {
            dTrace("onComplete() unserialize Error:" + e.message + " : " + raw);
            this.dispatchEvent(new GSIEvent(GSIEvent.ERROR));
         }
         if(!unserialized || !unserialized.length)
         {
            this.dispatchEvent(new GSIEvent(GSIEvent.ERROR));
            return;
         }
         aReturnMethods = new Array();
         totalMethods = unserialized.length;
         x = 0;
         while(x < totalMethods)
         {
            pack = unserialized[x];
            method = int(pack[0]);
            success = Boolean(pack[1]);
            data = pack[2];
            aReturnMethods.push({
               "id":method,
               "data":data,
               "success":success
            });
            if(success)
            {
               this.dispatchEvent(new GSIEvent(GSIEvent.LOADED,method,data));
            }
            else
            {
               this.dispatchEvent(new GSIEvent(GSIEvent.ERROR,method,data));
            }
            x++;
         }
         this.dispatchEvent(new GSICompleteEvent(GSICompleteEvent.COMPLETE,aReturnMethods));
      }
      
      public function set useNonEncodedURL(param1:Boolean) : void
      {
         _useNonEncodedURL = param1;
      }
      
      public function send() : void
      {
         var _loc5_:Base64Encoder = null;
         var _loc6_:String = null;
         var _loc7_:URLRequestHeader = null;
         dTrace(":send()" + aQueuedMethods);
         if(!this.aQueuedMethods.length)
         {
            return;
         }
         var _loc1_:String = createURL();
         var _loc2_:URLRequest = new URLRequest(_loc1_);
         _loc2_.method = URLRequestMethod.POST;
         var _loc3_:URLVariables = new URLVariables();
         _loc3_.m = unescape(this.serializerClass.serialize(this.aQueuedMethods));
         if(hasEventListener(GSIEvent.SERIALIZED))
         {
            dispatchEvent(new GSIEvent(GSIEvent.SERIALIZED,aQueuedMethods[0],_loc3_.m));
         }
         _loc3_.v = this.serializerClass.encodeName;
         _loc3_.X = new Date().getTime();
         _loc2_.data = _loc3_;
         if(this.userName != null && this.password != null)
         {
            _loc5_ = new Base64Encoder();
            _loc5_.encode(this.userName + ":" + this.password);
            _loc6_ = _loc5_.flush();
            _loc7_ = new URLRequestHeader("Authorization","Basic " + _loc6_);
            _loc2_.requestHeaders.push(_loc7_);
         }
         trace(_loc2_.url,_loc2_.method,_loc2_.data);
         var _loc4_:URLLoader = createURLLoader();
         _loaders[_loc4_] = new RequestRetry(_loc2_,_loc4_,RETRIES,DELAY);
         _loc4_.load(_loc2_);
         this.reset();
      }
      
      public function invokeArray(param1:uint, param2:Array) : void
      {
         var _loc3_:Array = new Array();
         _loc3_.push(param1);
         _loc3_.push(param2);
         this.aQueuedMethods.push(_loc3_);
         this.send();
      }
      
      public function queue(param1:uint, ... rest) : void
      {
         var _loc3_:Array = new Array();
         _loc3_.push(param1);
         _loc3_.push(rest);
         this.aQueuedMethods.push(_loc3_);
      }
      
      public function reset() : void
      {
         this.aQueuedMethods.length = 0;
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[GSIGateway]" + param1);
      }
      
      protected function createURL() : String
      {
         var _loc1_:String = _useNonEncodedURL ? GATEWAY_NONENCODED_URL : GATEWAY_URL;
         return "http://" + this.subdomain + "." + _loc1_;
      }
      
      public function get useNonEncodedURL() : Boolean
      {
         return _useNonEncodedURL;
      }
      
      public function invoke(param1:uint, ... rest) : void
      {
         var _loc3_:Array = new Array();
         _loc3_.push(param1);
         _loc3_.push(rest);
         this.aQueuedMethods.push(_loc3_);
         this.send();
      }
      
      private function createURLLoader() : URLLoader
      {
         var _loc1_:URLLoader = new URLLoader();
         _loc1_.addEventListener(Event.COMPLETE,this.onComplete);
         _loc1_.addEventListener(IOErrorEvent.IO_ERROR,this.onIOError);
         return _loc1_;
      }
   }
}

import flash.net.URLLoader;
import flash.net.URLRequest;
import flash.utils.setTimeout;

class RequestRetry
{
   
   private var _request:URLRequest = null;
   
   private var _retriesAllowed:uint = 1;
   
   private var _urlLoader:URLLoader = null;
   
   private var _delay:uint = 1;
   
   public function RequestRetry(param1:URLRequest, param2:URLLoader, param3:uint, param4:uint = 2000)
   {
      super();
      _request = param1;
      _urlLoader = param2;
      _retriesAllowed = param3;
      _delay = param4;
   }
   
   public function doRetry() : Boolean
   {
      --_retriesAllowed;
      if(_retriesAllowed > 0)
      {
         setTimeout(handleRetry,_delay);
         return true;
      }
      return false;
   }
   
   private function handleRetry() : void
   {
      _urlLoader.load(_request);
   }
}
