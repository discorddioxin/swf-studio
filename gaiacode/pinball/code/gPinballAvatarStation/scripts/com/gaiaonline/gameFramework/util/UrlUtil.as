package com.gaiaonline.gameFramework.util
{
   import flash.display.*;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   
   public class UrlUtil
   {
      
      private static var _gsiSubdomain:String;
      
      public static const URL_REGISTER:String = "http://www.gaiaonline.com/register/flash";
      
      public static const URL_TOS:String = "http://www.gaiaonline.com/info/index.php?mode=tos";
      
      public static const URL_RULES:String = "http://www.gaiaonline.com/info/index.php?mode=rules";
      
      public static const DEFAULT_GFX_SUBDOMAIN:String = "avatar2";
      
      private static var _additionalURLParams:String = "";
      
      public function UrlUtil()
      {
         super();
      }
      
      public static function isLocal() : Boolean
      {
         return getDomainUrl().indexOf("http") == -1;
      }
      
      public static function getShellBaseUrl(param1:MovieClip) : *
      {
         var _loc2_:* = undefined;
         var _loc3_:* = undefined;
         var _loc4_:* = undefined;
         _loc2_ = param1.loaderInfo.url.split("/");
         _loc3_ = "";
         _loc4_ = 0;
         while(_loc4_ < _loc2_.length - 1)
         {
            _loc3_ += _loc2_[_loc4_] + "/";
            _loc4_++;
         }
         trace("baseUrl:" + _loc3_);
         return _loc3_;
      }
      
      public static function getExternalFlashVar(param1:String) : String
      {
         return TheStage.getStage().loaderInfo.parameters[param1];
      }
      
      public static function getInviteFriendUrl(param1:*) : String
      {
         var _loc2_:String = null;
         if(TheStage.getStage().loaderInfo.parameters.invite_friend_url)
         {
            _loc2_ = TheStage.getStage().loaderInfo.parameters.invite_friend_url;
         }
         else
         {
            _loc2_ = "http://" + _gsiSubdomain + ".gaiaonline.com/games/";
         }
         _loc2_ += "?game=" + param1.game;
         _loc2_ += "&inviter=" + escape(param1.userData.userName);
         if(param1.serverData != null)
         {
            _loc2_ += "&invite_server_ip=" + param1.serverData.ip;
         }
         if(param1.roomData != null)
         {
            _loc2_ += "&invite_room_id=" + param1.roomData.id + "&invite_room_name=" + escape(param1.roomData.name);
            if(param1.roomPassword != null)
            {
               _loc2_ += "&invite_password=" + param1.roomPassword;
            }
         }
         if(_additionalURLParams != "")
         {
            _loc2_ += "&" + _additionalURLParams;
         }
         return _loc2_;
      }
      
      public static function getAvatarServerSubdomain() : String
      {
         var _loc1_:String = null;
         return TheStage.getStage().loaderInfo.parameters.avatar_server == undefined ? DEFAULT_GFX_SUBDOMAIN : TheStage.getStage().loaderInfo.parameters.avatar_server;
      }
      
      public static function popUpRegistration() : void
      {
         var request:URLRequest = null;
         request = new URLRequest(getRegisterUrl());
         try
         {
            navigateToURL(request,"_new");
         }
         catch(e:Error)
         {
         }
      }
      
      public static function getDomainUrl() : *
      {
         var _loc1_:Stage = null;
         var _loc2_:* = undefined;
         var _loc3_:String = null;
         _loc1_ = TheStage.getStage();
         _loc2_ = _loc1_.loaderInfo.url.split("/");
         if(_loc2_[2] != "")
         {
            _loc3_ = "http://" + _loc2_[2];
         }
         return _loc3_;
      }
      
      public static function getRegisterUrl() : String
      {
         var _loc1_:String = null;
         _loc1_ = URL_REGISTER + "?ref=" + TheStage.getStage().loaderInfo.parameters.game;
         if(_additionalURLParams != "")
         {
            _loc1_ += "&" + _additionalURLParams;
         }
         return _loc1_;
      }
      
      public static function getGraphicsServerSubdomain() : String
      {
         var _loc1_:String = null;
         return TheStage.getStage().loaderInfo.parameters.graphics_server == undefined ? DEFAULT_GFX_SUBDOMAIN : TheStage.getStage().loaderInfo.parameters.graphics_server;
      }
      
      public static function getGsiServerSubdomain() : String
      {
         var _loc1_:String = null;
         return TheStage.getStage().loaderInfo.parameters.gsi_server == undefined ? _gsiSubdomain : TheStage.getStage().loaderInfo.parameters.gsi_server;
      }
      
      public static function setAdditionalURLParams(param1:String) : *
      {
         _additionalURLParams = param1;
      }
      
      public static function setGsiServerSubdomain(param1:String) : void
      {
         _gsiSubdomain = param1;
      }
   }
}

