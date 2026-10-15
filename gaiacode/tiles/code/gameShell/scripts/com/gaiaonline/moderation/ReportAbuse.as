package com.gaiaonline.moderation
{
   import com.gaiaonline.gsi.*;
   import flash.display.*;
   import flash.events.*;
   import flash.text.*;
   
   public class ReportAbuse extends EventDispatcher
   {
      
      private var userSid:String;
      
      private var roomName:String;
      
      private var accusedName:String;
      
      private var chatHistory:String;
      
      private var gameId:uint;
      
      private var reportType:int;
      
      private var comments:String;
      
      private var roomId:int;
      
      private var reporterName:String;
      
      private var _returnedReportId:Number;
      
      public function ReportAbuse(param1:Object)
      {
         super();
         userSid = param1.userSid;
         gameId = param1.gameId;
         accusedName = param1.accusedName;
         reportType = param1.reportType;
         roomName = param1.roomName;
         comments = param1.comments;
         chatHistory = param1.chatHistory;
         var _loc2_:GSIGateway = new GSIGateway(param1.subDomain);
         _loc2_.invoke(1001,userSid,reportType,gameId,accusedName,comments,chatHistory,roomName);
         _loc2_.addEventListener(GSIEvent.LOADED,onGsiLoaded);
         _loc2_.addEventListener(GSIEvent.ERROR,onGsiError);
      }
      
      private function onGsiLoaded(param1:GSIEvent) : void
      {
         dTrace("report successful! data:" + param1.gsiData);
         this._returnedReportId = Number(param1.gsiData);
         dispatchEvent(new Event(Event.COMPLETE));
      }
      
      public function get reportID() : Number
      {
         return this._returnedReportId;
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[ReportAbuse]",param1);
      }
      
      private function onGsiError(param1:GSIEvent) : void
      {
         var _loc2_:Object = param1.gsiData ? param1.gsiData.error : "UNKNOWN";
         dTrace("onGsiError, " + _loc2_);
         dispatchEvent(new Event("ERROR"));
      }
   }
}

