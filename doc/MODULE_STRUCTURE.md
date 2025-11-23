# 模組架構說明

## 概覽

本專案已完成模組化重構，將原本的單一 main.js 檔案分解為多個職責明確的模組。

## 目錄結構

```
tg_mac_electron/
├── main.js                          # 應用程式主入口
├── config/                          # 配置管理模組
│   ├── ConfigManager.js            # 配置管理器（單例模式）
│   └── IdleDetector.js             # 閒置檢測器
├── ipc/                            # IPC 通信模組
│   └── IPCHandler.js               # IPC 處理器
├── features/                       # 功能模組
│   └── LockManager.js              # 鎖定/解鎖管理器
├── window/                         # 視窗管理模組
│   ├── MainWindow.js               # 主視窗管理器
│   └── BrowserViewManager.js       # BrowserView 管理器
└── menu/                           # 選單模組
    └── MenuBuilder.js              # 選單建構器
```

## 模組說明

### 1. config/ - 配置管理模組

#### ConfigManager.js
- **職責**: 管理應用程式配置（密碼、閒置時間等）
- **模式**: 單例模式
- **主要功能**:
  - 載入/儲存配置檔案
  - 密碼管理
  - 閒置時間設定

#### IdleDetector.js
- **職責**: 檢測用戶閒置狀態
- **主要功能**:
  - 監控用戶活動
  - 閒置超時自動鎖定
  - 重置閒置計時器

### 2. ipc/ - IPC 通信模組

#### IPCHandler.js
- **職責**: 處理主進程與渲染進程之間的通信
- **主要功能**:
  - 註冊 IPC 處理器
  - 解鎖/鎖定應用
  - 密碼管理 IPC
  - 緊急模式處理
  - 系統通知

### 3. features/ - 功能模組

#### LockManager.js
- **職責**: 管理應用程式的鎖定/解鎖狀態
- **主要功能**:
  - 鎖定應用程式
  - 解鎖應用程式
  - 注入計算機覆蓋層
  - 顯示/隱藏計算機覆蓋層

### 4. window/ - 視窗管理模組

#### MainWindow.js
- **職責**: 管理主視窗和設定視窗
- **主要功能**:
  - 建立主視窗
  - 開啟密碼設定視窗
  - 視窗事件處理
  - 視窗生命週期管理

#### BrowserViewManager.js
- **職責**: 管理 Telegram BrowserView
- **主要功能**:
  - 建立 BrowserView
  - 載入 Telegram 網頁
  - 注入 Panic Detector 腳本
  - 調整 BrowserView 大小

### 5. menu/ - 選單模組

#### MenuBuilder.js
- **職責**: 建構應用程式選單
- **主要功能**:
  - 根據狀態動態建立選單
  - 處理選單項目點擊事件
  - 更新選單項目

## 模組依賴關係

```
main.js
  ├── ConfigManager (Singleton)
  ├── IdleDetector
  ├── IPCHandler
  ├── LockManager
  ├── MainWindow
  ├── BrowserViewManager
  └── MenuBuilder

LockManager
  ├── 依賴: IdleDetector, IPCHandler
  └── 提供: lockApp(), unlockApp()

MainWindow
  ├── 依賴: LockManager, IdleDetector, IPCHandler
  └── 提供: create(), openPasswordSettings()

BrowserViewManager
  ├── 依賴: LockManager, IdleDetector
  └── 提供: create(), resize()

MenuBuilder
  ├── 依賴: LockManager, MainWindow
  └── 提供: build()

IPCHandler
  ├── 依賴: ConfigManager, IdleDetector, LockManager
  └── 提供: IPC 處理器註冊
```

## 初始化流程

1. **應用程式啟動** (main.js `app.on('ready')`)
   - 載入配置 (ConfigManager)
   - 建立應用程式 (createApp())

2. **建立應用程式** (createApp())
   - 建立主視窗 (MainWindow.create())
   - 建立 BrowserView (BrowserViewManager.create())
   - 設定模組依賴關係
   - 初始化 IPC 處理器
   - 建構初始選單

3. **Telegram 載入完成**
   - 注入 Panic Detector
   - 初始化閒置檢測
   - 更新選單狀態

## 重構優點

1. **職責分離**: 每個模組有明確的職責
2. **易於維護**: 模組獨立，修改影響範圍小
3. **可測試性**: 模組可以獨立測試
4. **可擴展性**: 新增功能只需新增模組
5. **程式碼重用**: 模組可以在其他專案中重用
6. **可讀性**: 程式碼結構清晰，易於理解

## 開發指南

### 新增模組

1. 在適當的目錄下建立新模組檔案
2. 使用 ES6 類別定義模組
3. 在 main.js 中引入並初始化模組
4. 設定模組依賴關係

### 修改現有模組

1. 找到對應的模組檔案
2. 修改模組內部實作
3. 確保不影響模組的公開 API
4. 測試修改是否正常運作

### 除錯

1. 每個模組都有 console.log 輸出，標註模組名稱
2. 檢查模組初始化順序
3. 確認模組依賴關係正確設定

## 測試

### 語法檢查
```bash
node -c main.js
node -c config/ConfigManager.js
node -c config/IdleDetector.js
node -c ipc/IPCHandler.js
node -c features/LockManager.js
node -c window/MainWindow.js
node -c window/BrowserViewManager.js
node -c menu/MenuBuilder.js
```

### 模組載入測試
```bash
node -e "
const ConfigManager = require('./config/ConfigManager');
const LockManager = require('./features/LockManager');
// ... 其他模組
console.log('所有模組載入成功');
"
```

## 版本歷史

- **v2.0** (2025-11-23): 完成階段3模組化重構
  - 建立 features/LockManager.js
  - 建立 window/MainWindow.js
  - 建立 window/BrowserViewManager.js
  - 建立 menu/MenuBuilder.js
  - 重構 main.js 使用所有新模組

- **v1.0**: 原始版本（單一 main.js 檔案）
