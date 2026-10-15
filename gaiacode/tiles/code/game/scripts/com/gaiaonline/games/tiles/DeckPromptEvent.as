package com.gaiaonline.games.tiles
{
   import flash.events.Event;
   
   public class DeckPromptEvent extends Event
   {
      
      public static const SELECT:String = "select";
      
      public var index:int;
      
      public var _hackDeckXML:Object;
      
      public var isMovieClip:Boolean;
      
      public var url:String;
      
      public function DeckPromptEvent(_index:int, _url:String, _ismc:Boolean)
      {
         super(SELECT,false,false);
         index = _index;
         url = _url;
         isMovieClip = _ismc;
      }
   }
}

