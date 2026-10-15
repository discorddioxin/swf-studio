package gs
{
   import flash.events.Event;
   import flash.events.EventDispatcher;
   import flash.events.IEventDispatcher;
   import flash.utils.*;
   import gs.events.TweenEvent;
   
   public class TweenMax extends TweenFilterLite implements IEventDispatcher
   {
      
      public static var version:Number = 2.13;
      
      protected static const _RAD2DEG:Number = 180 / Math.PI;
      
      private static var _overwriteMode:int = OverwriteManager.enabled ? OverwriteManager.mode : OverwriteManager.init();
      
      public static var killTweensOf:Function = TweenLite.killTweensOf;
      
      public static var killDelayedCallsTo:Function = TweenLite.killDelayedCallsTo;
      
      public static var removeTween:Function = TweenLite.removeTween;
      
      public static var defaultEase:Function = TweenLite.defaultEase;
      
      protected var _dispatcher:EventDispatcher;
      
      protected var _callbacks:Object;
      
      protected var _pauseTime:int;
      
      public function TweenMax($target:Object, $duration:Number, $vars:Object)
      {
         super($target,$duration,$vars);
         _pauseTime = -1;
         if(this.vars.onCompleteListener != null || this.vars.onUpdateListener != null || this.vars.onStartListener != null)
         {
            initDispatcher();
            if($duration == 0 && this.delay == 0)
            {
               onUpdateDispatcher();
               onCompleteDispatcher();
            }
         }
         if(this.vars.yoyo == true || this.vars.loop == true)
         {
            this.vars.persist = true;
         }
         if(TweenFilterLite.version < 8.13)
         {
            trace("TweenMax error! Please update your TweenFilterLite class or try deleting your ASO files. TweenMax requires a more recent version. Download updates at http://www.TweenMax.com.");
         }
      }
      
      public static function sequence($target:Object, $tweens:Array) : Array
      {
         for(var i:uint = 0; i < $tweens.length; i++)
         {
            $tweens[i].target = $target;
         }
         return multiSequence($tweens);
      }
      
      public static function hexColorsProxy($o:Object) : void
      {
         $o.info.target[$o.info.prop] = uint($o.target.r << 16 | $o.target.g << 8 | $o.target.b);
      }
      
      public static function parseBeziers($props:Object, $through:Boolean = false) : Object
      {
         var i:int = 0;
         var a:Array = null;
         var b:Object = null;
         var p:String = null;
         var all:Object = {};
         if($through)
         {
            for(p in $props)
            {
               a = $props[p];
               all[p] = b = [];
               if(a.length > 2)
               {
                  b[b.length] = {
                     "s":a[0],
                     "cp":a[1] - (a[2] - a[0]) / 4,
                     "e":a[1]
                  };
                  for(i = 1; i < a.length - 1; i++)
                  {
                     b[b.length] = {
                        "s":a[i],
                        "cp":a[i] + (a[i] - b[i - 1].cp),
                        "e":a[i + 1]
                     };
                  }
               }
               else
               {
                  b[b.length] = {
                     "s":a[0],
                     "cp":(a[0] + a[1]) / 2,
                     "e":a[1]
                  };
               }
            }
         }
         else
         {
            for(p in $props)
            {
               a = $props[p];
               all[p] = b = [];
               if(a.length > 3)
               {
                  b[b.length] = {
                     "s":a[0],
                     "cp":a[1],
                     "e":(a[1] + a[2]) / 2
                  };
                  for(i = 2; i < a.length - 2; i++)
                  {
                     b.push({
                        "s":b[i - 2].e,
                        "cp":a[i],
                        "e":(a[i] + a[i + 1]) / 2
                     });
                  }
                  b[b.length] = {
                     "s":b[b.length - 1].e,
                     "cp":a[a.length - 2],
                     "e":a[a.length - 1]
                  };
               }
               else if(a.length == 3)
               {
                  b[b.length] = {
                     "s":a[0],
                     "cp":a[1],
                     "e":a[2]
                  };
               }
               else if(a.length == 2)
               {
                  b[b.length] = {
                     "s":a[0],
                     "cp":(a[0] + a[1]) / 2,
                     "e":a[1]
                  };
               }
            }
         }
         return all;
      }
      
      public static function bezierProxy2($o:Object) : void
      {
         var a:Number = NaN;
         var dx:Number = NaN;
         var dy:Number = NaN;
         var cotb:Array = null;
         var toAdd:Number = NaN;
         bezierProxy($o);
         var future:Object = {};
         var tg:Object = $o.info.target;
         $o.info.target = future;
         $o.target.t += 0.01;
         bezierProxy($o);
         var otb:Array = $o.info.orientToBezier;
         for(var i:uint = 0; i < otb.length; i++)
         {
            cotb = otb[i];
            toAdd = Number(Number(cotb[3]) || 0);
            dx = future[cotb[0]] - tg[cotb[0]];
            dy = future[cotb[1]] - tg[cotb[1]];
            tg[cotb[2]] = Math.atan2(dy,dx) * _RAD2DEG + toAdd;
         }
         $o.info.target = tg;
         $o.target.t -= 0.01;
      }
      
      public static function pauseAll($tweens:Boolean = true, $delayedCalls:Boolean = false) : void
      {
         changePause(true,$tweens,$delayedCalls);
      }
      
      public static function getTweensOf($target:Object) : Array
      {
         var p:Object = null;
         var t:Dictionary = _all[$target];
         var a:Array = [];
         if(t != null)
         {
            for(p in t)
            {
               if(t[p].tweens != undefined)
               {
                  a[a.length] = t[p];
               }
            }
         }
         return a;
      }
      
      public static function multiSequence($tweens:Array) : Array
      {
         var tw:Object = null;
         var tgt:Object = null;
         var dl:Number = NaN;
         var t:Number = NaN;
         var i:uint = 0;
         var o:Object = null;
         var p:String = null;
         var dict:Dictionary = new Dictionary();
         var a:Array = [];
         var overwriteMode:int = int(TweenLite.overwriteManager.mode);
         var totalDelay:Number = 0;
         for(i = 0; i < $tweens.length; i++)
         {
            tw = $tweens[i];
            t = Number(Number(tw.time) || 0);
            o = {};
            for(p in tw)
            {
               o[p] = tw[p];
            }
            delete o.time;
            dl = Number(Number(o.delay) || 0);
            o.delay = totalDelay + dl;
            tgt = o.target;
            delete o.target;
            if(overwriteMode == 1)
            {
               if(dict[tgt] == undefined)
               {
                  dict[tgt] = o;
               }
               else
               {
                  o.overwrite = 2;
               }
            }
            a[a.length] = new TweenMax(tgt,t,o);
            totalDelay += t + dl;
         }
         return a;
      }
      
      public static function delayedCall($delay:Number, $onComplete:Function, $onCompleteParams:Array = null) : TweenMax
      {
         return new TweenMax($onComplete,0,{
            "delay":$delay,
            "onComplete":$onComplete,
            "onCompleteParams":$onCompleteParams,
            "overwrite":0
         });
      }
      
      public static function isTweening($target:Object) : Boolean
      {
         var a:Array = getTweensOf($target);
         for(var i:* = int(a.length - 1); i > -1; i--)
         {
            if(a[i].active)
            {
               return true;
            }
         }
         return false;
      }
      
      public static function killAll($complete:Boolean = false, $tweens:Boolean = true, $delayedCalls:Boolean = true) : void
      {
         var a:Array = getAllTweens();
         for(var i:* = int(a.length - 1); i > -1; i--)
         {
            if(a[i].target is Function == $delayedCalls || a[i].target is Function != $tweens)
            {
               if($complete)
               {
                  a[i].complete();
               }
               else
               {
                  TweenLite.removeTween(a[i]);
               }
            }
         }
      }
      
      public static function changePause($pause:Boolean, $tweens:Boolean = true, $delayedCalls:Boolean = false) : void
      {
         var a:Array = getAllTweens();
         for(var i:* = int(a.length - 1); i > -1; i--)
         {
            if(a[i] is TweenMax && (a[i].target is Function == $delayedCalls || a[i].target is Function != $tweens))
            {
               a[i].paused = $pause;
            }
         }
      }
      
      public static function bezierProxy($o:Object) : void
      {
         var i:int = 0;
         var p:String = null;
         var b:Object = null;
         var t:Number = NaN;
         var segments:uint = 0;
         var factor:Number = Number($o.target.t);
         var props:Object = $o.info.props;
         var tg:Object = $o.info.target;
         if(factor == 1)
         {
            for(p in props)
            {
               i = props[p].length - 1;
               tg[p] = props[p][i].e;
            }
         }
         else
         {
            for(p in props)
            {
               segments = uint(props[p].length);
               if(factor < 0)
               {
                  i = 0;
               }
               else if(factor >= 1)
               {
                  i = segments - 1;
               }
               else
               {
                  i = int(segments * factor);
               }
               t = (factor - i * (1 / segments)) * segments;
               b = props[p][i];
               tg[p] = b.s + t * (2 * (1 - t) * (b.cp - b.s) + t * (b.e - b.s));
            }
         }
      }
      
      public static function callbackProxy($functions:Array, $params:Array = null) : void
      {
         for(var i:uint = 0; i < $functions.length; i++)
         {
            if($functions[i] != undefined)
            {
               $functions[i].apply(null,$params[i]);
            }
         }
      }
      
      public static function allFrom($targets:Array, $duration:Number, $vars:Object) : Array
      {
         $vars.runBackwards = true;
         return allTo($targets,$duration,$vars);
      }
      
      public static function killAllDelayedCalls($complete:Boolean = false) : void
      {
         killAll($complete,false,true);
      }
      
      public static function from($target:Object, $duration:Number, $vars:Object) : TweenMax
      {
         $vars.runBackwards = true;
         return new TweenMax($target,$duration,$vars);
      }
      
      public static function killAllTweens($complete:Boolean = false) : void
      {
         killAll($complete,true,false);
      }
      
      public static function getAllTweens() : Array
      {
         var p:Object = null;
         var tw:Object = null;
         var a:Dictionary = _all;
         var all:Array = [];
         for(p in a)
         {
            for(tw in a[p])
            {
               if(a[p][tw] != undefined)
               {
                  all[all.length] = a[p][tw];
               }
            }
         }
         return all;
      }
      
      public static function resumeAll($tweens:Boolean = true, $delayedCalls:Boolean = false) : void
      {
         changePause(false,$tweens,$delayedCalls);
      }
      
      public static function to($target:Object, $duration:Number, $vars:Object) : TweenMax
      {
         return new TweenMax($target,$duration,$vars);
      }
      
      public static function allTo($targets:Array, $duration:Number, $vars:Object) : Array
      {
         var i:int = 0;
         var v:Object = null;
         var p:String = null;
         var dl:Number = NaN;
         var lastVars:Object = null;
         if($targets.length == 0)
         {
            return [];
         }
         var a:Array = [];
         var dli:Number = Number(Number($vars.delayIncrement) || 0);
         delete $vars.delayIncrement;
         if($vars.onCompleteAll == undefined)
         {
            lastVars = $vars;
         }
         else
         {
            lastVars = {};
            for(p in $vars)
            {
               lastVars[p] = $vars[p];
            }
            lastVars.onCompleteParams = [[$vars.onComplete,$vars.onCompleteAll],[$vars.onCompleteParams,$vars.onCompleteAllParams]];
            lastVars.onComplete = TweenMax.callbackProxy;
            delete $vars.onCompleteAll;
         }
         delete $vars.onCompleteAllParams;
         if(dli == 0)
         {
            for(i = 0; i < $targets.length - 1; i++)
            {
               v = {};
               for(p in $vars)
               {
                  v[p] = $vars[p];
               }
               a[a.length] = new TweenMax($targets[i],$duration,v);
            }
         }
         else
         {
            dl = Number(Number($vars.delay) || 0);
            for(i = 0; i < $targets.length - 1; i++)
            {
               v = {};
               for(p in $vars)
               {
                  v[p] = $vars[p];
               }
               v.delay = dl + i * dli;
               a[a.length] = new TweenMax($targets[i],$duration,v);
            }
            lastVars.delay = dl + ($targets.length - 1) * dli;
         }
         a[a.length] = new TweenMax($targets[$targets.length - 1],$duration,lastVars);
         if($vars.onCompleteAllListener is Function)
         {
            a[a.length - 1].addEventListener(TweenEvent.COMPLETE,$vars.onCompleteAllListener);
         }
         return a;
      }
      
      public function dispatchEvent($e:Event) : Boolean
      {
         if(_dispatcher == null)
         {
            return false;
         }
         return _dispatcher.dispatchEvent($e);
      }
      
      public function removeEventListener($type:String, $listener:Function, $useCapture:Boolean = false) : void
      {
         if(_dispatcher != null)
         {
            _dispatcher.removeEventListener($type,$listener,$useCapture);
         }
      }
      
      public function addEventListener($type:String, $listener:Function, $useCapture:Boolean = false, $priority:int = 0, $useWeakReference:Boolean = false) : void
      {
         if(_dispatcher == null)
         {
            initDispatcher();
         }
         _dispatcher.addEventListener($type,$listener,$useCapture,$priority,$useWeakReference);
      }
      
      protected function onStartDispatcher(... $args) : void
      {
         if(_callbacks.onStart != null)
         {
            _callbacks.onStart.apply(null,this.vars.onStartParams);
         }
         _dispatcher.dispatchEvent(new TweenEvent(TweenEvent.START));
      }
      
      public function setDestination($property:String, $value:*, $adjustStartValues:Boolean = true) : void
      {
         var v:Object = null;
         var i:* = 0;
         var varsOld:Object = null;
         var tweensOld:Array = null;
         var subTweensOld:Array = null;
         var p:Number = this.progress;
         if(this.vars[$property] != undefined && _initted)
         {
            if(!$adjustStartValues && p != 0)
            {
               for(i = int(this.tweens.length - 1); i > -1; i--)
               {
                  if(this.tweens[i].name == $property)
                  {
                     this.tweens[i].o[this.tweens[i].p] = this.tweens[i].s;
                  }
               }
            }
            v = {};
            v[$property] = 1;
            killVars(v);
         }
         this.vars[$property] = $value;
         if(_initted)
         {
            varsOld = this.vars;
            tweensOld = this.tweens;
            subTweensOld = _subTweens;
            this.vars = {};
            this.tweens = [];
            _subTweens = [];
            this.vars[$property] = $value;
            initTweenVals();
            if($adjustStartValues && p != 0)
            {
               this.vars.ease = varsOld.ease;
               adjustStartValues();
            }
            this.vars = varsOld;
            this.tweens = tweensOld.concat(this.tweens);
            _subTweens = subTweensOld.concat(_subTweens);
         }
      }
      
      override public function initTweenVals($hrp:Boolean = false, $reservedProps:String = "") : void
      {
         var p:String = null;
         var i:int = 0;
         var curProp:Object = null;
         var props:Object = null;
         var b:Array = null;
         $reservedProps += " hexColors bezier bezierThrough orientToBezier quaternions onCompleteAll onCompleteAllParams yoyo loop onCompleteListener onUpdateListener onStartListener ";
         if(!$hrp && Boolean(TweenLite.overwriteManager.enabled))
         {
            TweenLite.overwriteManager.manageOverwrites(this,_all[this.target]);
         }
         var bProxy:Function = bezierProxy;
         if(this.vars.orientToBezier == true)
         {
            this.vars.orientToBezier = [["x","y","rotation",0]];
            bProxy = bezierProxy2;
         }
         else if(this.vars.orientToBezier is Array)
         {
            bProxy = bezierProxy2;
         }
         if(this.vars.bezier != undefined && this.vars.bezier is Array)
         {
            props = {};
            b = this.vars.bezier;
            for(i = 0; i < b.length; i++)
            {
               for(p in b[i])
               {
                  if(props[p] == undefined)
                  {
                     props[p] = [this.target[p]];
                  }
                  if(typeof b[i][p] == "number")
                  {
                     props[p].push(b[i][p]);
                  }
                  else
                  {
                     props[p].push(this.target[p] + Number(b[i][p]));
                  }
               }
            }
            for(p in props)
            {
               if(typeof this.vars[p] == "number")
               {
                  props[p].push(this.vars[p]);
               }
               else
               {
                  props[p].push(this.target[p] + Number(this.vars[p]));
               }
               delete this.vars[p];
            }
            addSubTween("bezier",bProxy,{"t":0},{"t":1},{
               "props":parseBeziers(props,false),
               "target":this.target,
               "orientToBezier":this.vars.orientToBezier
            });
         }
         if(this.vars.bezierThrough != undefined && this.vars.bezierThrough is Array)
         {
            props = {};
            b = this.vars.bezierThrough;
            for(i = 0; i < b.length; i++)
            {
               for(p in b[i])
               {
                  if(props[p] == undefined)
                  {
                     props[p] = [this.target[p]];
                  }
                  if(typeof b[i][p] == "number")
                  {
                     props[p].push(b[i][p]);
                  }
                  else
                  {
                     props[p].push(this.target[p] + Number(b[i][p]));
                  }
               }
            }
            for(p in props)
            {
               if(typeof this.vars[p] == "number")
               {
                  props[p].push(this.vars[p]);
               }
               else
               {
                  props[p].push(this.target[p] + Number(this.vars[p]));
               }
               delete this.vars[p];
            }
            addSubTween("bezierThrough",bProxy,{"t":0},{"t":1},{
               "props":parseBeziers(props,true),
               "target":this.target,
               "orientToBezier":this.vars.orientToBezier
            });
         }
         if(this.vars.hexColors != undefined && typeof this.vars.hexColors == "object")
         {
            for(p in this.vars.hexColors)
            {
               addSubTween("hexColors",hexColorsProxy,{
                  "r":this.target[p] >> 16,
                  "g":this.target[p] >> 8 & 0xFF,
                  "b":this.target[p] & 0xFF
               },{
                  "r":this.vars.hexColors[p] >> 16,
                  "g":this.vars.hexColors[p] >> 8 & 0xFF,
                  "b":this.vars.hexColors[p] & 0xFF
               },{
                  "prop":p,
                  "target":this.target
               });
            }
         }
         super.initTweenVals(true,$reservedProps);
      }
      
      protected function adjustStartValues() : void
      {
         var factor:Number = NaN;
         var endValue:Number = NaN;
         var tp:Object = null;
         var i:* = 0;
         var p:Number = this.progress;
         if(p != 0)
         {
            factor = 1 / (1 - this.vars.ease(p * this.duration,0,1,this.duration));
            for(i = int(this.tweens.length - 1); i > -1; i--)
            {
               tp = this.tweens[i];
               endValue = tp.s + tp.c;
               tp.c = (endValue - tp.o[tp.p]) * factor;
               tp.s = endValue - tp.c;
            }
         }
      }
      
      public function restart() : void
      {
         this.progress = 0;
         resume();
      }
      
      protected function initDispatcher() : void
      {
         var v:Object = null;
         var p:String = null;
         if(_dispatcher == null)
         {
            _dispatcher = new EventDispatcher(this);
            _callbacks = {
               "onStart":this.vars.onStart,
               "onUpdate":this.vars.onUpdate,
               "onComplete":this.vars.onComplete
            };
            v = {};
            for(p in this.vars)
            {
               v[p] = this.vars[p];
            }
            this.vars = v;
            this.vars.onStart = onStartDispatcher;
            this.vars.onUpdate = onUpdateDispatcher;
            this.vars.onComplete = onCompleteDispatcher;
            if(this.vars.onStartListener is Function)
            {
               _dispatcher.addEventListener(TweenEvent.START,this.vars.onStartListener,false,0,true);
            }
            if(this.vars.onUpdateListener is Function)
            {
               _dispatcher.addEventListener(TweenEvent.UPDATE,this.vars.onUpdateListener,false,0,true);
            }
            if(this.vars.onCompleteListener is Function)
            {
               _dispatcher.addEventListener(TweenEvent.COMPLETE,this.vars.onCompleteListener,false,0,true);
            }
         }
      }
      
      protected function onUpdateDispatcher(... $args) : void
      {
         if(_callbacks.onUpdate != null)
         {
            _callbacks.onUpdate.apply(null,this.vars.onUpdateParams);
         }
         _dispatcher.dispatchEvent(new TweenEvent(TweenEvent.UPDATE));
      }
      
      public function set progress($n:Number) : void
      {
         var t:Number = _curTime - this.duration * $n * 1000;
         this.initTime = t - this.delay * 1000;
         var s:Boolean = this.active;
         this.startTime = t;
         render(_curTime);
         var v:* = this.vars.visible;
         if(this.vars.isTV == true)
         {
            v = this.vars.exposedProps.visible;
         }
         if(v != null && _isDisplayObject && $n < 1)
         {
            this.target.visible = Boolean(v);
         }
      }
      
      public function reverse($adjustDuration:Boolean = true) : void
      {
         this.vars.ease = this.vars.ease == _originalEase ? reverseEase : _originalEase;
         if($adjustDuration && _curTime > this.startTime)
         {
            this.startTime = _curTime - (1 - this.progress) * this.duration * 1000 / _timeScale;
            this.initTime = this.startTime - this.delay * 1000;
         }
      }
      
      public function set paused($b:Boolean) : void
      {
         if($b)
         {
            this.pause();
         }
         else
         {
            this.resume();
         }
      }
      
      public function willTrigger($type:String) : Boolean
      {
         if(_dispatcher == null)
         {
            return false;
         }
         return _dispatcher.willTrigger($type);
      }
      
      override public function get active() : Boolean
      {
         if(_active)
         {
            return true;
         }
         if(_pauseTime != -1)
         {
            return false;
         }
         if((_curTime - this.initTime) / 1000 > this.delay)
         {
            _active = true;
            this.startTime = this.initTime + this.delay * 1000;
            if(!_initted)
            {
               initTweenVals();
            }
            else if(this.vars.visible != undefined && _isDisplayObject)
            {
               this.target.visible = true;
            }
            if(this.vars.onStart != null)
            {
               this.vars.onStart.apply(null,this.vars.onStartParams);
            }
            if(this.duration == 0.001)
            {
               --this.startTime;
            }
            return true;
         }
         return false;
      }
      
      public function resume() : void
      {
         var gap:Number = NaN;
         if(_pauseTime != -1)
         {
            gap = _curTime - _pauseTime;
            this.initTime += gap;
            if(!isNaN(this.startTime))
            {
               this.startTime += gap;
            }
            _pauseTime = -1;
            if((_curTime - this.initTime) / 1000 > this.delay)
            {
               _active = true;
            }
         }
      }
      
      public function get paused() : Boolean
      {
         if(_pauseTime != -1)
         {
            return true;
         }
         return false;
      }
      
      public function reverseEase($t:Number, $b:Number, $c:Number, $d:Number) : Number
      {
         return _originalEase($d - $t,$b,$c,$d);
      }
      
      public function killProperties($names:Array) : void
      {
         var i:* = 0;
         var v:Object = {};
         for(i = int($names.length - 1); i > -1; i--)
         {
            if(this.vars[$names[i]] != null)
            {
               v[$names[i]] = 1;
            }
         }
         killVars(v);
      }
      
      public function hasEventListener($type:String) : Boolean
      {
         if(_dispatcher == null)
         {
            return false;
         }
         return _dispatcher.hasEventListener($type);
      }
      
      public function pause() : void
      {
         if(_pauseTime == -1)
         {
            _pauseTime = _curTime;
            _active = false;
         }
      }
      
      override public function complete($skipRender:Boolean = false) : void
      {
         super.complete($skipRender);
         if(this.vars.yoyo == true || this.vars.loop == true)
         {
            if(this.vars.yoyo == true)
            {
               reverse(false);
            }
            this.startTime = _curTime;
            this.initTime = this.startTime - this.delay * 1000;
            render(_curTime);
         }
         else if(this.vars.persist == true)
         {
            _pauseTime = _curTime;
            _active = false;
         }
      }
      
      public function invalidate($adjustStartValues:Boolean = true) : void
      {
         var p:Number = NaN;
         if(_initted)
         {
            p = this.progress;
            if(!$adjustStartValues && p != 0)
            {
               this.progress = 0;
            }
            this.tweens = [];
            _subTweens = [];
            initTweenVals();
            if(p != 0)
            {
               if($adjustStartValues)
               {
                  adjustStartValues();
               }
               else
               {
                  this.progress = p;
               }
            }
         }
      }
      
      public function get progress() : Number
      {
         var n:Number = Number((_curTime - this.startTime) / 1000 / this.duration * _timeScale || 0);
         if(n > 1)
         {
            return 1;
         }
         return n;
      }
      
      protected function onCompleteDispatcher(... $args) : void
      {
         if(_callbacks.onComplete != null)
         {
            _callbacks.onComplete.apply(null,this.vars.onCompleteParams);
         }
         _dispatcher.dispatchEvent(new TweenEvent(TweenEvent.COMPLETE));
      }
   }
}

