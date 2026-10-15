class Player
{
   var cards;
   var iRage;
   var iRageMax;
   function Player()
   {
      this.cards = new Hand();
      this.iRage = 100;
      this.iRageMax = 100;
   }
   function hitMe(dck)
   {
      this.cards.addCard(dck.getNextCard());
   }
   function addRage(i)
   {
      this.iRage += i;
      if(this.iRage > this.iRageMax)
      {
         this.iRage = this.iRageMax;
      }
      if(this.iRage < 0)
      {
         this.iRage = 0;
      }
   }
   function useRage()
   {
      this.iRage = 0;
   }
   function getRage()
   {
      return this.iRage;
   }
   function canIUsePower()
   {
      if(this.iRage >= this.iRageMax)
      {
         return true;
      }
      return false;
   }
   function tie(i)
   {
      this.addRage(8);
   }
   function win(i)
   {
      this.addRage(5);
   }
   function lose(i)
   {
      this.addRage(20);
   }
   function clearHand()
   {
      this.cards = new Hand();
   }
}
