on(release){
   valido = true;
   if(validateEmail(youremail) == false)
   {
      entmail1.play();
      valido = false;
   }
   if(validateEmail(f1name) == false && f1name != "")
   {
      entmail2.play();
      valido = false;
   }
   if(validateEmail(f2name) == false && f2name != "")
   {
      entmail3.play();
      valido = false;
   }
   if(yourname != "" && youremail != "" && valido == true)
   {
      this.yourname = yourname;
      this.youremail = youremail;
      friendsnames = [];
      friendsemails = [];
      numfriends = 3;
      f = 1;
      while(f < numfriends + 1)
      {
         if(this["f" + f + "name"] != "")
         {
            friendsemails.push(this["f" + f + "name"]);
            friendsnames.push("");
         }
         f++;
      }
      subject = "Check out Gaia Word Bump!";
      mymessage = "Hello <br><br> This email invites you to check out Gaia word bump at a nice url.... <br><br> have a nice day :)";
      _root.__trackref.emailFriends(yourname,youremail,friendsnames,friendsemails,subject,mymessage);
      _root.__trackref.hitPage("{879FF41A-544A-4B21-995A-59E455C09452}");
      play();
   }
}
