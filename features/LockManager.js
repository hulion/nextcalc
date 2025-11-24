/**
 * LockManager - 應用程式鎖定/解鎖狀態管理
 * 負責處理鎖定畫面的顯示、隱藏和計算機覆蓋層的注入
 */

const fs = require('fs');
const path = require('path');

class LockManager {
  constructor() {
    this.mainWindow = null;
    this.telegramView = null;
    this.isUnlocked = false;
    this.isCalculatorInjected = false;
    this.isTelegramLoaded = false;
    this.idleDetector = null;
    this.ipcHandler = null;
    this.settingsWindow = null;
    this.onMenuRebuild = null;
  }

  /**
   * 初始化 LockManager
   */
  initialize(options) {
    this.mainWindow = options.mainWindow;
    this.telegramView = options.telegramView;
    this.idleDetector = options.idleDetector;
    this.ipcHandler = options.ipcHandler;
    this.onMenuRebuild = options.onMenuRebuild;
  }

  /**
   * 設定 Telegram 已載入狀態
   */
  setTelegramLoaded(loaded) {
    this.isTelegramLoaded = loaded;
  }

  /**
   * 設定 Settings Window 參考
   */
  setSettingsWindow(window) {
    this.settingsWindow = window;
  }

  /**
   * 取得解鎖狀態
   */
  getUnlocked() {
    return this.isUnlocked;
  }

