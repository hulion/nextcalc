const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * 配置管理器
 * 集中管理應用程序配置，包括密碼和閒置時間設定
 */
class ConfigManager {
  constructor() {
    this.DEFAULT_PASSWORD = '1209';
    this.DEFAULT_IDLE_TIMEOUT = 60; // 默認閒置時間：60秒
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.config = {
      password: this.DEFAULT_PASSWORD,
      idleTimeout: this.DEFAULT_IDLE_TIMEOUT
    };
  }

  /**
   * 從文件加載配置
   * @returns {boolean} 是否成功加載
   */
  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(data);

        this.config.password = loadedConfig.password || this.DEFAULT_PASSWORD;
        this.config.idleTimeout = loadedConfig.idleTimeout !== undefined
          ? loadedConfig.idleTimeout
          : this.DEFAULT_IDLE_TIMEOUT;

        console.log('[ConfigManager] Configuration loaded successfully');
        console.log('[ConfigManager] Password:', this.config.password);
        console.log('[ConfigManager] Idle timeout:', this.config.idleTimeout);
        return true;
      }
    } catch (err) {
      console.error('[ConfigManager] Failed to load configuration:', err);
    }

    // 使用默認值
    this.config.password = this.DEFAULT_PASSWORD;
    this.config.idleTimeout = this.DEFAULT_IDLE_TIMEOUT;
    console.log('[ConfigManager] Using default configuration');
    return true;
  }

  /**
   * 保存配置到文件
   * @returns {boolean} 是否成功保存
   */
  save() {
    try {
      const data = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, data);
      console.log('[ConfigManager] Configuration saved successfully');
      return true;
    } catch (err) {
      console.error('[ConfigManager] Failed to save configuration:', err);
      throw err;
    }
  }

  /**
   * 獲取密碼
   * @returns {string} 當前密碼
   */
  getPassword() {
    return this.config.password;
  }

  /**
   * 設置密碼
   * @param {string} password - 新密碼（必須是4位數字）
   * @throws {Error} 如果密碼格式無效或是保留碼
   */
  setPassword(password) {
    // 驗證密碼格式
    if (!password || !/^[0-9]{4}$/.test(password)) {
      throw new Error('密碼必須是4位數字');
    }

    // 檢查保留碼
    if (password === '4444') {
      throw new Error('此密碼為系統保留碼，請使用其他密碼');
    }

    this.config.password = password;
    this.save();
    console.log('[ConfigManager] Password updated:', password);
  }

  /**
   * 重置密碼為默認值
   */
  resetPassword() {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
        console.log('[ConfigManager] Configuration file deleted');
      }
      this.config.password = this.DEFAULT_PASSWORD;
      this.config.idleTimeout = this.DEFAULT_IDLE_TIMEOUT;
      console.log('[ConfigManager] Password reset to default:', this.DEFAULT_PASSWORD);
    } catch (err) {
      console.error('[ConfigManager] Failed to reset password:', err);
      throw err;
    }
  }

  /**
   * 獲取閒置超時時間
   * @returns {number} 閒置超時時間（秒）
   */
  getIdleTimeout() {
    return this.config.idleTimeout;
  }

  /**
   * 設置閒置超時時間
   * @param {number} seconds - 超時時間（秒）
   */
  setIdleTimeout(seconds) {
    this.config.idleTimeout = seconds;
    this.save();
    console.log('[ConfigManager] Idle timeout updated:', seconds);
  }

  /**
   * 獲取完整配置對象
   * @returns {Object} 配置對象
   */
  getConfig() {
    return { ...this.config };
  }
}

// 導出單例實例
let instance = null;

module.exports = {
  /**
   * 獲取 ConfigManager 單例實例
   * @returns {ConfigManager} ConfigManager 實例
   */
  getInstance() {
    if (!instance) {
      instance = new ConfigManager();
    }
    return instance;
  }
};
