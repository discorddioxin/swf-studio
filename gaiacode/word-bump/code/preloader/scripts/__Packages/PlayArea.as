class PlayArea extends MovieClip
{
   var FloatloonDeck;
   var StageHeight;
   var StageWidth;
   var dropShadow;
   var fan;
   var gameName;
   var loaderX;
   var loaderY;
   var onEnterFrame;
   var percentLoadedTxt;
   var txtFrmt;
   var deck = 10;
   var Floatloons_alive = new Array();
   var skyDepth = 2;
   var textDepth = 3;
   var text2Depth = 4;
   var boxFrameDepth = 5;
   var boxDepth = 6;
   var fanDepth = 9;
   var percentLoadd = 0;
   function PlayArea()
   {
      super();
      this.StageWidth = Stage.width;
      this.StageHeight = Stage.height;
      this._x = this.StageWidth / 2;
      this._y = this.StageHeight / 2;
      var _loc11_ = 50;
      var _loc12_ = 30;
      var _loc9_ = 200;
      var _loc8_ = 1;
      var _loc10_ = 16777215;
      var _loc7_ = 0;
      this.loaderX = (- this.StageWidth) / 2 + this.StageWidth / 40;
      this.loaderY = this.StageHeight / 2 - 50;
      this.drawSky();
      this.dropShadow = new flash.filters.DropShadowFilter(3,45,0,0.2,10,10,2,3);
      this.drawBox(this.loaderX,this.loaderY + 20,_loc9_,10,this.boxDepth,_loc8_,_loc10_,_loc7_);
      this.gameName = this.createTextField("gameName",this.textDepth,this.loaderX,this.loaderY,300,20);
      this.percentLoadedTxt = this.createTextField("loadedTxt",this.text2Depth,this.loaderX + 205,this.loaderY + 16,100,20);
      this.gameName.text = _global.game_nms;
      this.txtFrmt = new TextFormat();
      this.txtFrmt.font = "Verdana";
      this.txtFrmt.size = 12;
      this.txtFrmt.color = 0;
      this.gameName.setTextFormat(this.txtFrmt);
      this.gameName.selectable = false;
      this.percentLoadedTxt.setTextFormat(this.txtFrmt);
      this.percentLoadedTxt.selectable = false;
      var thisClass = this;
      this.onEnterFrame = function()
      {
         if(thisClass.percentLoadedTxt.text != "100 %")
         {
            thisClass.percentLoadedTxt.text = Math.floor(this.percentLoadd * 100) + " %";
            thisClass.drawBox(thisClass.loaderX,thisClass.loaderY + 21,this.percentLoadd * 200,9,thisClass.boxFrameDepth,0,0,16777215);
         }
         thisClass.update();
      };
      var _loc4_ = 0;
      while(_loc4_ < 10)
      {
         this.Floatloons_alive[_loc4_] = {alive:false,fl:undefined};
         _loc4_ = _loc4_ + 1;
      }
      this.FloatloonDeck = this.getDeck(10);
      this.createNewSprite(-200,this.randomYPlacement(),"g",this.FloatloonDeck,30,true);
      this.createNewSprite(-100,this.randomYPlacement(),"a",this.FloatloonDeck,30,true);
      this.createNewSprite(0,this.randomYPlacement(),"i",this.FloatloonDeck,30,true);
      this.createNewSprite(100,this.randomYPlacement(),"a",this.FloatloonDeck,30,true);
      this.createNewSprite(0,60,"o2",this.FloatloonDeck,10,false);
      this.createNewSprite(35,65,"n2",this.FloatloonDeck,10,false);
      this.createNewSprite(70,60,"l2",this.FloatloonDeck,10,false);
      this.createNewSprite(105,55,"i2",this.FloatloonDeck,10,false);
      this.createNewSprite(140,65,"n2",this.FloatloonDeck,10,false);
      this.createNewSprite(175,60,"e2",this.FloatloonDeck,10,false);
      this.fan = this.attachMovie("fan","fan",this.fanDepth);
      this.fan._xscale = this.fan._yscale = 30;
   }
   function randomYPlacement()
   {
      var _loc1_ = -30 + random(20);
      return _loc1_;
   }
   function createNewSprite(x, y, sprite, dck, scale, coll)
   {
      if(coll == undefined)
      {
         coll = false;
      }
      var _loc2_ = 0;
      while(this.Floatloons_alive[_loc2_].alive)
      {
         _loc2_ = _loc2_ + 1;
      }
      this.Floatloons_alive[_loc2_].fl = new Sprite(this,sprite,dck + _loc2_,scale);
      this.Floatloons_alive[_loc2_].fl.itemIndex = _loc2_;
      this.Floatloons_alive[_loc2_].fl.mc._x = x;
      this.Floatloons_alive[_loc2_].fl.mc._y = y;
      this.Floatloons_alive[_loc2_].fl.initVector();
      this.Floatloons_alive[_loc2_].alive = true;
      this.Floatloons_alive[_loc2_].fl.coll = coll;
   }
   function getDeck(d)
   {
      var _loc2_ = this.deck;
      this.deck += d;
      return _loc2_;
   }
   function drawBox(x, y, w, h, d, lineSize, lineColor, fillColor)
   {
      var _loc2_;
      _loc2_ = this.createEmptyMovieClip("box" + d,d);
      if(lineSize)
      {
         _loc2_.lineStyle(lineSize,lineColor);
      }
      if(fillColor)
      {
         _loc2_.beginFill(fillColor);
      }
      _loc2_.moveTo(x,y);
      _loc2_.lineTo(x + w,y);
      _loc2_.lineTo(x + w,y + h);
      _loc2_.lineTo(x,y + h);
      _loc2_.lineTo(x,y);
      if(fillColor)
      {
         _loc2_.endFill();
      }
      _loc2_.filters = [this.dropShadow];
   }
   function drawSky()
   {
      trace("DSFDSFDSFD    " + this);
      var _loc3_ = this.attachMovie("bgSky","bgSky",this.skyDepth);
      _loc3_._width = _global.stageSize[0];
      _loc3_._height = _global.stageSize[1];
      _loc3_.cacheAsBitmap;
   }
   function update()
   {
      this.fan._x = _root._xmouse - this._x;
      this.fan._y = _root._ymouse - this._y;
      Mouse.hide();
   }
}
