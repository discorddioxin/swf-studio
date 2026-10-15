package com.gaiaworld.towns.collectables.trash.view
{
   import com.gaiaworld.towns.collectables.bugs.interfaces.IMarker;
   import com.gaiaworld.towns.collectables.constants.MarkerConstants;
   import flash.display.Sprite;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol3")]
   public class TrashMarker extends Sprite implements IMarker
   {
      
      public function TrashMarker()
      {
         super();
      }
      
      public function get clip() : Sprite
      {
         return this as Sprite;
      }
      
      public function get type() : String
      {
         return MarkerConstants.TRASH;
      }
   }
}

