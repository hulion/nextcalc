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
      // [task#100446] A WebContentsView's webContents is NOT destroyed when its owning
      // window closes (unlike BrowserView; see Electron's base-window docs: not closing
      // it explicitly leaks). On macOS 'window-all-closed' does not quit (main.js), and
      // Dock re-open builds a brand-new view via createApp(), so every close/reopen
      // cycle would strand a live Telegram renderer + its Service Worker.
      if (this.telegramView &&
          this.telegramView.webContents &&
          !this.telegramView.webContents.isDestroyed()) {
        this.telegramView.webContents.close();
        console.log('[MainWindow] Telegram webContents closed with window');
      }
      // Don't cleanup IPC handlers - they will be reused when window reopens
      this.mainWindow = null;
      this.telegramView = null;
    });

    // Handle window resize
    this.mainWindow.on('resize', () => {
      if (this.onResize) {
        this.onResize();
      }
    });

    // [task#100437 O1] Forward window visibility to the renderer so the lock-screen
    // canvas animation stops when the window is hidden/minimized (backgrounded) and
    // resumes on show/restore. Belt-and-suspenders alongside the renderer's
    // document.visibilitychange (covers cases the Page Visibility API may miss).
    const sendVisibility = (visible) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('window-visibility-changed', visible);
      }
    };
    this.mainWindow.on('hide', () => sendVisibility(false));
    this.mainWindow.on('minimize', () => sendVisibility(false));
    this.mainWindow.on('show', () => sendVisibility(true));
    this.mainWindow.on('restore', () => sendVisibility(true));
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
