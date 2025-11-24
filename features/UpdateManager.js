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

    // 配置 autoUpdater
    autoUpdater.autoDownload = true; // 自動下載
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

      // 檢查是否為必須更新 (從 release notes 中檢查 MANDATORY 標記)
      const isMandatory = info.releaseNotes &&
                         (info.releaseNotes.includes('[MANDATORY]') ||
                          info.releaseNotes.includes('[必須更新]'));

      this.sendToRenderer('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        isMandatory: isMandatory
      });
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
   * 安裝更新並重啟應用程式
   */
  installUpdate() {
    if (this.isDevelopment) {
      console.log('[UpdateManager] Development mode - using test install');
      this.testInstallUpdate();
      return;
    }

    console.log('[UpdateManager] Installing update and restarting app...');
    autoUpdater.quitAndInstall(false, true);
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
   * @param {boolean} isMandatory - 是否為強制更新
   */
  testUpdateFlow(isMandatory = false) {
    if (!this.isDevelopment) {
      console.log('[UpdateManager] Test update flow is only available in development mode');
      return;
    }

    console.log(`[UpdateManager] Starting test update flow (${isMandatory ? 'MANDATORY' : 'OPTIONAL'})...`);

    // 步驟 1: 模擬發現更新 (1 秒後)
    setTimeout(() => {
      const mockUpdateInfo = {
        version: '99.99.99',
        releaseDate: new Date().toISOString(),
        releaseNotes: isMandatory
          ? '[必須更新] 這是一個重要的安全更新,必須立即安裝。'
          : '這是一個可選更新,包含新功能和錯誤修復。',
        isMandatory: isMandatory
      };

      console.log('[UpdateManager] Test: Update available');
      this.sendToRenderer('update-available', mockUpdateInfo);

      // 步驟 2: 模擬下載進度 (從 0% 到 100%)
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 10;

        if (progress <= 100) {
          console.log(`[UpdateManager] Test: Download progress ${progress}%`);
          this.sendToRenderer('update-progress', {
            percent: progress,
            transferred: progress * 1024 * 1024, // 模擬已下載大小
            total: 100 * 1024 * 1024, // 模擬總大小 100MB
            bytesPerSecond: 5 * 1024 * 1024 // 模擬速度 5MB/s
          });
        }

        if (progress >= 100) {
          clearInterval(progressInterval);

          // 步驟 3: 模擬下載完成 (100% 後 0.5 秒)
          setTimeout(() => {
            console.log('[UpdateManager] Test: Update downloaded');
            this.sendToRenderer('update-downloaded', {
              version: '99.99.99'
            });
          }, 500);
        }
      }, 300); // 每 300ms 增加 10%
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
