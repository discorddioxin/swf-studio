package com.gaiaworld.user.services
{
   import com.gaiaonline.gsi.GSICompleteEvent;
   import com.gaiaonline.gsi.GSIGateway;
   import com.gaiaonline.serializers.JSONSerializer;
   import com.gaiaworld.global.constants.GsiConstants;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.user.controller.UserController;
   import com.gaiaworld.user.model.UserModel;
   
   public class TrackerData
   {
      
      private var gateway:GSIGateway;
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      public function TrackerData()
      {
         super();
         this.gateway = new GSIGateway(this.globalModel.gsiSubdomain);
         this.gateway.serializerClass = JSONSerializer;
      }
      
      public function getAllOnline() : *
      {
         if(this.globalModel.phoneIsOpen == false)
         {
            return;
         }
         this.gateway.addEventListener(GSICompleteEvent.COMPLETE,this.gotAll);
         this.gateway.queue(GsiConstants.GET_ONLINE_FRIENDS,UserModel.getInstance().sid);
         this.gateway.send();
      }
      
      private function gotAll(param1:GSICompleteEvent) : void
      {
         var _loc2_:Array = new Array();
         this.gateway.removeEventListener(GSICompleteEvent.COMPLETE,this.gotAll);
         var _loc3_:* = param1.methods[0].data;
         var _loc4_:* = _loc3_.length;
         var _loc5_:int = 0;
         while(_loc5_ < _loc4_)
         {
            _loc2_[_loc3_[_loc5_].id] = _loc3_[_loc5_].loc;
            _loc5_++;
         }
         var _loc6_:UserController = new UserController();
         _loc6_.setOnlinePals(_loc2_);
      }
   }
}

