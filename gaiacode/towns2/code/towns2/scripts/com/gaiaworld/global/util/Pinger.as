package com.gaiaworld.global.util
{
   import com.gaiaonline.gsi.GSIGateway;
   import com.gaiaworld.global.constants.GlobalConstants;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.user.model.UserModel;
   import flash.events.Event;
   import flash.events.TimerEvent;
   import flash.utils.Timer;
   
   public class Pinger
   {
      
      private var timer1:Timer;
      
      private var userModel:UserModel = UserModel.getInstance();
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      public function Pinger()
      {
         super();
         this.timer1 = new Timer(60000);
         this.timer1.addEventListener(TimerEvent.TIMER,this.pingLoc);
         this.timer1.start();
         this.pingLoc();
         this.globalModel.addEventListener(GlobalConstants.UPDATE_PING,this.ping2);
      }
      
      private function ping2(param1:Event) : void
      {
         this.pingLoc();
      }
      
      private function pingLoc(param1:TimerEvent = null) : void
      {
         var _loc2_:GSIGateway = null;
         if(this.globalModel.myLoc != "")
         {
            _loc2_ = new GSIGateway(this.globalModel.gsiSubdomain);
            _loc2_.queue(324,this.userModel.sid,this.globalModel.myLoc);
            _loc2_.send();
         }
      }
   }
}

