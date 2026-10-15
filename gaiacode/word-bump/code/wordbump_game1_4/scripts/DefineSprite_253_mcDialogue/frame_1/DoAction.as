function setDialogue()
{
   gotoAndPlay(whereToGo);
   centerDialogue();
}
function clearDialogue()
{
   removeMovieClip(_root.mcDialogue);
   _X = -100000;
}
function centerDialogue()
{
   var _loc2_ = _root.mcInterface.mcPlayArea._x + _root.mcInterface.mcPlayArea._width / 2;
   _X = _loc2_;
}
setDialogue();
