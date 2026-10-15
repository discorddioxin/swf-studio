package com.gaiaworld.global.view.panels
{
   import com.gaiaworld.global.constants.GlobalConstants;
   import com.gaiaworld.global.controller.GlobalController;
   import com.gaiaworld.global.model.GlobalModel;
   import com.gaiaworld.global.sounds.BgSound;
   import com.gaiaworld.global.util.StringFunctions;
   import com.gaiaworld.house.model.HousingModel;
   import com.gaiaworld.pets.model.PetModel;
   import com.gaiaworld.user.constants.UserConstants;
   import com.gaiaworld.user.model.UserModel;
   import com.gaiaworld.user.services.NonPalDataLoader;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol816")]
   public class TownsUserInfo extends Sprite
   {
      
      public var btnAudio:MovieClip;
      
      public var goldText:TextField;
      
      public var gstIcon:MovieClip;
      
      public var locationText:TextField;
      
      public var petName:TextField;
      
      public var timeText:TextField;
      
      public var userText:TextField;
      
      private var userModel:UserModel = UserModel.getInstance();
      
      private var globalController:GlobalController = new GlobalController();
      
      private var globalModel:GlobalModel = GlobalModel.getInstance();
      
      private var bgSound:BgSound = BgSound.getInstance();
      
      private var housingModel:HousingModel = HousingModel.getInstance();
      
      private var nonPal:NonPalDataLoader;
      
      private var petModel:PetModel = PetModel.getInstance();
      
      public function TownsUserInfo()
      {
         super();
         this.tabChildren = false;
         this.btnAudio.focusRect = false;
         this.btnAudio.tabEnabled = false;
         this.btnAudio.buttonMode = true;
         this.btnAudio.useHandCursor = true;
         this.userModel.addEventListener(UserConstants.USER_GOLD_SET,this.userGoldSet);
         this.userModel.addEventListener(UserConstants.USER_DATA_SET,this.userDataSet);
         this.btnAudio.addEventListener(MouseEvent.MOUSE_DOWN,this.toggleSound);
         this.globalModel.addEventListener(GlobalConstants.HIDE_USER_BAR,this.hideUserBar);
         this.globalModel.addEventListener(GlobalConstants.SHOW_USER_BAR,this.showUserBar);
         this.globalModel.addEventListener(GlobalConstants.GAIA_TIME_UPDATED,this.timeUpdated);
         this.globalModel.addEventListener(GlobalConstants.SHOW_HOUSE_NAME,this.showHouseName);
         this.globalModel.addEventListener(GlobalConstants.HIDE_HOUSE_NAME,this.hideHouseName);
         this.globalModel.addEventListener(GlobalConstants.LOCATION_TEXT_CHANGED,this.showLocation);
      }
      
      private function justEquppied(param1:Event) : void
      {
      }
      
      private function myPetSet(param1:Event) : void
      {
      }
      
      private function showUserBar(param1:Event) : void
      {
         this.visible = true;
      }
      
      private function hideUserBar(param1:Event) : void
      {
         this.visible = false;
      }
      
      private function userGoldSet(param1:Event) : void
      {
         var _loc2_:String = StringFunctions.addCommas(this.userModel.gold);
         this.goldText.text = _loc2_ + " " + this.userModel.currency;
      }
      
      private function showHouseName(param1:Event) : void
      {
         this.nonPal = new NonPalDataLoader();
         this.nonPal.addEventListener(NonPalDataLoader.NON_PALS_DONE,this.nonPalDone);
         this.nonPal.getUserInfo(this.housingModel.house_id);
      }
      
      private function nonPalDone(param1:Event) : void
      {
         this.nonPal.removeEventListener(NonPalDataLoader.NON_PALS_DONE,this.nonPalDone);
         this.locationText.text = this.nonPal.palVo.userName + "\'s home";
      }
      
      private function hideHouseName(param1:Event) : *
      {
         this.locationText.text = "";
      }
      
      private function showLocation(param1:Event) : *
      {
         this.locationText.text = this.globalModel.location;
      }
      
      private function userDataSet(param1:Event) : void
      {
         this.userModel.removeEventListener(UserConstants.USER_DATA_SET,this.userDataSet);
         this.userText.text = this.userModel.userVo.userName;
      }
      
      private function toggleSound(param1:MouseEvent) : *
      {
         this.bgSound.toggleSound();
         if(this.bgSound.mute == true)
         {
            this.btnAudio.gotoAndStop(2);
         }
         else
         {
            this.btnAudio.gotoAndStop(1);
         }
      }
      
      private function timeUpdated(param1:Event) : *
      {
         this.timeText.text = this.globalModel.gaiaTime;
         var _loc2_:Number = this.globalModel.dayIcon + 1;
         this.gstIcon.gotoAndStop(_loc2_);
      }
   }
}

