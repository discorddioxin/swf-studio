function init(initObj)
{
   globalSound = new Sound(this);
   soundOn = true;
   musicOn = true;
   previousVol = globalSound.getVolume();
   musicVolume = 50;
   var _loc2_ = 2;
   var _loc3_;
   while(_loc2_ <= 5)
   {
      _loc3_ = "mcSoundDummy" + String(_loc2_);
      this.createEmptyMovieClip(_loc3_,100 + _loc2_);
      _loc2_ = _loc2_ + 1;
   }
   sound2 = new Sound(mcSoundDummy1);
   music = new Sound(mcSoundDummy2);
   trackNum = 0;
   loop1 = new Sound(mcSoundDummy3);
   loop2 = new Sound(mcSoundDummy4);
   loop3 = new Sound(mcSoundDummy5);
}
function nextGameMusic()
{
   trackNum++;
   trackNum %= 3;
   playMusic("game");
}
function toggleSound()
{
   soundOn = !soundOn;
   setSound(soundOn);
}
function setSound(torf)
{
   soundOn = torf;
   if(!torf)
   {
      globalSound.setVolume(0);
   }
   else
   {
      globalSound.setVolume(previousVol);
   }
}
function setMusic(torf)
{
   musicOn = torf;
   if(!torf)
   {
      music.setVolume(0);
      loop1.setVolume(0);
      loop2.setVolume(0);
      loop3.setVolume(0);
   }
   else
   {
      music.setVolume(previousVol);
      mcSoundDummy3.loops[loopNum].setVolume(musicVolume);
   }
}
function getSoundEnabled()
{
   return soundOn;
}
function playSound(snd)
{
   globalSound.attachSound(snd);
   globalSound.start();
}
function playSound2(snd)
{
   sound2.attachSound(snd);
   sound2.start();
}
function xplayMusic(snd, vol)
{
   _root.mcDebug.dTrace("play music:" + snd);
   music.stop();
   music.attachSound(snd);
   music.start(0,100);
   music.setVolume(vol);
}
function playMusic2(snd)
{
   music2.stop();
   music2.attachSound(snd);
   music2.start(0,100);
   music2.setVolume(40);
}
function playMusic(mType)
{
   loop1.stop();
   loop2.stop();
   loop3.stop();
   music.stop();
   if(mType == "game")
   {
      loop1.attachSound("theme_a");
      loop2.attachSound("theme_b");
      loop3.attachSound("theme_c");
      loop1.start(0,999);
      loop2.start(0,999);
      loop3.start(0,999);
      loop1.setVolume(musicVolume);
      loop2.setVolume(0);
      loop3.setVolume(0);
      mcSoundDummy3.musicVolume = loop1.getVolume();
      mcSoundDummy3.loopLength = 28656;
      mcSoundDummy3.loopTotalCount = 0;
      loopNum = 0;
      mcSoundDummy3.loops = [loop1,loop2,loop3];
      mcSoundDummy3.startTime = getTimer() - 20;
      mcSoundDummy3.onEnterFrame = function()
      {
         if(Math.floor((getTimer() - this.startTime) / this.loopLength) > this.loopTotalCount)
         {
            this.loops[loopNum].setVolume(0);
            loopNum++;
            if(loopNum == 3)
            {
               loopNum = 0;
            }
            this.loopTotalCount = this.loopTotalCount + 1;
            this.pLoop = this.loops[loopNum];
            this.pLoop.setVolume(this.musicVolume);
         }
      };
   }
   else
   {
      snd = mType + "_theme";
      music.attachSound(snd);
      music.start(0,999);
      music.setVolume(musicVolume);
   }
}
init();
stop();
