package com.gaiaonline.gsi
{
   import com.gaiaonline.serializers.SushiSerializer;
   import flash.events.*;
   import flash.net.*;
   import flash.utils.Timer;
   import mx.utils.Base64Encoder;
   
   public class GSIGateway extends EventDispatcher
   {
      
      public var subdomain:String;
      
      private var _retries:int = 0;
      
      private var loader:URLLoader;
      
      private var aPreviousMethods:Array;
      
      public var password:String;
      
      public var serializerClass:Object = SushiSerializer;
      
      private var _timeout:uint = 0;
      
      public const GATEWAY_URL:String = "gaiaonline.com/chat/gsi/gateway.php";
      
      private var _failed:int = 0;
      
      private var aQueuedMethods:Array;
      
      private var timeoutTimer:Timer;
      
      public var userName:String;
      
      public function GSIGateway(param1:String = "www")
      {
         super();
         this.subdomain = param1;
         this.aQueuedMethods = new Array();
         this.loader = new URLLoader();
         this.loader.addEventListener(Event.COMPLETE,this.onComplete);
         this.loader.addEventListener(IOErrorEvent.IO_ERROR,this.onIOError);
         this.timeoutTimer = new Timer(this._timeout,1);
         this.timeoutTimer.addEventListener(TimerEvent.TIMER_COMPLETE,this.onTimeout);
      }
      
      private function onTimeout(param1:TimerEvent) : void
      {
         dTrace("onTimeout(" + param1 + ")");
         this.close();
         if(!this.retry())
         {
            this.dispatchEvent(new GSITimeoutEvent(GSITimeoutEvent.TIMEOUT,this._timeout,this._failed));
            this._failed = 0;
         }
      }
      
      public function queue(param1:uint, ... rest) : void
      {
         var _loc3_:Array = null;
         _loc3_ = new Array();
         _loc3_.push(param1);
         _loc3_.push(rest);
         this.aQueuedMethods.push(_loc3_);
      }
      
      public function send() : void
      {
         var _loc1_:String = null;
         var _loc2_:URLRequest = null;
         var _loc3_:URLVariables = null;
         var _loc4_:Base64Encoder = null;
         var _loc5_:String = null;
         var _loc6_:URLRequestHeader = null;
         var _loc7_:* = undefined;
         dTrace(":send()" + aQueuedMethods);
         if(!this.aQueuedMethods.length)
         {
            return;
         }
         _loc1_ = createURL();
         _loc2_ = new URLRequest(_loc1_);
         _loc2_.method = URLRequestMethod.POST;
         _loc3_ = new URLVariables();
         _loc3_.m = unescape(this.serializerClass.serialize(this.aQueuedMethods));
         dispatchEvent(new GSIEvent(GSIEvent.SERIALIZED,aQueuedMethods[0],_loc3_.m));
         _loc3_.v = this.serializerClass.encodeName;
         _loc3_.X = new Date().getTime();
         _loc2_.data = _loc3_;
         if(this.userName != null && this.password != null)
         {
            _loc4_ = new Base64Encoder();
            _loc4_.encode(this.userName + ":" + this.password);
            _loc5_ = _loc4_.flush();
            _loc6_ = new URLRequestHeader("Authorization","Basic " + _loc5_);
            _loc2_.requestHeaders.push(_loc6_);
         }
         trace(_loc2_.url,_loc2_.method,_loc2_.data);
         this.loader.load(_loc2_);
         if(this._retries > 0)
         {
            this.aPreviousMethods = new Array();
            for(_loc7_ in this.aQueuedMethods)
            {
               this.aPreviousMethods.push(this.aQueuedMethods[_loc7_]);
            }
         }
         if(this._timeout > 0)
         {
            this.timeoutTimer.reset();
            this.timeoutTimer.start();
         }
         this.reset();
      }
      
      public function set retries(param1:int) : void
      {
         this._retries = param1;
      }
      
      private function retry() : Boolean
      {
         if(++this._failed <= this._retries)
         {
            dTrace("   Failed: " + this._failed + ", retrying...");
            this.aQueuedMethods = this.aPreviousMethods;
            this.send();
            this.dispatchEvent(new GSIRetryEvent(GSIRetryEvent.RETRY,this._failed));
            return true;
         }
         return false;
      }
      
      private function onComplete(param1:Event) : void
      {
         var loader:URLLoader = null;
         var raw:String = null;
         var aReturnMethods:Array = null;
         var totalMethods:uint = 0;
         var x:uint = 0;
         var unserialized:Array = null;
         var pack:Array = null;
         var method:int = 0;
         var success:Boolean = false;
         var data:Object = null;
         var event:Event = param1;
         dTrace("onComplete()" + aQueuedMethods);
         this._failed = 0;
         if(this.timeoutTimer.running)
         {
            this.timeoutTimer.reset();
         }
         loader = URLLoader(event.target);
         raw = unescape(loader.data.toString());
         dispatchEvent(new GSIEvent(GSIEvent.RAW_LOADED,0,raw));
         try
         {
            unserialized = this.serializerClass.unserialize(raw);
         }
         catch(e:Error)
         {
            dTrace("onComplete() unserialize Error:" + e.message);
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
      
      public function invokeArray(param1:uint, param2:Array) : void
      {
         var _loc3_:Array = null;
         _loc3_ = new Array();
         _loc3_.push(param1);
         _loc3_.push(param2);
         this.aQueuedMethods.push(_loc3_);
         this.send();
      }
      
      public function set timeout(param1:uint) : void
      {
         this._timeout = param1;
         if(this.timeoutTimer.running)
         {
            this.timeoutTimer.reset();
         }
         if(param1 > 0)
         {
            this.timeoutTimer.delay = param1;
         }
      }
      
      private function onIOError(param1:IOErrorEvent) : void
      {
         dTrace("onIOError(" + param1.text + ")");
         if(this.timeoutTimer.running)
         {
            this.timeoutTimer.reset();
         }
         if(!this.retry())
         {
            this._failed = 0;
            this.dispatchEvent(param1);
         }
      }
      
      public function get retries() : int
      {
         return this._retries;
      }
      
      public function reset() : void
      {
         this.aQueuedMethods = new Array();
      }
      
      private function dTrace(param1:String) : void
      {
      }
      
      protected function createURL() : String
      {
         return "http://" + this.subdomain + "." + GATEWAY_URL;
      }
      
      public function get timeout() : uint
      {
         return this._timeout;
      }
      
      public function invoke(param1:uint, ... rest) : void
      {
         var _loc3_:Array = null;
         _loc3_ = new Array();
         _loc3_.push(param1);
         _loc3_.push(rest);
         this.aQueuedMethods.push(_loc3_);
         this.send();
      }
      
      public function close() : void
      {
         this.loader.close();
         if(this.timeoutTimer.running)
         {
            this.timeoutTimer.reset();
         }
      }
   }
}

