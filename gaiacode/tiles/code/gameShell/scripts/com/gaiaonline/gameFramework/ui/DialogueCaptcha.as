package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.events.CaptchaEvent;
   import com.gaiaonline.gameFramework.util.UrlUtil;
   import com.gaiaonline.gsi.GSIEvent;
   import com.gaiaonline.gsi.GSIGateway;
   import com.gaiaonline.serializers.SushiSerializer;
   import flash.display.InteractiveObject;
   import flash.display.Loader;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.IOErrorEvent;
   import flash.events.MouseEvent;
   import flash.net.URLRequest;
   import flash.text.TextField;
   import flash.text.TextFieldAutoSize;
   import flash.text.TextFieldType;
   
   public class DialogueCaptcha extends Dialogue
   {
      
      private static const PADDING_HORZ:uint = 9;
      
      private static const PADDING_VERT:uint = 8;
      
      private static const START_Y:uint = 45;
      
      private static const CAPTCHA_Y:uint = 78;
      
      private static const CAPTCHA_WIDTH:uint = 300;
      
      private static const CAPTCHA_HEIGHT:uint = 57;
      
      private static const CAPTCHA_BORDER_WIDTH:uint = 1;
      
      private var _input:TextField;
      
      private var _loader:Loader = null;
      
      public function DialogueCaptcha()
      {
         super();
         super.setEnterClickedFunction(onSubmit);
      }
      
      private static function addWeakListener(param1:EventDispatcher, param2:String, param3:Function) : void
      {
         param1.addEventListener(param2,param3,false,0,true);
      }
      
      private function onIOError(param1:Event) : void
      {
         dispatchEvent(new CaptchaEvent(CaptchaEvent.ERROR,"IO error"));
      }
      
      private function onCaptchaImageRetrieved(param1:GSIEvent) : void
      {
         _loader = new Loader();
         _loader.load(new URLRequest(String(param1.gsiData)));
         _loader.x = PADDING_HORZ + CAPTCHA_BORDER_WIDTH;
         _loader.y = CAPTCHA_Y + CAPTCHA_BORDER_WIDTH;
         addChildToDialog(_loader);
      }
      
      private function onGSIError(param1:GSIEvent) : void
      {
         dispatchEvent(new CaptchaEvent(CaptchaEvent.ERROR,"GSI error"));
      }
      
      private function requestCaptchaImage() : void
      {
         if(_loader)
         {
            removeChildFromDialog(_loader);
            _loader = null;
         }
         var _loc1_:GSIGateway = new GSIGateway(UrlUtil.getGsiServerSubdomain());
         _loc1_.addEventListener(GSIEvent.LOADED,onCaptchaImageRetrieved);
         _loc1_.addEventListener(GSIEvent.ERROR,onGSIError);
         _loc1_.addEventListener(IOErrorEvent.IO_ERROR,onIOError);
         _loc1_.serializerClass = SushiSerializer;
         _loc1_.invoke(3009,"flowerJong");
      }
      
      private function deferredSetFocus(param1:Event) : void
      {
         var _loc2_:InteractiveObject = InteractiveObject(param1.target);
         _loc2_.stage.focus = _loc2_;
         _loc2_.removeEventListener(Event.ADDED_TO_STAGE,deferredSetFocus);
      }
      
      private function onSubmit(param1:Event) : void
      {
         if(_input.text.length > 0)
         {
            dispatchEvent(new CaptchaEvent(CaptchaEvent.SUBMIT,_input.text));
            close();
         }
      }
      
      override protected function drawUI() : void
      {
         super.drawUI();
         titleTxt.text = "User Verification";
         dialogBG.width = PADDING_HORZ * 2 + CAPTCHA_WIDTH;
         var _loc1_:TextField = new TextField();
         _loc1_.text = "Enter the words in the image below separated by spaces:";
         _loc1_.autoSize = TextFieldAutoSize.LEFT;
         _loc1_.x = PADDING_HORZ;
         _loc1_.y = START_Y;
         addChildToDialog(_loc1_);
         var _loc2_:GaiaButton = new GaiaButton(new DialogButtonAsset(),"Submit");
         _loc2_.x = dialogBG.width - _loc2_.width - PADDING_HORZ;
         _loc2_.y = 196;
         addWeakListener(_loc2_,MouseEvent.CLICK,onSubmit);
         var _loc3_:GaiaButton = new GaiaButton(new DialogButtonAsset(),"Refresh");
         _loc3_.x = PADDING_HORZ;
         _loc3_.y = _loc2_.y;
         addWeakListener(_loc3_,MouseEvent.CLICK,onRefresh);
         addChildToDialog(_loc2_);
         addChildToDialog(_loc3_);
         _loc1_ = new TextField();
         _loc1_.text = "Text: ";
         _loc1_.autoSize = TextFieldAutoSize.LEFT;
         _loc1_.x = PADDING_HORZ;
         _loc1_.y = 152;
         addChildToDialog(_loc1_);
         _input = new TextField();
         _input.type = TextFieldType.INPUT;
         _input.border = true;
         _input.x = _loc1_.x + _loc1_.width + PADDING_HORZ;
         _input.y = _loc1_.y;
         _input.width = dialogBG.width - _input.x - PADDING_HORZ;
         _input.height = _loc1_.height;
         _input.background = true;
         addWeakListener(_input,Event.ADDED_TO_STAGE,deferredSetFocus);
         addChildToDialog(_input);
         var _loc4_:Sprite = new Sprite();
         _loc4_.graphics.clear();
         _loc4_.graphics.lineStyle(1,0);
         _loc4_.graphics.beginFill(16777215);
         _loc4_.graphics.drawRect(0,0,CAPTCHA_WIDTH + CAPTCHA_BORDER_WIDTH,CAPTCHA_HEIGHT + CAPTCHA_BORDER_WIDTH);
         _loc4_.x = PADDING_HORZ;
         _loc4_.y = CAPTCHA_Y;
         addChildToDialog(_loc4_);
         requestCaptchaImage();
      }
      
      private function onRefresh(param1:Event) : void
      {
         requestCaptchaImage();
      }
   }
}

