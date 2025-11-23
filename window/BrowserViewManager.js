/**
 * BrowserViewManager - Telegram BrowserView 管理
 * 負責建立和管理 Telegram BrowserView，包括載入 Telegram 網頁和注入腳本
 */

const { BrowserView } = require('electron');
const path = require('path');
const fs = require('fs');

class BrowserViewManager {
  constructor() {
    this.mainWindow = null;
    this.telegramView = null;
    this.isTelegramLoaded = false;
    this.lockManager = null;
    this.idleDetector = null;
    this.isDev = false;
  }

  /**
   * 建立 Telegram BrowserView
   */
  create(mainWindow) {
    this.mainWindow = mainWindow;

    // Create BrowserView for Telegram (hidden initially)
    this.telegramView = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false  // 確保在背景時仍能接收通知
      }
    });

    // Add BrowserView to window immediately
    this.mainWindow.addBrowserView(this.telegramView);

    // Get window bounds
    const bounds = this.mainWindow.getContentBounds();

    // Set BrowserView bounds (move far off-screen initially since app starts locked)
    this.telegramView.setBounds({ x: 0, y: -10000, width: bounds.width, height: bounds.height });
    this.telegramView.setAutoResize({ width: true, height: true });

    // Setup event handlers
    this.setupEventHandlers();

    // Load Telegram in BrowserView
    this.telegramView.webContents.loadURL('https://web.telegram.org/k/');

    return this.telegramView;
  }

  /**
   * 設定 BrowserView 事件處理器
   */
  setupEventHandlers() {
    // Handle Telegram loaded
    this.telegramView.webContents.on('did-finish-load', () => {
      console.log('[BrowserViewManager] Telegram loaded in BrowserView');
      this.isTelegramLoaded = true;

      // Update lock manager
      if (this.lockManager) {
        this.lockManager.setTelegramLoaded(true);
      }

      // Update menu builder with loaded status
      if (this.onTelegramLoaded) {
        this.onTelegramLoaded();
      }

      // Inject panic detector
      setTimeout(() => {
        this.injectPanicDetector();
      }, 1000);

      // Initialize idle detector with BrowserView
      if (this.idleDetector) {
        this.idleDetector.initialize({
          mainWindow: this.mainWindow,
          telegramView: this.telegramView,
          onLock: () => {
            if (this.lockManager) {
              this.lockManager.lockApp();
            }
          },
          isDev: this.isDev
        });
      }
    });
  }

  /**
   * 注入 Panic Detector 腳本
   */
  injectPanicDetector() {
    try {
      const panicDetectorPath = path.join(__dirname, '..', 'panic-detector.js');
      const panicDetectorCode = fs.readFileSync(panicDetectorPath, 'utf8');

      this.telegramView.webContents.executeJavaScript(panicDetectorCode)
        .then(() => {
          console.log('[BrowserViewManager] Panic detector injected into BrowserView');
        })
        .catch(err => {
          console.error('[BrowserViewManager] Failed to inject panic detector:', err);
        });
    } catch (err) {
      console.error('[BrowserViewManager] Failed to read panic detector file:', err);
    }
  }

  /**
   * 設定依賴項目
   */
  setDependencies(options) {
    this.lockManager = options.lockManager;
    this.idleDetector = options.idleDetector;
    this.isDev = options.isDev || false;
    this.onTelegramLoaded = options.onTelegramLoaded;
  }

  /**
   * 取得 BrowserView
   */
  getView() {
    return this.telegramView;
  }

  /**
   * 取得 Telegram 載入狀態
   */
  isTelegramLoadedStatus() {
    return this.isTelegramLoaded;
  }

  /**
   * 調整 BrowserView 大小（用於視窗 resize 時）
   */
  resize(isUnlocked) {
    if (this.telegramView && isUnlocked && this.mainWindow) {
      const bounds = this.mainWindow.getContentBounds();
      this.telegramView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    }
  }
}

module.exports = BrowserViewManager;
