class code.gameController
{
   var _visible;
   var _x;
   var _y;
   var animDelayFrames;
   var boardRect;
   var bonusLevelTypeArray;
   var builtWordArray;
   var builtWordString;
   var builtWordStringWithoutFreeU;
   var creditsToGrant;
   var degreeNames;
   var dockLetterArray;
   var doubleClickTimeMax;
   var dx;
   var dy;
   var gameState;
   var goldToGrant;
   var goldenLetterArray;
   var goldenWordType;
   var initialDepths;
   var itemGrantData;
   var itemToGrantId;
   var keyListener;
   var lastClickedTime;
   var lastSubmitTime;
   var letterHeight;
   var letterTileArray;
   var letterWidth;
   var levelNum;
   var levelResult;
   var levelType;
   var levelTypeNum;
   var mcActiveGoldenLetter;
   var mcBallLauncher;
   var mcBoard;
   var mcInterface;
   var mcSound;
   var mcTimer;
   var mcWordList;
   var mcWordSoFar;
   var minVowelsOnBoard;
   var movingItemsArray;
   var needToCheckGoldenMatches;
   var nextLetterDepth;
   var numAnimSteps;
   var numColumns;
   var numInvalidWordsInARow;
   var numPowerBalls;
   var numRows;
   var numVisibleRows;
   var onAnimComplete;
   var onEnterFrame;
   var originPt;
   var pGameController;
   var powerBallArray;
   var powerNameArray;
   var prePauseGameState;
   var prevMovingFlag;
   var roundNum;
   var score;
   var soundWhenArrived;
   var submitWordAttemptedFlag;
   var sushiGameData;
   var targetLoc;
   var timeBetweenBumps;
   var unitX;
   var unitY;
   var whereToGo;
   var maxWordLength = 8;
   function gameController()
   {
   }
   function initGame(initParams)
   {
      this.mcWordList = initParams.mcWordList;
      this.mcBoard = initParams.mcBoard;
      this.mcWordSoFar = initParams.mcWordSoFar;
      this.numVisibleRows = initParams.numVisibleRows;
      this.mcTimer = initParams.mcTimer;
      this.mcInterface = initParams.mcInterface;
      this.mcSound = _root.mcSound;
      this.mcSound.nextGameMusic();
      var _loc13_;
      var _loc6_;
      var _loc3_;
      var _loc4_;
      var _loc8_;
      var _loc7_;
      this.unitX = 45;
      this.unitY = 46;
      this.letterWidth = this.unitX - 3;
      this.letterHeight = this.unitY - 3;
      _loc13_ = "A4,B3,C3,D3,E8,F4,G4,H3,I5,J1,K1,L4,M4,N7,O8,P4,Q1,R7,S8,T8,U3,V1,W2,X1,Y1,Z1";
      this.degreeNames = new Array("Bachelors","Masters","Phd");
      _loc6_ = _loc13_.split(",");
      var _loc9_ = new Array();
      _loc3_ = 0;
      while(_loc3_ < _loc6_.length)
      {
         _loc8_ = _loc6_[_loc3_].charAt(0);
         _loc7_ = Number(_loc6_[_loc3_].charAt(1));
         _loc4_ = 0;
         while(_loc4_ < _loc7_)
         {
            _loc9_.push(_loc8_);
            _loc4_ = _loc4_ + 1;
         }
         _loc3_ = _loc3_ + 1;
      }
      var _loc17_ = new Array("A","E","I","O","U");
      this.doubleClickTimeMax = 300;
      this.nextLetterDepth = 0;
      this.initialDepths = {dockLetters:100,staticLetters:10000,dock:490000,ballLauncher:50000,powerBallIndicator:75000,wordSoFarLetterAnim:80000,movingLetters:100000,itemTile:140000,powerBall:150000,splitPods:160000};
      this.numPowerBalls = 3;
      this.powerNameArray = new Array();
      this.powerNameArray["0"] = ["sticky"];
      this.powerNameArray["1"] = ["bump"];
      this.powerNameArray["2"] = ["split"];
      this.powerNameArray["01"] = ["bump","sticky"];
      this.powerNameArray["02"] = ["split","sticky"];
      this.powerNameArray["12"] = ["split","bump"];
      this.powerNameArray["012"] = ["announce"];
      this.boardRect = new flash.geom.Rectangle(0,0,Stage.width,Stage.height);
      this.mcBoard.pGameController = this;
      this.dTrace("initParams.initialLevelNum:" + initParams.initialLevelNum);
      if(!isNaN(initParams.initialLevelNum))
      {
         this.levelNum = initParams.initialLevelNum;
      }
      else
      {
         this.levelNum = 1;
      }
      this.bonusLevelTypeArray = [undefined,"spam","chatterBox","spam","chatterBox","spam","itemGrant"];
      this.powerBallArray = new Array();
      _loc3_ = 0;
      var _loc5_;
      while(_loc3_ < this.numPowerBalls)
      {
         _loc5_ = this.mcBoard["mcPowerBall" + _loc3_];
         _loc5_.initPowerBallIndicator({gameController:this,groupNum:_loc3_,ballLauncher:this.mcBoard.mcBallLauncher});
         this.powerBallArray[_loc3_] = _loc5_;
         _loc5_.swapDepths(this.initialDepths.powerBallIndicator + _loc3_);
         _loc3_ = _loc3_ + 1;
      }
      this.minVowelsOnBoard = 3;
      this.score = 0;
      this.mcBallLauncher = this.mcBoard.mcBallLauncher;
      this.mcBallLauncher.initBallLauncher({gameController:this,mcLaunchedPowerBall:this.mcBoard.mcLaunchedPowerBall});
      this.mcBoard.mcLaunchedPowerBall.swapDepths(this.initialDepths.powerBall);
      this.sushiGameData = {letterArr:new Array(),wellArr:new Array()};
      _root.requestHandler("initGame",[this.levelNum]);
   }
   function initLevel()
   {
      var mcLetter;
      this.mcBallLauncher.setWidth(this.numColumns);
      this.dTrace("numColumns:" + this.numColumns + "," + "levelType:" + this.levelType);
      this.numVisibleRows = 8;
      this.mcInterface.levelNumTxt.text = String(this.levelNum);
      var goldenTypeArr = {normal:"normal",chatterBox:"normal",itemGrant:"itemGrant",spam:"normal"};
      this.goldenWordType = goldenTypeArr[this.levelType];
      this.originPt = new flash.geom.Point(Math.round(_root.mcOrigin._x),Math.round(_root.mcOrigin._y));
      this.numRows = this.numVisibleRows * 2;
      this.letterTileArray = new Array();
      var i = 0;
      while(i < this.numColumns)
      {
         this.letterTileArray[i] = new Array();
         var j = 0;
         while(j < this.numRows)
         {
            this.letterTileArray[i][j] = "";
            j++;
         }
         i++;
      }
      this.movingItemsArray = new Array();
      this.mcBoard.mcDockBg._visible = true;
      this.mcBoard.mcDockBg.gotoAndStop(this.numColumns - 2);
      this.dockLetterArray = new Array();
      this.goldenLetterArray = new Array();
      var i = 0;
      while(i < this.numColumns)
      {
         var j = 0;
         while(j < this.numVisibleRows)
         {
            var mcLetter = this.createNewLetterClip();
            this.putLetterAtArrPos(mcLetter,i,j - this.numVisibleRows - 1);
            this.letterTileArray[i][j] = mcLetter;
            var newLetterObj = this.convertLetterCode(this.sushiGameData.letterArr[j * this.numColumns + i]);
            mcLetter.setTile(newLetterObj);
            j++;
         }
         i++;
      }
      var i = 0;
      while(i < this.maxWordLength)
      {
         var newName = "mcLetter" + i;
         this.mcWordSoFar.attachMovie("mcLetter",newName,100 + i);
         mcLetter = eval("mcWordSoFar.mcLetter" + i);
         mcLetter._x = this.mcWordSoFar.mcOrigin._x + this.unitX / 2 + this.unitX * 0.9500000000000001 * i;
         mcLetter._y = this.mcWordSoFar.mcOrigin._y + this.unitY / 2;
         mcLetter._visible = false;
         newName = "mcConnector" + i;
         this.mcWordSoFar.attachMovie("mcLetterConnector",newName,50 + i);
         var mcConnector = eval("mcWordSoFar.mcConnector" + i);
         mcConnector._visible = false;
         mcConnector._x = mcLetter._x;
         mcConnector._y = mcLetter._y;
         i++;
      }
      this.gameState = "addInitialLetters";
      this.whereToGo = "play loop";
      this.builtWordArray = new Array();
      this.mcInterface.completedWordsTxt.text = "";
      this.mcInterface.gotoAndStop(String(this.numColumns) + " wide");
      this.submitWordAttemptedFlag = false;
      this.updateScoreDisplay();
      this.dTrace("timeBetweenBumps:" + this.timeBetweenBumps);
      this.mcTimer.init({levelType:this.levelType,timeBetweenBumps:this.timeBetweenBumps});
      this.needToCheckGoldenMatches = false;
      this.levelResult = undefined;
      this.numInvalidWordsInARow = 0;
      this.lastSubmitTime = getTimer();
   }
   function startLevel()
   {
      this.mcSound.playSound("init level");
      this.mcTimer.startTimer({delayBeforeStart:2000});
      this.keyListener = new Object();
      this.keyListener.onKeyDown = function()
      {
         if(Key.getCode() == 13)
         {
            _root.gGameController.attemptSubmitWord();
         }
      };
      Key.addListener(this.keyListener);
      var _loc6_;
      var _loc5_;
      var _loc4_ = 0;
      var _loc3_;
      while(_loc4_ < this.numColumns)
      {
         _loc3_ = 0;
         while(_loc3_ < this.numVisibleRows)
         {
            _loc6_ = this.letterTileArray[_loc4_][_loc3_];
            _loc5_ = (this.numVisibleRows - _loc3_) * 4 + _loc4_ * 2;
            this.sendLetterToArrPos(_loc6_,_loc4_,_loc3_,_loc5_,1.5,"land");
            _loc3_ = _loc3_ + 1;
         }
         _loc4_ = _loc4_ + 1;
      }
   }
   function receiveGameDataFromSushi(str)
   {
      _root.mcSushiBoardDebug.receiveGameDataFromSushi(str);
      _root.mcSushiBoardDebug.debugOutputWell();
   }
   function receiveLevelInitDataFromSushi(str)
   {
      this.dTrace("receiveInitialDataFromSushi:" + str);
      var _loc3_ = new Array();
      _loc3_ = str.split("|");
      this.numColumns = _loc3_[0];
      this.roundNum = this.numColumns - 3;
      this.levelTypeNum = Number(_loc3_[1]);
      this.timeBetweenBumps = Number(_loc3_[2]);
      var _loc6_ = new Array("normal","spam","chatterBox","itemGrant");
      this.levelType = _loc6_[this.levelTypeNum];
      var _loc7_ = _loc3_[3].split("_");
      var _loc5_ = _loc3_[4].split("_");
      this.sushiGameData.letterArr = _loc7_;
      this.sushiGameData.wellLetterArr = _loc5_;
      this.goldToGrant = _loc3_[5];
      this.creditsToGrant = new Array();
      this.creditsToGrant[0] = _loc3_[6];
      this.creditsToGrant[1] = _loc3_[7];
      this.creditsToGrant[2] = _loc3_[8];
      this.itemToGrantId = _loc3_[9];
      this.dTrace("Received item to grant:" + this.itemToGrantId);
      _root.mcSushiBoardDebug.receiveGameDataFromSushi(str);
      _root.mcSushiBoardDebug.debugOutputWell();
      if(this.levelType == "itemGrant")
      {
         _root.gotoAndPlay("load item");
      }
      else
      {
         _root.gotoAndPlay("level loaded");
      }
   }
   function receiveWellLettersFromSushi(str)
   {
      this.dTrace("old Well Letter Array length:" + this.sushiGameData.wellLetterArr.length);
      var _loc3_ = str.split("_");
      var _loc4_ = "";
      var _loc2_ = 0;
      while(_loc2_ < _loc3_.length)
      {
         this.sushiGameData.wellLetterArr.push(_loc3_[_loc2_]);
         _loc4_ += this.convertLetterCode(_loc3_[_loc2_]).char = this.convertLetterCode(_loc3_[_loc2_]).char + " ";
         _loc2_ = _loc2_ + 1;
      }
      this.dTrace("new Well Letter Array length:" + this.sushiGameData.wellLetterArr.length);
      this.dTrace("[gameController] Received well letters:" + _loc4_);
   }
   function convertLetterCode(str)
   {
      var _loc2_ = Number(str);
      var _loc1_ = new Object();
      _loc1_.char = String.fromCharCode(65 + _loc2_ % 26);
      _loc1_.groupNum = Math.floor(_loc2_ / 26);
      return _loc1_;
   }
   function addDockedLetter(mcGoldenLetter)
   {
      var _loc4_ = "mcDockLetter" + String(mcGoldenLetter.col);
      this.mcBoard.attachMovie("mcLetter",_loc4_,this.initialDepths.dockLetters + mcGoldenLetter.col);
      var _loc2_ = this.mcBoard[_loc4_];
      _loc2_.initLetterTile({gameController:this,itemGrantUrl:this.itemGrantData.thumbUrl});
      this.dTrace("docked letter:" + _loc2_ + " at " + _loc2_.getDepth());
      _loc2_.setDockLetter(mcGoldenLetter);
      this.dockLetterArray[mcGoldenLetter.col] = _loc2_;
   }
   function stepGame()
   {
      var _loc4_;
      var _loc3_;
      switch(this.gameState)
      {
         case "addInitialLetters":
            if(!this.itemsInMotionTest())
            {
               this.gameState = "normal";
            }
            break;
         case "bumpingDown":
            if(!this.itemsInMotionTest())
            {
               _root.mcSushiBoardDebug.dTraceBoard();
               this.checkSelectedLettersOffBoard();
               this.checkGameOver();
               _loc3_ = 0;
               while(_loc3_ < this.numColumns)
               {
                  this.dTrace("shearing:" + this.letterTileArray[_loc3_][this.numRows]);
                  this.letterTileArray[_loc3_][this.numVisibleRows].removeMovieClip();
                  this.letterTileArray[_loc3_][this.numVisibleRows] = "";
                  _loc3_ = _loc3_ + 1;
               }
               this.gameState = "normal";
            }
            break;
         case "clearingTiles":
            if(!this.itemsInMotionTest())
            {
               this.checkGameOver();
               this.gameState = "normal";
            }
            break;
         case "normal":
            if(this.needToCheckGoldenMatches)
            {
               if(!this.itemsInMotionTest())
               {
                  _root.mcSushiBoardDebug.dTraceBoard();
                  this.needToCheckGoldenMatches = false;
                  this.checkForGoldenMatches();
               }
            }
            else
            {
               if(this.prevMovingFlag == true and !this.itemsInMotionTest())
               {
                  _root.mcSushiBoardDebug.dTraceBoard();
               }
               this.prevMovingFlag = this.itemsInMotionTest();
            }
            if(this.mcTimer.timerComplete())
            {
               if(this.levelType != "normal")
               {
                  this.bumpLettersDown(0);
                  this.bonusLevelLost();
               }
               else if(!this.itemsInMotionTest())
               {
                  this.bumpLettersDown(0);
                  this.mcTimer.reset();
               }
            }
            if(this.submitWordAttemptedFlag)
            {
               if(!this.itemsInMotionTest())
               {
                  this.submitWord();
                  this.submitWordAttemptedFlag = false;
               }
            }
            break;
         case "enactingPowerUps":
            if(!this.itemsInMotionTest() and !this.mcBallLauncher.getBallCurrentlyLaunching())
            {
               this.mcActiveGoldenLetter.checkApplyNextPowerUp();
               this.determineWordSoFar();
               _root.mcSushiBoardDebug.dTraceBoard();
            }
      }
      _root.debugI = this.itemsInMotionTest();
      _root.debugJ = this.mcBallLauncher.getBallCurrentlyLaunching();
   }
   function determineWordSoFar()
   {
      var i;
      var mcDisplayLetter;
      var mcConnector;
      this.builtWordString = "";
      this.builtWordStringWithoutFreeU = "";
      var newBuiltArray = new Array();
      i = 0;
      while(i < this.builtWordArray.length)
      {
         if(this.builtWordArray[i].active)
         {
            newBuiltArray.push(this.builtWordArray[i]);
         }
         i++;
      }
      this.builtWordArray = newBuiltArray;
      i = 0;
      while(i < this.builtWordArray.length)
      {
         mcDisplayLetter = eval("mcWordSoFar.mcLetter" + i);
         mcDisplayLetter.letter = this.builtWordArray[i].letter;
         mcDisplayLetter.setAsDisplayLetter({mcLetterToMirror:this.builtWordArray[i]});
         mcDisplayLetter._visible = true;
         this.builtWordString = this.builtWordString + this.builtWordArray[i].letter + this.builtWordArray[i].subLetter;
         this.builtWordStringWithoutFreeU += this.builtWordArray[i].letter;
         mcConnector = eval("mcWordSoFar.mcConnector" + i);
         if(this.builtWordArray[i].groupNum == this.builtWordArray[i + 1].groupNum)
         {
            mcConnector.gotoAndStop(this.builtWordArray[i].groupNum + 1);
            mcConnector._visible = true;
         }
         else
         {
            mcConnector._visible = false;
         }
         i++;
      }
      if(this.builtWordArray.length > 5)
      {
         this.mcWordSoFar._xscale = 5 / this.builtWordArray.length * 100;
         this.mcWordSoFar._yscale = 5 / this.builtWordArray.length * 100;
      }
      else
      {
         this.mcWordSoFar._xscale = 100;
         this.mcWordSoFar._yscale = 100;
      }
      i = this.builtWordArray.length;
      while(i < 10)
      {
         mcDisplayLetter = eval("mcWordSoFar.mcLetter" + i);
         mcDisplayLetter._visible = false;
         mcConnector = eval("mcWordSoFar.mcConnector" + i);
         mcConnector._visible = false;
         i++;
      }
   }
   function attemptSubmitWord()
   {
      this.submitWordAttemptedFlag = true;
   }
   function submitWord()
   {
      this.dTrace("submit word:" + this.builtWordString + ", " + this.gameState);
      if(getTimer() - this.lastSubmitTime < 250)
      {
         return undefined;
      }
      if(this.numInvalidWordsInARow > 20)
      {
         return undefined;
      }
      var _loc23_ = getTimer();
      var _loc12_;
      var _loc5_;
      switch(this.levelType)
      {
         case "spam":
            _loc12_ = true;
            if(this.builtWordArray.length < 3)
            {
               _loc12_ = false;
            }
            _loc5_ = 1;
            while(_loc5_ < this.builtWordArray.length)
            {
               if(this.builtWordArray[_loc5_].groupNum != this.builtWordArray[_loc5_ - 1].groupNum)
               {
                  _loc12_ = false;
               }
               _loc5_ = _loc5_ + 1;
            }
            if(!_loc12_)
            {
               _loc12_ = this.mcWordList.validWord(this.builtWordString);
               if(!_loc12_ and this.builtWordString != this.builtWordStringWithoutFreeU)
               {
                  this.builtWordString = this.builtWordStringWithoutFreeU;
                  _loc12_ = this.mcWordList.validWord(this.builtWordString);
               }
            }
            break;
         case "chatterBox":
            _loc12_ = this.builtWordString == "BUMP";
            break;
         default:
            this.dTrace("normal submit word");
            _loc12_ = this.mcWordList.validWord(this.builtWordString);
            _loc12_ = this.mcWordList.validWord(this.builtWordString);
            if(!_loc12_ and this.builtWordString != this.builtWordStringWithoutFreeU)
            {
               this.builtWordString = this.builtWordStringWithoutFreeU;
               _loc12_ = this.mcWordList.validWord(this.builtWordString);
            }
      }
      var _loc22_ = true;
      _loc5_ = 0;
      while(_loc5_ < this.builtWordArray.length)
      {
         if(!this.builtWordArray[_loc5_].testGolden())
         {
            _loc22_ = false;
         }
         _loc5_ = _loc5_ + 1;
      }
      if(_loc22_)
      {
         _loc12_ = false;
      }
      if(!gaiaWordFilter.WordFilter.noBadWords(this.builtWordString))
      {
         _loc12_ = false;
      }
      var _loc4_;
      var _loc13_;
      var _loc9_;
      var _loc3_;
      var _loc10_;
      var _loc7_;
      var _loc6_;
      var _loc8_;
      var _loc15_;
      var _loc11_;
      var _loc14_;
      if(_loc12_)
      {
         _loc5_ = 0;
         while(_loc5_ < this.builtWordArray.length)
         {
            this.score += 5;
            _loc4_ = _loc5_ - 1;
            while(this.builtWordArray[_loc4_].groupNum == this.builtWordArray[_loc5_].groupNum and _loc4_ >= 0)
            {
               _loc4_ = _loc4_ - 1;
               this.score += 5;
            }
            this.builtWordArray[_loc5_].castLetterAwayIfNotGolden();
            _loc5_ = _loc5_ + 1;
         }
         _loc13_ = 1;
         _loc5_ = 0;
         while(_loc5_ < this.builtWordArray.length)
         {
            if(_loc5_ > 0)
            {
               if(this.builtWordArray[_loc5_ - 1].groupNum == this.builtWordArray[_loc5_].groupNum)
               {
                  _loc13_ = _loc13_ + 1;
               }
               else
               {
                  _loc13_ = 1;
               }
            }
            _loc9_ = "mcWordSoFarLetterForAnim" + _loc5_;
            this.mcBoard.attachMovie("mcLetter",_loc9_,this.initialDepths.wordSoFarLetterAnim + _loc5_);
            _loc3_ = this.mcBoard[_loc9_];
            _loc10_ = this.mcWordSoFar["mcLetter" + String(_loc5_)];
            _loc3_.initLetterTile({gameController:this,animDepth:_loc3_.getDepth(),normalDepth:_loc3_.getDepth(),itemGrantUrl:this.itemGrantData.thumbUrl});
            _loc3_.setAsDisplayLetter({mcLetterToMirror:_loc10_});
            _loc7_ = {x:_loc10_._x,y:_loc10_._y};
            this.mcWordSoFar.localToGlobal(_loc7_);
            _loc3_._x = _loc7_.x;
            _loc3_._y = _loc7_.y;
            _loc3_._xscale = this.mcWordSoFar._xscale;
            _loc3_._yscale = this.mcWordSoFar._yscale;
            _loc6_ = this.mcBoard["mcPowerBall" + _loc3_.groupNum];
            _loc8_ = new flash.geom.Point(_loc6_.mcPowerLevel._x,_loc6_.mcPowerLevel._y);
            _loc6_.localToGlobal(_loc8_);
            if(_loc5_ == 0)
            {
               _loc15_ = "powerball fill";
            }
            else
            {
               _loc15_;
            }
            this.sendObjToScreenLoc(_loc3_,_loc8_,_loc5_,1,_loc15_);
            _loc3_.onAnimComplete = _loc3_.onDisplayLetterReachPowerBall;
            _loc3_.amountToIncreasePowerball = _loc13_;
            _loc3_.mcPowerBall = _loc6_;
            _loc5_ = _loc5_ + 1;
         }
         _loc5_ = 0;
         while(_loc5_ < this.powerBallArray.length)
         {
            this.powerBallArray[_loc5_].targetLevel = this.powerBallArray[_loc5_].level;
            _loc5_ = _loc5_ + 1;
         }
         if(this.gameState == "normal")
         {
            this.initContractLettersUp();
         }
         this.mcInterface.completedWordsTxt.text += this.builtWordString + " ";
         this.mcSound.playSound2("submit word");
         this.updateScoreDisplay();
         this.needToCheckGoldenMatches = true;
         _loc11_ = "";
         _loc5_ = 0;
         while(_loc5_ < this.builtWordArray.length)
         {
            _loc14_ = String(this.builtWordArray[_loc5_].col) + "_" + String(this.builtWordArray[_loc5_].row);
            _loc11_ += _loc14_;
            _loc11_ += "_" + this.builtWordArray[_loc5_].letter;
            if(_loc5_ < this.builtWordArray.length)
            {
               _loc11_ += ",";
            }
            _loc5_ = _loc5_ + 1;
         }
         _root.requestHandler("submitWord",[_loc11_]);
      }
      else
      {
         this.mcSound.playSound2("not a word");
         this.numInvalidWordsInARow = this.numInvalidWordsInARow + 1;
      }
      this.clearSelectedWord();
      this.dTrace("SUBMIT WORD TOOK: " + String(getTimer() - _loc23_) + " miliseconds");
   }
   function clearSelectedWord()
   {
      this.deselectAllLetters();
      this.builtWordArray = new Array();
      this.determineWordSoFar();
   }
   function bumpLettersDown(row)
   {
      this.initMoveLettersDown(row);
      this.addRowOfLetters(row);
      _root.requestHandler("bumpDown",[]);
   }
   function addRowOfLetters(row)
   {
      var _loc2_;
      _loc2_ = 0;
      var _loc3_;
      var _loc4_;
      while(_loc2_ < this.numColumns)
      {
         if(this.goldenLetterArray[_loc2_].power != "sticky")
         {
            _loc3_ = this.createNewLetterClip();
            this.dTrace("addRowOfLetters:" + tileCode);
            var tileCode = this.getNextWellLetter();
            _loc4_ = this.convertLetterCode(tileCode);
            _loc3_.setTile(_loc4_);
            this.putLetterAtArrPos(_loc3_,_loc2_,row - 2);
            this.sendLetterToArrPos(_loc3_,_loc2_,row,_loc2_ * 2,1,"land");
         }
         else
         {
            this.goldenLetterArray[_loc2_].clearStickyPower();
         }
         _loc2_ = _loc2_ + 1;
      }
   }
   function getNextWellLetter()
   {
      var _loc3_ = this.sushiGameData.wellLetterArr.splice(0,1)[0];
      _root.mcSushiBoardDebug.debugOutputWell();
      this.dTrace("used well letter:" + this.convertLetterCode(_loc3_).char + "," + this.convertLetterCode(_loc3_).groupNum);
      return _loc3_;
   }
   function initMoveLettersDown(row)
   {
      if(row == undefined)
      {
         row = 0;
      }
      var _loc4_ = 0;
      var _loc3_;
      var _loc2_;
      while(_loc4_ < this.numColumns)
      {
         if(this.goldenLetterArray[_loc4_].power != "sticky")
         {
            _loc3_ = row;
            while(_loc3_ < this.numRows)
            {
               _loc2_ = this.letterTileArray[_loc4_][_loc3_];
               if(_loc2_ != "")
               {
                  if(_loc2_.row == this.numVisibleRows - 1 and _loc2_.mcHilite._visible)
                  {
                     _loc2_.letterClicked();
                  }
                  this.sendLetterToArrPos(_loc2_,_loc4_,_loc3_ + 1,0,1,undefined);
               }
               _loc3_ = _loc3_ + 1;
            }
         }
         _loc4_ = _loc4_ + 1;
      }
      this.mcSound.playSound("bump");
      this.gameState = "bumpingDown";
   }
   function getLevelOverDialogueFrame()
   {
      var _loc2_;
      if(this.levelResult == "solved")
      {
         _loc2_ = "level won " + this.levelType;
         if(this.levelType == "spam" or this.levelType == "chatterBox")
         {
            this.dTrace("roundNum:" + this.roundNum);
            _loc2_ += " " + this.roundNum;
         }
      }
      else
      {
         _loc2_ = "bonusLevelLost";
      }
      return _loc2_;
   }
   function checkSelectedLettersOffBoard()
   {
      var _loc3_ = false;
      var _loc2_ = 0;
      while(_loc2_ < this.builtWordArray.length)
      {
         if(this.builtWordArray[_loc2_].row >= this.numVisibleRows)
         {
            _loc3_ = true;
         }
         _loc2_ = _loc2_ + 1;
      }
      if(_loc3_)
      {
         this.clearSelectedWord();
      }
   }
   function clearTileAtScreenLoc(paramObj)
   {
      var _loc5_ = this.screenToArrayCoords(paramObj.pt.x,paramObj.pt.y);
      var _loc2_ = this.letterTileArray[_loc5_.col][_loc5_.row];
      var _loc4_;
      var _loc6_;
      if(_loc2_ != "" and _loc2_ != this and _loc2_ != undefined)
      {
         if(_loc2_ != paramObj.letterToExclude)
         {
            _loc4_ = new flash.geom.Point(_loc2_._x,_loc2_._y);
            _loc6_ = flash.geom.Point.distance(_loc4_,paramObj.pt);
            if(_loc6_ < paramObj.minDistance)
            {
               _loc2_.clearLetterByPowerUp();
            }
            else
            {
               this.dTrace(_loc4_ + "," + paramObj.pt);
            }
         }
      }
   }
   function pauseGame()
   {
      this.prePauseGameState = this.gameState;
      this.gameState = "paused";
   }
   function unPauseGame()
   {
      this.gameState = this.prePauseGameState;
   }
   function togglePause()
   {
      if(this.gameState == "paused")
      {
         this.unPauseGame();
      }
      else
      {
         this.pauseGame();
      }
   }
   function checkGameOver()
   {
      var _loc2_;
      var _loc3_;
      _loc3_ = false;
      _loc2_ = 0;
      while(_loc2_ < this.numColumns)
      {
         if(this.letterTileArray[_loc2_][this.numVisibleRows].goldenFlag)
         {
            _loc3_ = true;
         }
         _loc2_ = _loc2_ + 1;
      }
      if(_loc3_)
      {
         this.gameOver();
      }
   }
   function gameOver()
   {
      this.mcTimer.stopTimer();
      this.mcSound.playSound("level lost");
      this.whereToGo = "lost";
   }
   function bonusLevelLost()
   {
      this.levelResult = "lost";
      this.mcTimer.stopTimer();
      this.whereToGo = "level complete";
      this.gameState = "levelOver";
   }
   function initContractLettersUp(col)
   {
      var _loc6_;
      var _loc5_;
      var _loc2_;
      this.dTrace("contract letters up:");
      var _loc11_;
      var _loc10_;
      if(col == undefined)
      {
         _loc11_ = 0;
         _loc10_ = this.numColumns - 1;
      }
      else
      {
         _loc11_ = col;
         _loc10_ = col;
      }
      _loc6_ = _loc11_;
      var _loc3_;
      var _loc4_;
      var _loc8_;
      var _loc7_;
      var _loc9_;
      while(_loc6_ <= _loc10_)
      {
         _loc3_ = 0;
         _loc5_ = 0;
         while(_loc5_ < this.numRows)
         {
            _loc4_ = this.letterTileArray[_loc6_][_loc5_];
            if(_loc4_ == "")
            {
               if(_loc5_ < this.numVisibleRows)
               {
                  _loc3_ = _loc3_ + 1;
               }
            }
            else if(_loc3_ > 0)
            {
               this.sendLetterToArrPos(_loc4_,_loc4_.col,_loc4_.row - _loc3_,0,1,undefined);
            }
            _loc5_ = _loc5_ + 1;
         }
         _loc2_ = 0;
         while(_loc2_ < _loc3_)
         {
            if(this.letterTileArray[_loc6_][this.numVisibleRows + _loc2_] == "")
            {
               _loc8_ = this.getNextWellLetter();
               _loc7_ = this.createNewLetterClip();
               _loc9_ = this.convertLetterCode(_loc8_);
               _loc7_.setTile(_loc9_);
               this.putLetterAtArrPos(_loc7_,_loc6_,this.numVisibleRows + _loc2_);
               this.sendLetterToArrPos(_loc7_,_loc6_,this.numVisibleRows + _loc2_ - _loc3_,0,1,undefined);
            }
            _loc2_ = _loc2_ + 1;
         }
         _loc6_ = _loc6_ + 1;
      }
   }
   function updateScoreDisplay()
   {
      this.mcInterface.scoreTxt.text = String(this.score);
   }
   function checkForGoldenMatches()
   {
      this.dTrace("checkGoldenLettersSolved");
      var _loc2_;
      var _loc3_ = 0;
      var _loc4_;
      while(_loc3_ < this.goldenLetterArray.length)
      {
         _loc2_ = this.goldenLetterArray[_loc3_];
         if(_loc2_.row == 0)
         {
            _loc4_ = new flash.geom.Point(this.dockLetterArray[_loc3_]._x,this.dockLetterArray[_loc3_]._y);
            this.sendObjToScreenLoc(_loc2_,_loc4_,0,1,"match golden");
            this.dTrace("GOLDEN LETTER SOLVED!!!:" + _loc2_.letter + ". Sending to:" + _loc4_);
            _loc2_.onAnimComplete = _loc2_.onArrivedAtDock;
            this.letterTileArray[_loc2_.col][0] = "";
         }
         _loc3_ = _loc3_ + 1;
      }
      this.initContractLettersUp();
   }
   function sendGoldenLetterToDock(mcLetter)
   {
      mcLetter.row = -1;
      this.dockLetterArray[mcLetter.col] = mcLetter;
      this.checkLevelWon();
   }
   function alignBallToLetter(mcBall, mcLetter)
   {
      mcBall._x = mcLetter._x;
      mcBall._y = mcLetter._y;
   }
   function checkLevelWon(dTraceFlag)
   {
      var _loc2_;
      var _loc3_;
      _loc3_ = true;
      _loc2_ = 0;
      while(_loc2_ < this.goldenLetterArray.length)
      {
         if(dTraceFlag)
         {
            this.dTrace(_loc2_ + "," + this.goldenLetterArray[_loc2_]);
         }
         if(this.goldenLetterArray[_loc2_].row != undefined)
         {
            if(this.goldenLetterArray[_loc2_].row != -1)
            {
               _loc3_ = false;
            }
         }
         _loc2_ = _loc2_ + 1;
      }
      if(_loc3_)
      {
         this.levelResult = "solved";
         this.mcTimer.stopTimer();
         this.score += 200;
         this.gameState = "levelOver";
         this.whereToGo = "level complete";
         this.mcSound.playSound("level won");
      }
      this.dTrace("checkPuzzleSolved:" + _loc3_);
   }
   function deselectAllLetters()
   {
      var _loc3_;
      var _loc2_;
      _loc3_ = 0;
      while(_loc3_ < this.numColumns)
      {
         _loc2_ = 0;
         while(_loc2_ < this.numRows)
         {
            this.letterTileArray[_loc3_][_loc2_].mcHilite._visible = false;
            _loc2_ = _loc2_ + 1;
         }
         _loc3_ = _loc3_ + 1;
      }
      for(var _loc4_ in this.dockLetterArray)
      {
         this.dockLetterArray[_loc4_].mcHilite._visible = false;
      }
   }
   function backButtonClicked()
   {
      _root.attachMovie("mcDialogue","mcDialogue",_root.getNextHighestDepth(),{whereToGo:"confirmQuit"});
      this.dTrace("mcDialogue:" + _root.mcDialogue);
   }
   function userQuitGame()
   {
      _root.requestHandler("userQuitGame",[]);
      this.cleanUpGame();
      this.mcInterface.gotoAndStop("3 wide");
      gotoAndStop("title");
      play();
   }
   function haltGame()
   {
      this.gameState = "halted";
      this.mcTimer.stopTime();
   }
   function cleanUpGame()
   {
      this.dTrace("clean up game");
      var _loc3_ = 0;
      var _loc2_;
      while(_loc3_ < this.numColumns)
      {
         _loc2_ = 0;
         while(_loc2_ < this.numRows)
         {
            removeMovieClip(this.letterTileArray[_loc3_][_loc2_]);
            _loc2_ = _loc2_ + 1;
         }
         _loc3_ = _loc3_ + 1;
      }
      for(var _loc4_ in this.dockLetterArray)
      {
         removeMovieClip(this.dockLetterArray[_loc4_]);
      }
      this.mcBallLauncher.reset();
      this.mcTimer.reset();
      this.mcTimer.stopTimer();
   }
   function cleanUpLevel()
   {
      var _loc3_ = 0;
      var _loc2_;
      while(_loc3_ < this.numColumns)
      {
         _loc2_ = 0;
         while(_loc2_ < this.numRows)
         {
            removeMovieClip(this.letterTileArray[_loc3_][_loc2_]);
            _loc2_ = _loc2_ + 1;
         }
         _loc3_ = _loc3_ + 1;
      }
      for(var _loc4_ in this.dockLetterArray)
      {
         removeMovieClip(this.dockLetterArray[_loc4_]);
      }
      this.mcTimer.reset();
      this.mcTimer.stopTimer();
      Key.removeListener(this.keyListener);
   }
   function resetGame()
   {
      this.cleanUpGame();
      this.mcInterface.gotoAndStop("3 wide");
      _root.gotoAndPlay("level loaded");
   }
   function restartLevel()
   {
      this.cleanUpLevel();
      _root.gotoAndPlay("init level");
      _root.requestHandler("restartLevel",[]);
      if(this.levelNum % 5 == 0)
      {
         _root.mcDebug.clearLog();
      }
   }
   function nextLevel()
   {
      this.dTrace("nextLevel");
      this.levelNum = this.levelNum + 1;
      this.cleanUpLevel();
      _root.requestHandler("nextLevel",[]);
      _root.gotoAndPlay("init level");
      if(this.levelNum % 5 == 0)
      {
         _root.mcDebug.clearLog();
      }
      this.dTrace("log cleared");
   }
   function resetPowerballIndicators()
   {
      for(var _loc2_ in this.powerBallArray)
      {
         this.powerBallArray[_loc2_].reset();
      }
   }
   function createNewLetterClip()
   {
      var _loc3_ = "mcLetter" + this.nextLetterDepth;
      var _loc5_ = this.initialDepths.staticLetters + this.nextLetterDepth;
      var _loc4_ = this.initialDepths.movingLetters + this.nextLetterDepth;
      this.mcBoard.attachMovie("mcLetter",_loc3_,_loc5_);
      var _loc2_ = this.mcBoard[_loc3_];
      _loc2_.initLetterTile({gameController:this,animDepth:_loc4_,normalDepth:_loc5_,itemGrantUrl:this.itemGrantData.thumbUrl});
      this.nextLetterDepth = this.nextLetterDepth + 1;
      return _loc2_;
   }
   function letterClicked(mcLetter)
   {
      var _loc2_;
      var _loc3_;
      if(mcLetter.active)
      {
         if(mcLetter.mcHilite._visible)
         {
            if(getTimer() - this.lastClickedTime < this.doubleClickTimeMax)
            {
               this.attemptSubmitWord();
            }
            else
            {
               _loc3_ = true;
               _loc2_ = this.builtWordArray.length - 1;
               while(_loc3_)
               {
                  if(this.builtWordArray[_loc2_] == mcLetter or _loc2_ < 0)
                  {
                     _loc3_ = false;
                  }
                  this.builtWordArray[_loc2_].mcHilite._visible = false;
                  this.builtWordArray.pop();
                  _loc2_ = _loc2_ - 1;
               }
            }
         }
         else if(this.builtWordArray.length < this.maxWordLength)
         {
            this.builtWordArray.push(mcLetter);
            mcLetter.builtWordArrayPos = this.builtWordArray.length - 1;
            this.determineWordSoFar();
            mcLetter.mcHilite._visible = true;
            mcLetter.mcHilite.gotoAndStop(mcLetter.groupNum + 1);
         }
         this.mcSound.playSound("letter click");
         this.lastClickedTime = getTimer();
         this.determineWordSoFar();
      }
   }
   function sendLetterToArrPos(mcLetter, i, j, initialDelayFrames, speed, soundWhenArrived)
   {
      if(mcLetter != undefined and mcLetter != "")
      {
         mcLetter.targetCol = Number(i);
         mcLetter.targetRow = Number(j);
         this.sendObjToScreenLoc(mcLetter,this.arrayPositionToScreenLoc(i,j),initialDelayFrames,speed,soundWhenArrived);
         mcLetter.onAnimComplete = mcLetter.onArrivedAtArrayPos;
         if(this.returnItemArrayPos(this.movingItemsArray,mcLetter) == undefined)
         {
            this.movingItemsArray.push(mcLetter);
         }
      }
   }
   function removeFromMovingArray(obj)
   {
      this.removeItemFromArray(this.movingItemsArray,obj);
   }
   function addToMovingArray(obj)
   {
      this.movingItemsArray.push(obj);
   }
   function itemsInMotionTest()
   {
      return this.movingItemsArray.length > 0;
   }
   function sendObjToScreenLoc(mcLetter, loc, initialDelayFrames, speed, soundWhenArrived)
   {
      if(speed == undefined)
      {
         speed = 1;
      }
      if(initialDelayFrames == undefined)
      {
         initialDelayFrames = 0;
      }
      if(mcLetter.animDelayFrames == undefined)
      {
         mcLetter.animDelayFrames = initialDelayFrames;
      }
      else
      {
         mcLetter.animDelayFrames = Math.max(mcLetter.animDelayFrames,initialDelayFrames);
      }
      mcLetter.targetLoc = loc;
      var dx = loc.x - mcLetter._x;
      var dy = loc.y - mcLetter._y;
      mcLetter.numAnimSteps = Math.floor(Math.sqrt(dx * dx + dy * dy) / (15 * speed));
      mcLetter.numAnimSteps = Math.max(4,mcLetter.numAnimSteps);
      mcLetter.dx = dx / mcLetter.numAnimSteps;
      mcLetter.dy = dy / mcLetter.numAnimSteps;
      mcLetter.soundWhenArrived = soundWhenArrived;
      mcLetter.onEnterFrame = function()
      {
         if(this.animDelayFrames > 0)
         {
            this.animDelayFrames = this.animDelayFrames - 1;
         }
         else
         {
            this._visible = this._y < this.arrayPositionToScreenLoc(0,this.numVisibleRows).y;
            if(this.numAnimSteps > 0)
            {
               this._x += this.dx;
               this._y += this.dy;
               this.numAnimSteps = this.numAnimSteps - 1;
            }
            else
            {
               if(this.soundWhenArrived != undefined)
               {
                  this.pGameController.mcSound.playSound(this.soundWhenArrived);
               }
               this._x = this.targetLoc.x;
               this._y = this.targetLoc.y;
               if(this.onAnimComplete != undefined)
               {
                  this.onAnimComplete();
                  this.onAnimComplete = undefined;
               }
               delete this.onEnterFrame;
            }
         }
      };
   }
   function putLetterAtArrPos(mcLetter, i, j)
   {
      var _loc3_ = this.arrayPositionToScreenLoc(i,j);
      mcLetter._x = _loc3_.x;
      mcLetter._y = _loc3_.y;
      this.letterTileArray[i][j] = mcLetter;
      mcLetter.col = i;
      mcLetter.row = j;
   }
   function screenToArrayCoords(x, y)
   {
      var _loc4_;
      var _loc3_;
      var _loc2_;
      _loc4_ = Math.round((x - this.originPt.x) / this.unitX);
      _loc3_ = Math.round((y - this.originPt.y) / this.unitY);
      _loc2_ = new Object();
      _loc2_.row = _loc3_;
      _loc2_.col = _loc4_;
      return _loc2_;
   }
   function arrayPositionToScreenLoc(i, j)
   {
      var _loc3_ = this.originPt.x + i * this.unitX;
      var _loc2_ = this.originPt.y + j * this.unitY;
      var _loc4_ = new flash.geom.Point(_loc3_,_loc2_);
      return _loc4_;
   }
   function returnItemArrayPos(arr, item)
   {
      var _loc3_;
      var _loc1_ = 0;
      while(_loc1_ < arr.length)
      {
         if(arr[_loc1_] == item)
         {
            _loc3_ = _loc1_;
         }
         _loc1_ = _loc1_ + 1;
      }
      return _loc3_;
   }
   function removeItemFromArray(arr, item)
   {
      var _loc3_;
      var _loc1_ = 0;
      while(_loc1_ < arr.length)
      {
         if(arr[_loc1_] == item)
         {
            _loc3_ = _loc1_;
         }
         _loc1_ = _loc1_ + 1;
      }
      if(_loc3_ != undefined)
      {
         arr.splice(_loc3_,1);
      }
   }
   function debugAddPowerUp(powerUp)
   {
      var _loc3_;
      var _loc2_;
      _loc3_ = random(this.numColumns);
      _loc2_ = random(this.numVisibleRows);
      _loc2_ = this.numVisibleRows - 1;
      this.letterTileArray[_loc3_][_loc2_].setTilePowerUp(powerUp);
      this.letterTileArray[_loc3_][_loc2_].letter = undefined;
   }
   function outputWordArray()
   {
      var _loc4_;
      var _loc5_;
      var _loc3_ = 0;
      var _loc2_;
      while(_loc3_ < this.numRows)
      {
         _loc4_ = String(_loc3_) + ":";
         _loc2_ = 0;
         while(_loc2_ < this.numColumns)
         {
            _loc5_ = this.letterTileArray[_loc2_][_loc3_].letter;
            if(this.letterTileArray[_loc2_][_loc3_] == "")
            {
               _loc5_ = " ";
            }
            _loc4_ = _loc4_ + _loc5_ + ",";
            _loc2_ = _loc2_ + 1;
         }
         this.dTrace(_loc4_);
         _loc3_ = _loc3_ + 1;
      }
   }
   function dTraceN(n)
   {
      this.dTrace(n) + ":" + eval(n);
   }
   function dTrace(str)
   {
      var _loc2_ = "[GameController]";
      if(_root.mcDebug.dTrace != undefined)
      {
         _root.mcDebug.dTrace(_loc2_ + str);
      }
   }
}
