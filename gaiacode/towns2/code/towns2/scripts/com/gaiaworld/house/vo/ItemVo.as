package com.gaiaworld.house.vo
{
   public class ItemVo
   {
      
      public var itemID:Number;
      
      public var sex:String;
      
      public var type:String;
      
      public var sub_type:String;
      
      public var name:String;
      
      public var description:String;
      
      public var thumbnail:String;
      
      public var thumbfile:String;
      
      public var price:Number;
      
      public var gpass:Number;
      
      public var store_id:Number;
      
      public var trade_ignore:Number;
      
      public function ItemVo(param1:Number = 0, param2:String = "", param3:String = "", param4:String = "", param5:String = "", param6:String = "", param7:String = "", param8:String = "", param9:Number = 0, param10:Number = 0, param11:Number = 0, param12:Number = 0)
      {
         super();
         this.itemID = param1;
         this.sex = param2;
         this.type = param3;
         this.sub_type = param4;
         this.name = param5;
         this.description = param6;
         this.thumbnail = param7;
         this.thumbfile = param8;
         this.price = param9;
         this.gpass = param10;
         this.store_id = param11;
         this.trade_ignore = param12;
      }
      
      public function fromObj(param1:Object) : *
      {
         if(param1 != null)
         {
            try
            {
               this.itemID = param1.item_id;
               this.sex = param1.sex;
               this.type = param1.type;
               this.sub_type = param1.sub_type;
               this.name = param1.name;
               this.description = param1.description;
               this.thumbnail = param1.thumbnail;
               this.thumbfile = param1.thumbfile;
               this.price = param1.price;
               this.gpass = param1.gpass;
               this.store_id = param1.store_id;
               this.trade_ignore = param1.trade_ignore;
            }
            catch(e:Error)
            {
            }
         }
      }
   }
}

