package com.gaiaonline.gameFramework.util
{
   import flash.display.*;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   
   public class UrlUtil
   {
      
      private static var _gsiSubdomain:String;
      
      private static const URL_REGISTER:String = "/register/flash";
      
      private static const URL_TOS:String = "/info/index.php?mode=tos";
      
      private static const URL_RULES:String = "/info/index.php?mode=rules";
      
      public static const DEFAULT_GFX_SUBDOMAIN:String = "avatar2";
      
      private static var _additionalURLParams:String = "";
      
      public function UrlUtil()
      {
         super();
      }
      
      public static function getInviteFriendUrl(param1:Object) : String
      {
         var _loc2_:String = null;
         _loc2_ = "http://" + getGsiServerSubdomain() + ".gaiaonline.com/games/";
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
      
      public static function getShellBaseUrl(param1:MovieClip) : String
      {
         var _loc2_:Array = null;
         var _loc3_:String = null;
         var _loc4_:int = 0;
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
      
      public static function setGsiServerSubdomain(param1:String) : void
      {
         _gsiSubdomain = param1;
      }
      
      public static function getGraphicsServerSubdomain() : String
      {
         var _loc1_:String = null;
         return TheStage.getStage().loaderInfo.parameters.graphics_server == undefined ? DEFAULT_GFX_SUBDOMAIN : TheStage.getStage().loaderInfo.parameters.graphics_server;
      }
      
      public static function getURLRulesUrl() : String
      {
         return "http://" + getGsiServerSubdomain() + ".gaiaonline.com" + URL_RULES;
      }
      
      public static function getDomainUrl() : String
      {
         var _loc1_:Stage = null;
         var _loc2_:Array = null;
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
         _loc1_ = "http://" + getGsiServerSubdomain() + ".gaiaonline.com" + URL_REGISTER + "?ref=" + TheStage.getStage().loaderInfo.parameters.game;
         if(_additionalURLParams != "")
         {
            _loc1_ += "&" + _additionalURLParams;
         }
         return _loc1_;
      }
      
      public static function isLocal() : Boolean
      {
         return getDomainUrl().indexOf("http") == -1;
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
      
      public static function setAdditionalURLParams(param1:String) : void
      {
         _additionalURLParams = param1;
      }
      
      public static function getAvatarServerSubdomain() : String
      {
         var _loc1_:String = null;
         return TheStage.getStage().loaderInfo.parameters.avatar_server == undefined ? DEFAULT_GFX_SUBDOMAIN : TheStage.getStage().loaderInfo.parameters.avatar_server;
      }
      
      public static function getExternalFlashVar(param1:String) : String
      {
         return TheStage.getStage().loaderInfo.parameters[param1];
      }
      
      public static function getTOS_URL() : String
      {
         return "http://" + getGsiServerSubdomain() + ".gaiaonline.com" + URL_TOS;
      }
      
      public static function getGsiServerSubdomain() : String
      {
         var _loc1_:String = null;
         return TheStage.getStage().loaderInfo.parameters.gsiUrl == undefined ? _gsiSubdomain : TheStage.getStage().loaderInfo.parameters.gsiUrl;
      }
      
      public static function navigateToLogin() : void
      {
         var link:String = null;
         var request:URLRequest = null;
         link = getDomainUrl();
         request = new URLRequest("javascript:if(opener){ window.close(); opener.location=\'" + link + "\';} else location=\'" + link + "\';");
         try
         {
            navigateToURL(request,"_parent");
         }
         catch(e:Error)
         {
         }
      }
   }
}

