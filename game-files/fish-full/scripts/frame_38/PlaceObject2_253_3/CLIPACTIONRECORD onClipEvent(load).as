onClipEvent(load){
   function initFish(fishLevel, rareChance)
   {
      pondSize = 200;
      if(fishLevel == 0)
      {
         if(rareChance == 1)
         {
            fishAvailable = new Array(18,54,18,9,1);
         }
         else
         {
            fishAvailable = new Array(18,54,18,9,0);
         }
      }
      else if(fishLevel == 1)
      {
         if(rareChance == 1)
         {
            fishAvailable = new Array(32,54,11,3,1);
         }
         else
         {
            fishAvailable = new Array(32,54,11,3,0);
         }
      }
      else
      {
         fishAvailable = new Array(51,42,6,1,0);
      }
      fishSize = new Array();
      fishSize[0] = new s_fish(25,100);
      fishSize[1] = new s_fish(25,100);
      fishSize[2] = new s_fish(45,100);
      fishSize[3] = new s_fish(65,100);
      junk = new Array();
      junk[0] = new o_fish("An Old Can!","I don\'t know if I can deal with this.",5,40,0.3);
      junk[1] = new o_fish("An Old Boot!","Now if only I had one more \n I wouldn\'t have to buy new shoes.",6,40,0.3);
      junk[2] = new o_fish("A Big Old Tire!","Geebus! What am I gonna do with this junk!?",7,40,0.3);
      junk[3] = new o_fish("Drift Wood!","Your hard work has paid off! You\'ve got junk!",15,40,0.3);
      fishSmall = new Array();
      fishSmall[0] = new o_fish("An Orange Guppy!","How tiny...poor little guy.",0,25,0.3);
      fishSmall[1] = new o_fish("A Yellow Guppy!","Looks kinda puny to me.",1,30,0.35);
      fishSmall[2] = new o_fish("A Red Guppy!","You may be red, but now you\'re dead.",12,35,0.4);
      fishSmall[3] = new o_fish("Red Bubble-Eye Goldfish!","That\'s money in the-- uh-- fish in the bank!",16,25,0.26);
      fishSmall[4] = new o_fish("Gold Bubble-Eye Goldfish!","That\'s money in the-- uh-- fish in the bank!",17,20,0.3);
      fishSmall[5] = new o_fish("Black Bubble-Eye Goldfish!","That\'s money in the-- uh-- fish in the bank!",18,15,0.32);
      fishMedium = new Array();
      fishMedium[0] = new o_fish("A Green Bass!","This kicks serious bass!",2,30,0.45);
      fishMedium[1] = new o_fish("A Brown Bass!","This one smells like bass!",3,40,0.45);
      fishMedium[2] = new o_fish("A Blue Bass!","No wonder you\'re blue, cuz I caught you!",13,35,0.5);
      fishMedium[3] = new o_fish("Kohaku Koi!","Don\'t be koi about your accomplishment, you\'re a great fisher!",19,40,0.4);
      fishMedium[4] = new o_fish("Ochiba Koi!","Don\'t be koi about your accomplishment, you\'re a great fisher!",20,30,0.52);
      fishMedium[5] = new o_fish("Yamabuki Koi!","Don\'t be koi about your accomplishment, you\'re a great fisher!",21,35,0.46);
      fishLarge = new Array();
      fishLarge[0] = new o_fish("A Blue Striper!","The blue stripe keeps it dry and fresh\n even underwater.",10,40,0.55);
      fishLarge[1] = new o_fish("A Gray Striper!","Whoa...a gray striper!  No wonder he \n moved so fast!",11,25,0.55);
      fishLarge[2] = new o_fish("A Green Striper!","The green stripe is for freshness!",14,30,0.6);
      fishLarge[5] = new o_fish("Witchling Catfish!","Looks like the cat\'s IN the bag!",22,35,0.65);
      fishLarge[4] = new o_fish("Tigerstripe Catfish!","Looks like the cat\'s IN the bag!",23,30,0.75);
      fishLarge[3] = new o_fish("Russian Catfish!","Looks like the cat\'s IN the bag!",24,40,0.65);
      fishRare = new Array();
      if(currentTime == "day")
      {
         fishRare[0] = new o_fish("Mutha Guppa!!!","Dang gurl! Baby got back!",8,25,0.8);
      }
      else if(currentTime == "night")
      {
         fishRare[0] = new o_fish("Big Mouth Bass*terd!!!","OMG! HE\'s HUGE!",4,25,0.8);
      }
      else
      {
         fishRare[0] = new o_fish("Candy Striper!!!","I don\'t know why anyone \n would volunteer to get caught.",9,25,0.8);
      }
   }
   function s_fish(minDistance, maxDistance)
   {
      this.minDistance = minDistance;
      this.maxDistance = maxDistance;
   }
   function o_fish(fishName, fishDesc, fishIDCode, aggressiveness, speed)
   {
      this.fishName = fishName;
      this.fishDesc = fishDesc;
      this.fishIDCode = fishIDCode;
      this.aggressiveness = aggressiveness;
      this.speed = speed;
   }
   function checkForBite(dist)
   {
      var _loc2_ = 0;
      var _loc3_ = 0;
      var _loc4_ = 0;
      var _loc5_ = random(pondSize);
      var _loc6_ = 0;
      if(fishAvailable[4] >= 1)
      {
         if(_loc5_ >= 150)
         {
            return 4;
         }
      }
      x = 3;
      while(x >= 0)
      {
         _loc6_ += fishAvailable[x];
         x--;
      }
      var _loc7_;
      var _loc8_;
      if(_loc5_ <= _loc6_)
      {
         _loc7_ = 3;
         while(_loc7_ >= 0)
         {
            x = _loc7_;
            while(x >= 0)
            {
               _loc2_ += fishAvailable[x];
               x--;
            }
            _loc4_ = _loc7_ - 1;
            if(_loc4_ >= 0)
            {
               y = _loc4_;
               while(y >= 0)
               {
                  _loc3_ += fishAvailable[y];
                  y--;
               }
            }
            if(_loc3_ < _loc5_ && _loc2_ >= _loc5_ && fishAvailable[_loc7_] != 0)
            {
               _loc8_ = fishSize[_loc7_];
               if(dist >= _loc8_.minDistance && dist <= _loc8_.maxDistance)
               {
                  return _loc7_;
               }
               return -999;
            }
            _loc3_ = 0;
            _loc2_ = 0;
            _loc7_ -= 1;
         }
      }
      return -99;
   }
   function loadFishData(whichBait, saveFlag)
   {
      var _loc4_;
      var _loc5_;
      var _loc6_;
      if(_root.playAsGuest)
      {
         _loc4_ = "2d4c488e581879c8bfc0664c35cb2ccc";
         _loc5_ = "c56b5ba08a469081f0032cc04ebd562b";
         _loc6_ = "500\x01\x05\x010\x01" + _loc4_ + "\x01" + _loc5_ + "2";
         loadFishData_CB(_loc6_);
         return undefined;
      }
      var _loc7_;
      if(whichBait == "baita")
      {
         _loc7_ = "100003";
      }
      if(whichBait == "baitd")
      {
         _loc7_ = "100002";
      }
      if(whichBait == "baitf")
      {
         _loc7_ = "100001";
      }
      var _loc8_ = new Array();
      _loc8_[0] = "500";
      _loc8_[1] = _loc7_;
      _loc8_[2] = saveFlag;
      _loc8_[3] = _root.gsiUserData.gaiaSID;
      sushi.callPlugin("G_FISH_PLUGIN",_loc8_,loadFishData_CB,_root);
   }
   function loadFishData_CB(loadedData)
   {
      if(checkForGSIError(loadedData))
      {
         return undefined;
      }
      var _loc3_ = unescape(loadedData);
      var _loc4_ = _loc3_.split("\x01");
      var _loc5_;
      var _loc6_;
      var _loc7_;
      var _loc8_;
      if(_loc4_[1] == "\x06")
      {
         _loc5_ = _loc4_[2];
         _loc6_ = _loc4_[3];
         if(_loc5_ == "-8")
         {
            _loc7_ = "A fishing game is already in progress or your previous game was not saved. \n\nDo you want to continue with a new game?";
            _root.attachMovie("errorPanelNewGame","errorPanelNewGame",430,{theMessage:_loc7_,popPanelType:"newgame"});
         }
         else
         {
            _root.attachMovie("errorPanelQuit","errorPanelQuit",430,{theMessage:_loc6_,popPanelType:"quit"});
         }
      }
      else
      {
         fishData.sid2 = _loc4_[2];
         fishData.sid3 = _loc4_[3];
         fishData.timeOfDay = _loc4_[4];
         _loc8_ = titleTimeOfDay[fishData.timeOfDay];
         currentTimeOfDay(_loc8_);
         switch(fishData.sid2)
         {
            case "0bec1093f7a3de5a1fb0481a90c72387":
               fishData.fishLevel = 0;
               break;
            case "8537b11bae00996495118be7a6cb899d":
               fishData.fishLevel = 0;
               break;
            case "2d4c488e581879c8bfc0664c35cb2ccc":
               fishData.fishLevel = 1;
               break;
            case "af9d30069c67e56b93c621d4ccb611c4":
               fishData.fishLevel = 1;
               break;
            case "c90b2f8da134c0889936adec6466d290":
               fishData.fishLevel = 2;
               break;
            default:
               fishData.fishLevel = 2;
         }
         if(fishData.sid2 == "8537b11bae00996495118be7a6cb899d" || fishData.sid2 == "af9d30069c67e56b93c621d4ccb611c4")
         {
            fishData.rare = 1;
         }
         else
         {
            fishData.rare = 0;
         }
         initFish(fishData.fishLevel,fishData.rare);
         _root.mapOverview.map.coast.enabled = true;
         _root.woodPanel.saveQuit_btn.enabled = true;
         _root.main.showRod(true);
      }
   }
   function o_Vector(x, y)
   {
      this.x = x;
      this.y = y;
   }
   function distPoints(x1, y1, x2, y2)
   {
      var _loc5_ = (x1 - x2) * (x1 - x2);
      var _loc6_ = (y1 - y2) * (y1 - y2);
      var _loc7_ = Math.sqrt(_loc5_ + _loc6_);
      return _loc7_;
   }
   function normalizeV(vec)
   {
      var _loc2_ = new o_Vector();
      var _loc3_ = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
      _loc2_.x = vec.x / _loc3_;
      _loc2_.y = vec.y / _loc3_;
      return _loc2_;
   }
   function dotV(vec1, vec2)
   {
      var _loc3_ = vec1.x * vec2.x + vec1.y * vec2.y;
      return _loc3_;
   }
   function lengthV(v)
   {
      var _loc2_ = Math.sqrt(v.x * v.x + v.y * v.y);
      return _loc2_;
   }
   function init3d()
   {
      viewDist = 10;
      cam = new o_3dVector(12,11,-15);
      ScreenOffx = -80;
      ScreenOffy = -25;
      ScreenZoom = 25;
      foff = new o_3dVector(0,0,0);
   }
   function worldToScreenCoords(vec)
   {
      var _loc2_ = new o_3dVector(0,0,0);
      _loc2_.x = vec.x - cam.x;
      _loc2_.y = -1 * (vec.y - cam.y);
      _loc2_.z = vec.z - cam.z;
      var _loc3_ = new o_Vector();
      _loc3_.x = ScreenOffx + _loc2_.x / _loc2_.z * viewDist * ScreenZoom;
      _loc3_.y = ScreenOffy + _loc2_.y / _loc2_.z * viewDist * ScreenZoom;
      return _loc3_;
   }
   function worldToScreenScale(depth)
   {
      var _loc2_ = new o_3dVector(100,0,depth);
      _loc2_.z -= cam.z;
      var _loc3_ = _loc2_.x / _loc2_.z * viewDist * ScreenZoom;
      return _loc3_;
   }
   function o_3dVector(x, y, z)
   {
      this.x = x;
      this.y = y;
      this.z = z;
   }
   function displayBaitDialog()
   {
      _root.selectBait.gotoAndStop("bait");
      _root.selectBait.baita_mc.baita_btn.enabled = true;
      _root.selectBait.baitd_mc.baitd_btn.enabled = true;
      _root.selectBait.baitf_mc.baitf_btn.enabled = true;
      _root.selectBait.baita_mc.baita_txt = _root.user.baitA;
      _root.selectBait.baitd_mc.baitd_txt = _root.user.baitD;
      _root.selectBait.baitf_mc.baitf_txt = _root.user.baitF;
      if(_root.user.baitA == 0 || _root.user.baitA == undefined)
      {
         _root.selectBait.baita_mc.baita_txt = 0;
         _root.selectBait.baita_mc.baita_btn.enabled = false;
      }
      if(_root.user.baitD == 0 || _root.user.baitD == undefined)
      {
         _root.selectBait.baitd_mc.baitd_txt = 0;
         _root.selectBait.baitd_mc.baitd_btn.enabled = false;
      }
      if(_root.user.baitF == 0 || _root.user.baitF == undefined)
      {
         _root.selectBait.baitf_mc.baitf_txt = 0;
         _root.selectBait.baitf_mc.baitf_btn.enabled = false;
      }
      var _loc2_ = int(_root.user.baitA) + int(_root.user.baitD) + int(_root.user.baitF);
      if(_loc2_ <= 0)
      {
         _root.launchLoganNoBait();
      }
   }
   function currentTimeOfDay(currTime)
   {
      currentTime = currTime;
      _root.avatarScreen.gotoAndStop(currentTime);
      _root.view.mainScene.gotoAndStop(currentTime);
      _root.view.land.gotoAndStop(currentTime);
      _root.mapOverview.map.bg.gotoAndStop(currentTime);
      _root.view.clouds1.gotoAndStop(currentTime);
      _root.view.clouds2.gotoAndStop(currentTime);
   }
   function setCurRod(newId)
   {
      playSound("rodSFX");
      var _loc3_ = rodDbValues.length;
      var _loc4_ = 0;
      while(_loc4_ < _loc3_)
      {
         if(newId == rodDbValues[_loc4_])
         {
            curRodId = _loc4_;
         }
         _loc4_ += 1;
      }
      _root.main.rodPlacement.char.removeMovieClip();
      var _loc5_ = "rod_" + rodToUse[curRodId];
      ROD_MAX_DISTANCE = rodMaxDistance[curRodId];
      ROD_SOUND = rodToUse[curRodId];
      var _loc6_ = curRodId + 1;
      _root.main.rodPlacement.attachMovie(_loc5_,"char",100);
      _root.main.rodPlacement.guidelines.gotoAndStop(_loc6_);
      _root.main.rodselect.icon.gotoAndStop(_loc6_);
      _root.avatarGroup.avatarp1.avatarRod.gotoAndStop(_loc6_);
      rodselect.nameTxt = rodNames[curRodId];
      _root.main.rodPlacement.char.gotoAndStop("idle");
      var _loc7_;
      if(_root.fromGameRoom == true)
      {
         _loc7_ = sushi.me.data;
         _loc7_[_root.DATA_ROD_TYPE] = _loc6_;
         _loc7_[_root.DATA_UPDATE_TYPE] = _root.UPDATE_TYPE_CHANGE_ROD;
         sushi.me.update(_loc7_);
      }
   }
   function selectRod(indexStep)
   {
      curUserRodIndex += indexStep;
      var _loc3_ = _parent.user.rodIDs.length;
      if(curUserRodIndex >= _loc3_)
      {
         curUserRodIndex = 0;
      }
      else if(curUserRodIndex < 0)
      {
         curUserRodIndex = _loc3_ - 1;
      }
      setCurRod(_parent.user.rodIDs[curUserRodIndex]);
   }
   function gameOver()
   {
      gamedOver = true;
      openSave();
   }
   function openSave()
   {
      showRod(false);
      _root.mapOverview.map.coast.enabled = false;
      _root.woodPanel.saveQuit_btn.enabled = false;
      _root.savePanel.gotoAndPlay(2);
   }
   function continueGame()
   {
      if(gamedOver)
      {
         getUrl("javascript:window.close();","");
      }
      else
      {
         _root.launchLogan();
         _root.loadGetData(false);
      }
   }
   function splash()
   {
      if(Math.random() > 0.959)
      {
         rodPlacement.bob.gotoAndPlay("bite");
         playSound("fish_splash");
      }
   }
   function rodPulling()
   {
      var _loc2_ = 140;
      var _loc3_ = Math.max(_root.main.rodPlacement._xmouse,- _loc2_);
      var _loc4_ = Math.round(sidePull * 3);
      sidePull = _loc3_ / _loc2_;
      var _loc5_;
      if(_loc4_ > 0)
      {
         _loc5_ = 32 + _loc4_;
         if(_loc5_ >= 35)
         {
            _loc5_ = 35;
         }
         _root.main.rodPlacement.char.gotoAndStop(_loc5_);
      }
      else if(_loc4_ < 0)
      {
         _root.main.rodPlacement.char.gotoAndStop(29 + Math.abs(_loc4_));
      }
      else
      {
         _root.main.rodPlacement.char.gotoAndStop(38);
      }
   }
   function fightingFish()
   {
      if(FISH_ENDURANCE % ft.aggressiveness == 0)
      {
         if(fishPull.x <= 0)
         {
            fishPull.x = Math.abs(fishPull.x);
         }
         else
         {
            fishPull.x = - fishPull.x;
         }
      }
      FISH_ENDURANCE++;
   }
   function catchingFish()
   {
      var _loc3_;
      if(_root.main.rodPlacement.guidelines.hitTest(bobSpos.x + _root.main.rodPlacement._x,bobSpos.y + _root.main.rodPlacement._y,true))
      {
         if(bobWpos.z > 5)
         {
            _root.main.rodPlacement.lin._x = 1000;
            _root.fishGotAwayAlert.gotoAndPlay("on");
            _root.main.rodPlacement.char.gotoAndStop("escape");
            gameMode = "paused";
            _root.avatarGroup.avatarp1.wordBubble.gotoAndPlay("escape");
            if(_root.fromGameRoom == true)
            {
               _loc3_ = sushi.me.data;
               _loc3_[_root.DATA_BUBBLE_TYPE] = "escape";
               _loc3_[_root.DATA_UPDATE_TYPE] = _root.UPDATE_TYPE_BUBBLE;
               sushi.me.update(_loc3_);
            }
            setBobber();
            showFishShadow(0);
         }
      }
      if(bobWpos.z < 5)
      {
         playSound("catchFish");
         _root.main.rodPlacement.char.gotoAndStop("gotone");
         gameMode = "paused";
         _root.main.rodPlacement.lin._x = 1000;
         _root.main.rodPlacement.bob._x = 1100;
         _root.avatarGroup.avatarp1.wordBubble.whichFishIcon = ft.fishIDCode + 10;
         _root.avatarGroup.avatarp1.wordBubble.gotoAndPlay("gotone");
         if(_root.fromGameRoom == true)
         {
            _loc3_ = sushi.me.data;
            _loc3_[_root.DATA_BUBBLE_TYPE] = "gotone";
            _loc3_[_root.DATA_BUBBLE_FISH] = ft.fishIDCode + 10;
            _loc3_[_root.DATA_UPDATE_TYPE] = _root.UPDATE_TYPE_BUBBLE;
            sushi.me.update(_loc3_);
         }
         _parent.gotoneAlert.fishID = ft.fishIDCode + 10;
         _parent.gotoneAlert.gotoAndPlay("on");
         _parent.gotoneAlert.fishInfo1 = ft.fishName;
         _parent.gotoneAlert.fishInfo2 = ft.fishDesc;
         myFish.push(ft.fishIDCode);
         _parent.inventory.setIcons(myFish);
         if(fishAvailable[hookedFishType] != 0)
         {
            fishAvailable[hookedFishType] -= 1;
         }
         showFishShadow(0);
      }
   }
   function setBobber()
   {
      bobSpos = worldToScreenCoords(bobWpos);
      var _loc2_ = worldToScreenScale(bobWpos.z);
      _root.main.rodPlacement.bob._x = bobSpos.x;
      _root.main.rodPlacement.bob._y = bobSpos.y;
      _root.main.rodPlacement.bob._xscale = _loc2_ * 0.065;
      _root.main.rodPlacement.bob._yscale = _loc2_ * 0.065;
   }
   function showFishShadow(showShadow)
   {
      if(showShadow == 0)
      {
         _root.main.rodPlacement.bob.shadow.gotoAndStop(1);
      }
      else
      {
         _root.main.rodPlacement.bob.shadow.gotoAndStop(2);
      }
   }
   function startThrow()
   {
      Selection.setFocus("_root.main.focus_btn");
      _root.woodPanel.saveQuit_btn.enabled = false;
      _root.mapOverview.map.coast.enabled = false;
      _root.main.rodselect.nextRod_btn.enabled = false;
      _root.main.rodselect.prevRod_btn.enabled = false;
      _root.main.rodPlacement.char.gotoAndPlay("throw");
      gameMode = "moveBack";
      throwPower = releasePower = 0;
      cosCount = 3.141592653589793;
   }
   function startRelease()
   {
      _root.main.rodPlacement.char.gotoAndPlay("release");
      gmCount = 0;
      gameMode = "moveForward";
   }
   function setDistanceGauge(dist)
   {
      _root.main.distanceGauge.mark._y = dist / 100 * -200;
   }
   function doLine()
   {
      _root.main.rodPlacement.lin._x = _root.main.rodPlacement.char.end._x;
      _root.main.rodPlacement.lin._y = _root.main.rodPlacement.char.end._y;
      _root.main.rodPlacement.lin._xscale = _root.main.rodPlacement.bob._x - _root.main.rodPlacement.char.end._x;
      _root.main.rodPlacement.lin._yscale = _root.main.rodPlacement.bob._y - _root.main.rodPlacement.char.end._y;
   }
   function resetThrow()
   {
      if(myFish.length >= MAX_FISH_AMOUNT)
      {
         clearSettings();
         openSave();
      }
      else
      {
         clearSettings();
      }
   }
   function clearSettings()
   {
      _root.woodPanel.saveQuit_btn.enabled = true;
      _root.mapOverview.map.coast.enabled = true;
      _root.main.rodselect.nextRod_btn.enabled = true;
      _root.main.rodselect.prevRod_btn.enabled = true;
      _root.main.rodPlacement.char.gotoAndStop("idle");
      _root.main.rodPlacement.bob.gotoAndStop(1);
      _root.main.rodPlacement.lin._x = 1000;
      _root.main.rodPlacement.lin.gotoAndStop(1);
      _root.main.rodPlacement.guidelines._visible = false;
      setDistanceGauge(0);
      timeOutCounter = 0;
      bobWpos.z = 0;
      power.mark._x = 0;
      hookedFishType = -99;
   }
   function doFishingLoop()
   {
      fCount++;
      bobWpos.x += bobVel.x;
      bobWpos.z += bobVel.z;
      setDistanceGauge(bobWpos.z);
      doLine();
      if(bobWpos.z < -1.5)
      {
         gameMode = "none";
         resetThrow();
      }
      if(bobWpos.z >= MIN_DISTANCE_BITE)
      {
         if(fCount % CHECK_FOR_BITE_INTERVAL == 0)
         {
            res = checkForBite(bobWpos.z);
            if(res >= 0)
            {
               return res;
            }
         }
      }
      return -99;
   }
   function setMessage(str)
   {
      if(_root.setMessageCounter++ > 45)
      {
         mess.txt = "";
         return undefined;
      }
      if(str == "Hold fish inside red lines!!")
      {
         str = "move mouse to stay between lines";
      }
      if(str == "Click to start throw..")
      {
         str = "click mouse to begin cast.";
      }
      if(str == "Click again to select power.")
      {
         str = "click again to set distance";
      }
      mess.txt = str;
   }
   function loadSoundFiles()
   {
      fish_splash = new Sound();
      fish_splash.attachSound("fishsplash");
      bobber_splash = new Sound();
      bobber_splash.attachSound("bobbersplash");
      whiplight = new Sound();
      whiplight.attachSound("whiplight");
      alert = new Sound();
      alert.attachSound("alert");
      whipheavy = new Sound();
      whipheavy.attachSound("whipheavy");
      ROD_SOUND = "whiplight";
      catchFish = new Sound();
      catchFish.attachSound("catchFish");
      rodSFX = new Sound();
      rodSFX.attachSound("rodSFX");
   }
   function playSound(whichFile)
   {
      if(SOUND_STATE == true)
      {
         soundFile = eval(whichFile);
         soundFile.start();
      }
   }
   function soundControl(state)
   {
      SOUND_STATE = state;
   }
   function cameraShake()
   {
      _root.view._x = CSorgX + CSOffsets[CSid] * -0.05;
      _root.view._y = CSorgY + CSOffsets[CSid] * -0.9;
      CSid++;
      if(CSid > CSOffsets.length)
      {
         CSid = 0;
         CSon = false;
         _root.view._x = CSorgX;
         _root.view._y = CSorgY;
      }
   }
   function selectedBait(whichBait)
   {
      myFish = new Array();
      _root.inventory.init();
      _root.selectBait.gotoAndStop("hidepanel");
      _root.bucketbg_mc.gotoAndStop(whichBait);
      _root.avatarGroup.avatarp1.avatarBait.gotoAndStop(whichBait);
      var _loc3_;
      if(_root.fromGameRoom == true)
      {
         _loc3_ = sushi.me.data;
         _loc3_[_root.DATA_BUBBLE_FISH] = 3;
         _loc3_[_root.DATA_BAIT_TYPE] = whichBait;
         _loc3_[_root.DATA_UPDATE_TYPE] = _root.UPDATE_TYPE_CHANGE_BAIT;
         sushi.me.update(_loc3_);
      }
      selectBait = 0;
      baitSelected = whichBait;
      loadFishData(whichBait,0);
   }
   function showRod(toggleCheck)
   {
      if(toggleCheck == true)
      {
         _root.main.rodPlacement.char.gotoAndStop("idle");
         _root.main.rodselect.nextRod_btn.enabled = true;
         _root.main.rodselect.prevRod_btn.enabled = true;
      }
      else
      {
         _root.main.rodPlacement.char.gotoAndStop("off");
         _root.main.rodselect.nextRod_btn.enabled = false;
         _root.main.rodselect.prevRod_btn.enabled = false;
      }
   }
   _root.main.rodselect.nextRod_btn.onRelease = function()
   {
      Selection.setFocus("_root.main.focus_btn");
      selectRod(1);
   };
   _root.main.rodselect.prevRod_btn.onRelease = function()
   {
      Selection.setFocus("_root.main.focus_btn");
      selectRod(-1);
   };
   fishData = new Object();
   _root.updateUserListing();
   myTraceTarget.level = LogEventLevel.NONE;
   var FISH_ENDURANCE = 0;
   var MAX_FISH_AMOUNT = 18;
   var CHECK_FOR_BITE_INTERVAL = 50;
   var MIN_DISTANCE_BITE = 5;
   var THROW_SPEED = 5;
   var SOUND_STATE = true;
   _root.mapOverview.map.coast.enabled = false;
   _root.mapOverview.map.sceneScroll(0);
   var rodDbValues = new Array(2523,2524,2529,2530,2525,2526,2527,2528,10203,10205);
   var rodNames = new Array("Basic Rod","Basic Rod Plus","Performance Rod","Performance Rod Plus","Distance Rod","Distance Rod Plus","Strength Rod","Strength Rod Plus","Angelic Rod","Angelic Rod Plus");
   var rodToUse = new Array(1,1,2,2,3,3,4,4,5,5);
   var rodMaxDistance = new Array(70,80,75,90,90,100,60,75,100,100);
   var initRodId = _root.user.rodIDs[0];
   var poleDefPos = 18;
   var maxPower = 165;
   var throwPos = 0;
   var releasePower = 0;
   var curUserRodIndex = 0;
   var gamedOver = false;
   var timeOutTimer = 30000;
   var titleTimeOfDay = new Array("day","sunset","night","twilight");
   var currentTime = titleTimeOfDay[_root.user.timeOfDay];
   var selectBait = 1;
   var baitSelected;
   var timeOutCounter = 0;
   var sendToSushi = 0;
   var myFish = new Array();
   var hookedFishType = -99;
   var throwDist = 0;
   var sidePull = 0;
   var targfPos = 0;
   var fVel = 0;
   var fPos = 0.2;
   var fCount = 0;
   var cosCount = 3.141592653589793;
   var pointerPos = 0;
   var CSOffsets = new Array(10,-8,7,-5,9,-6,5,-3,4,2,-1,1,-3,0,-1,1,0);
   var CSon = false;
   var CSorgX = _root.view._x;
   var CSorgY = _root.view._y;
   var CSid = 0;
   setCurRod(initRodId);
   _root.main.rodPlacement.char.gotoAndStop("off");
   init3d();
   loadSoundFiles();
   currentTimeOfDay(currentTime);
   if(_root.user.userLevel == 1)
   {
      rodPlacement.fishLevel_txt = "Fish Level: " + _parent.user.fishLevel;
   }
   _root.main.rodPlacement.guidelines._visible = false;
   _root.main.rodPlacement.lin._x = 1000;
   _root.main.rodPlacement.guidelines._visible = false;
   bobWpos = new o_3dVector(0,0,0);
   bobSpos = new o_Vector(0,0);
   bobVel = new o_3dVector(0,0,-0.25);
   fishPull = new o_3dVector(0,0,0);
   displayBaitDialog();
   _root.woodPanel.saveQuit_btn.enabled = false;
   showRod(false);
   _root.main.onEnterFrame = function()
   {
      if(CSon)
      {
         cameraShake();
      }
      var _loc3_;
      var _loc4_;
      var _loc5_;
      var _loc6_;
      var _loc7_;
      switch(gameMode)
      {
         case "none":
         case "moveBack":
            if(cosCount <= 16.964600329384883)
            {
               cosCount += 0.08;
            }
            _loc3_ = (0.5 + Math.cos(cosCount) / 2) * 2;
            if(_loc3_ <= 1)
            {
               throwPower = _loc3_ * maxPower;
            }
            if(_loc3_ > 1)
            {
               throwPower = maxPower - (_loc3_ - 1) * maxPower;
            }
            throwPower = Math.min(maxPower,throwPower);
            _root.main.power.mark._x = throwPower;
            releasePower = throwPower;
            break;
         case "moveForward":
            gmCount++;
            if(gmCount > 4)
            {
               gameMode = "release";
            }
            break;
         case "release":
            if(ROD_SOUND != 4)
            {
               playSound("whiplight");
            }
            else
            {
               playSound("whipheavy");
            }
            throwDist = releasePower / maxPower * ROD_MAX_DISTANCE;
            bobWpos.z = throwDist;
            bobWpos.x = poleDefPos;
            bobWpos.y = _loc4_ = 0;
            bobVel.y = _loc4_;
            bobVel.x = _loc4_;
            curDist = _loc4_;
            gmCount = _loc4_;
            setBobber();
            gameMode = "inair";
            break;
         case "inair":
            curDist += THROW_SPEED;
            if(throwdist == 0)
            {
               throwDist = 1;
            }
            if(curDist > throwDist)
            {
               gameMode = "land";
            }
            setDistanceGauge(curDist);
            break;
         case "land":
            _root.main.rodPlacement.char.linanim.gotoAndStop("off");
            curDist = throwDist;
            gmCount = 0;
            _root.main.rodPlacement.bob.gotoAndPlay("land");
            playSound("bobber_splash");
            doLine();
            gameMode = "fishing";
            break;
         case "fishing":
            setBobber();
            gotSome = doFishingLoop();
            if(gotSome >= 0)
            {
               hookedFishType = gotSome;
               _root.main.rodPlacement.bob.gotoAndPlay("bite");
               _root.main.rodPlacement.lin.gotoAndStop(2);
               _root.main.rodPlacement.guidelines._visible = true;
               _root.avatarGroup.avatarp1.wordBubble.gotoAndPlay("hooked");
               _parent.fishHookedAlert.gotoAndPlay("on");
               if(_root.fromGameRoom == true)
               {
                  _loc5_ = sushi.me.data;
                  _loc5_[_root.DATA_BUBBLE_TYPE] = "hooked";
                  _loc5_[_root.DATA_UPDATE_TYPE] = _root.UPDATE_TYPE_BUBBLE;
                  sushi.me.update(_loc5_);
               }
               playSound("alert");
               gmCount = 0;
               CSon = true;
               showFishShadow(1);
               switch(hookedFishType)
               {
                  case 0:
                     _loc6_ = random(4);
                     ft = junk[_loc6_];
                     break;
                  case 1:
                     _loc6_ = random(6);
                     ft = fishSmall[_loc6_];
                     break;
                  case 2:
                     _loc6_ = random(6);
                     ft = fishMedium[_loc6_];
                     break;
                  case 3:
                     _loc6_ = random(6);
                     ft = fishLarge[_loc6_];
                     break;
                  case 4:
                     ft = fishRare[0];
                     break;
                  default:
                     _loc6_ = random(4);
                     ft = junk[_loc6_];
               }
               fishPull.x = ft.speed;
               _loc7_ = random(2);
               if(_loc7_ == 0)
               {
                  fishPull.x = - fishPull.x;
               }
            }
            break;
         case "pullFish":
            splash();
            setDistanceGauge(bobWpos.z);
            rodPulling();
            fightingFish();
            bobVel.x = fishPull.x;
            bobVel.x += sidePull;
            bobWpos.x += bobVel.x;
            bobWpos.y += bobVel.y;
            bobWpos.z += bobVel.z;
            setBobber();
            doLine();
            catchingFish();
         default:
            return;
      }
   };
   gameMode = "none";
}
