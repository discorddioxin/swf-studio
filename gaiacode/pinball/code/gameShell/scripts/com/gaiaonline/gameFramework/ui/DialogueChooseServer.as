package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.text.*;
   import com.gaiaonline.gameFramework.util.UrlUtil;
   import com.gaiaonline.gsi.*;
   import com.gaiaonline.serializers.*;
   import fl.controls.DataGrid;
   import fl.controls.ScrollPolicy;
   import fl.data.DataProvider;
   import flash.display.*;
   import flash.events.*;
   import flash.text.*;
   import flash.utils.*;
   
   public class DialogueChooseServer extends Dialogue
   {
      
      public var serverList:DataGrid;
      
      private var timer:Timer;
      
      private const OCCUPANCY_REFRESH_INTERVAL:int = 60000;
      
      public var playAlone_btn:GaiaButton;
      
      public var joinServer_btn:GaiaButton;
      
      public var msgTxt:TextField;
      
      private var appID:Number;
      
      private var gsi:GSIGateway;
      
      private var useDynamicServers:Boolean;
      
      public function DialogueChooseServer(param1:Object)
      {
         var _loc4_:* = undefined;
         super();
         titleTxt.text = textContentManager.getText("chooseServerHeader");
         msgTxt.text = textContentManager.getText("chooseServerBody");
         playAlone_btn.addEventListener(MouseEvent.CLICK,playAloneClicked);
         joinServer_btn.addEventListener(MouseEvent.CLICK,joinServerClicked);
         var _loc2_:Array = param1.servers;
         this.appID = Number(param1.gameConfig.gaiaApplicationID);
         this.useDynamicServers = param1.gameConfig.useDynamicGameServerIps == "true";
         var _loc3_:DataProvider = new DataProvider();
         for each(_loc4_ in _loc2_)
         {
            _loc4_.status = "AVAILABLE";
            _loc3_.addItem(_loc4_);
         }
         serverList.columns = ["name","occupancy","status"];
         serverList.getColumnAt(0).headerText = "Name";
         serverList.getColumnAt(1).headerText = "Players";
         serverList.getColumnAt(1).width = 80;
         serverList.getColumnAt(1).sortOptions = Array.NUMERIC;
         serverList.getColumnAt(2).headerText = "Status";
         serverList.getColumnAt(2).width = 80;
         serverList.dataProvider = _loc3_;
         serverList.dataProvider.sortOn("occupancy");
         serverList.selectedIndex = 0;
         serverList.addEventListener(Event.CHANGE,this.onChangeSelection);
         gsi = new GSIGateway(UrlUtil.getGsiServerSubdomain());
         gsi.serializerClass = JSONSerializer;
         gsi.addEventListener(GSIEvent.LOADED,onOccupancyLoaded);
         gsi.addEventListener(GSIEvent.ERROR,onGSIIOError);
         gsi.addEventListener(IOErrorEvent.IO_ERROR,onGSIIOError);
         loadOccupancy();
         timer = new Timer(OCCUPANCY_REFRESH_INTERVAL,1);
         timer.addEventListener(TimerEvent.TIMER_COMPLETE,this.onTimer);
      }
      
      private function loadOccupancy() : void
      {
         gsi.invoke(50,this.appID);
      }
      
      public function getChosenServer() : Object
      {
         return serverList.selectedItem;
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[DialogueChooseServer]";
         trace(_loc2_ + param1);
      }
      
      private function onOccupancyLoaded(param1:GSIEvent) : void
      {
         var _loc3_:Object = null;
         var _loc4_:* = undefined;
         var _loc5_:int = 0;
         var _loc6_:int = 0;
         var _loc7_:Object = null;
         var _loc8_:* = undefined;
         var _loc2_:int = serverList.selectedIndex;
         if(!useDynamicServers)
         {
            _loc3_ = new Object();
            for(_loc4_ in param1.gsiData)
            {
               _loc3_[param1.gsiData[_loc4_].ip] = param1.gsiData[_loc4_];
            }
            _loc5_ = int(serverList.dataProvider.length);
            _loc6_ = 0;
            while(_loc6_ < _loc5_)
            {
               _loc7_ = serverList.dataProvider.getItemAt(_loc6_);
               if(_loc3_[_loc7_.ip])
               {
                  _loc7_.name = unescape(_loc7_.name).split("+").join(" ");
                  _loc7_.occupancy = Number(_loc3_[_loc7_.ip].occupancy);
                  _loc7_.max_occupancy = Number(_loc3_[_loc7_.ip].max_occupancy);
                  _loc7_.status = getStatus(_loc7_);
                  serverList.dataProvider.replaceItemAt(_loc7_,_loc6_);
               }
               _loc6_++;
            }
         }
         else
         {
            serverList.dataProvider.removeAll();
            for each(_loc8_ in param1.gsiData)
            {
               _loc8_.name = unescape(_loc8_.name).split("+").join(" ");
               _loc8_.occupancy = Number(_loc8_.occupancy);
               _loc8_.status = getStatus(_loc8_);
               _loc8_.max_occupancy = Number(_loc8_.max_occupancy);
               serverList.dataProvider.addItem(_loc8_);
            }
         }
         serverList.dataProvider.sortOn("occupancy",Array.NUMERIC);
         serverList.selectedIndex = _loc2_;
         onChangeSelection();
         timer.reset();
         if(this.parent)
         {
            timer.start();
         }
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         dialogBG.height = 383.6;
         dialogBG.width = 403.5;
         titleTxt.text = "CHOOSE A SERVER";
         var _loc1_:TextFormat = new TextFormat();
         _loc1_.leading = 3;
         msgTxt = new TextField();
         msgTxt.defaultTextFormat = _loc1_;
         msgTxt.width = 356;
         msgTxt.height = 61.3;
         msgTxt.x = 24.1;
         msgTxt.y = 37.2;
         msgTxt.multiline = true;
         msgTxt.wordWrap = true;
         addChildToDialog(msgTxt);
         var _loc2_:TextField = new TextField();
         _loc2_.defaultTextFormat = new TextFormat("Arial",10,0,true);
         _loc2_.text = "SERVERS";
         _loc2_.x = 34;
         _loc2_.y = 95;
         addChildToDialog(_loc2_);
         serverList = new DataGrid();
         serverList.allowMultipleSelection = false;
         serverList.editable = false;
         serverList.headerHeight = 25;
         serverList.horizontalLineScrollSize = 4;
         serverList.horizontalPageScrollSize = 0;
         serverList.horizontalScrollPolicy = ScrollPolicy.OFF;
         serverList.resizableColumns = true;
         serverList.rowHeight = 20;
         serverList.showHeaders = true;
         serverList.sortableColumns = true;
         serverList.verticalLineScrollSize = 4;
         serverList.verticalPageScrollSize = 0;
         serverList.verticalScrollPolicy = ScrollPolicy.AUTO;
         serverList.width = 336;
         serverList.height = 190;
         serverList.x = 33.6;
         serverList.y = 110.4;
         addChildToDialog(serverList);
         playAlone_btn = new GaiaButton(new DialogButtonAsset(),"Play Alone");
         playAlone_btn.x = 59;
         playAlone_btn.y = 327.9;
         addChildToDialog(playAlone_btn);
         joinServer_btn = new GaiaButton(new DialogButtonAsset(),"Join Server");
         joinServer_btn.x = 216;
         joinServer_btn.y = 327.9;
         addChildToDialog(joinServer_btn);
      }
      
      private function joinServerClicked(param1:Event) : void
      {
         dTrace("joinServerClicked:" + serverList.selectedItem.ip);
         if(!joinServer_btn.enabled)
         {
            return;
         }
         param1 = new Event("SERVER_CHOSEN");
         dispatchEvent(param1);
         close();
      }
      
      private function onChangeSelection(param1:Event = null) : void
      {
         var _loc2_:Object = serverList.selectedItem;
         playAlone_btn.enabled = joinServer_btn.enabled = _loc2_.status == "AVAILABLE";
      }
      
      public function playAloneClicked(param1:Event) : void
      {
         dTrace("playAloneClicked");
         if(!playAlone_btn.enabled)
         {
            return;
         }
         dispatchEvent(new Event("PLAY_ALONE"));
         dispatchEvent(new Event("SERVER_CHOSEN"));
         close();
      }
      
      private function onTimer(param1:TimerEvent = null) : void
      {
         loadOccupancy();
      }
      
      private function getStatus(param1:Object) : String
      {
         return !param1.max_occupancy || param1.max_occupancy <= 0 || Number(param1.occupancy) < Number(param1.max_occupancy) ? "AVAILABLE" : "FULL";
      }
      
      private function onGSIIOError(param1:Event) : void
      {
         dTrace("onGSIIOError | " + param1);
      }
   }
}

