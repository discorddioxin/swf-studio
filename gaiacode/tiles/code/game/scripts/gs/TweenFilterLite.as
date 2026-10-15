package gs
{
   import flash.filters.*;
   
   public class TweenFilterLite extends TweenLite
   {
      
      public static var version:Number = 8.13;
      
      public static var delayedCall:Function = TweenLite.delayedCall;
      
      public static var killTweensOf:Function = TweenLite.killTweensOf;
      
      public static var killDelayedCallsTo:Function = TweenLite.killTweensOf;
      
      public static var removeTween:Function = TweenLite.removeTween;
      
      public static var defaultEase:Function = TweenLite.defaultEase;
      
      private static var _idMatrix:Array = [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0];
      
      private static var _lumR:Number = 0.212671;
      
      private static var _lumG:Number = 0.71516;
      
      private static var _lumB:Number = 0.072169;
      
      protected var _matrix:Array;
      
      protected var _hf:Boolean = false;
      
      protected var _cmf:ColorMatrixFilter;
      
      protected var _filters:Array = [];
      
      protected var _endMatrix:Array;
      
      protected var _originalEase:Function;
      
      protected var _clrsa:Array;
      
      public function TweenFilterLite($target:Object, $duration:Number, $vars:Object)
      {
         super($target,$duration,$vars);
         _originalEase = this.vars.ease;
         if(TweenLite.version < 8.13)
         {
            trace("TweenFilterLite error! Please update your TweenLite class or try deleting your ASO files. TweenFilterLite requires a more recent version. Download updates at http://www.TweenLite.com.");
         }
         if($vars.type != undefined)
         {
            trace("TweenFilterLite error: " + $target + " is using deprecated syntax. Please update to the new syntax. See http://www.TweenFilterLite.com for details.");
         }
      }
      
      public static function setContrast($m:Array, $n:Number) : Array
      {
         if(isNaN($n))
         {
            return $m;
         }
         $n += 0.01;
         var temp:Array = [$n,0,0,0,128 * (1 - $n),0,$n,0,0,128 * (1 - $n),0,0,$n,0,128 * (1 - $n),0,0,0,1,0];
         return applyMatrix(temp,$m);
      }
      
      public static function colorize($m:Array, $color:Number, $amount:Number = 1) : Array
      {
         if(isNaN($color))
         {
            return $m;
         }
         if(isNaN($amount))
         {
            $amount = 1;
         }
         var r:Number = ($color >> 16 & 0xFF) / 255;
         var g:Number = ($color >> 8 & 0xFF) / 255;
         var b:Number = ($color & 0xFF) / 255;
         var inv:Number = 1 - $amount;
         var temp:Array = [inv + $amount * r * _lumR,$amount * r * _lumG,$amount * r * _lumB,0,0,$amount * g * _lumR,inv + $amount * g * _lumG,$amount * g * _lumB,0,0,$amount * b * _lumR,$amount * b * _lumG,inv + $amount * b * _lumB,0,0,0,0,0,1,0];
         return applyMatrix(temp,$m);
      }
      
      public static function setBrightness($m:Array, $n:Number) : Array
      {
         if(isNaN($n))
         {
            return $m;
         }
         $n = $n * 100 - 100;
         return applyMatrix([1,0,0,0,$n,0,1,0,0,$n,0,0,1,0,$n,0,0,0,1,0,0,0,0,0,1],$m);
      }
      
      public static function setSaturation($m:Array, $n:Number) : Array
      {
         if(isNaN($n))
         {
            return $m;
         }
         var inv:Number = 1 - $n;
         var r:Number = inv * _lumR;
         var g:Number = inv * _lumG;
         var b:Number = inv * _lumB;
         var temp:Array = [r + $n,g,b,0,0,r,g + $n,b,0,0,r,g,b + $n,0,0,0,0,0,1,0];
         return applyMatrix(temp,$m);
      }
      
      public static function applyMatrix($m:Array, $m2:Array) : Array
      {
         var y:int = 0;
         var x:int = 0;
         if(!($m is Array) || !($m2 is Array))
         {
            return $m2;
         }
         var temp:Array = [];
         var i:int = 0;
         var z:int = 0;
         for(y = 0; y < 4; y++)
         {
            for(x = 0; x < 5; x++)
            {
               if(x == 4)
               {
                  z = int($m[i + 4]);
               }
               else
               {
                  z = 0;
               }
               temp[i + x] = $m[i] * $m2[x] + $m[i + 1] * $m2[x + 5] + $m[i + 2] * $m2[x + 10] + $m[i + 3] * $m2[x + 15] + z;
            }
            i += 5;
         }
         return temp;
      }
      
      public static function from($target:Object, $duration:Number, $vars:Object) : TweenFilterLite
      {
         $vars.runBackwards = true;
         return new TweenFilterLite($target,$duration,$vars);
      }
      
      public static function HEXtoRGB($n:Number) : Object
      {
         return {
            "rb":$n >> 16,
            "gb":$n >> 8 & 0xFF,
            "bb":$n & 0xFF
         };
      }
      
      public static function setThreshold($m:Array, $n:Number) : Array
      {
         if(isNaN($n))
         {
            return $m;
         }
         var temp:Array = [_lumR * 256,_lumG * 256,_lumB * 256,0,-256 * $n,_lumR * 256,_lumG * 256,_lumB * 256,0,-256 * $n,_lumR * 256,_lumG * 256,_lumB * 256,0,-256 * $n,0,0,0,1,0];
         return applyMatrix(temp,$m);
      }
      
      public static function to($target:Object, $duration:Number, $vars:Object) : TweenFilterLite
      {
         return new TweenFilterLite($target,$duration,$vars);
      }
      
      public static function setHue($m:Array, $n:Number) : Array
      {
         if(isNaN($n))
         {
            return $m;
         }
         $n *= Math.PI / 180;
         var c:Number = Math.cos($n);
         var s:Number = Math.sin($n);
         var temp:Array = [_lumR + c * (1 - _lumR) + s * -_lumR,_lumG + c * -_lumG + s * -_lumG,_lumB + c * -_lumB + s * (1 - _lumB),0,0,_lumR + c * -_lumR + s * 0.143,_lumG + c * (1 - _lumG) + s * 0.14,_lumB + c * -_lumB + s * -0.283,0,0,_lumR + c * -_lumR + s * -(1 - _lumR),_lumG + c * -_lumG + s * _lumG,_lumB + c * (1 - _lumB) + s * _lumB,0,0,0,0,0,1,0,0,0,0,0,1];
         return applyMatrix(temp,$m);
      }
      
      override public function killVars($vars:Object) : void
      {
         if(TweenLite.overwriteManager.enabled)
         {
            TweenLite.overwriteManager.killVars($vars,this.vars,this.tweens,_subTweens,_filters);
         }
      }
      
      override public function initTweenVals($hrp:Boolean = false, $reservedProps:String = "") : void
      {
         var i:* = 0;
         var fv:Object = null;
         var cmf:Object = null;
         var tp:Object = null;
         if(!$hrp && Boolean(TweenLite.overwriteManager.enabled))
         {
            TweenLite.overwriteManager.manageOverwrites(this,_all[this.target]);
         }
         _clrsa = [];
         _filters = [];
         _matrix = _idMatrix.slice();
         $reservedProps += " blurFilter glowFilter colorMatrixFilter dropShadowFilter bevelFilter ";
         if(_isDisplayObject)
         {
            if(this.vars.blurFilter != null)
            {
               fv = this.vars.blurFilter;
               addFilter("blurFilter",fv,BlurFilter,["blurX","blurY","quality"],new BlurFilter(0,0,int(fv.quality) || 2));
            }
            if(this.vars.glowFilter != null)
            {
               fv = this.vars.glowFilter;
               addFilter("glowFilter",fv,GlowFilter,["alpha","blurX","blurY","color","quality","strength","inner","knockout"],new GlowFilter(16777215,0,0,0,Number(fv.strength) || 1,int(fv.quality) || 2,fv.inner,fv.knockout));
            }
            if(this.vars.colorMatrixFilter != null)
            {
               fv = this.vars.colorMatrixFilter;
               cmf = addFilter("colorMatrixFilter",fv,ColorMatrixFilter,[],new ColorMatrixFilter(_matrix));
               _cmf = cmf.filter;
               _matrix = ColorMatrixFilter(_cmf).matrix;
               if(fv.matrix != null && fv.matrix is Array)
               {
                  _endMatrix = fv.matrix;
               }
               else
               {
                  if(fv.relative == true)
                  {
                     _endMatrix = _matrix.slice();
                  }
                  else
                  {
                     _endMatrix = _idMatrix.slice();
                  }
                  _endMatrix = setBrightness(_endMatrix,fv.brightness);
                  _endMatrix = setContrast(_endMatrix,fv.contrast);
                  _endMatrix = setHue(_endMatrix,fv.hue);
                  _endMatrix = setSaturation(_endMatrix,fv.saturation);
                  _endMatrix = setThreshold(_endMatrix,fv.threshold);
                  if(!isNaN(fv.colorize))
                  {
                     _endMatrix = colorize(_endMatrix,fv.colorize,fv.amount);
                  }
                  else if(!isNaN(fv.color))
                  {
                     _endMatrix = colorize(_endMatrix,fv.color,fv.amount);
                  }
               }
               for(i = 0; i < _endMatrix.length; i++)
               {
                  if(_matrix[i] != _endMatrix[i] && _matrix[i] != undefined)
                  {
                     this.tweens[this.tweens.length] = {
                        "o":_matrix,
                        "p":i.toString(),
                        "s":_matrix[i],
                        "c":_endMatrix[i] - _matrix[i],
                        "name":"colorMatrixFilter"
                     };
                  }
               }
            }
            if(this.vars.dropShadowFilter != null)
            {
               fv = this.vars.dropShadowFilter;
               addFilter("dropShadowFilter",fv,DropShadowFilter,["alpha","angle","blurX","blurY","color","distance","quality","strength","inner","knockout","hideObject"],new DropShadowFilter(0,45,0,0,0,0,1,int(fv.quality) || 2,fv.inner,fv.knockout,fv.hideObject));
            }
            if(this.vars.bevelFilter != null)
            {
               fv = this.vars.bevelFilter;
               addFilter("bevelFilter",fv,BevelFilter,["angle","blurX","blurY","distance","highlightAlpha","highlightColor","quality","shadowAlpha","shadowColor","strength"],new BevelFilter(0,0,16777215,0.5,0,0.5,2,2,0,int(fv.quality) || 2));
            }
            if(this.vars.runBackwards == true)
            {
               for(i = int(_clrsa.length - 1); i > -1; i--)
               {
                  tp = _clrsa[i];
                  tp.sr += tp.cr;
                  tp.cr *= -1;
                  tp.sg += tp.cg;
                  tp.cg *= -1;
                  tp.sb += tp.cb;
                  tp.cb *= -1;
                  tp.f[tp.p] = tp.sr << 16 | tp.sg << 8 | tp.sb;
               }
            }
            super.initTweenVals(true,$reservedProps);
         }
         else
         {
            super.initTweenVals($hrp,$reservedProps);
         }
      }
      
      public function set timeScale($n:Number) : void
      {
         if(_initted && _curTime > this.startTime)
         {
            this.startTime = _curTime - (_curTime - this.startTime) * _timeScale * (1 / $n);
            this.initTime = this.startTime - this.delay * 1000;
         }
         _timeScale = $n;
      }
      
      public function get timeScale() : Number
      {
         return _timeScale;
      }
      
      override public function render($t:uint) : void
      {
         var factor:Number = NaN;
         var tp:Object = null;
         var i:* = 0;
         var r:Number = NaN;
         var g:Number = NaN;
         var b:Number = NaN;
         var j:* = 0;
         var f:Array = null;
         var time:Number = ($t - this.startTime) / 1000 * _timeScale;
         if(time >= this.duration)
         {
            time = this.duration;
            factor = _originalEase == this.vars.ease ? 1 : 0;
         }
         else
         {
            factor = Number(this.vars.ease(time,0,1,this.duration));
         }
         for(i = int(this.tweens.length - 1); i > -1; i--)
         {
            tp = this.tweens[i];
            tp.o[tp.p] = tp.s + factor * tp.c;
         }
         if(_hf)
         {
            for(i = int(_clrsa.length - 1); i > -1; i--)
            {
               tp = _clrsa[i];
               r = tp.sr + factor * tp.cr;
               g = tp.sg + factor * tp.cg;
               b = tp.sb + factor * tp.cb;
               tp.f[tp.p] = r << 16 | g << 8 | b;
            }
            if(_cmf != null)
            {
               ColorMatrixFilter(_cmf).matrix = _matrix;
            }
            f = this.target.filters;
            for(i = 0; i < _filters.length; i++)
            {
               for(j = int(f.length - 1); j > -1; j--)
               {
                  if(f[j] is _filters[i].type)
                  {
                     f.splice(j,1,_filters[i].filter);
                     break;
                  }
               }
            }
            this.target.filters = f;
         }
         if(_hst)
         {
            for(i = int(_subTweens.length - 1); i > -1; i--)
            {
               _subTweens[i].proxy(_subTweens[i]);
            }
         }
         if(_hasUpdate)
         {
            this.vars.onUpdate.apply(null,this.vars.onUpdateParams);
         }
         if(time == this.duration)
         {
            complete(true);
         }
      }
      
      private function addFilter($name:String, $fv:Object, $filterType:Class, $props:Array, $defaultFilter:BitmapFilter) : Object
      {
         var i:int = 0;
         var prop:String = null;
         var valChange:Number = NaN;
         var begin:Object = null;
         var end:Object = null;
         var f:Object = {
            "type":$filterType,
            "name":$name
         };
         var fltrs:Array = this.target.filters;
         for(i = 0; i < fltrs.length; i++)
         {
            if(fltrs[i] is $filterType)
            {
               f.filter = fltrs[i];
               break;
            }
         }
         if(f.filter == undefined)
         {
            f.filter = $defaultFilter;
            fltrs[fltrs.length] = f.filter;
            this.target.filters = fltrs;
         }
         for(i = 0; i < $props.length; i++)
         {
            prop = $props[i];
            if($fv[prop] != undefined)
            {
               if(prop == "color" || prop == "highlightColor" || prop == "shadowColor")
               {
                  begin = HEXtoRGB(f.filter[prop]);
                  end = HEXtoRGB($fv[prop]);
                  _clrsa[_clrsa.length] = {
                     "f":f.filter,
                     "p":prop,
                     "sr":begin.rb,
                     "cr":end.rb - begin.rb,
                     "sg":begin.gb,
                     "cg":end.gb - begin.gb,
                     "sb":begin.bb,
                     "cb":end.bb - begin.bb
                  };
               }
               else if(prop == "quality" || prop == "inner" || prop == "knockout" || prop == "hideObject")
               {
                  f.filter[prop] = $fv[prop];
               }
               else
               {
                  if(typeof $fv[prop] == "number")
                  {
                     valChange = $fv[prop] - f.filter[prop];
                  }
                  else
                  {
                     valChange = Number($fv[prop]);
                  }
                  this.tweens[this.tweens.length] = {
                     "o":f.filter,
                     "p":prop,
                     "s":f.filter[prop],
                     "c":valChange,
                     "name":$name
                  };
               }
            }
         }
         _filters[_filters.length] = f;
         _hf = true;
         return f;
      }
   }
}

