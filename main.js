const { app, BrowserWindow, BrowserView, Notification, ipcMain, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let telegramView = null; // BrowserView for Telegram
let settingsWindow = null;
let isUnlocked = false;
let isTelegramLoaded = false; // Track if Telegram has been loaded
let isCalculatorInjected = false; // Track if calculator overlay is injected
const DEFAULT_PASSWORD = '1209'; // Default password
let appPassword = DEFAULT_PASSWORD;
let idleTimeout = 60; // Default idle time: 1 minute (in seconds)
let idleTimer = null;
let lastActivityTime = Date.now();

// Load password and settings from file
function loadPassword() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      appPassword = config.password || DEFAULT_PASSWORD;
      idleTimeout = config.idleTimeout !== undefined ? config.idleTimeout : 60;
      console.log('[Main] Password loaded:', appPassword);
      console.log('[Main] Idle timeout loaded:', idleTimeout);
      return true;
    }
  } catch (err) {
    console.error('[Main] Failed to load config:', err);
  }
  appPassword = DEFAULT_PASSWORD;
  idleTimeout = 60;
  return true;
}

// Save password to file
function savePassword(password) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    const config = { password, idleTimeout };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    appPassword = password;
    console.log('[Main] Password saved:', password);
    return true;
  } catch (err) {
    console.error('[Main] Failed to save password:', err);
    throw err;
  }
}

// Save idle timeout to file
function saveIdleTimeout(timeout) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    const config = { password: appPassword, idleTimeout: timeout };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    idleTimeout = timeout;
    console.log('[Main] Idle timeout saved:', timeout);
    resetIdleTimer();
    return true;
  } catch (err) {
    console.error('[Main] Failed to save idle timeout:', err);
    throw err;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'default',
    resizable: true,
    icon: path.join(__dirname, 'build/icon.icns'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  // Load calculator lock screen first
  mainWindow.loadFile('calculator-lock.html');

  // Create BrowserView for Telegram (hidden initially)
  telegramView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false  // 確保在背景時仍能接收通知
    }
  });

  // Add BrowserView to window immediately
  mainWindow.addBrowserView(telegramView);

  // Get window bounds
  const bounds = mainWindow.getContentBounds();

  // Set BrowserView bounds (move far off-screen initially since app starts locked)
  telegramView.setBounds({ x: 0, y: -10000, width: bounds.width, height: bounds.height });
  telegramView.setAutoResize({ width: true, height: true });

  // Load Telegram in BrowserView
  telegramView.webContents.loadURL('https://web.telegram.org/k/');

  // Handle Telegram loaded
  telegramView.webContents.on('did-finish-load', () => {
    console.log('[Main] Telegram loaded in BrowserView');
    isTelegramLoaded = true;

    // Inject panic detector
    setTimeout(() => {
      const panicDetectorCode = fs.readFileSync(path.join(__dirname, 'panic-detector.js'), 'utf8');
      telegramView.webContents.executeJavaScript(panicDetectorCode)
        .then(() => {
          console.log('[Main] Panic detector injected into BrowserView');
        })
        .catch(err => {
          console.error('[Main] Failed to inject panic detector:', err);
        });
    }, 1000);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    telegramView = null;
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  });

  // Handle window resize
  mainWindow.on('resize', () => {
    if (telegramView && isUnlocked) {
      const bounds = mainWindow.getContentBounds();
      telegramView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    }
  });

  createMenu();
  setupActivityTracking();
}

