/**
 * 閒置檢測器
 * 管理用戶活動追蹤和自動鎖定功能
 */
class IdleDetector {
  constructor(configManager) {
    this.configManager = configManager;
    this.idleTimer = null;
    this.lastActivityTime = Date.now();
    this.isWindowFocused = true;
    this.isUnlocked = false;
    this.isDev = false;
    this.lockCallback = null;
    this.mainWindow = null;
    this.telegramView = null;
  }

  /**
   * 初始化閒置檢測器
   * @param {Object} options - 初始化選項
   * @param {BrowserWindow} options.mainWindow - 主窗口實例
   * @param {BrowserView} options.telegramView - Telegram BrowserView 實例
   * @param {Function} options.onLock - 鎖定回調函數
   * @param {boolean} options.isDev - 是否為開發模式
   */
  initialize({ mainWindow, telegramView, onLock, isDev = false }) {
    this.mainWindow = mainWindow;
    this.telegramView = telegramView;
    this.lockCallback = onLock;
    this.isDev = isDev;

    this.setupActivityTracking();
  }

  /**
   * 設置活動追蹤
   */
  setupActivityTracking() {
    if (!this.mainWindow) return;

    if (this.isDev) console.log('[Activity] Setting up activity tracking...');

    // === 主窗口活動追蹤（鎖定畫面） ===
    this.mainWindow.webContents.on('before-input-event', () => {
      if (this.isUnlocked) {
        if (this.isDev) console.log('[Activity] Main window keyboard activity');
        this.resetIdleTimer();
      }
    });

    this.mainWindow.on('focus', () => {
      this.isWindowFocused = true;
      if (this.isUnlocked) {
        if (this.isDev) console.log('[Activity] Main window focused - pausing idle timer');
        // Clear timer but don't restart when window has focus
        if (this.idleTimer) {
          clearInterval(this.idleTimer);
          this.idleTimer = null;
        }
      }
    });

    // === BrowserView 活動追蹤（Telegram 使用） ===
    if (this.telegramView && this.telegramView.webContents) {
      if (this.isDev) console.log('[Activity] Setting up BrowserView activity tracking');

      // 鍵盤活動（打字、快捷鍵）
      this.telegramView.webContents.on('before-input-event', (event, input) => {
        if (this.isUnlocked) {
          if (this.isDev) console.log('[Activity] Telegram keyboard activity:', input.key);
          this.resetIdleTimer();
        }
      });

      // 頁面內導航（切換聊天、滾動）
      this.telegramView.webContents.on('did-navigate-in-page', () => {
        if (this.isUnlocked) {
          if (this.isDev) console.log('[Activity] Telegram page navigation');
          this.resetIdleTimer();
        }
      });

      // DOM 更新檢測（消息加載、UI 更新）
      this.telegramView.webContents.on('dom-ready', () => {
        if (this.isUnlocked) {
          if (this.isDev) console.log('[Activity] Telegram DOM ready');
          this.resetIdleTimer();
        }
      });
    }

    // === 窗口狀態變化處理 ===

    // 窗口最小化
    this.mainWindow.on('minimize', () => {
      if (this.isDev) console.log('[Window] Window minimized - continuing idle timer');
      // 繼續倒數，最小化後 idleTimeout 秒會自動鎖定
    });

    // 窗口恢復
    this.mainWindow.on('restore', () => {
      if (this.isDev) console.log('[Window] Window restored');
      if (this.isUnlocked) {
        this.resetIdleTimer();
      }
    });

    // 窗口隱藏（縮小到 Dock）
    this.mainWindow.on('hide', () => {
      if (this.isDev) console.log('[Window] Window hidden (minimized to Dock)');
    });

    // 窗口顯示
    this.mainWindow.on('show', () => {
      if (this.isDev) console.log('[Window] Window shown');
      if (this.isUnlocked) {
        this.resetIdleTimer();
      }
    });

    // 應用失去焦點（切換到其他應用）
    this.mainWindow.on('blur', () => {
      this.isWindowFocused = false;
      if (this.isDev) console.log('[Window] App lost focus - starting idle timer');
      if (this.isUnlocked) {
        this.resetIdleTimer();  // Start idle timer when window loses focus
      }
    });

    if (this.isDev) console.log('[Activity] Activity tracking setup complete');
  }

  /**
   * 重置閒置計時器
   */
  resetIdleTimer() {
    this.lastActivityTime = Date.now();

    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }

    // Only start timer if unlocked, idle timeout is not 0, and window is not focused
    const idleTimeout = this.configManager.getIdleTimeout();
    if (this.isUnlocked && idleTimeout > 0 && !this.isWindowFocused) {
      this.idleTimer = setInterval(() => this.checkIdleTime(), 1000); // Check every second
    }
  }

  /**
   * 檢查閒置時間
   */
  checkIdleTime() {
    const idleTimeout = this.configManager.getIdleTimeout();
    if (!this.isUnlocked || idleTimeout === 0) {
      return;
    }

    const now = Date.now();
    const elapsedSeconds = Math.floor((now - this.lastActivityTime) / 1000);

    if (elapsedSeconds >= idleTimeout) {
      console.log('[IdleDetector] Idle timeout reached, locking app...');
      if (this.lockCallback) {
        this.lockCallback();
      }
    }
  }

  /**
   * 設置解鎖狀態
   * @param {boolean} unlocked - 是否解鎖
   */
  setUnlocked(unlocked) {
    this.isUnlocked = unlocked;

    if (unlocked) {
      // Only start idle timer if window is not focused
      if (!this.isWindowFocused) {
        this.resetIdleTimer();
      }
    } else {
      // Clear timer when locked
      if (this.idleTimer) {
        clearInterval(this.idleTimer);
        this.idleTimer = null;
      }
    }
  }

  /**
   * 停止閒置檢測
   */
  stop() {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * 獲取閒置狀態
   * @returns {Object} 閒置狀態信息
   */
  getStatus() {
    const idleTimeout = this.configManager.getIdleTimeout();
    const elapsedSeconds = Math.floor((Date.now() - this.lastActivityTime) / 1000);

    return {
      isUnlocked: this.isUnlocked,
      isWindowFocused: this.isWindowFocused,
      idleTimeout,
      elapsedSeconds,
      remainingSeconds: Math.max(0, idleTimeout - elapsedSeconds),
      isTimerActive: this.idleTimer !== null
    };
  }
}

module.exports = IdleDetector;
