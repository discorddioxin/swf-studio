package com.rawfishsoftware.sushi
{
   import flash.events.DataEvent;
   import flash.events.Event;
   import flash.events.IOErrorEvent;
   import flash.events.SecurityErrorEvent;
   import flash.events.StatusEvent;
   import flash.events.TimerEvent;
   import flash.net.XMLSocket;
   import flash.utils.Timer;
   
   public class SushiSocket extends XMLSocket
   {
      
      public static const DEFAULT_TIMEOUT:uint = 30000;
      
      private var timeoutTimer:Timer;
      
      private var timer:Timer;
      
      private var ref:Object;
      
      public function SushiSocket(param1:String, param2:Number, param3:Object)
      {
         super();
         trace("*** SushiSocket::SushiSocket(" + param1 + ", " + param2 + ", ...)");
         ref = param3;
         this.timer = new Timer(42);
         this.timer.addEventListener(TimerEvent.TIMER,this.onTimer);
         this.timeoutTimer = new Timer(DEFAULT_TIMEOUT,1);
         this.timeoutTimer.addEventListener(TimerEvent.TIMER,this.onTimeout);
         this.timeoutTimer.start();
         this.addEventListener(flash.events.Event.CONNECT,this.onConnect);
         this.addEventListener(DataEvent.DATA,this.onData);
         this.addEventListener(flash.events.Event.CLOSE,this.onClose);
         this.addEventListener(IOErrorEvent.IO_ERROR,this.onError);
         this.addEventListener(SecurityErrorEvent.SECURITY_ERROR,this.onError);
         this.addEventListener("status",this.onStatus);
         connect(param1,param2);
      }
      
      protected function onTimeout(param1:TimerEvent) : void
      {
         trace("*** SushiSocket::onTimeout()");
         this.dispatchEvent(new flash.events.Event("timeout"));
         if(this.connected)
         {
            this.close();
         }
         else
         {
            this.ref = null;
         }
      }
      
      private function onData(param1:DataEvent) : void
      {
         this.timeoutTimer.reset();
         ref.$p.apply(ref,[param1.data]);
      }
      
      private function onConnect(param1:flash.events.Event) : void
      {
         var _loc2_:String = null;
         trace("*** SushiSocket::onConnect()");
         this.timeoutTimer.reset();
         this.timeoutTimer.start();
         if(this.ref)
         {
            this.timer.start();
            _loc2_ = ref.$d;
            ref.connectionType = "SOCKET";
            ref.$connected = 1;
            ref.$sts += "S55" + _loc2_ + "FLASH" + _loc2_ + "1" + _loc2_ + ref.LIMIT + ref.$e + "2" + _loc2_ + ref.$clientSpeed + ref.$e;
            ref.$netTimer = new Date().getTime();
         }
         else
         {
            this.close();
         }
      }
      
      private function onTimer(param1:TimerEvent) : void
      {
         var _loc2_:Object = this.ref;
         if(_loc2_.$sts != "")
         {
            if(_loc2_.logging)
            {
               _loc2_.logger.log(_loc2_.$sts,"FLASH");
            }
            this.send(_loc2_.$sts);
            _loc2_.$sts = "";
         }
         if(_loc2_.$fps)
         {
            _loc2_.$getFPS();
         }
      }
      
      private function onError(param1:flash.events.Event) : void
      {
         trace("*** SushiSocket::onEror(" + param1.type + ")");
         this.timer.stop();
         this.timeoutTimer.reset();
      }
      
      private function onStatus(param1:StatusEvent) : void
      {
         trace("*** SushiSocket::onStatus(" + param1.code + ")");
      }
      
      override public function close() : void
      {
         super.close();
         this.onClose(null);
      }
      
      private function onClose(param1:flash.events.Event) : void
      {
         trace("*** SushiSocket::onClose()");
         this.timer.stop();
         this.timeoutTimer.reset();
         if(this.ref)
         {
            ref.$connected = 0;
            ref.event.onDisconnect.$call();
            ref.$init();
            ref.session.sessionList = [];
         }
      }
   }
}

