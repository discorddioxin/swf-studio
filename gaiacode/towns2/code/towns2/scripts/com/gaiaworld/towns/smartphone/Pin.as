package com.gaiaworld.towns.smartphone
{
   import com.gaiaworld.room.interfaces.IAnimatedObject;
   import com.gaiaworld.room.interfaces.ISurfaceObject;
   import com.gaiaworld.room.view.AnimatedObject;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol129")]
   public class Pin extends AnimatedObject implements IAnimatedObject, ISurfaceObject
   {
      
      public function Pin()
      {
         super();
      }
      
      override public function get depth2() : Number
      {
         return this.y;
      }
   }
}

