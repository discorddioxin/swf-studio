function validateEmail(email)
{
   indexOfAt = email.indexOf("@");
   lastIndexOfDot = email.lastIndexOf(".");
   if(indexOfAt != -1 && lastIndexOfDot != -1)
   {
      if(lastIndexOfDot > indexOfAt)
      {
         return true;
      }
      return false;
   }
   return false;
}
stop();
yourname = "";
youremail = "";
f1name = "";
f2name = "";
in1.tabIndex = 1;
in2.tabIndex = 2;
in3.tabIndex = 3;
in4.tabIndex = 4;
