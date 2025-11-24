/**
 * Main Entry Point
 * 應用程式主入口，負責協調各模組
 */

const { app, globalShortcut } = require('electron');
const { getInstance: getConfigManager } = require('./config/ConfigManager');
const IdleDetector = require('./config/IdleDetector');
const IPCHandler = require('./ipc/IPCHandler');
const LockManager = require('./features/LockManager');
const UpdateManager = require('./features/UpdateManager');
const MainWindow = require('./window/MainWindow');
const BrowserViewManager = require('./window/BrowserViewManager');
const MenuBuilder = require('./menu/MenuBuilder');

// Module instances
const configManager = getConfigManager();
const idleDetector = new IdleDetector(configManager);
const ipcHandler = new IPCHandler();
const lockManager = new LockManager();
const updateManager = new UpdateManager();
const mainWindowManager = new MainWindow();
const browserViewManager = new BrowserViewManager();
const menuBuilder = new MenuBuilder();

// Development mode detection
const isDev = !app.isPackaged;

/**
 * 建立應用程式視窗和所有組件
 */
function createApp() {
  // Create main window
  const mainWindow = mainWindowManager.create();

  // Create Telegram BrowserView
  const telegramView = browserViewManager.create(mainWindow);

  // Setup dependencies between modules
  lockManager.initialize({
    mainWindow,
    telegramView,
    idleDetector,
    ipcHandler,
    onMenuRebuild: () => {
      menuBuilder.build();
    }
  });

  browserViewManager.setDependencies({
    lockManager,
    idleDetector,
    isDev,
    onTelegramLoaded: () => {
      menuBuilder.setTelegramLoaded(true);
      menuBuilder.build();
    }
  });

  mainWindowManager.setDependencies({
    telegramView,
    lockManager,
    idleDetector,
    ipcHandler,
    onResize: () => {
      browserViewManager.resize(lockManager.getUnlocked());
    }
  });

  menuBuilder.setDependencies({
    mainWindow,
    lockManager,
    updateManager,
    onOpenSettings: () => {
      mainWindowManager.openPasswordSettings();
    }
  });

  // Initialize UpdateManager
  updateManager.initialize({
    mainWindow,
    isDevelopment: isDev
  });

  // Initialize IPC handlers
  ipcHandler.initialize({
    mainWindow,
    telegramView,
    configManager,
    idleDetector,
    updateManager,
    lockApp: () => lockManager.lockApp(),
    unlockApp: () => lockManager.unlockApp(),
    createMenu: () => menuBuilder.build(),
    isDev
  });

  // Build initial menu
  menuBuilder.build();
}

/**
 * 應用程式準備就緒
 */
app.on('ready', async () => {
  // Load saved configuration
  configManager.load();

  // Create application
  createApp();

  // Register global shortcut for boss key (Cmd+Escape)
  const ret = globalShortcut.register('CommandOrControl+Escape', () => {
    console.log('[Main] Cmd+Escape global shortcut pressed - triggering lock screen');
    if (browserViewManager.isTelegramLoadedStatus()) {
      lockManager.lockApp();
    }
  });

  if (ret) {
    console.log('[Main] Cmd+Escape global shortcut registered successfully');
  } else {
    console.log('[Main] Cmd+Escape global shortcut registration failed');
  }

  // Check for updates after app is ready (delay 3 seconds)
  setTimeout(() => {
    updateManager.checkForUpdates();
  }, 3000);
});

/**
 * 所有視窗關閉
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 應用程式啟動（macOS）
 */
app.on('activate', () => {
  if (!mainWindowManager.getWindow()) {
    createApp();
  }
});

/**
 * 應用程式即將退出
 */
app.on('will-quit', () => {
  // Unregister all global shortcuts
  globalShortcut.unregisterAll();
  console.log('[Main] Global shortcuts unregistered');
});

// Set application name and about panel
app.setName('Telegram');

if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'Telegram',
    applicationVersion: app.getVersion(),
    version: app.getVersion()
  });
}