  /**
   * 鎖定應用程式
   */
  lockApp() {
    if (this.mainWindow && this.telegramView && this.isUnlocked) {
      this.isUnlocked = false;

      if (this.idleDetector) {
        this.idleDetector.setUnlocked(false);
      }

      if (this.ipcHandler) {
        this.ipcHandler.setUnlocked(false);
      }

      // Close settings window if it's open
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        console.log('[LockManager] Locking app - closing settings window');
        this.settingsWindow.close();
      }

      // Hide Telegram BrowserView (move off-screen but keep webContents active for notifications)
      console.log('[LockManager] Locking app - hiding BrowserView (moving off-screen, webContents stays active)');
      const bounds = this.mainWindow.getContentBounds();
      this.telegramView.setBounds({ x: 0, y: -10000, width: bounds.width, height: bounds.height });

      // Reset calculator state and reload password when locking
      this.mainWindow.webContents.executeJavaScript(`
        (async function() {
          // Reload password from main process
          if (typeof window.electronAPI !== 'undefined' && typeof window.electronAPI.getPassword === 'function') {
            try {
              if (typeof PASSWORD !== 'undefined') {
                PASSWORD = await window.electronAPI.getPassword();
                console.log('[LockManager] Password reloaded on lock:', PASSWORD);
              }
            } catch (err) {
              console.error('[LockManager] Failed to reload password:', err);
            }
          }

          // Reset calculator state
          if (typeof window.resetCalculator === 'function') {
            window.resetCalculator();
          }
        })();
      `).catch(err => {
        console.error('[LockManager] Failed to reset calculator:', err);
      });

      // Notify calculator that app is now locked (resume animations)
      this.mainWindow.webContents.send('lock-state-changed', true);

      // Rebuild menu after locking
      if (this.onMenuRebuild) {
        this.onMenuRebuild();
      }
    }
  }

  /**
   * 解鎖應用程式
   */
  unlockApp() {
    if (this.mainWindow && this.telegramView && !this.isUnlocked) {
      this.isUnlocked = true;

      if (this.idleDetector) {
        this.idleDetector.setUnlocked(true);
      }

      if (this.ipcHandler) {
        this.ipcHandler.setUnlocked(true);
      }

      // Show Telegram BrowserView
      console.log('[LockManager] Unlocking app - showing BrowserView');
      const bounds = this.mainWindow.getContentBounds();
      this.telegramView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });

      // Notify calculator that app is now unlocked (stop animations)
      this.mainWindow.webContents.send('lock-state-changed', false);

      // Rebuild menu after unlocking
      if (this.onMenuRebuild) {
        this.onMenuRebuild();
      }
    }
  }

  /**
   * 注入計算機覆蓋層到 Telegram 頁面
   */
  injectCalculatorOverlay() {
    if (!this.mainWindow || !this.isTelegramLoaded) {
      console.error('[LockManager] Cannot inject calculator: mainWindow or Telegram not loaded');
      return;
    }

    if (this.isCalculatorInjected) {
      // Calculator already injected, just show it
      this.showCalculatorOverlay();
      return;
    }

    // Read calculator-lock.html and extract content
    const calculatorHtmlPath = path.join(__dirname, '..', 'calculator-lock.html');
    const calculatorHtml = fs.readFileSync(calculatorHtmlPath, 'utf8');

    // Parse calculator HTML to extract body content, styles, and scripts
    const bodyMatch = calculatorHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let bodyContent = bodyMatch ? bodyMatch[1] : '';

    const styleMatches = calculatorHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
    let styles = styleMatches.map(s => s.match(/<style[^>]*>([\s\S]*?)<\/style>/i)[1]).join('\n');

    const scriptMatches = calculatorHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    let scripts = scriptMatches.map(s => s.match(/<script[^>]*>([\s\S]*?)<\/script>/i)[1]).join('\n');

    // Create injection script using Shadow DOM
    const injectionScript = `
      (function() {
        'use strict';

        // Check if overlay already exists
        if (document.getElementById('calculator-overlay-container')) {
          console.log('[Calculator Overlay] Overlay already exists');
          return;
        }

        console.log('[Calculator Overlay] Creating calculator overlay with Shadow DOM...');

        // Create full-screen overlay container (host element)
        const overlay = document.createElement('div');
        overlay.id = 'calculator-overlay-container';
        overlay.style.cssText = \`
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          pointer-events: none;
          transition: z-index 0s, opacity 0.3s;
          opacity: 0;
        \`;

        // Create Shadow DOM
        const shadowRoot = overlay.attachShadow({ mode: 'open' });

        // Create Shadow DOM container with body-like styling
        const shadowContainer = document.createElement('div');
        shadowContainer.className = 'dark';
        shadowContainer.id = 'shadow-body';
        shadowContainer.style.cssText = \`
          width: 100%;
          height: 100%;
          background: #111827;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 16px;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: white;
          -webkit-user-select: none;
          user-select: none;
          box-sizing: border-box;
        \`;

        // Inject styles into Shadow DOM first
        const styleElement = document.createElement('style');
        styleElement.textContent = ${JSON.stringify(styles)};
        shadowRoot.appendChild(styleElement);

        // Inject body content
        shadowContainer.innerHTML = ${JSON.stringify(bodyContent)};

        // Append shadow container to shadow root
        shadowRoot.appendChild(shadowContainer);

        // Create a script that combines the calculator script with event listener attachment
        const scriptElement = document.createElement('script');
        scriptElement.textContent = ${JSON.stringify(scripts)} + \`

          // Attach event listeners to buttons (since inline onclick won't work in Shadow DOM)
          (function() {
            const shadowRoot = document.getElementById('calculator-overlay-container')?.shadowRoot;
            if (!shadowRoot) {
              console.error('[Calculator] Shadow root not found');
              return;
            }

            // Number buttons
            shadowRoot.querySelectorAll('[onclick*="handleNumber"]').forEach(btn => {
              const match = btn.getAttribute('onclick').match(/handleNumber\\\\('(.+?)'\\\\)/);
              if (match) {
                btn.onclick = () => handleNumber(match[1]);
              }
            });

            // Operator buttons
            shadowRoot.querySelectorAll('[onclick*="handleOperator"]').forEach(btn => {
              const match = btn.getAttribute('onclick').match(/handleOperator\\\\('(.+?)'\\\\)/);
              if (match) {
                btn.onclick = () => handleOperator(match[1]);
              }
            });

            // Special function buttons
            shadowRoot.querySelectorAll('[onclick*="handleSpecial"]').forEach(btn => {
              const match = btn.getAttribute('onclick').match(/handleSpecial\\\\('(.+?)'\\\\)/);
              if (match) {
                btn.onclick = () => handleSpecial(match[1]);
              }
            });

            // Calculate button
            shadowRoot.querySelectorAll('[onclick*="calculate()"]').forEach(btn => {
              btn.onclick = () => calculate();
            });

            // Toggle history button
            shadowRoot.querySelectorAll('[onclick*="toggleHistory"]').forEach(btn => {
              btn.onclick = () => toggleHistory();
            });

            // Toggle theme button
            shadowRoot.querySelectorAll('[onclick*="toggleTheme"]').forEach(btn => {
              btn.onclick = () => toggleTheme();
            });

            // Clear history button
            shadowRoot.querySelectorAll('[onclick*="clearHistory"]').forEach(btn => {
              btn.onclick = () => clearHistory();
            });

            // Settings modal buttons
            shadowRoot.querySelectorAll('[onclick*="closeSettingsModal"]').forEach(btn => {
              btn.onclick = () => closeSettingsModal();
            });

            shadowRoot.querySelectorAll('[onclick*="savePassword"]').forEach(btn => {
              btn.onclick = () => savePassword();
            });

            shadowRoot.querySelectorAll('[onclick*="togglePasswordVisibility"]').forEach(btn => {
              btn.onclick = () => togglePasswordVisibility();
            });

            console.log('[Calculator] Event listeners attached to Shadow DOM buttons');
          })();
        \`;
        shadowRoot.appendChild(scriptElement);

        // Append overlay to body
        document.body.appendChild(overlay);

        console.log('[Calculator Overlay] Calculator overlay with Shadow DOM created');
      })();

      // Global functions to control overlay visibility
      window.showCalculatorOverlay = function() {
        const overlay = document.getElementById('calculator-overlay-container');
        if (overlay) {
          overlay.style.zIndex = '999999';
          overlay.style.pointerEvents = 'auto';
          overlay.style.opacity = '1';
          console.log('[Calculator Overlay] Showing calculator');
        } else {
          console.error('[Calculator Overlay] Overlay not found');
        }
      };

      window.hideCalculatorOverlay = function() {
        const overlay = document.getElementById('calculator-overlay-container');
        if (overlay) {
          overlay.style.opacity = '0';
          setTimeout(() => {
            overlay.style.zIndex = '-1';
            overlay.style.pointerEvents = 'none';
          }, 300);
          console.log('[Calculator Overlay] Hiding calculator');
        } else {
          console.error('[Calculator Overlay] Overlay not found');
        }
      };

      console.log('[Calculator Overlay] Script loaded successfully');
    `;

    this.mainWindow.webContents.executeJavaScript(injectionScript)
      .then(() => {
        this.isCalculatorInjected = true;
        console.log('[LockManager] Calculator overlay injected successfully');
      })
      .catch(err => {
        console.error('[LockManager] Failed to inject calculator overlay:', err);
      });
  }

  /**
   * 顯示計算機覆蓋層
   */
  showCalculatorOverlay() {
    if (!this.mainWindow || !this.isCalculatorInjected) return;

    this.mainWindow.webContents.executeJavaScript('window.showCalculatorOverlay && window.showCalculatorOverlay();')
      .then(() => {
        console.log('[LockManager] Calculator overlay shown');
      })
      .catch(err => {
        console.error('[LockManager] Failed to show calculator overlay:', err);
      });
  }

  /**
   * 隱藏計算機覆蓋層
   */
  hideCalculatorOverlay() {
    if (!this.mainWindow || !this.isCalculatorInjected) return;

    this.mainWindow.webContents.executeJavaScript('window.hideCalculatorOverlay && window.hideCalculatorOverlay();')
      .then(() => {
        console.log('[LockManager] Calculator overlay hidden');
      })
      .catch(err => {
        console.error('[LockManager] Failed to hide calculator overlay:', err);
      });
  }
}

module.exports = LockManager;
