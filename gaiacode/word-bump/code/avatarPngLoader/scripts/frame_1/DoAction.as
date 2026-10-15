function handleReply(success, userData)
{
   trace("\n- Reply from invoke -");
   var _loc3_ = userData.avatar.split("_");
   _global.debugOutput.dTraceObj(_loc3_);
   var _loc5_;
   if(success == true)
   {
      trace(userData.username + " : " + userData.gaia_id);
      _loc5_ = baseAvatarUrl + _loc3_[0] + ".png?t=" + _loc3_[4] + "_" + _loc3_[2] + "_" + _loc3_[3];
      _global.debugOutput.dTrace(_loc5_);
      this.createEmptyMovieClip("mcAvatar",this.getNextHighestDepth());
      mcAvatar.loadMovie(_loc5_);
   }
   else
   {
      trace("GSI METHOD FAILED");
      trace(userData[1] + " -- (" + userData[0] + ")");
   }
}
var gsi = new GSItools.GSIGateway();
var baseAvatarUrl = "http://avatar.gaiaonline.com/gaia/members/";
gsi.invoke("107",undefined,handleReply,this);
delete gsi;
delete handleReply;
