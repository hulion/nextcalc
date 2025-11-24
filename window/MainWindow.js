/**
 * MainWindow - 主視窗建立和管理
 * 負責建立和管理主視窗、設定視窗及其事件處理
 */

const { BrowserWindow } = require('electron');
const path = require('path');

class MainWindow {
  constructor() {
    this.mainWindow = null;
    this.settingsWindow = null;
    this.telegramView = null;
    this.lockManager = null;
    this.idleDetector = null;
    this.ipcHandler = null;
    this.onResize = null;
  }

  /**
   * 建立主視窗
   */
  create() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: 'NEXT Calc',
      titleBarStyle: 'default',
      resizable: true,
      icon: path.join(__dirname, '..', 'build', 'icon.icns'),
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
      }
    });

    // Load calculator lock screen first
    this.mainWindow.loadFile('calculator-lock.html');

    // Set window open handler
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    });

    // Setup event handlers
    this.setupEventHandlers();

    return this.mainWindow;
  }

  /**
   * 設定視窗事件處理器
   */
  setupEventHandlers() {
    // Handle window close
    this.mainWindow.on('closed', () => {
      if (this.idleDetector) {
        this.idleDetector.stop();
      }
      if (this.ipcHandler) {
        this.ipcHandler.cleanup();
      }
      this.mainWindow = null;
      this.telegramView = null;
    });

    // Handle window resize
    this.mainWindow.on('resize', () => {
      if (this.onResize) {
        this.onResize();
      }
    });
  }

  /**
   * 設定依賴項目
   */
  setDependencies(options) {
    this.telegramView = options.telegramView;
    this.lockManager = options.lockManager;
    this.idleDetector = options.idleDetector;
    this.ipcHandler = options.ipcHandler;
    this.onResize = options.onResize;
  }

  /**
   * 取得主視窗
   */
  getWindow() {
    return this.mainWindow;
  }

  /**
   * 開啟密碼設定視窗
   */
  openPasswordSettings() {
    // If settings window already exists, focus it
    if (this.settingsWindow) {
      this.settingsWindow.focus();
      return;
    }

    // Get main window position and size
    const mainBounds = this.mainWindow.getBounds();

    this.settingsWindow = new BrowserWindow({
      width: mainBounds.width,
      height: mainBounds.height,
      x: mainBounds.x,
      y: mainBounds.y,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      movable: false,
      parent: this.mainWindow,
      modal: false,
      show: false,
      backgroundColor: '#00000000',
      transparent: true,
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.settingsWindow.loadFile('settings.html');

    // Show with animation
    this.settingsWindow.once('ready-to-show', () => {
      this.settingsWindow.setOpacity(0);
      this.settingsWindow.show();

      // Fade in animation
      let opacity = 0;
      const fadeIn = setInterval(() => {
        opacity += 0.1;
        if (opacity >= 1) {
          this.settingsWindow.setOpacity(1);
          clearInterval(fadeIn);
        } else {
          this.settingsWindow.setOpacity(opacity);
        }
      }, 20);
    });

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
    });

    // Update lock manager with settings window reference
    if (this.lockManager) {
      this.lockManager.setSettingsWindow(this.settingsWindow);
    }
  }

  /**
   * 取得設定視窗
   */
  getSettingsWindow() {
    return this.settingsWindow;
  }

  /**
   * 關閉設定視窗
   */
  closeSettingsWindow() {
    if (this.settingsWindow) {
      this.settingsWindow.close();
    }
  }
}

module.exports = MainWindow;
