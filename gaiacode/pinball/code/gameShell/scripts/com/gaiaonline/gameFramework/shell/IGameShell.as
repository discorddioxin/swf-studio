package com.gaiaonline.gameFramework.shell
{
   import com.gaiaonline.gameFramework.sound.ISoundController;
   import com.gaiaonline.gameFramework.tracking.ITracking;
   import com.gaiaonline.gameFramework.ui.IShellUi;
   import com.gaiaonline.gameFramework.ui.IUserBar;
   import com.gaiaonline.gateway.IGaiaGateway;
   
   public interface IGameShell
   {
      
      function get serverGateway() : IGaiaGateway;
      
      function get gameParameters() : Object;
      
      function get shellUi() : IShellUi;
      
      function get tracking() : ITracking;
      
      function get userBar() : IUserBar;
      
      function get soundController() : ISoundController;
      
      function get gameBaseUrl() : String;
   }
}

