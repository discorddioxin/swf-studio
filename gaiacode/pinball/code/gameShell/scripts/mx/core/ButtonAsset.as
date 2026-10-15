package mx.core
{
   use namespace mx_internal;
   
   public class ButtonAsset extends FlexSimpleButton implements IFlexAsset, IFlexDisplayObject
   {
      
      mx_internal static const VERSION:String = "3.0.0.0";
      
      private var _measuredHeight:Number;
      
      private var _measuredWidth:Number;
      
      public function ButtonAsset()
      {
         super();
         _measuredWidth = width;
         _measuredHeight = height;
      }
      
      public function get measuredWidth() : Number
      {
         return _measuredWidth;
      }
      
      public function get measuredHeight() : Number
      {
         return _measuredHeight;
      }
      
      public function setActualSize(param1:Number, param2:Number) : void
      {
         width = param1;
         height = param2;
      }
      
      public function move(param1:Number, param2:Number) : void
      {
         this.x = param1;
         this.y = param2;
      }
   }
}

