package com.gaiaonline.utils.wordfilter
{
   import com.gaiaonline.gsi.GSIEvent;
   import com.gaiaonline.gsi.GSIGateway;
   import flash.events.Event;
   import flash.events.EventDispatcher;
   
   public class WordFilter extends EventDispatcher
   {
      
      private static var _instance:WordFilter;
      
      private static const GSI_FILTER_CALL:uint = 3004;
      
      private static var _dictionary:Array = null;
      
      private static var _requestPending:Boolean = false;
      
      public function WordFilter(param1:SingletonEnforcer)
      {
         super();
      }
      
      public static function clean(param1:String, param2:int) : String
      {
         if(param2 == 0 || !WordFilter._dictionary)
         {
            return param1;
         }
         var _loc3_:Array = WordFilter.getDictionary(param2);
         var _loc4_:int = int(_loc3_.length);
         var _loc5_:String = new String(param1);
         var _loc6_:int = 0;
         while(_loc6_ < _loc4_)
         {
            _loc5_ = _loc5_.replace(new RegExp(_loc3_[_loc6_].word,"gi"),_loc3_[_loc6_].replacement);
            _loc6_++;
         }
         return _loc5_;
      }
      
      public static function getInstance() : WordFilter
      {
         if(!WordFilter._instance)
         {
            _instance = new WordFilter(new SingletonEnforcer());
         }
         return _instance;
      }
      
      public static function getDictionary(param1:int) : Array
      {
         var _loc2_:int = 0;
         switch(param1)
         {
            case 1:
               _loc2_ = 0;
               break;
            case 4:
               _loc2_ = 1;
               break;
            case 9:
               _loc2_ = 2;
               break;
            default:
               _loc2_ = 0;
         }
         return WordFilter._dictionary[_loc2_] as Array;
      }
      
      public static function init(param1:String = "www") : void
      {
         var _loc2_:GSIGateway = null;
         var _loc3_:Event = null;
         if(!_requestPending && _dictionary == null)
         {
            _requestPending = true;
            _loc2_ = new GSIGateway();
            _loc2_.subdomain = param1;
            _loc2_.addEventListener(GSIEvent.LOADED,WordFilter.getInstance().onGSILoaded);
            _loc2_.invoke(WordFilter.GSI_FILTER_CALL);
         }
         if(_dictionary != null)
         {
            _loc3_ = new Event(Event.COMPLETE);
            WordFilter._instance.dispatchEvent(_loc3_);
         }
      }
      
      private function onGSILoaded(param1:GSIEvent) : void
      {
         var _loc3_:Array = null;
         var _loc4_:int = 0;
         var _loc5_:Array = null;
         var _loc8_:int = 0;
         if(!param1.gsiData)
         {
            return;
         }
         var _loc2_:int = int(param1.gsiData.length);
         _dictionary = new Array();
         var _loc6_:int = 1;
         while(_loc6_ < _loc2_)
         {
            _loc3_ = new Array();
            _loc4_ = int(param1.gsiData[_loc6_].length);
            _loc8_ = 0;
            while(_loc8_ < _loc4_)
            {
               _loc5_ = String(param1.gsiData[_loc6_][_loc8_]).split(",");
               _loc3_.push({
                  "word":_loc5_[0],
                  "replacement":_loc5_[1]
               });
               _loc8_++;
            }
            _dictionary.push(_loc3_);
            _loc6_++;
         }
         _requestPending = false;
         var _loc7_:Event = new Event(Event.COMPLETE);
         dispatchEvent(_loc7_);
      }
   }
}

class SingletonEnforcer
{
   
   public function SingletonEnforcer()
   {
      super();
   }
}
