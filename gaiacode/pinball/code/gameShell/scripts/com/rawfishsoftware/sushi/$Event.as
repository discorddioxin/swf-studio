package com.rawfishsoftware.sushi
{
   public class $Event
   {
      
      private var callback:Function = null;
      
      private var object:String;
      
      private var hasListeners:Boolean = false;
      
      private var sushi:Object;
      
      private var event:String;
      
      private var scope:Object = null;
      
      private var listeners:Array = [];
      
      public function $Event(param1:Object, param2:String, param3:String = "")
      {
         super();
         event = param2;
         if(param3)
         {
            object = param3;
         }
         sushi = param1;
      }
      
      public function removeAllListeners() : void
      {
         listeners = [];
         hasListeners = false;
      }
      
      public function setCallback(param1:Function, param2:Object) : void
      {
         this.callback = param1;
         this.scope = param2;
      }
      
      public function $call(... rest) : void
      {
         var _loc2_:* = undefined;
         var _loc3_:* = undefined;
         var _loc4_:* = undefined;
         if(!rest || !rest.length)
         {
            return;
         }
         if(Boolean(sushi) && Boolean(object) && Boolean(sushi[object]) && Boolean(sushi[object].list) && Boolean(sushi[object].list["_" + rest[0]]) && Boolean(sushi[object].list["_" + rest[0]].$class))
         {
            _loc2_ = sushi[object].list["_" + rest[0]].$class;
            _loc2_[event].apply(_loc2_,rest);
         }
         if(Boolean(callback))
         {
            callback.apply(scope,rest);
         }
         if(hasListeners)
         {
            _loc4_ = listeners;
            for(_loc3_ in _loc4_)
            {
               _loc2_ = _loc4_[_loc3_];
               _loc2_[event].apply(_loc2_,rest);
            }
         }
      }
      
      public function addListener(param1:Object) : void
      {
         removeListener(param1);
         listeners.push(param1);
         hasListeners = true;
      }
      
      public function removeListener(param1:Object) : Boolean
      {
         var _loc2_:Array = listeners;
         var _loc3_:* = int(_loc2_.length);
         while(_loc3_--)
         {
            if(_loc2_[_loc3_] == param1)
            {
               _loc2_.splice(_loc3_,1);
               if(!_loc2_.length)
               {
                  hasListeners = false;
               }
               return true;
            }
         }
         return false;
      }
      
      public function clearCallback() : void
      {
         callback = null;
         scope = null;
      }
   }
}

