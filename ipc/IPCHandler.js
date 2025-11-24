const { ipcMain, Notification } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * IPC 通道處理器
 * 集中管理所有主進程與渲染進程之間的通信
 */
class IPCHandler {
  constructor() {
    this.mainWindow = null;
    this.telegramView = null;
    this.configManager = null;
    this.idleDetector = null;
    this.updateManager = null;
    this.isUnlocked = false;
    this.handlers = new Map();
    this.isDev = false;
  }

  /**
   * 初始化 IPC 處理器
   * @param {Object} options - 初始化選項
   * @param {BrowserWindow} options.mainWindow - 主窗口實例
   * @param {BrowserView} options.telegramView - Telegram BrowserView 實例
   * @param {ConfigManager} options.configManager - 配置管理器實例
   * @param {IdleDetector} options.idleDetector - 閒置檢測器實例
   * @param {UpdateManager} options.updateManager - 更新管理器實例
   * @param {Function} options.lockApp - 鎖定應用回調
   * @param {Function} options.createMenu - 創建菜單回調
   * @param {Function} options.unlockApp - 解鎖應用回調
   * @param {boolean} options.isDev - 是否為開發模式
   */
  initialize({ mainWindow, telegramView, configManager, idleDetector, updateManager, lockApp, createMenu, unlockApp, isDev }) {
    this.mainWindow = mainWindow;
    this.telegramView = telegramView;
    this.configManager = configManager;
    this.idleDetector = idleDetector;
    this.updateManager = updateManager;
    this.lockApp = lockApp;
    this.createMenu = createMenu;
    this.unlockApp = unlockApp;
    this.isDev = isDev || false;

    this.registerHandlers();
  }

  /**
   * 註冊所有 IPC 處理器
   */
  registerHandlers() {
    // === 解鎖相關 ===
    this.register('unlock-app', this.handleUnlock.bind(this));

    // === 密碼管理 ===
    this.register('get-password', this.handleGetPassword.bind(this));
    this.register('set-password', this.handleSetPassword.bind(this));
    this.register('reset-password', this.handleResetPassword.bind(this));

    // === 閒置時間管理 ===
    this.register('get-idle-time', this.handleGetIdleTime.bind(this));
    this.register('set-idle-time', this.handleSetIdleTime.bind(this));

    // === 應用控制 ===
    this.register('panic-mode', this.handlePanicMode.bind(this));
    this.register('clear-telegram-data', this.handleClearTelegramData.bind(this));

    // === 系統功能 ===
    this.register('switch-to-english-input', this.handleSwitchToEnglishInput.bind(this));
    this.register('show-notification', this.handleShowNotification.bind(this));
    this.register('is-development', this.handleIsDevelopment.bind(this));

    // === 自動更新 ===
    this.register('install-update', this.handleInstallUpdate.bind(this));

    console.log('[IPCHandler] All handlers registered');
  }

  /**
   * 註冊單個 IPC 處理器
   * @param {string} channel - 通道名稱
   * @param {Function} handler - 處理函數
   */
  register(channel, handler) {
    if (this.handlers.has(channel)) {
      console.warn(`[IPCHandler] Handler for '${channel}' already registered, overwriting...`);
    }

    ipcMain.handle(channel, handler);
    this.handlers.set(channel, handler);
  }

  /**
   * 設置解鎖狀態
   * @param {boolean} unlocked - 是否解鎖
   */
  setUnlocked(unlocked) {
    this.isUnlocked = unlocked;
  }

  // ========== 處理器實現 ==========

  /**
   * 處理解鎖應用
   */
  async handleUnlock() {
    if (!this.isUnlocked) {
      console.log('[IPCHandler] Unlocking app');

      // Delegate to unlock callback (LockManager)
      if (this.unlockApp) {
        this.unlockApp();
        this.isUnlocked = true;
        return true;
      }
    }
    return false;
  }

  /**
   * 處理獲取密碼
   */
  async handleGetPassword() {
    return this.configManager.getPassword();
  }

