package com.rawfishsoftware.sushi
{
   public class Event
   {
      
      public var onUpdateRoom:$Event;
      
      public var onUpdateTeam:$Event;
      
      public var onIndexUpdateMob:$Event;
      
      public var onObjectReceived:$Event;
      
      public var onMemberNameChanged:$Event;
      
      public var onRoomLocked:$Event;
      
      public var onBeSpectator:$Event;
      
      public var onIndexUpdateMember:$Event;
      
      public var onExcludeMember:$Event;
      
      public var onIndexUpdateSession:$Event;
      
      public var onMemberKicked:$Event;
      
      public var onMaster:$Event;
      
      private var ref:Object;
      
      public var onMemberChangesRoom:$Event;
      
      public var onMemberChangesTeam:$Event;
      
      public var onCancelChallenge:$Event;
      
      public var onChallengeRequest:$Event;
      
      public var onServerRestart:$Event;
      
      public var onChatMessage:$Event;
      
      public var onPlay:$Event;
      
      public var onSlave:$Event;
      
      public var onSystemMessage:$Event;
      
      public var onNewMember:$Event;
      
      public var onNewRoom:$Event;
      
      public var onRemoveMember:$Event;
      
      public var onRemoveRoom:$Event;
      
      public var onUpdateMember:$Event;
      
      public var onIncludeMember:$Event;
      
      public var onRemoveMob:$Event;
      
      public var onAnswerChallengeRequest:$Event;
      
      public var onBadwordDetected:$Event;
      
      public var onIndexUpdateRoom:$Event;
      
      public var onUpdateMob:$Event;
      
      public var onIndexUpdateTeam:$Event;
      
      public var onDisconnect:$Event;
      
      public var onUserMessage:$Event;
      
      public var onStartChallenge:$Event;
      
      public var onUpdateWaitingQueue:$Event;
      
      public var onUpdateSession:$Event;
      
      public var onModeratorChanged:$Event;
      
      public var onNewMob:$Event;
      
      public function Event(param1:*)
      {
         super();
         ref = param1;
         $init();
      }
      
      public function $init() : void
      {
         onNewMember = new $Event(ref,"onNewMember","member");
         onUpdateMember = new $Event(ref,"onUpdateMember","member");
         onIndexUpdateMember = new $Event(ref,"onIndexUpdateMember","member");
         onMemberChangesRoom = new $Event(ref,"onMemberChangesRoom","member");
         onRemoveMember = new $Event(ref,"onRemoveMember","member");
         onNewMob = new $Event(ref,"onNewMob","mob");
         onMaster = new $Event(ref,"onMaster");
         onSlave = new $Event(ref,"onSlave");
         onUpdateMob = new $Event(ref,"onUpdateMob","mob");
         onIndexUpdateMob = new $Event(ref,"onIndexUpdateMob","mob");
         onRemoveMob = new $Event(ref,"onRemoveMob","mob");
         onNewRoom = new $Event(ref,"onNewRoom");
         onRemoveRoom = new $Event(ref,"onRemoveRoom","room");
         onUpdateRoom = new $Event(ref,"onUpdateRoom","room");
         onIndexUpdateRoom = new $Event(ref,"onIndexUpdateRoom","room");
         onUpdateWaitingQueue = new $Event(ref,"onUpdateWaitingQueue","room");
         onUpdateTeam = new $Event(ref,"onUpdateTeam","team");
         onIndexUpdateTeam = new $Event(ref,"onIndexUpdateTeam","team");
         onMemberChangesTeam = new $Event(ref,"onMemberChangesTeam","team");
         onChatMessage = new $Event(ref,"onChatMessage","member");
         onUserMessage = new $Event(ref,"onUserMessage");
         onSystemMessage = new $Event(ref,"onSystemMessage");
         onDisconnect = new $Event(ref,"onDisconnect");
         onServerRestart = new $Event(ref,"onServerRestart");
         onUpdateSession = new $Event(ref,"onUpdateSession","session");
         onIndexUpdateSession = new $Event(ref,"onIndexUpdateSession","session");
         onChallengeRequest = new $Event(ref,"onChallengeRequest");
         onAnswerChallengeRequest = new $Event(ref,"onAnswerChallengeRequest");
         onCancelChallenge = new $Event(ref,"onCancelChallenge");
         onModeratorChanged = new $Event(ref,"onModeratorChanged");
         onIncludeMember = new $Event(ref,"onIncludeMember");
         onExcludeMember = new $Event(ref,"onExcludeMember");
         onRoomLocked = new $Event(ref,"onRoomLocked","room");
         onStartChallenge = new $Event(ref,"onStartChallenge");
         onPlay = new $Event(ref,"onPlay");
         onBeSpectator = new $Event(ref,"onBeSpectator","member");
         onMemberKicked = new $Event(ref,"onMemberKicked","member");
         onBadwordDetected = new $Event(ref,"onBadwordDetected");
         onMemberNameChanged = new $Event(ref,"onMemberNameChanged");
         onObjectReceived = new $Event(ref,"onObjectReceived");
      }
   }
}