function createMenu() {
  // Build View submenu items based on unlock status
  const viewSubmenu = [
    { role: 'reload' },
    { role: 'forceReload' }
  ];

  // Only show DevTools in development mode
  if (!app.isPackaged) {
    viewSubmenu.push({ role: 'toggleDevTools' });
  }

  viewSubmenu.push({ type: 'separator' });

  // Add Standard Mode (always available)
  viewSubmenu.push({
    label: 'Standard Mode',
    accelerator: 'CmdOrCtrl+L',
    click: () => {
      if (mainWindow) {
        isUnlocked = false;
        mainWindow.loadFile('calculator.html').then(() => {
          createMenu(); // Rebuild menu after switching
        });
      }
    }
  });

  // Only show these items when unlocked
  if (isUnlocked) {
    viewSubmenu.push({
      label: 'Settings',
      accelerator: 'CmdOrCtrl+,',
      click: () => {
        openPasswordSettingsWindow();
      }
    });
    viewSubmenu.push({
      label: 'Scientific Mode',
      accelerator: 'CmdOrCtrl+T',
      click: () => {
        if (mainWindow) {
          mainWindow.loadURL('https://web.telegram.org/k/');

          // Inject panic detector when Telegram loads
          mainWindow.webContents.once('did-finish-load', () => {
            // Set window title to NEXT TG
            mainWindow.setTitle('NEXT TG');

            // Add delay to ensure Telegram is fully loaded
            setTimeout(() => {
              const panicDetectorCode = fs.readFileSync(path.join(__dirname, 'panic-detector.js'), 'utf8');
              mainWindow.webContents.executeJavaScript(panicDetectorCode)
                .then(() => {
                  console.log('[Main] Panic detector injected successfully (from menu)');
                })
                .catch(err => {
                  console.error('[Main] Failed to inject panic detector:', err);
                });
            }, 1000);
            createMenu(); // Rebuild menu after switching
            resetIdleTimer(); // Start idle timer
          });
        }
      }
    });

    // Add Lock Screen option when Telegram is loaded
    if (isTelegramLoaded) {
      viewSubmenu.push({
        label: 'Lock Screen',
        accelerator: 'CmdOrCtrl+Shift+L',
        click: () => {
          console.log('[Main] Manual lock triggered from menu');
          lockApp();
        }
      });
    }

    viewSubmenu.push({
      label: 'Test Notifications',
      click: () => {
        if (mainWindow) {
          mainWindow.loadFile('test-notification.html').then(() => {
            createMenu(); // Rebuild menu after switching
          });
        }
      }
    });
  }

  // Add standard view items
  viewSubmenu.push(
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' }
  );

  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: viewSubmenu
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Open password settings window
function openPasswordSettingsWindow() {
  // If settings window already exists, focus it
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  // Get main window position and size
  const mainBounds = mainWindow.getBounds();

  settingsWindow = new BrowserWindow({
    width: mainBounds.width,
    height: mainBounds.height,
    x: mainBounds.x,
    y: mainBounds.y,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: false,
    parent: mainWindow,
    modal: false,
    show: false,
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile('settings.html');

  // Show with animation
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.setOpacity(0);
    settingsWindow.show();

    // Fade in animation
    let opacity = 0;
    const fadeIn = setInterval(() => {
      opacity += 0.1;
      if (opacity >= 1) {
        settingsWindow.setOpacity(1);
        clearInterval(fadeIn);
      } else {
        settingsWindow.setOpacity(opacity);
      }
    }, 20);
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Inject calculator overlay into Telegram page
function injectCalculatorOverlay() {
  if (!mainWindow || !isTelegramLoaded) {
    console.error('[Lock] Cannot inject calculator: mainWindow or Telegram not loaded');
    return;
  }

  if (isCalculatorInjected) {
    // Calculator already injected, just show it
    showCalculatorOverlay();
    return;
  }

  // Read calculator.html and extract content
  const calculatorHtmlPath = path.join(__dirname, 'calculator.html');
  const calculatorHtml = fs.readFileSync(calculatorHtmlPath, 'utf8');

  // Parse calculator HTML to extract body content, styles, and scripts
  const bodyMatch = calculatorHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let bodyContent = bodyMatch ? bodyMatch[1] : '';

  const styleMatches = calculatorHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  let styles = styleMatches.map(s => s.match(/<style[^>]*>([\s\S]*?)<\/style>/i)[1]).join('\n');

  const scriptMatches = calculatorHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let scripts = scriptMatches.map(s => s.match(/<script[^>]*>([\s\S]*?)<\/script>/i)[1]).join('\n');

  // Don't modify scripts - we'll handle Shadow DOM access differently

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
            const match = btn.getAttribute('onclick').match(/handleNumber\\('(.+?)'\\)/);
            if (match) {
              btn.onclick = () => handleNumber(match[1]);
            }
          });

          // Operator buttons
          shadowRoot.querySelectorAll('[onclick*="handleOperator"]').forEach(btn => {
            const match = btn.getAttribute('onclick').match(/handleOperator\\('(.+?)'\\)/);
            if (match) {
              btn.onclick = () => handleOperator(match[1]);
            }
          });

          // Special function buttons
          shadowRoot.querySelectorAll('[onclick*="handleSpecial"]').forEach(btn => {
            const match = btn.getAttribute('onclick').match(/handleSpecial\\('(.+?)'\\)/);
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

  mainWindow.webContents.executeJavaScript(injectionScript)
    .then(() => {
      isCalculatorInjected = true;
      console.log('[Lock] Calculator overlay injected successfully');
      // Don't show the overlay immediately, only inject it for later use
    })
    .catch(err => {
      console.error('[Lock] Failed to inject calculator overlay:', err);
    });
}

// Show calculator overlay (set z-index to top)
function showCalculatorOverlay() {
  if (!mainWindow || !isCalculatorInjected) return;

  mainWindow.webContents.executeJavaScript('window.showCalculatorOverlay && window.showCalculatorOverlay();')
    .then(() => {
      console.log('[Lock] Calculator overlay shown');
    })
    .catch(err => {
      console.error('[Lock] Failed to show calculator overlay:', err);
    });
}

// Hide calculator overlay (set z-index to bottom)
function hideCalculatorOverlay() {
  if (!mainWindow || !isCalculatorInjected) return;

  mainWindow.webContents.executeJavaScript('window.hideCalculatorOverlay && window.hideCalculatorOverlay();')
    .then(() => {
      console.log('[Lock] Calculator overlay hidden');
    })
    .catch(err => {
      console.error('[Lock] Failed to hide calculator overlay:', err);
    });
}

ipcMain.handle('unlock-app', async () => {
  if (!isUnlocked && mainWindow && telegramView) {
    isUnlocked = true;

    console.log('[Main] Unlocking app - showing BrowserView');

    // Move BrowserView to visible position (covers calculator lock screen)
    const bounds = mainWindow.getContentBounds();
    telegramView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });

    createMenu(); // Rebuild menu after unlocking
    resetIdleTimer(); // Start idle timer

    return true;
  }
  return false;
});

ipcMain.handle('get-password', async () => {
  return appPassword;
});

ipcMain.handle('set-password', async (event, password) => {
  if (!password || !/^[0-9]{4}$/.test(password)) {
    throw new Error('密碼必須是4位數字');
  }
  if (password === '4444') {
    throw new Error('此密碼為系統保留碼，請使用其他密碼');
  }
  savePassword(password);
  return true;
});

ipcMain.handle('panic-mode', async () => {
  console.log('[Main] PANIC MODE ACTIVATED!');
  if (mainWindow) {
    isUnlocked = false;

    // Show calculator overlay (keeps Telegram running for notifications)
    console.log('[Main] Showing calculator overlay for panic mode');
    injectCalculatorOverlay();
    createMenu();
  }
  return true;
});

ipcMain.handle('clear-telegram-data', async () => {
  console.log('[Main] Clearing Telegram data...');
  try {
    const session = mainWindow.webContents.session;
    await session.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
    });
    console.log('[Main] Telegram data cleared successfully');
    return true;
  } catch (err) {
    console.error('[Main] Failed to clear Telegram data:', err);
    throw err;
  }
});

