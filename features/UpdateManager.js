/**
 * UpdateManager
 * 管理應用程式自動更新功能
 */

const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

class UpdateManager {
  constructor() {
    this.mainWindow = null;
    this.updateInfo = null;
    this.isChecking = false;
    this.isDevelopment = false;
    this.manualUpdateMode = true; // 手動更新模式（需要簽名才能自動更新）

    // 配置 autoUpdater
    autoUpdater.autoDownload = false; // 不自動下載,讓使用者選擇
    autoUpdater.autoInstallOnAppQuit = false; // 不自動安裝,讓使用者選擇
  }

  /**
   * 初始化更新管理器
   * @param {Object} config - 配置對象
   * @param {BrowserWindow} config.mainWindow - 主視窗實例
   * @param {boolean} config.isDevelopment - 是否為開發模式
   */
  initialize({ mainWindow, isDevelopment = false }) {
    this.mainWindow = mainWindow;
    this.isDevelopment = isDevelopment;

    if (this.isDevelopment) {
      console.log('[UpdateManager] Development mode - auto-update disabled');
      return;
    }

    this.setupEventHandlers();
    console.log('[UpdateManager] Initialized');
  }

  /**
   * 設定 autoUpdater 事件處理器
   */
  setupEventHandlers() {
    // 檢查更新時發生錯誤
    autoUpdater.on('error', (error) => {
      console.error('[UpdateManager] Error:', error);
      this.sendToRenderer('update-error', {
        message: error.message
      });
    });

    // 開始檢查更新
    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdateManager] Checking for updates...');
      this.isChecking = true;
    });

    // 有可用更新
    autoUpdater.on('update-available', (info) => {
      console.log('[UpdateManager] Update available:', info.version);
      this.updateInfo = info;
      this.isChecking = false;

      this.sendToRenderer('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        manualMode: this.manualUpdateMode // 通知前端是否為手動更新模式
      });

      // 手動更新模式：不自動下載，讓使用者選擇前往 GitHub 下載
      if (this.manualUpdateMode) {
        console.log('[UpdateManager] Manual update mode - waiting for user to visit GitHub releases');
        return;
      }

      // 自動更新模式（需要簽名）：等待使用者手動觸發下載
      console.log('[UpdateManager] Waiting for user action to download update');
    });

    // 沒有可用更新
    autoUpdater.on('update-not-available', (info) => {
      console.log('[UpdateManager] No updates available. Current version:', info.version);
      this.isChecking = false;
    });

    // 下載進度
    autoUpdater.on('download-progress', (progress) => {
      const percent = Math.round(progress.percent);
      console.log(`[UpdateManager] Download progress: ${percent}%`);

      this.sendToRenderer('update-progress', {
        percent: percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      });
    });

    // 更新下載完成
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[UpdateManager] Update downloaded:', info.version);

      this.sendToRenderer('update-downloaded', {
        version: info.version
      });
    });
  }

  /**
   * 檢查更新
   */
  async checkForUpdates() {
    if (this.isDevelopment) {
      console.log('[UpdateManager] Skipping update check in development mode');
      return;
    }

    if (this.isChecking) {
      console.log('[UpdateManager] Already checking for updates');
      return;
    }

    try {
      console.log('[UpdateManager] Starting update check...');
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('[UpdateManager] Failed to check for updates:', error);
    }
  }

  /**
   * 開始下載更新
   */
  downloadUpdate() {
    if (this.isDevelopment) {
      console.log('[UpdateManager] Development mode - using test download');
      // 在開發模式下模擬下載過程
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 10;
        if (progress <= 100) {
          console.log(`[UpdateManager] Test: Download progress ${progress}%`);
          this.sendToRenderer('update-progress', {
            percent: progress,
            transferred: progress * 1024 * 1024,
            total: 100 * 1024 * 1024,
            bytesPerSecond: 5 * 1024 * 1024
          });
        }
        if (progress >= 100) {
          clearInterval(progressInterval);
          setTimeout(() => {
            console.log('[UpdateManager] Test: Update downloaded');
            this.sendToRenderer('update-downloaded', {
              version: this.updateInfo?.version || '99.99.99'
            });
          }, 500);
        }
      }, 300);
      return;
    }

    console.log('[UpdateManager] Starting update download...');
    autoUpdater.downloadUpdate();
  }

  /**
   * 安裝更新並重啟應用程式
   */
  installUpdate() {
    if (this.isDevelopment) {
      console.log('[UpdateManager] Development mode - using test install');
      this.testInstallUpdate();
      return;
    }

    try {
      console.log('[UpdateManager] Installing update and restarting app...');
      // quitAndInstall 參數:
      // - isSilent: false (顯示對話框)
      // - isForceRunAfter: true (強制重啟後立即執行)
      setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
      });
    } catch (error) {
      console.error('[UpdateManager] Failed to install update:', error);
      this.sendToRenderer('update-error', {
        message: `安裝更新失敗: ${error.message}`
      });
    }
  }

  /**
   * 發送訊息到渲染程序
   * @param {string} channel - IPC 頻道名稱
   * @param {Object} data - 要發送的資料
   */
  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * 取得當前應用程式版本
   * @returns {string} 版本號
   */
  getCurrentVersion() {
    return app.getVersion();
  }

  /**
   * 取得更新資訊
   * @returns {Object|null} 更新資訊
   */
  getUpdateInfo() {
    return this.updateInfo;
  }

  /**
   * 測試更新流程 (僅開發模式)
   * 模擬完整的更新流程,包括檢查、下載和安裝
   */
  testUpdateFlow() {
    if (!this.isDevelopment) {
      console.log('[UpdateManager] Test update flow is only available in development mode');
      return;
    }

    console.log('[UpdateManager] Starting test update flow...');

    // 步驟 1: 模擬發現更新 (1 秒後)
    setTimeout(() => {
      const mockUpdateInfo = {
        version: '99.99.99',
        releaseDate: new Date().toISOString(),
        releaseNotes: '這是一個可選更新,包含新功能和錯誤修復。',
        manualMode: this.manualUpdateMode
      };

      // 儲存更新資訊供後續使用
      this.updateInfo = mockUpdateInfo;

      console.log('[UpdateManager] Test: Update available');
      this.sendToRenderer('update-available', mockUpdateInfo);

      // 手動更新模式：等待使用者點擊前往下載
      if (this.manualUpdateMode) {
        console.log('[UpdateManager] Test: Manual mode - waiting for user to click download button');
      } else {
        console.log('[UpdateManager] Test: Auto mode - waiting for user action');
      }
    }, 1000);
  }

  /**
   * 測試安裝更新 (僅開發模式)
   * 模擬安裝更新,實際上只是顯示訊息
   */
  testInstallUpdate() {
    if (!this.isDevelopment) {
      console.log('[UpdateManager] Test install is only available in development mode');
      return;
    }

    console.log('[UpdateManager] Test: Install update requested');
    console.log('[UpdateManager] 在生產環境中,應用程式會在此處重啟並安裝更新');

    // 發送通知告知使用者這是測試模式
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.executeJavaScript(`
        if (window.showStatus) {
          window.showStatus('測試模式:應用程式不會真的重啟', 'info', 3000);
        }
      `);
    }
  }
}

module.exports = UpdateManager;
