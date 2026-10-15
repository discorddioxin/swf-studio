package com.gaiaonline.utils
{
   import flash.system.Capabilities;
   
   public class FlashVersion
   {
      
      private static var _instance:FlashVersion = null;
      
      private var _revision:uint = 0;
      
      private var _build:uint = 0;
      
      private var _minor:uint = 0;
      
      private var _major:uint = 0;
      
      public function FlashVersion(param1:SingletonEnforcer)
      {
         super();
         if(param1 == null)
         {
            throw "don\'t allocate me directly, call getInstance";
         }
         var _loc2_:Array = Capabilities.version.split(" ")[1].split(",");
         _major = uint(_loc2_[0]);
         _minor = uint(_loc2_[1]);
         _revision = uint(_loc2_[2]);
         _build = uint(_loc2_[3]);
      }
      
      public static function getInstance() : FlashVersion
      {
         if(!_instance)
         {
            _instance = new FlashVersion(new SingletonEnforcer());
         }
         return _instance;
      }
      
      public function get build() : uint
      {
         return _build;
      }
      
      public function get minor() : uint
      {
         return _minor;
      }
      
      public function get major() : uint
      {
         return _major;
      }
      
      public function get revision() : uint
      {
         return _revision;
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
