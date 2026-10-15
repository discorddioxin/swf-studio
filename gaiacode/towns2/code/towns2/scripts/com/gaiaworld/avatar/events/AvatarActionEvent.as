package com.gaiaworld.avatar.events
{
   import com.gaiaworld.user.vo.UserVo;
   import flash.events.Event;
   
   public class AvatarActionEvent extends Event
   {
      
      public static var DO_AVATAR_ACTION:String = "DO_AVATAR_ACTION";
      
      public var userVo:UserVo;
      
      public var action:String;
      
      public function AvatarActionEvent(param1:String, param2:String, param3:UserVo, param4:Boolean = false, param5:Boolean = false)
      {
         super(param1,param4,param5);
         this.userVo = param3;
         this.action = param2;
      }
      
      override public function clone() : Event
      {
         return new AvatarActionEvent(type,this.action,this.userVo,bubbles,cancelable);
      }
      
      override public function toString() : String
      {
         return formatToString("AvatarActionEvent","type","action","userVo","bubbles","cancelable","eventPhase");
      }
   }
}

