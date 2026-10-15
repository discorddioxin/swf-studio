package com.gaiaonline.gameFramework.avatar
{
   import com.gaiaonline.gameFramework.util.*;
   import com.gaiaonline.gateway.GaiaChatMessage;
   import com.gaiaonline.gsi.*;
   import flash.display.*;
   import flash.events.*;
   import flash.net.*;
   import flash.system.LoaderContext;
   import flash.text.*;
   
   public class AvatarStation extends MovieClip
   {
      
      private const GSI_RETRIES:int = 5;
      
      public var wordBalloon:WordBalloon;
      
      private const AVATAR_RETRIES:int = 5;
      
      public var userData:Object;
      
      public var emptyFlag:Boolean = true;
      
      public var userNameTxt:TextField;
      
      private var loaderContext:LoaderContext;
      
      public var mcAvatarContainer:MovieClip;
      
      public var userName:String;
      
      private var isLoading:Boolean = false;
      
      private var loadAvatarFailed:int = 0;
      
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
      
      public function initStation(param1:Object) : void
      {
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
         emptyFlag = false;
         gotoAndStop("occupied");
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
      
      private function dTrace(param1:String) : void
      {
         trace("[AvatarStation]" + param1);
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
      
      public function speak(param1:GaiaChatMessage) : void
      {
         var _loc2_:String = param1.message;
         _loc2_ = _loc2_.replace(/\</g,"&lt;");
         _loc2_ = _loc2_.replace(/\>/g,"&gt;");
         wordBalloon.setText(_loc2_,param1.color);
      }
      
      public function isEmpty() : Boolean
      {
         return emptyFlag;
      }
      
      private function loadAvatar(param1:String) : void
      {
         var _loc2_:String = param1.split("_")[0];
         var _loc3_:String = UrlUtil.getAvatarServerSubdomain();
         var _loc4_:String = "http://" + _loc3_ + ".gaiaonline.com/gaia/members/" + _loc2_ + "_96x96.png";
         var _loc5_:Loader = new Loader();
         _loc5_.contentLoaderInfo.addEventListener(Event.INIT,onAvatarLoadInit);
         _loc5_.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR,onAvatarLoadError);
         _loc5_.load(new URLRequest(_loc4_),this.loaderContext);
         isLoading = true;
      }
      
      private function clearContainer() : void
      {
         var _loc1_:int = mcAvatarContainer.numChildren;
         var _loc2_:int = 0;
         while(_loc2_ < _loc1_)
         {
            mcAvatarContainer.removeChildAt(0);
            _loc2_++;
         }
      }
   }
}

