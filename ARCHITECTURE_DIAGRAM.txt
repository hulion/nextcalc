階段3模組化架構圖
================================================================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                              main.js (147 lines)                            │
│                         應用程式主入口 & 模組協調者                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 初始化並協調所有模組
         │
         ├──────────────────────────────────────────────────────────────────┐
         │                                                                  │
         ▼                                                                  ▼
┌─────────────────────┐                                          ┌─────────────────────┐
│  ConfigManager.js   │◄─────────────────────────────────────────│  IdleDetector.js    │
│   (Singleton)       │                                          │                     │
│   配置管理器         │                                          │   閒置檢測器         │
│                     │                                          │                     │
│ • 密碼管理          │                                          │ • 監控用戶活動       │
│ • 閒置時間設定      │                                          │ • 自動鎖定          │
└─────────────────────┘                                          └─────────────────────┘
         │                                                                  │
         │                                                                  │
         ▼                                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          IPCHandler.js (285 lines)                          │
│                          IPC 通信處理器                                      │
│                                                                             │
│ • unlock-app              • get-password          • panic-mode             │
│ • set-password            • get-idle-time         • clear-telegram-data    │
│ • reset-password          • set-idle-time         • show-notification      │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 通知狀態變更
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LockManager.js (370 lines)                           │
│                        鎖定/解鎖狀態管理器                                    │
│                                                                             │
│ • lockApp()                    • unlockApp()                                │
│ • injectCalculatorOverlay()    • showCalculatorOverlay()                    │
│ • hideCalculatorOverlay()                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 控制視窗顯示
         │
         ├──────────────────────────────┬────────────────────────────────────┐
         │                              │                                    │
         ▼                              ▼                                    ▼
┌─────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────┐
│  MainWindow.js      │    │  BrowserViewManager.js  │    │  MenuBuilder.js     │
│  (170 lines)        │    │  (145 lines)            │    │  (130 lines)        │
│                     │    │                         │    │                     │
│  主視窗管理          │    │  BrowserView 管理        │    │  選單建構器          │
│                     │    │                         │    │                     │
│ • create()          │    │ • create()              │    │ • build()           │
│ • openSettings()    │    │ • injectPanic()         │    │ • setTelegramLoaded │
│ • setupEvents()     │    │ • resize()              │    │                     │
└─────────────────────┘    └─────────────────────────┘    └─────────────────────┘
         │                              │                              │
         │                              │                              │
         ▼                              ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────┐    ┌─────────────────────┐
│  主視窗              │    │  Telegram BrowserView   │    │  應用程式選單        │
│  calculator-lock    │    │  + Panic Detector       │    │  (動態更新)          │
└─────────────────────┘    └─────────────────────────┘    └─────────────────────┘


模組依賴關係
================================================================================

main.js
  ├── ConfigManager (Singleton)    ← 配置管理
  ├── IdleDetector                 ← 閒置檢測
  ├── IPCHandler                   ← IPC 通信
  ├── LockManager                  ← 鎖定管理
  ├── MainWindow                   ← 視窗管理
  ├── BrowserViewManager           ← BrowserView 管理
  └── MenuBuilder                  ← 選單建構

LockManager
  ├── 依賴: IdleDetector, IPCHandler, MainWindow, BrowserViewManager
  └── 提供: lockApp(), unlockApp(), 計算機覆蓋層管理

MainWindow
  ├── 依賴: LockManager, IdleDetector, IPCHandler
  └── 提供: 視窗建立、設定視窗、事件處理

BrowserViewManager
  ├── 依賴: LockManager, IdleDetector
  └── 提供: BrowserView 建立、Panic Detector 注入、調整大小

MenuBuilder
  ├── 依賴: LockManager, MainWindow
  └── 提供: 動態選單建構

IPCHandler
  ├── 依賴: ConfigManager, IdleDetector, LockManager
  └── 提供: IPC 處理器註冊和管理


初始化流程
================================================================================

1. app.on('ready')
   │
   ├─► ConfigManager.load()          ← 載入配置
   │
   └─► createApp()
       │
       ├─► MainWindow.create()        ← 建立主視窗
       │     └─► 載入 calculator-lock.html
       │
       ├─► BrowserViewManager.create() ← 建立 BrowserView
       │     └─► 載入 https://web.telegram.org/k/
       │
       ├─► 設定模組依賴關係
       │     ├─► LockManager.initialize()
       │     ├─► BrowserViewManager.setDependencies()
       │     ├─► MainWindow.setDependencies()
       │     └─► MenuBuilder.setDependencies()
       │
       ├─► IPCHandler.initialize()    ← 初始化 IPC 處理器
       │
       └─► MenuBuilder.build()        ← 建構初始選單

2. Telegram 載入完成 (did-finish-load)
   │
   ├─► BrowserViewManager.injectPanicDetector()  ← 注入 Panic Detector
   │
   ├─► IdleDetector.initialize()                 ← 初始化閒置檢測
   │
   └─► MenuBuilder.build()                       ← 更新選單（顯示鎖定選項）


程式碼統計
================================================================================

┌──────────────────────────────┬───────────┬──────────────────────────┐
│ 模組                          │ 行數      │ 職責                      │
├──────────────────────────────┼───────────┼──────────────────────────┤
│ main.js                      │    147    │ 應用程式入口              │
│ config/ConfigManager.js      │    180    │ 配置管理                  │
│ config/IdleDetector.js       │    145    │ 閒置檢測                  │
│ ipc/IPCHandler.js            │    285    │ IPC 通信                  │
│ features/LockManager.js      │    370    │ 鎖定管理                  │
│ window/MainWindow.js         │    170    │ 視窗管理                  │
│ window/BrowserViewManager.js │    145    │ BrowserView 管理          │
│ menu/MenuBuilder.js          │    130    │ 選單建構                  │
├──────────────────────────────┼───────────┼──────────────────────────┤
│ 總計                          │  1,572    │ 完整模組化架構            │
└──────────────────────────────┴───────────┴──────────────────────────┘

重構前 main.js: 600+ 行 → 重構後: 147 行（減少 75%）


重構優點
================================================================================

✅ 職責分離 (Single Responsibility)
   每個模組有明確的單一職責

✅ 可維護性提升
   模組獨立，修改影響範圍小

✅ 可測試性提升
   模組可以獨立測試和 mock

✅ 可擴展性提升
   新增功能只需新增對應模組

✅ 可讀性提升
   程式碼結構清晰，易於理解

✅ 可重用性提升
   模組可以在其他專案中重用


功能完整性檢查
================================================================================

✅ 計算機鎖定畫面功能完整保留
✅ Telegram BrowserView 載入正常
✅ Panic Detector 注入機制保留
✅ 閒置檢測自動鎖定保留
✅ 密碼設定視窗功能保留
✅ 全域快捷鍵 (Cmd+Escape) 保留
✅ 選單動態更新保留
✅ 所有 IPC 通信保留

