package com.gaiaonline.net
{
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.events.SecurityErrorEvent;
   import flash.events.TimerEvent;
   import flash.net.Socket;
   import flash.utils.Timer;
   
   public class GaiaSocket extends Socket
   {
      
      public static const DEFAULT_TIMEOUT:uint = 3000;
      
      private var _host:String = "";
      
      private var _retries:int = 0;
      
      private var _port:uint = 0;
      
      private var timeoutTimer:Timer = new Timer(DEFAULT_TIMEOUT,1);
      
      private var _retriedCount:int = 0;
      
      public function GaiaSocket(param1:String = null, param2:uint = 0)
      {
         this.timeoutTimer.addEventListener(TimerEvent.TIMER,this.onTimeout);
         super(param1,param2);
         this._host = param1;
         this._port = param2;
         this.addEventListener(Event.CLOSE,this.onClose);
         this.addEventListener(IOErrorEvent.IO_ERROR,this.onIOError);
         this.addEventListener(SecurityErrorEvent.SECURITY_ERROR,this.onSecurityError);
         this.addEventListener(Event.CONNECT,this.onConnect);
      }
      
      public function get port() : uint
      {
         return this._port;
      }
      
      public function set timeout(param1:uint) : void
      {
         this.timeoutTimer.delay = param1;
      }
      
      protected function onIOError(param1:IOErrorEvent) : void
      {
      }
      
      public function get retries() : int
      {
         return this._retries;
      }
      
      protected function onSecurityError(param1:SecurityErrorEvent) : void
      {
      }
      
      protected function onConnect(param1:Event) : void
      {
         this._retriedCount = 0;
         this.timeoutTimer.reset();
      }
      
      public function set retries(param1:int) : void
      {
         this._retries = param1;
      }
      
      protected function onTimeout(param1:TimerEvent) : void
      {
         trace("*** GaiaSocket::onTimeout()");
         this.onClose(param1);
         this.dispatchEvent(new Event("timeout"));
      }
      
      public function reconnect() : Boolean
      {
         trace("*** GaiaSocket::reconnect()");
         if(Boolean(!this.connected) && Boolean(this._host) && Boolean(this._port))
         {
            this.connect(this._host,this._port);
            return true;
         }
         return false;
      }
      
      public function get retriedCount() : int
      {
         return this._retriedCount;
      }
      
      protected function onClose(param1:Event) : void
      {
         this.timeoutTimer.reset();
         if(this._retriedCount >= 0 && (this._retries < 0 || this._retriedCount < this._retries))
         {
            ++this._retriedCount;
            this.reconnect();
         }
         else
         {
            this.dispatchEvent(new Event("dead"));
         }
      }
      
      public function get timeout() : uint
      {
         return this.timeoutTimer.delay;
      }
      
      public function get host() : String
      {
         return this._host;
      }
      
      override public function connect(param1:String, param2:int) : void
      {
         if(this.connected)
         {
            return;
         }
         super.connect(param1,param2);
         this._host = param1;
         this._port = param2;
         if(this._retriedCount < 0)
         {
            this._retriedCount = 0;
         }
         this.timeoutTimer.start();
      }
      
      override public function close() : void
      {
         this._retriedCount = -1;
         if(this.connected)
         {
            super.close();
            this.dispatchEvent(new Event(Event.CLOSE));
            this.onClose(null);
         }
      }
   }
}

