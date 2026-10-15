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
      
      public static function getInviteFriendUrl(initParams:Object) : String
      {
         var s:String = null;
         s = "http://" + getGsiServerSubdomain() + ".gaiaonline.com/games/";
         s += "?game=" + initParams.game;
         s += "&inviter=" + escape(initParams.userData.userName);
         if(initParams.serverData != null)
         {
            s += "&invite_server_ip=" + initParams.serverData.ip;
         }
         if(initParams.roomData != null)
         {
            s += "&invite_room_id=" + initParams.roomData.id + "&invite_room_name=" + escape(initParams.roomData.name);
            if(initParams.roomPassword != null)
            {
               s += "&invite_password=" + initParams.roomPassword;
            }
         }
         if(_additionalURLParams != "")
         {
            s += "&" + _additionalURLParams;
         }
         return s;
      }
      
      public static function getShellBaseUrl(mc:MovieClip) : String
      {
         var urlArr:Array = mc.loaderInfo.url.split("/");
         var baseUrl:String = "";
         for(var i:int = 0; i < urlArr.length - 1; i++)
         {
            baseUrl += urlArr[i] + "/";
         }
         trace("baseUrl:" + baseUrl);
         return baseUrl;
      }
      
      public static function setGsiServerSubdomain(s:String) : void
      {
         _gsiSubdomain = s;
      }
      
      public static function getGraphicsServerSubdomain() : String
      {
         return TheStage.getStage().loaderInfo.parameters.graphics_server == undefined ? DEFAULT_GFX_SUBDOMAIN : TheStage.getStage().loaderInfo.parameters.graphics_server;
      }
      
      public static function getURLRulesUrl() : String
      {
         return "http://" + getGsiServerSubdomain() + ".gaiaonline.com" + URL_RULES;
      }
      
      public static function getDomainUrl() : String
      {
         var domain:String = null;
         var stg:Stage = TheStage.getStage();
         var urlArr:Array = stg.loaderInfo.url.split("/");
         if(urlArr[2] != "")
         {
            domain = "http://" + urlArr[2];
         }
         return domain;
      }
      
      public static function getRegisterUrl() : String
      {
         var s:String = "http://" + getGsiServerSubdomain() + ".gaiaonline.com" + URL_REGISTER + "?ref=" + TheStage.getStage().loaderInfo.parameters.game;
         if(_additionalURLParams != "")
         {
            s += "&" + _additionalURLParams;
         }
         return s;
      }
      
      public static function isLocal() : Boolean
      {
         return getDomainUrl().indexOf("http") == -1;
      }
      
      public static function popUpRegistration() : void
      {
         var request:URLRequest = new URLRequest(getRegisterUrl());
         try
         {
            navigateToURL(request,"_new");
         }
         catch(e:Error)
         {
         }
      }
      
      public static function setAdditionalURLParams(params:String) : void
      {
         _additionalURLParams = params;
      }
      
      public static function getAvatarServerSubdomain() : String
      {
         return TheStage.getStage().loaderInfo.parameters.avatar_server == undefined ? DEFAULT_GFX_SUBDOMAIN : TheStage.getStage().loaderInfo.parameters.avatar_server;
      }
      
      public static function getExternalFlashVar(s:String) : String
      {
         return TheStage.getStage().loaderInfo.parameters[s];
      }
      
      public static function getTOS_URL() : String
      {
         return "http://" + getGsiServerSubdomain() + ".gaiaonline.com" + URL_TOS;
      }
      
      public static function getGsiServerSubdomain() : String
      {
         return TheStage.getStage().loaderInfo.parameters.gsiUrl == undefined ? _gsiSubdomain : TheStage.getStage().loaderInfo.parameters.gsiUrl;
      }
      
      public static function navigateToLogin() : void
      {
         var link:String = getDomainUrl();
         var request:URLRequest = new URLRequest("javascript:if(opener){ window.close(); opener.location=\'" + link + "\';} else location=\'" + link + "\';");
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

