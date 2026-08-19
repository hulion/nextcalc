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
    // [task#100437 O5] guard: idleDetector adds listeners to persistent webContents;
    // did-finish-load fires on every reload (logout/menu reload) so init must run once only
    this.idleDetectorInitialized = false;
    // [task#100439 O3a] Whether telegramView is currently added to the window.
    // App starts locked, so the view loads but is NOT attached until first unlock.
    this.isViewAttached = false;
    // [task#100439 O4] Handle for the periodic HTTP-cache cleanup timer.
    this.cacheClearTimer = null;
  }

  /**
   * 建立 Telegram BrowserView
   */
  create(mainWindow) {
    this.mainWindow = mainWindow;

    // [task#100437 O5] Reset the once-only idleDetector guard for EACH new BrowserView.
    // This manager is a module-level singleton; on macOS the app survives window close
    // (window-all-closed does not quit on darwin), so Dock re-open -> app 'activate' ->
    // createApp() -> create() builds a fresh telegramView/webContents. Without this reset
    // the stale flag would skip idleDetector.initialize() on the new webContents, leaving
    // auto-lock wired to a destroyed webContents (core privacy feature regression).
    // Semantics: same webContents reload -> flag stays true -> did-finish-load skips;
    //            new webContents (here) -> flag false -> did-finish-load re-inits.
    this.idleDetectorInitialized = false;
    // [task#100439 O3a] Fresh view starts detached; first unlock attaches it.
    this.isViewAttached = false;

    // Create BrowserView for Telegram (hidden initially)
    this.telegramView = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
        // [task#100437 O2] backgroundThrottling removed pending notification A/B test — revert to `false` if TG notifications break in background
      }
    });

    // [task#100439 O3a] Do NOT addBrowserView here. The app starts locked, so the
    // view would only be composited off-screen (wasted work). We load the URL now
    // (Telegram + its Service Worker initialise, so notifications work while locked)
    // but defer attach to the first unlock (LockManager -> attachView()).
    // No pre-attach setBounds/setAutoResize: per Electron (issue #20064) those are
    // no-ops before the view is added to a window. attachView() sets bounds after add.

    // Setup event handlers
    this.setupEventHandlers();

    // Load Telegram in BrowserView (works whether or not the view is attached)
    this.telegramView.webContents.loadURL('https://web.telegram.org/k/');

    // [task#100439 O4] Start the periodic HTTP-cache cleanup timer for this view.
    this.setupCacheCleanup();

    return this.telegramView;
  }

  /**
   * [task#100439 O3a] 將 Telegram BrowserView attach 回主視窗（解鎖時呼叫）
   * detach 過的 view 重新 addBrowserView 後必須重設 bounds 才會顯示在正確位置。
   */
  attachView() {
    if (!this.telegramView || !this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (this.isViewAttached) return; // idempotent guard, avoid double add

    this.mainWindow.addBrowserView(this.telegramView);
    const bounds = this.mainWindow.getContentBounds();
    this.telegramView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    this.telegramView.setAutoResize({ width: true, height: true });
    this.isViewAttached = true;
    console.log('[BrowserViewManager] BrowserView attached (unlock)');
  }

  /**
   * [task#100439 O3a] 將 Telegram BrowserView 從主視窗 detach（鎖定時呼叫）
   * 只 removeBrowserView（停止合成/渲染），不 destroy webContents —— session 與
   * Service Worker 通知不受影響。對已 detach 的 view 不重複操作。
   */
  detachView() {
    if (!this.telegramView || !this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (!this.isViewAttached) return; // already detached, nothing to do

    this.mainWindow.removeBrowserView(this.telegramView);
    this.isViewAttached = false;
    console.log('[BrowserViewManager] BrowserView detached (lock) — webContents kept alive');
  }

  /**
   * [task#100439 O4] 定期只清 HTTP cache（session.clearCache），限制 disk-cache
   * 單向增長。clearCache 不動 cookies / localStorage / IndexedDB / CacheStorage，
   * 故不會登出 Telegram。每次 create() 都會先清掉舊 timer，避免視窗重建後累積。
   */
  setupCacheCleanup() {
    if (this.cacheClearTimer) {
      clearInterval(this.cacheClearTimer);
      this.cacheClearTimer = null;
    }

    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    this.cacheClearTimer = setInterval(() => {
      if (this.telegramView &&
          this.telegramView.webContents &&
          !this.telegramView.webContents.isDestroyed()) {
        this.telegramView.webContents.session.clearCache()
          .then(() => console.log('[BrowserViewManager] HTTP cache cleared (periodic)'))
          .catch(err => console.error('[BrowserViewManager] clearCache failed:', err));
      }
    }, TWELVE_HOURS_MS);
  }

  /**
   * [task#100439 O4] 停止週期 cache 清理 timer（quit 時對稱清理）。
   */
  stopCacheCleanup() {
    if (this.cacheClearTimer) {
      clearInterval(this.cacheClearTimer);
      this.cacheClearTimer = null;
    }
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

      // Inject panic detector (fresh document each load; script self-guards against double-install)
      setTimeout(() => {
        this.injectPanicDetector();
      }, 1000);

      // [task#100437 O5] Initialize idle detector only once — its listeners live on the
      // persistent telegramView/mainWindow webContents, so re-running on every reload
      // would stack duplicate handlers that are never removed.
      if (this.idleDetector && !this.idleDetectorInitialized) {
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
        this.idleDetectorInitialized = true;
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
   * 打開 BrowserView 開發者工具
   */
  openDevTools() {
    if (this.telegramView && this.telegramView.webContents) {
      this.telegramView.webContents.openDevTools({ mode: 'detach' });
      console.log('[BrowserViewManager] DevTools opened for BrowserView');
    }
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
