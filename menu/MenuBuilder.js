/**
 * MenuBuilder - 應用程式選單建構
 * 負責根據應用程式狀態動態建立選單
 */

const { app, Menu } = require('electron');

class MenuBuilder {
  constructor() {
    this.mainWindow = null;
    this.lockManager = null;
    this.updateManager = null;
    this.isTelegramLoaded = false;
    this.onOpenSettings = null;
  }

  /**
   * 設定依賴項目
   */
  setDependencies(options) {
    this.mainWindow = options.mainWindow;
    this.telegramView = options.telegramView;
    this.lockManager = options.lockManager;
    this.updateManager = options.updateManager;
    this.onOpenSettings = options.onOpenSettings;
  }

  /**
   * 更新 Telegram 載入狀態
   */
  setTelegramLoaded(loaded) {
    this.isTelegramLoaded = loaded;
  }

  /**
   * 建立應用程式選單
   */
  build() {
    const isUnlocked = this.lockManager ? this.lockManager.getUnlocked() : false;

    // Build View submenu items
    const viewSubmenu = [
      { role: 'reload' },
      { role: 'forceReload' },
      { type: 'separator' }
    ];

    // Only show these items when unlocked
    if (isUnlocked) {
      viewSubmenu.push({
        label: 'Settings',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          if (this.onOpenSettings) {
            this.onOpenSettings();
          }
        }
      });

      // Add Lock Screen option when Telegram is loaded
      if (this.isTelegramLoaded) {
        viewSubmenu.push({
          label: 'Lock Screen',
          accelerator: 'CommandOrControl+Escape',
          click: () => {
            console.log('[MenuBuilder] Manual lock triggered from menu');
            if (this.lockManager) {
              this.lockManager.lockApp();
            }
          }
        });
      }
    }

    // Add standard view items
    viewSubmenu.push(
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    );

    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: viewSubmenu
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' }
        ]
      }
    ];

    // Test menu - only in development mode
    if (!app.isPackaged) {
      template.push({
        label: 'Test',
        submenu: [
          { role: 'toggleDevTools' },
          {
            label: 'Open Telegram DevTools',
            click: () => {
              if (this.telegramView && this.telegramView.webContents) {
                this.telegramView.webContents.openDevTools({ mode: 'detach' });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Test Mandatory Update',
            click: () => {
              if (this.updateManager) {
                this.updateManager.testUpdateFlow(true);
              }
            }
          },
          {
            label: 'Test Optional Update',
            click: () => {
              if (this.updateManager) {
                this.updateManager.testUpdateFlow(false);
              }
            }
          }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
}

module.exports = MenuBuilder;
