package com.gaiaonline.gateway.sgs
{
   import com.gaiaonline.gateway.GaiaFunction;
   
   public class SGSGaiaFunction extends GaiaFunction
   {
      
      private var _chid:Number = 0;
      
      public function SGSGaiaFunction(param1:Number = 0, param2:String = null, ... rest)
      {
         super();
         this._chid = param1;
         this._name = param2;
         if(rest)
         {
            this._args = rest.length > 1 ? rest : rest[0];
         }
      }
      
      override public function fromObject(param1:Object) : void
      {
         if(!param1)
         {
            return;
         }
         super.fromObject(param1);
         if(param1.chid != undefined)
         {
            this._chid = param1.chid;
         }
      }
      
      override public function toObject() : Object
      {
         var _loc1_:Object = super.toObject();
         if(this._chid > 0)
         {
            _loc1_.chid = this._chid;
         }
         return _loc1_;
      }
   }
}

