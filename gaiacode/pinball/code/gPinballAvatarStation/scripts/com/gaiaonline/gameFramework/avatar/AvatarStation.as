package com.gaiaonline.gameFramework.avatar
{
   import com.gaiaonline.gameFramework.util.*;
   import com.gaiaonline.gateway.GaiaChatMessage;
   import com.gaiaonline.gsi.*;
   import com.gaiaonline.serializers.PHPSerializer;
   import flash.display.*;
   import flash.events.*;
   import flash.net.*;
   import flash.system.LoaderContext;
   import flash.text.*;
   
   public class AvatarStation extends MovieClip
   {
      
      private var loadAvatarFailed:int = 0;
      
      public var userData:Object;
      
      private var loaderContext:LoaderContext;
      
      private const AVATAR_RETRIES:int = 5;
      
      public var emptyFlag:Boolean = true;
      
      public var userNameTxt:TextField;
      
      public var mcAvatarContainer:MovieClip;
      
      public var wordBalloon:WordBalloon;
      
      private var isLoading:Boolean = false;
      
      private const GSI_RETRIES:int = 5;
      
      public var userName:String;
      
      public function AvatarStation()
      {
         super();
         userNameTxt.text = "";
         this.loaderContext = new LoaderContext();
         this.loaderContext.checkPolicyFile = true;
      }
      
      public function setWordBalloon(param1:WordBalloon) : void
      {
         wordBalloon = param1;
         addChild(wordBalloon);
      }
      
      public function isEmpty() : Boolean
      {
         return emptyFlag;
      }
      
      private function dTrace(param1:String) : void
      {
         trace("[AvatarStation]" + param1);
      }
      
      private function onAvatarLoadInit(param1:Event) : void
      {
         if(isLoading)
         {
            clearContainer();
            mcAvatarContainer.addChild(param1.target.content);
            isLoading = false;
         }
         this.loadAvatarFailed = 0;
      }
      
      private function userInfoError(param1:GSIEvent) : void
      {
         dTrace("userInfoError:" + param1.gsiData);
      }
      
      public function initStation(param1:Object) : void
      {
         var _loc2_:* = undefined;
         dTrace("initStation()");
         isLoading = false;
         userData = param1.userData;
         userName = userData.userName;
         if(userName != null)
         {
            userNameTxt.text = userName;
         }
         if(userData.avatar != null)
         {
            dTrace("   Good Avatar, " + userData.avatar);
            loadAvatar(userData.avatar);
         }
         else
         {
            _loc2_ = new GSIGateway(UrlUtil.getGsiServerSubdomain());
            _loc2_.serializerClass = PHPSerializer;
            _loc2_.retries = GSI_RETRIES;
            _loc2_.invoke(102,userData.gid);
            _loc2_.addEventListener(GSIEvent.LOADED,userInfoComplete);
            _loc2_.addEventListener(GSIEvent.ERROR,userInfoError);
         }
         emptyFlag = false;
         gotoAndStop("occupied");
      }
      
      private function onAvatarLoadError(param1:Event) : void
      {
         dTrace("onAvatarLoadError()");
         isLoading = false;
         if(++this.loadAvatarFailed < AVATAR_RETRIES)
         {
            dTrace("Reloading Avatar: " + this.userName);
            loadAvatar(userData.avatar);
         }
      }
      
      private function userInfoComplete(param1:GSIEvent) : void
      {
         dTrace("userInfoComplete(), " + userData.avatar);
         userData.avatar = param1.gsiData.avatar;
         loadAvatar(userData.avatar);
      }
      
      public function clear() : void
      {
         clearContainer();
         isLoading = false;
         emptyFlag = true;
         userNameTxt.text = "";
         if(wordBalloon != null)
         {
            wordBalloon.visible = false;
         }
         gotoAndStop("empty");
      }
      
      private function clearContainer() : void
      {
         var _loc1_:int = 0;
         var _loc2_:int = 0;
         _loc1_ = mcAvatarContainer.numChildren;
         _loc2_ = 0;
         while(_loc2_ < _loc1_)
         {
            mcAvatarContainer.removeChildAt(0);
            _loc2_++;
         }
      }
      
      public function speak(param1:GaiaChatMessage) : void
      {
         var _loc2_:String = null;
         _loc2_ = param1.message;
         _loc2_ = _loc2_.replace(/\</g,"&lt;");
         _loc2_ = _loc2_.replace(/\>/g,"&gt;");
         wordBalloon.setText(_loc2_,param1.color);
      }
      
      private function loadAvatar(param1:String) : void
      {
         var _loc2_:String = null;
         var _loc3_:String = null;
         var _loc4_:String = null;
         var _loc5_:Loader = null;
         _loc2_ = param1.split("_")[0];
         _loc3_ = UrlUtil.getAvatarServerSubdomain();
         _loc4_ = "http://" + _loc3_ + ".gaiaonline.com/gaia/members/" + _loc2_ + "_96x96.png";
         _loc5_ = new Loader();
         _loc5_.contentLoaderInfo.addEventListener(Event.INIT,onAvatarLoadInit);
         _loc5_.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,onAvatarLoadError);
         _loc5_.load(new URLRequest(_loc4_),this.loaderContext);
         isLoading = true;
      }
   }
}