  /**
   * 處理設置密碼
   */
  async handleSetPassword(event, password) {
    try {
      if (!password || !/^[0-9]{4}$/.test(password)) {
        throw new Error('密碼必須是4位數字');
      }
      if (password === '4444') {
        throw new Error('此密碼為系統保留碼，請使用其他密碼');
      }
      this.configManager.setPassword(password);
      return true;
    } catch (err) {
      console.error('[IPCHandler] Failed to set password:', err);
      throw err;
    }
  }

  /**
   * 處理重置密碼
   */
  async handleResetPassword() {
    console.log('[IPCHandler] Resetting password to default...');
    try {
      this.configManager.resetPassword();
      console.log('[IPCHandler] Password reset to default');
      return true;
    } catch (err) {
      console.error('[IPCHandler] Failed to reset password:', err);
      throw err;
    }
  }

  /**
   * 處理獲取閒置時間
   */
  async handleGetIdleTime() {
    return this.configManager.getIdleTimeout();
  }

  /**
   * 處理設置閒置時間
   */
  async handleSetIdleTime(event, seconds) {
    try {
      this.configManager.setIdleTimeout(seconds);
      if (this.idleDetector) {
        this.idleDetector.resetIdleTimer();
      }
      return true;
    } catch (err) {
      console.error('[IPCHandler] Failed to set idle time:', err);
      throw err;
    }
  }

  /**
   * 處理緊急模式
   */
  async handlePanicMode() {
    console.log('[IPCHandler] Panic mode activated!');

    if (this.lockApp) {
      this.lockApp();
    }

    if (this.mainWindow) {
      this.mainWindow.hide();
    }

    return true;
  }

  /**
   * 處理清除 Telegram 數據
   */
  async handleClearTelegramData() {
    console.log('[IPCHandler] Clearing Telegram data...');

    const telegramDataPath = path.join(app.getPath('userData'), 'Partitions', 'telegram');

    try {
      if (fs.existsSync(telegramDataPath)) {
        // 遞歸刪除目錄
        fs.rmSync(telegramDataPath, { recursive: true, force: true });
        console.log('[IPCHandler] Telegram data cleared successfully');
        return { success: true, message: 'Telegram 數據已清除，請重啟應用' };
      } else {
        console.log('[IPCHandler] Telegram data directory not found');
        return { success: false, message: '找不到 Telegram 數據目錄' };
      }
    } catch (err) {
      console.error('[IPCHandler] Failed to clear Telegram data:', err);
      return { success: false, message: `清除失敗: ${err.message}` };
    }
  }

  /**
   * 處理切換到英文輸入法
   */
  async handleSwitchToEnglishInput() {
    return new Promise((resolve) => {
      const appleScript = `
        tell application "System Events"
          tell process "SystemUIServer"
            tell (menu bar item 1 of menu bar 1 where description is "text input")
              select
              tell menu 1
                click menu item "ABC"
              end tell
            end tell
          end tell
        end tell
      `;

      exec(`osascript -e '${appleScript}'`, (error) => {
        if (error) {
          console.error('[IPCHandler] Failed to switch input method:', error);
          resolve(false);
        } else {
          console.log('[IPCHandler] Switched to ABC input method');
          resolve(true);
        }
      });
    });
  }

  /**
   * 處理顯示通知
   */
  async handleShowNotification(event, { title, body, icon, tag, silent }) {
    try {
      const notification = new Notification({
        title: title || 'NEXT Calc',
        body: body || '',
        silent: silent !== undefined ? silent : false,
        tag: tag || undefined,
        icon: icon || undefined
      });

      notification.show();
      return true;
    } catch (err) {
      console.error('[IPCHandler] Failed to show notification:', err);
      return false;
    }
  }

  /**
   * 處理檢查是否為開發模式
   */
  async handleIsDevelopment() {
    return this.isDev;
  }

  /**
   * 處理安裝更新
   */
  async handleInstallUpdate() {
    console.log('[IPCHandler] Install update requested');
    if (this.updateManager) {
      this.updateManager.installUpdate();
      return true;
    }
    return false;
  }

  /**
   * 移除所有 IPC 處理器
   */
  cleanup() {
    for (const channel of this.handlers.keys()) {
      ipcMain.removeHandler(channel);
    }
    this.handlers.clear();
    console.log('[IPCHandler] All handlers removed');
  }
}

module.exports = IPCHandler;
