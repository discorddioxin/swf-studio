package com.gaiaonline.gameFramework.ui
{
   import com.gaiaonline.gameFramework.text.*;
   import flash.display.*;
   import flash.events.*;
   import flash.text.*;
   import flash.utils.*;
   
   public class GaiaButton extends MovieClip
   {
      
      private var asset:IGaiaButtonAsset = null;
      
      private var textContentManager:TextContentManager;
      
      public var label_txt:TextField;
      
      public function GaiaButton(param1:IGaiaButtonAsset = null, param2:String = null)
      {
         var _loc3_:String = null;
         var _loc4_:String = null;
         var _loc5_:String = null;
         textContentManager = TextContentManager.getInstance();
         super();
         if(param1)
         {
            label_txt = param1.label_txt;
            this.asset = param1;
            addChild(param1 as DisplayObject);
         }
         if(param1)
         {
            (param1 as Sprite).buttonMode = true;
         }
         else
         {
            this.buttonMode = true;
         }
         if(param2)
         {
            label_txt.text = param2;
         }
         else
         {
            _loc3_ = this.name;
            _loc4_ = _loc3_.split("_")[0] + "Btn";
            if(textContentManager.hasEntry(_loc4_))
            {
               _loc5_ = textContentManager.getText(_loc4_);
            }
            else
            {
               _loc5_ = getQualifiedClassName(this);
            }
            label_txt.text = _loc5_;
         }
         label_txt.mouseEnabled = false;
      }
      
      private function dTrace(param1:String) : void
      {
         var _loc2_:String = "[GaiaButton]";
         trace(_loc2_ + param1);
      }
      
      override public function set enabled(param1:Boolean) : void
      {
         var _loc2_:int = 0;
         var _loc5_:SimpleButton = null;
         super.enabled = param1;
         var _loc3_:DisplayObjectContainer = asset as DisplayObjectContainer;
         if(asset)
         {
            _loc3_.alpha = param1 ? 1 : 0.6;
            _loc2_ = _loc3_.numChildren;
         }
         else
         {
            this.alpha = param1 ? 1 : 0.6;
            _loc2_ = this.numChildren;
         }
         var _loc4_:int = 0;
         for(; _loc4_ < _loc2_; _loc4_++)
         {
            if(asset)
            {
               if(!(_loc3_.getChildAt(_loc4_) is SimpleButton))
               {
                  continue;
               }
               _loc5_ = _loc3_.getChildAt(_loc4_) as SimpleButton;
            }
            else
            {
               if(!(this.getChildAt(_loc4_) is SimpleButton))
               {
                  continue;
               }
               _loc5_ = this.getChildAt(_loc4_) as SimpleButton;
            }
            _loc5_.enabled = param1;
         }
      }
   }
}

