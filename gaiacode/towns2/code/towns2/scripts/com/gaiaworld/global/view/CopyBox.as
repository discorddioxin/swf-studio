package com.gaiaworld.global.view
{
   import com.gaiaonline.gsi.GSICompleteEvent;
   import com.gaiaonline.gsi.GSIGateway;
   import com.gaiaonline.serializers.JSONSerializer;
   import com.gaiaworld.global.controller.MessageController;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.global.util.DebugTool;
   import com.gaiaworld.sushi.DataEx2;
   import com.gaiaworld.user.model.UserModel;
   import fl.controls.Button;
   import fl.controls.List;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol458")]
   public class CopyBox extends Sprite
   {
      
      public var btnGo:Button;
      
      public var btnRefresh:Button;
      
      public var list1:List;
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      private var cArray:Array = new Array();
      
      private var dataEx:DataEx2 = DataEx2.getInstance();
      
      private var prefix:String = "";
      
      private var gsi:GSIGateway;
      
      private var userModel:UserModel = UserModel.getInstance();
      
      public function CopyBox()
      {
         super();
         this.gsi = new GSIGateway(this.globalModel.gsiSubdomain);
         trace("new copy box");
         var _loc1_:String = this.globalModel.mapCode;
         this.prefix = "gambinoMarket";
         if(_loc1_ == "rally")
         {
            this.prefix = "RallyMap3";
         }
         if(_loc1_ == "hollywood")
         {
            this.prefix = "vh_map2";
         }
         this.cArray.push({
            "name":"Alpha",
            "data":"alpha"
         });
         this.cArray.push({
            "name":"Beta",
            "data":"beta"
         });
         this.cArray.push({
            "name":"Omega",
            "data":"omega"
         });
         this.cArray.push({
            "name":"Mirror",
            "data":"mirror"
         });
         this.cArray.push({
            "name":"Waffles",
            "data":"waffles"
         });
         this.cArray.push({
            "name":"My Place",
            "data":"myplace"
         });
         this.cArray.push({
            "name":"Avalon",
            "data":"avalon"
         });
         this.cArray.push({
            "name":"Do Not Enter",
            "data":"donot"
         });
         Button(this.btnGo).addEventListener(MouseEvent.CLICK,this.startTowns);
         Button(this.btnRefresh).addEventListener(MouseEvent.CLICK,this.getOcc);
         this.btnGo.visible = false;
         this.btnRefresh.visible = false;
         this.getOcc();
         this.globalModel.addEventListener("ROOM_FULL",this.roomIsFull);
         this.__setProp_btnGo_copyBox_Layer1_0();
         this.__setProp_btnRefresh_copyBox_Layer1_0();
      }
      
      private function getOcc(param1:Event = null) : *
      {
         var _loc5_:* = undefined;
         var _loc6_:String = null;
         var _loc2_:Array = new Array();
         var _loc3_:int = 0;
         while(_loc3_ < this.cArray.length)
         {
            _loc5_ = this.cArray[_loc3_];
            _loc6_ = this.prefix + "_" + _loc5_.data;
            trace("loc=" + _loc6_);
            _loc2_.push(_loc6_);
            _loc3_++;
         }
         var _loc4_:String = _loc2_.join("|");
         this.gsi.addEventListener(GSICompleteEvent.COMPLETE,this.gotOcc);
         this.gsi.serializerClass = JSONSerializer;
         this.gsi.invoke(343,_loc4_);
      }
      
      private function gotOcc(param1:GSICompleteEvent) : void
      {
         var _loc4_:* = undefined;
         var _loc5_:String = null;
         var _loc6_:int = 0;
         this.gsi.removeEventListener(GSICompleteEvent.COMPLETE,this.gotOcc);
         var _loc2_:* = param1.methods[0].data;
         List(this.list1).removeAll();
         DebugTool.pr(_loc2_);
         var _loc3_:int = 0;
         while(_loc3_ < this.cArray.length)
         {
            _loc4_ = this.cArray[_loc3_];
            _loc5_ = this.prefix + "_" + _loc4_.data;
            _loc6_ = Number(_loc2_[_loc5_]);
            _loc4_.label = _loc4_.name + "(" + _loc6_ + "/40)";
            trace(_loc5_ + "=" + _loc6_);
            List(this.list1).addItem(_loc4_);
            _loc3_++;
         }
         this.btnGo.visible = true;
         this.btnRefresh.visible = true;
      }
      
      private function roomIsFull(param1:Event) : void
      {
         var _loc2_:MessageController = new MessageController();
         _loc2_.setMessage("Room Is Full!",true);
      }
      
      private function startTowns(param1:MouseEvent) : void
      {
         if(List(this.list1).selectedItem == null)
         {
            return;
         }
         this.gsi.addEventListener(GSICompleteEvent.COMPLETE,this.checkedFull);
         this.gsi.serializerClass = JSONSerializer;
         var _loc2_:String = this.prefix + "_" + List(this.list1).selectedItem.data;
         this.gsi.invoke(343,_loc2_);
      }
      
      private function checkedFull(param1:GSICompleteEvent) : void
      {
         var _loc4_:MessageController = null;
         if(List(this.list1).selectedItem == null)
         {
            return;
         }
         this.gsi.removeEventListener(GSICompleteEvent.COMPLETE,this.checkedFull);
         var _loc2_:* = param1.methods[0].data;
         var _loc3_:String = this.prefix + "_" + List(this.list1).selectedItem.data;
         DebugTool.pr(_loc2_);
         trace("data=" + _loc2_[_loc3_]);
         if(Number(_loc2_[_loc3_] < 41))
         {
            this.gsi.queue(324,this.userModel.sid,_loc3_);
            this.gsi.send();
            this.globalModel.roomInstance = List(this.list1).selectedItem.data;
         }
         else
         {
            _loc4_ = new MessageController();
            _loc4_.setMessage("Room Is Full!",true);
         }
      }
      
      internal function __setProp_btnGo_copyBox_Layer1_0() : *
      {
         try
         {
            this.btnGo["componentInspectorSetting"] = true;
         }
         catch(e:Error)
         {
         }
         this.btnGo.emphasized = false;
         this.btnGo.enabled = true;
         this.btnGo.label = "GO!";
         this.btnGo.labelPlacement = "right";
         this.btnGo.selected = false;
         this.btnGo.toggle = false;
         this.btnGo.visible = true;
         try
         {
            this.btnGo["componentInspectorSetting"] = false;
         }
         catch(e:Error)
         {
         }
      }
      
      internal function __setProp_btnRefresh_copyBox_Layer1_0() : *
      {
         try
         {
            this.btnRefresh["componentInspectorSetting"] = true;
         }
         catch(e:Error)
         {
         }
         this.btnRefresh.emphasized = false;
         this.btnRefresh.enabled = true;
         this.btnRefresh.label = "Refresh";
         this.btnRefresh.labelPlacement = "right";
         this.btnRefresh.selected = false;
         this.btnRefresh.toggle = false;
         this.btnRefresh.visible = true;
         try
         {
            this.btnRefresh["componentInspectorSetting"] = false;
         }
         catch(e:Error)
         {
         }
      }
   }
}

