class Vector
{
   var mag;
   var xComp;
   var xyT;
   var yComp;
   function Vector(x, y, z)
   {
      if(x == undefined)
      {
         this.x = 0;
      }
      else
      {
         this.x = x;
      }
      if(y == undefined)
      {
         this.y = 0;
      }
      else
      {
         this.y = y;
      }
   }
   function set x(i)
   {
      if(i != undefined && i != this.xComp)
      {
         this.xComp = i;
         this.fixAngle();
      }
   }
   function set y(i)
   {
      if(i != undefined && i != this.yComp)
      {
         this.yComp = i;
         this.fixAngle();
      }
   }
   function set m(i)
   {
      if(i != undefined && i != this.mag)
      {
         this.mag = i;
         this.xComp = Math.cos(this.xyT) * this.mag;
         this.yComp = Math.sin(this.xyT) * this.mag;
      }
   }
   function set XYAngle(a)
   {
      if(a != undefined && a != this.xyT)
      {
         this.xyT = a;
      }
   }
   function get x()
   {
      return this.xComp;
   }
   function get y()
   {
      return this.yComp;
   }
   function get m()
   {
      return this.mag;
   }
   function get XYAngleDeg()
   {
      return this.XYAngle * 57.3;
   }
   function get XYAngle()
   {
      return this.xyT;
   }
   function fixAngle()
   {
      if(this.yComp != undefined && this.xComp != undefined && this.xComp != 0)
      {
         this.xyT = Math.atan2(this.yComp,this.xComp);
         this.mag = Math.sqrt(this.xComp * this.xComp + this.yComp * this.yComp);
      }
   }
   static function getSign(num)
   {
      if(num)
      {
         num = Math.floor(num * 100000) / 100000;
         num /= Math.abs(num);
         return num;
      }
      return 0;
   }
}
