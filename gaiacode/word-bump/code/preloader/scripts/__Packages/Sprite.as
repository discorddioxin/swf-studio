class Sprite extends MovieClip
{
   var Side;
   var Top;
   var a;
   var c;
   var coll;
   var contents;
   var d;
   var diameter;
   var fanDelta;
   var g;
   var itemIndex;
   var line;
   var mass;
   var mc;
   var nrg;
   var pa;
   var r;
   var repLine;
   var v;
   static var spriteCount = 0;
   var vr = 0;
   var MAXRANGE = 0.03;
   var over = false;
   function Sprite(playarea, c, depth, scale)
   {
      super();
      this.pa = playarea;
      Sprite.spriteCount++;
      this.mc = this.pa.attachMovie("bubble","balloon" + depth,depth);
      this.mc._xscale = this.mc._yscale = scale;
      this.diameter = this.mc._width;
      if(this.diameter)
      {
         this.mass = Math.ceil(this.diameter / 64);
      }
      else
      {
         this.mass = 0;
         trace("WARNING: mass = 0!");
      }
      this.contents = this.mc.attachMovie(c,"contents",1);
      this.line = this.mc.createEmptyMovieClip("l",2);
      this.repLine = this.mc.createEmptyMovieClip("rpl",3);
      var thisClass = this;
      this.mc.onEnterFrame = function()
      {
         thisClass.update();
      };
      this.Side = (this.pa.StageWidth - this.mc._width) / 2;
      this.Top = (this.pa.StageHeight - this.mc._height) / 2;
   }
   function update()
   {
      this.addForces();
      this.findRange();
      this.checkWalls();
      if(this.d.y > this.Top)
      {
         if(this.v.y > 0.1)
         {
            this.v.y -= 0.1;
            this.v.y = - Math.abs(this.v.y);
         }
         else
         {
            this.v.y = 0;
         }
         this.d.y = this.Top;
         this.vr = 0.5;
      }
      else if(this.d.y < - this.Top)
      {
         if(this.v.y < -0.1)
         {
            this.v.y += 0.1;
            this.v.y = Math.abs(this.v.y);
         }
         else
         {
            this.v.y = 0;
         }
         this.d.y = - this.Top;
         this.vr = 0.5;
      }
      if(this.d.x > this.Side)
      {
         this.v.x = - Math.abs(this.v.x);
         this.vr = 0.5;
      }
      if(this.d.x < - this.Side)
      {
         this.v.x = Math.abs(this.v.x);
         this.vr = -0.5;
      }
      this.spriteUpdate();
   }
   function initVector()
   {
      this.d = new Vector(this.mc._x,this.mc._y);
      this.v = new Vector();
      this.a = new Vector();
      this.g = new Vector(0,0.001);
      this.r = new Vector();
      this.c = new Vector();
      this.fanDelta = new Vector();
   }
   function addForces()
   {
      var _loc3_;
      var _loc2_;
      if(this.d.x != undefined && this.d.y != undefined)
      {
         this.r.x = (- this.v.x) * 0.002;
         this.r.y = (- this.v.y) * 0.002;
         _loc3_ = this.v.x;
         _loc2_ = this.v.y;
         this.v.x += this.a.x / this.mass;
         this.v.x += this.g.x;
         this.v.x += this.r.x;
         this.v.x += this.c.x;
         this.v.y += this.a.y / this.mass;
         this.v.y += this.g.y;
         this.v.y += this.r.y;
         this.v.y += this.c.y;
         this.d.x += this.v.x;
         this.d.y += this.v.y;
      }
   }
   function findRange()
   {
      this.fanDelta.x = Math.floor(_root._xmouse - this.d.x - this.pa._x);
      this.fanDelta.y = Math.floor(_root._ymouse - this.d.y - this.pa._y);
      this.fanDelta.x *= 0.0002;
      this.fanDelta.y *= 0.0002;
      var _loc3_;
      if(this.fanDelta.m < this.MAXRANGE)
      {
         _loc3_ = new Vector();
         _loc3_.XYAngle = this.fanDelta.XYAngle;
         _loc3_.m = this.MAXRANGE - this.fanDelta.m;
         this.a.x = (- _loc3_.x) * 2;
         this.a.y = (- _loc3_.y) * 2;
      }
      else
      {
         this.line.clear();
         this.a.x = this.a.y = 0;
      }
   }
   function spriteUpdate()
   {
      this.mc._x = this.d.x;
      this.mc._y = this.d.y;
      this.contents._rotation += this.vr;
      if(this.contents._rotation < -15)
      {
         this.contents._rotation -= this.vr;
         this.vr = Math.abs(this.vr);
      }
      if(this.contents._rotation > 15)
      {
         this.contents._rotation -= this.vr;
         this.vr = - Math.abs(this.vr);
      }
      if(this.coll)
      {
         this.checkCollision();
      }
      if(this.vr < -2)
      {
         this.vr = -2;
      }
      if(this.vr > 2)
      {
         this.vr = 2;
      }
   }
   function checkCollision()
   {
      var _loc4_ = 1;
      this.nrg = this.c.x = this.c.y = 0;
      var _loc3_ = 0;
      var _loc2_;
      while(_loc3_ < Sprite.spriteCount)
      {
         if(_loc3_ != this.itemIndex && this.pa.Floatloons_alive[_loc3_].fl.coll)
         {
            if(this.pa.Floatloons_alive[_loc3_].fl.mc.hitTest(this.mc))
            {
               _loc2_ = new Vector();
               _loc2_.x = this.mc._x - this.pa.Floatloons_alive[_loc3_].fl.mc._x;
               _loc2_.y = this.mc._y - this.pa.Floatloons_alive[_loc3_].fl.mc._y;
               if(this.diameter > _loc2_.m)
               {
                  _loc2_.m = this.diameter - _loc2_.m;
               }
               else
               {
                  _loc2_.x = _loc2_.y = 0;
               }
               this.c.x += _loc2_.x * 0.004;
               this.c.y += _loc2_.y * 0.004;
               _loc4_ = _loc4_ + 1;
            }
            else
            {
               this.repLine.clear();
            }
         }
         _loc3_ = _loc3_ + 1;
      }
   }
   function checkWalls()
   {
      if(this.d.y > 160)
      {
         if(this.v.y > 0.05)
         {
            this.v.y -= 0.05;
            this.v.y = - Math.abs(this.v.y);
         }
         else
         {
            this.v.y = 0;
         }
         this.d.y = 160;
         this.vr = 0.5;
      }
      if(this.d.x > 270)
      {
         this.v.x = - Math.abs(this.v.x);
         this.vr = 0.5;
      }
      if(this.d.x < -270)
      {
         this.v.x = Math.abs(this.v.x);
         this.vr = -0.5;
      }
   }
   function drawLine(x, y)
   {
      this.line.clear();
      this.line.lineStyle(30,2228479,40);
      this.line.moveTo(0,0);
      this.line.lineTo(x,y);
   }
   function drawRepLine(x, y)
   {
      this.repLine.clear();
      this.repLine.lineStyle(20,16711714,50);
      this.repLine.moveTo(0,0);
      this.repLine.lineTo(x,y);
   }
}
