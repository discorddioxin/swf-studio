if(_global.game_nms == undefined)
{
   _global.game_nms = "Gaia Game";
}
if(_global.swf_nms == undefined)
{
   _global.swf_nms = new Array("loadme01.swf","loadme02.swf");
}
if(_global.loadAnimation == undefined)
{
   _global.loadAnimation = true;
}
if(_global.stageSize == undefined)
{
   _global.stageSize = new Array(640,480);
}
if(_global.main_swf == undefined)
{
   _global.main_swf = "loadme01.swf";
}
_root.createEmptyMovieClip("mainClip",1000);
_global.preloader = new Preloader(_global.swf_nms,mainClip);
_root.attachMovie("bgContainer","bgContainer",1);