ipcMain.handle('reset-password', async () => {
  console.log('[Main] Resetting password to default...');
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log('[Main] Config file deleted');
    }
    appPassword = DEFAULT_PASSWORD;
    console.log('[Main] Password reset to default:', DEFAULT_PASSWORD);
    return true;
  } catch (err) {
    console.error('[Main] Failed to reset password:', err);
    throw err;
  }
});

ipcMain.handle('get-idle-time', async () => {
  return idleTimeout;
});

ipcMain.handle('set-idle-time', async (event, seconds) => {
  try {
    saveIdleTimeout(seconds);
    return true;
  } catch (err) {
    console.error('[Main] Failed to set idle time:', err);
    throw err;
  }
});

ipcMain.handle('switch-to-english-input', async () => {
  try {
    // 使用 im-select 工具或系統指令來切換到英文輸入法
    // 方法1: 嘗試使用 defaults 讀取當前輸入法並切換到 com.apple.keylayout.ABC
    const switchScript = `
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

    exec(`osascript -e '${switchScript.replace(/\n/g, ' ')}'`, (error, stdout, stderr) => {
      if (error) {
        console.error('[Main] Failed to switch input method:', error);
      } else {
        console.log('[Main] Switched to English input method');
      }
    });

    return true;
  } catch (err) {
    console.error('[Main] Failed to switch to English input:', err);
    return false;
  }
});

// Idle detection functions
function resetIdleTimer() {
  lastActivityTime = Date.now();

  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }

  // Only start timer if unlocked and idle timeout is not 0 (永不)
  if (isUnlocked && idleTimeout > 0) {
    idleTimer = setInterval(checkIdleTime, 1000); // Check every second
  }
}

function checkIdleTime() {
  if (!isUnlocked || idleTimeout === 0) {
    return;
  }

  const now = Date.now();
  const elapsedSeconds = Math.floor((now - lastActivityTime) / 1000);

  if (elapsedSeconds >= idleTimeout) {
    console.log('[Main] Idle timeout reached, locking app...');
    lockApp();
  }
}

function lockApp() {
  if (mainWindow && telegramView && isUnlocked) {
    isUnlocked = false;

    // Hide Telegram BrowserView (move off-screen but keep webContents active for notifications)
    console.log('[Main] Locking app - hiding BrowserView (moving off-screen, webContents stays active)');
    const bounds = mainWindow.getContentBounds();
    telegramView.setBounds({ x: 0, y: -10000, width: bounds.width, height: bounds.height });

    // Reset calculator state when locking
    mainWindow.webContents.executeJavaScript(`
      if (typeof window.resetCalculator === 'function') {
        window.resetCalculator();
      }
    `).catch(err => {
      console.error('[Main] Failed to reset calculator:', err);
    });

    createMenu();
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  }
}

// Track user activity
function setupActivityTracking() {
  if (!mainWindow) return;

  // Track mouse and keyboard events
  mainWindow.webContents.on('before-input-event', () => {
    if (isUnlocked) {
      resetIdleTimer();
    }
  });

  mainWindow.on('focus', () => {
    if (isUnlocked) {
      resetIdleTimer();
    }
  });
}

ipcMain.handle('show-notification', async (event, { title, body, icon, tag, silent }) => {
  console.log('[Main] Notification received:', { title, body, icon, tag, silent });

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: title || 'Telegram',
      body: body || '',
      icon: icon,
      sound: silent ? undefined : 'default',
      silent: silent || false
    });

    notification.on('click', () => {
      console.log('[Main] Notification clicked');
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        app.dock.bounce('critical');
      }

      // Send click event back to renderer
      if (tag) {
        event.sender.send(`notification-clicked-${tag}`);
      }
    });

    notification.on('show', () => {
      console.log('[Main] Notification shown');
    });

    notification.on('close', () => {
      console.log('[Main] Notification closed');
    });

    notification.show();
    return true;
  }

  console.log('[Main] Notifications not supported');
  return false;
});

app.on('ready', async () => {
  loadPassword(); // Load saved password (or use default 1209)
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.setName('Telegram');

if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'Telegram',
    applicationVersion: app.getVersion(),
    version: app.getVersion()
  });
}
