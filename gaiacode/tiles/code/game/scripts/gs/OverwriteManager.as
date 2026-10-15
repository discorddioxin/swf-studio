package gs
{
   import flash.errors.*;
   import flash.utils.*;
   
   public class OverwriteManager
   {
      
      public static var mode:int;
      
      public static var enabled:Boolean;
      
      public static const version:Number = 0.95;
      
      public static const NONE:int = 0;
      
      public static const ALL:int = 1;
      
      public static const AUTO:int = 2;
      
      public static const CONCURRENT:int = 3;
      
      public function OverwriteManager()
      {
         super();
      }
      
      public static function killVars($killVars:Object, $vars:Object, $tweens:Array, $subTweens:Array, $filters:Array) : void
      {
         var p:String = null;
         for(var i:* = int($subTweens.length - 1); i > -1; i--)
         {
            if($killVars[$subTweens[i].name] != undefined)
            {
               $subTweens.splice(i,1);
            }
         }
         for(i = int($tweens.length - 1); i > -1; i--)
         {
            if($killVars[$tweens[i].name] != undefined)
            {
               $tweens.splice(i,1);
            }
         }
         for(i = int($filters.length - 1); i > -1; i--)
         {
            if($killVars[$filters[i].name] != undefined)
            {
               $filters.splice(i,1);
            }
         }
         for(p in $killVars)
         {
            delete $vars[p];
         }
      }
      
      public static function manageOverwrites($instance:TweenLite, $objTweens:Dictionary) : void
      {
         var tw:Object = null;
         var v:Object = null;
         var p:String = null;
         var vars:Object = $instance.vars;
         var m:int = vars.overwrite == undefined ? mode : int(vars.overwrite);
         if(m < 2)
         {
            return;
         }
         var startTime:Number = $instance.startTime;
         if(m == AUTO)
         {
            if(vars.isTV == true)
            {
               vars = vars.exposedProps;
            }
            v = {};
            for(p in vars)
            {
               if(!(p == "ease" || p == "delay" || p == "overwrite" || p == "onComplete" || p == "onCompleteParams" || p == "runBackwards" || p == "persist" || p == "onUpdate" || p == "onUpdateParams" || p == "timeScale" || p == "onStart" || p == "onStartParams" || p == "renderOnStart" || p == "proxiedEase" || p == "easeParams" || p == "onCompleteAll" || p == "onCompleteAllParams" || p == "yoyo" || p == "loop"))
               {
                  v[p] = 1;
               }
            }
            for each(tw in $objTweens)
            {
               if(tw.startTime <= startTime && tw != $instance)
               {
                  tw.killVars(v);
               }
            }
         }
         else
         {
            for each(tw in $objTweens)
            {
               if(tw.startTime <= startTime && tw != $instance)
               {
                  $objTweens[tw] = null;
                  delete $objTweens[tw];
               }
            }
         }
      }
      
      public static function init($mode:int = 2) : int
      {
         if(TweenLite.version < 8.12)
         {
            trace("TweenLite warning: Your TweenLite class needs to be updated to work with OverwriteManager (or you may need to clear your ASO files). Please download and install the latest version from http://www.tweenlite.com.");
         }
         TweenLite.overwriteManager = OverwriteManager;
         mode = $mode;
         enabled = true;
         return mode;
      }
   }
}

