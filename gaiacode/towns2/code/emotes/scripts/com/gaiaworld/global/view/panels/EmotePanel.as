package com.gaiaworld.global.view.panels
{
   import com.gaiaworld.global.util.StringFunctions;
   import com.gaiaworld.sushi.controller.ChatController;
   import flash.display.SimpleButton;
   import flash.display.Sprite;
   import flash.events.Event;
   import flash.events.MouseEvent;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol99")]
   public class EmotePanel extends Sprite
   {
      
      public var e12:SimpleButton;
      
      public var e47:SimpleButton;
      
      public var e21:SimpleButton;
      
      public var e0:SimpleButton;
      
      public var e13:SimpleButton;
      
      public var e22:SimpleButton;
      
      public var e1:SimpleButton;
      
      public var e14:SimpleButton;
      
      public var e2:SimpleButton;
      
      public var e23:SimpleButton;
      
      public var e15:SimpleButton;
      
      public var e3:SimpleButton;
      
      public var e24:SimpleButton;
      
      public var e16:SimpleButton;
      
      public var e25:SimpleButton;
      
      public var e4:SimpleButton;
      
      public var e26:SimpleButton;
      
      public var e5:SimpleButton;
      
      public var e17:SimpleButton;
      
      public var e27:SimpleButton;
      
      public var e18:SimpleButton;
      
      public var e6:SimpleButton;
      
      public var e28:SimpleButton;
      
      public var e7:SimpleButton;
      
      public var e19:SimpleButton;
      
      public var e29:SimpleButton;
      
      public var e8:SimpleButton;
      
      public var e9:SimpleButton;
      
      public var e10:SimpleButton;
      
      public var e11:SimpleButton;
      
      public var e20:SimpleButton;
      
      private var emoteArray:Array;
      
      private var chatController:ChatController = new ChatController();
      
      public function EmotePanel()
      {
         super();
         this.addEventListener(Event.ADDED_TO_STAGE,this.initEventListeners);
         this.emoteArray = [[1,"lol"],[2,"kiss"],[2,"wink"],[2,"huh"],[2,"cry"],[2,"ninja"],[4,"help"],[4,"scream"],[2,"sweat"],[2,"stare"],[4,"bugeye"],[2,"cute"],[2,"hug"],[2,"p"],[2,"r"],[2,"s"],[5,"brokenheart"],[1,"heart"],[2,"poed"],[2,"pwn"],[2,"wave"],[2,"peace"],[2,"up"],[2,"down"],[2,"confused"],[4,"exclamation"],[1,"notes"],[1,"zzz"],[5,"x"],[1,"vein"],[2,"domo"],[2,"llama"],[1,"brainFreeze"],[1,"bubble"],[1,"popcorn"],["toy","throwPopcorn"],[1,"soda"],["toy","laserPointer"],["toy","kiss"],["toy","fireBall"],["toy","spiderWeb"],["toy","tomato"],[1,"ramen"],["toy","canonBall"],[1,"coins"],["toy","flyingCards"],["toy","skittles"],[2,"applause"],[0,"archway"],[0,"celebrate"],[0,"chew"],[0,"skittleFlower"],[2,"fanwave"],[1,"sourPatch1"],[1,"sourPatch2"],[6,"yoga01"],[6,"yoga02"],[6,"yoga03"],[6,"yoga04"],[6,"yoga05"],[6,"yoga06"],[6,"yoga07"],[6,"yoga08"],[6,"yoga09"],[6,"yoga10"],[1,"sunkiss"],["toy","laserGun"],["toy","mini"],["toy","jumbo"]];
      }
      
      private function initEventListeners(param1:Event) : *
      {
         var _loc4_:SimpleButton = null;
         var _loc2_:Number = this.numChildren;
         var _loc3_:int = 1;
         while(_loc3_ < _loc2_ - 1)
         {
            _loc4_ = this.getChildAt(_loc3_) as SimpleButton;
            try
            {
               _loc4_.addEventListener(MouseEvent.MOUSE_DOWN,this.emoteSelected);
            }
            catch(e:Error)
            {
            }
            _loc3_++;
         }
      }
      
      private function emoteSelected(param1:MouseEvent) : void
      {
         var _loc2_:Number = Number(StringFunctions.findReplace("e",param1.target.name,""));
         this.chatController.sendEmote(this.emoteArray[_loc2_]);
      }
   }
}

