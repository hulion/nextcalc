/**
 * BrowserViewManager - Telegram WebContentsView 管理
 * 負責建立和管理 Telegram WebContentsView，包括載入 Telegram 網頁和注入腳本
 *
 * [task#100446] Migrated BrowserView -> WebContentsView (BrowserView is deprecated
 * since Electron 30). API deltas handled here:
 *   - addBrowserView/removeBrowserView -> mainWindow.contentView.addChildView/removeChildView
 *   - setAutoResize: does NOT exist on WebContentsView -> resize is driven manually by
 *     MainWindow 'resize' -> onResize -> resize() below
 *   - WebContentsView defaults to an OPAQUE WHITE background (BrowserView was
 *     transparent) -> setBackgroundColor('#00000000') right after construction
 *   - webContents is NOT destroyed with the window -> MainWindow 'closed' closes it
 */

const { WebContentsView, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { classifyNavigation } = require('./urlPolicy');

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

    // [task#100437 O5] Reset the once-only idleDetector guard for EACH new view.
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

    // Create WebContentsView for Telegram (detached initially)
    this.telegramView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true
        // [task#100437 O2] backgroundThrottling removed pending notification A/B test — revert to `false` if TG notifications break in background
      }
    });

    // [task#100446] WebContentsView's default background is opaque WHITE (BrowserView's
    // was transparent). Without this the lock<->unlock attach would flash white, which
    // for a privacy app means the disguise visibly breaks. Set it immediately after
    // construction, not lazily on first attach. 8-digit transparent hex is accepted.
    this.telegramView.setBackgroundColor('#00000000');

    // [task#100439 O3a] Do NOT attach here. The app starts locked, so the view would
    // only be composited off-screen (wasted work). We load the URL now (Telegram + its
    // Service Worker initialise, so notifications work while locked) but defer attach
    // to the first unlock (LockManager -> attachView()).
    // No pre-attach setBounds: per Electron (issue #20064) it is a no-op before the
    // view is added to a window. attachView() sets bounds after adding.

    // Setup event handlers
    this.setupEventHandlers();

    // [task#100449] Wire link routing BEFORE loadURL so the very first document is
    // already covered. Must stay out of did-finish-load: that fires on every reload
    // and would stack duplicate will-navigate listeners on the same webContents
    // (the O5 trap). Here it runs exactly once per freshly constructed webContents.
    this.setupExternalLinkHandling();

    // Load Telegram in the view (works whether or not the view is attached)
    this.telegramView.webContents.loadURL('https://web.telegram.org/k/');

    // [task#100439 O4] Start the periodic HTTP-cache cleanup timer for this view.
    this.setupCacheCleanup();

    return this.telegramView;
  }

  /**
   * [task#100439 O3a] 將 Telegram WebContentsView attach 回主視窗（解鎖時呼叫）
   * detach 過的 view 重新 addChildView 後必須重設 bounds 才會顯示在正確位置。
   * [task#100446] 沒有 setAutoResize 可用（WebContentsView 無此 API），視窗縮放
   * 改由 MainWindow 'resize' -> onResize -> resize() 手動跟隨。
   */
  attachView() {
    if (!this.telegramView || !this.mainWindow || this.mainWindow.isDestroyed()) return;
    // [task#100446] Adding a view whose webContents was already closed crashes the
    // app (electron#47099). isViewAttached alone does not cover that case.
    if (!this.telegramView.webContents || this.telegramView.webContents.isDestroyed()) return;
    if (this.isViewAttached) return; // idempotent guard, avoid double add

    this.mainWindow.contentView.addChildView(this.telegramView);
    const bounds = this.mainWindow.getContentBounds();
    this.telegramView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    this.isViewAttached = true;
    console.log('[BrowserViewManager] WebContentsView attached (unlock)');
  }

  /**
   * [task#100439 O3a] 將 Telegram WebContentsView 從主視窗 detach（鎖定時呼叫）
   * 只 removeChildView（停止合成/渲染），不 destroy webContents —— session 與
   * Service Worker 通知不受影響。對已 detach 的 view 不重複操作。
   */
  detachView() {
    if (!this.telegramView || !this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (!this.isViewAttached) return; // already detached, nothing to do

    this.mainWindow.contentView.removeChildView(this.telegramView);
    this.isViewAttached = false;
    console.log('[BrowserViewManager] WebContentsView detached (lock) — webContents kept alive');
  }

  /**
   * [task#100449] 外部連結改用系統預設瀏覽器開啟
   *
   * 兩個出口都要掛，缺一即漏：
   *   1. `setWindowOpenHandler` — `target="_blank"` / `window.open()`
   *   2. `will-navigate`        — 同 frame 整頁導航（`location.href = ...`、普通 <a> 點擊）
   * 兩者共用 `urlPolicy.classifyNavigation()`，白名單只有一份。
   *
   * 注意 hash / history（pushState）切換對話**不會**觸發 will-navigate（那走
   * did-navigate-in-page），所以 TG 內部換聊天室不受影響。`webContents.loadURL()`
   * 這種主程序發起的導航也不觸發 will-navigate，初始載入不受影響。
   */
  setupExternalLinkHandling() {
    const wc = this.telegramView.webContents;

    // --- 出口 1：新視窗 / 新分頁請求 ---
    wc.setWindowOpenHandler(({ url }) => {
      const verdict = classifyNavigation(url);

      if (verdict === 'external') {
        this.openInSystemBrowser(url, 'window-open');
      } else {
        // internal / passthru / block 一律不開第二個視窗：這是偽裝成計算機的 app，
        // 憑空多一個裸 TG 視窗等於破功。站內 t.me / web.telegram.org 由 TG Web 自己
        // 在頁內處理（實測 handler 多半收不到），這裡只保證不外洩、不生視窗。
        console.log(`[BrowserViewManager] window-open denied (${verdict}): ${url}`);
      }

      return { action: 'deny' };
    });

    // --- 出口 2：同 frame 導航 ---
    wc.on('will-navigate', (event, url) => {
      const verdict = classifyNavigation(url);

      // 站內導航（web.telegram.org/a/ 之類）與瀏覽器內部協定照原本行為放行
      if (verdict === 'internal' || verdict === 'passthru') {
        console.log(`[BrowserViewManager] navigation allowed (${verdict}): ${url}`);
        return;
      }

      event.preventDefault();
      if (verdict === 'external') {
        this.openInSystemBrowser(url, 'will-navigate');
      } else {
        console.log(`[BrowserViewManager] navigation blocked (${verdict}): ${url}`);
      }
    });
  }

  /**
   * [task#100449] 交給系統預設瀏覽器 / 系統協定處理器。
   * 只由 setupExternalLinkHandling 在 classifyNavigation 判為 external 後呼叫
   * （協定已限定 http(s)/mailto/tg，不會把任意自訂協定丟給 LaunchServices）。
   */
  openInSystemBrowser(url, origin) {
    console.log(`[BrowserViewManager] external link -> system browser (${origin}): ${url}`);
    shell.openExternal(url)
      .then(() => console.log(`[BrowserViewManager] openExternal ok: ${url}`))
      .catch(err => console.error(`[BrowserViewManager] openExternal failed: ${url}`, err));
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
   * 調整 view 大小（用於視窗 resize 時）
   * [task#100446] Since the WebContentsView migration this is the ONLY resize path —
   * setAutoResize no longer exists, so nothing else keeps bounds in sync. Wired from
   * main.js: mainWindowManager.setDependencies({ onResize: () => resize(isUnlocked) }),
   * fired by MainWindow's 'resize' handler. Detached (locked) view needs no resize;
   * attachView() re-reads getContentBounds() on the next unlock.
   */
  resize(isUnlocked) {
    if (this.telegramView && isUnlocked && this.mainWindow) {
      const bounds = this.mainWindow.getContentBounds();
      this.telegramView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    }
  }
}

module.exports = BrowserViewManager;
