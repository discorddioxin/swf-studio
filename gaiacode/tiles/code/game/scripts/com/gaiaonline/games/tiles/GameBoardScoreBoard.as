package com.gaiaonline.games.tiles
{
   import flash.display.DisplayObjectContainer;
   
   public class GameBoardScoreBoard
   {
      
      private var _currentTiles:uint = 0;
      
      private var _currentChains:uint = 0;
      
      private var _goal:uint = 0;
      
      private var _tilesNeeded:uint = 0;
      
      private var _fields:Object = {};
      
      public function GameBoardScoreBoard(parent:DisplayObjectContainer)
      {
         super();
         Utils.mapChildrenByName(parent,_fields);
      }
      
      private function updateChains() : void
      {
         _fields.chainsNeeded.text = _currentChains + "/" + _goal;
      }
      
      private function updateTiles() : void
      {
         _fields.tilesNeeded.textColor = _currentTiles < _tilesNeeded ? 16711680 : 16776960;
         _fields.tilesNeeded.text = _currentTiles + "/" + _tilesNeeded;
      }
      
      public function set score(str:String) : void
      {
         _fields.gameScore.text = str;
      }
      
      public function set currentChains(chains:uint) : void
      {
         _currentChains = chains;
         updateChains();
      }
      
      public function set goal(g:uint) : void
      {
         _goal = g;
         updateChains();
      }
      
      public function set level(str:String) : void
      {
         _fields.gameLevel.text = str;
      }
      
      public function set tickets(t:uint) : void
      {
         _fields.tickets.text = t;
      }
      
      public function get currentChains() : uint
      {
         return _currentChains;
      }
      
      public function set tilesNeeded(chain:uint) : void
      {
         _tilesNeeded = chain;
         updateTiles();
      }
      
      public function set currentTiles(chain:uint) : void
      {
         _currentTiles = chain;
         updateTiles();
      }
      
      public function get tilesNeeded() : uint
      {
         return _tilesNeeded;
      }
   }
}

