package com.gaiaworld.house.interfaces
{
   import flash.display.Bitmap;
   import flash.display.BitmapData;
   import flash.display.MovieClip;
   import flash.display.Sprite;
   
   public interface IFurniture
   {
      
      function setRotation(param1:Number) : void;
      
      function getH() : Number;
      
      function getW() : Number;
      
      function getL() : Number;
      
      function getR() : Number;
      
      function getObj() : MovieClip;
      
      function getCanStackOn() : Boolean;
      
      function getIsStackable() : Boolean;
      
      function getCanSitOn() : Boolean;
      
      function getType() : String;
      
      function getHitBox() : MovieClip;
      
      function getSpecialAction() : String;
      
      function doSpecial(param1:String) : void;
      
      function doBitmapDataAction(param1:BitmapData) : void;
      
      function doBitmapAction(param1:Bitmap) : void;
      
      function doSpriteAction(param1:Sprite) : void;
      
      function setCallback(param1:Function) : void;
      
      function setEditMode(param1:Boolean) : void;
   }
}

