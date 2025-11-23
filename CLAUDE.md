# CLAUDE.md

此文件為 Claude Code (claude.ai/code) 提供在此代碼庫中工作時的指導。

## 語言偏好設定

**重要:所有回應必須使用繁體中文(Traditional Chinese)。**

無論是新對話開始、對話壓縮後,或是任何情況下,都必須使用繁體中文回應使用者。這是強制性的語言要求。

## 專案概述

一個偽裝成計算機的隱私導向 Telegram macOS 桌面應用程式。使用 Electron BrowserView 架構提供密碼保護存取和緊急資料清除功能。

## 開發指令

```bash
npm install              # 安裝相依套件
npm start               # 啟動開發模式應用程式
npm run build           # 建置 macOS DMG 安裝檔
```

開發期間重啟應用程式:
```bash
pkill -9 -f Electron && sleep 2 && npm start
```

## 架構

### 核心架構模式: BrowserView 鎖定畫面

應用程式使用獨特的雙層架構:

1. **主視窗** (calculator-lock.html) - 始終可見,作為鎖定畫面
2. **BrowserView** (Telegram Web) - 鎖定時隱藏在畫面外 (y: -10000),解鎖時移入視圖

關鍵概念: Telegram Web 在背景的 BrowserView 中持續運行,在鎖定/解鎖循環期間從不重新載入。這保留了會話狀態。

### 模組組織

```
main.js                    # 入口點,協調所有模組
├── config/
│   ├── ConfigManager.js   # 密碼/設定的單例 (儲存至 ~/Library/Application Support)
│   └── IdleDetector.js    # 基於閒置時間的自動鎖定
├── features/
│   └── LockManager.js     # 核心鎖定/解鎖邏輯,協調 BrowserView 定位
├── window/
│   ├── MainWindow.js      # 計算機視窗管理
│   └── BrowserViewManager.js  # Telegram BrowserView 生命週期
├── menu/
│   └── MenuBuilder.js     # macOS 選單列 (根據鎖定狀態變化)
├── ipc/
│   └── IPCHandler.js      # 渲染器和主程序之間的 IPC 通信
├── preload.js             # 安全橋接,將 electronAPI 暴露給渲染器
└── panic-detector.js      # 注入到 Telegram 頁面,偵測緊急按鍵序列
```

### 狀態流程

1. **啟動**: MainWindow 顯示計算機 → BrowserView 在 y: -10000 載入 Telegram
2. **解鎖**: 使用者輸入密碼 (預設 1209) → BrowserView 移動到可見位置 → 選單變更為解鎖狀態
3. **鎖定**: 手動鎖定或閒置超時 → BrowserView 移至畫面外 → 選單變更為鎖定狀態
4. **緊急模式**: 計算機上輸入 "4444" 或 Telegram 中輸入 "444444" → 清除所有資料 → 重置為鎖定狀態

### 模組相依性

LockManager 是中央協調器:
- 從計算機接收解鎖請求 (透過 IPC)
- 控制 BrowserView 位置
- 觸發選單重建
- 管理閒置偵測器狀態
- 處理緊急模式資料清除

## 關鍵實作細節

### BrowserView 定位策略

鎖定/解鎖機制依賴於 BrowserView 的 Y 座標定位:

```javascript
// 鎖定狀態
telegramView.setBounds({ x: 0, y: -10000, width, height });

// 解鎖狀態
telegramView.setBounds({ x: 0, y: 0, width, height });
```

這種方法:
- 避免銷毀/重建 BrowserView (保留 Telegram 會話)
- 提供即時鎖定/解鎖而無需重新載入頁面
- 維護背景操作 (通知、訊息)

### 密碼驗證

密碼檢查發生在 `calculator-lock.js` (渲染器):
1. 使用者透過計算機 UI 輸入數字
2. 最後 N 位數字透過 IPC 與儲存的密碼比對
3. 匹配時: IPC 呼叫 `unlock-app` → LockManager.unlockApp()

### 緊急模式偵測

兩個獨立的觸發器:
1. **計算機鎖定畫面**: 在 calculator-lock.js 中偵測輸入序列 "4444"
2. **Telegram 介面**: `panic-detector.js` 注入到 Telegram 頁面,偵測 3 秒內按 6 次 "4"

兩者都觸發 `clear-telegram-data` IPC → 清除會話儲存、IndexedDB、快取 → 以預設密碼重置為鎖定狀態

### 通知覆寫

Telegram Web 通知在 `preload.js` 中被攔截:
- 用自訂 `ElectronNotification` 類別覆寫瀏覽器 `Notification` API
- 透過 IPC 將所有通知路由到 macOS 原生通知
- 防止權限提示,提供無縫通知體驗

## 資料儲存位置

- **設定**: `~/Library/Application Support/telegram-calculator/config.json`
- **Telegram 資料**: `~/Library/Application Support/telegram-calculator/telegram-data/`
- **緊急模式**: 刪除上述兩個目錄,將密碼重置為 "1209"

## 重要模式

### IPC 通信模式

所有渲染器 → 主程序通信都透過 `preload.js` 暴露的 API:

```javascript
// 渲染器端
window.electronAPI.unlockApp()

// Preload 橋接 (preload.js)
unlockApp: () => ipcRenderer.invoke('unlock-app')

// 主程序處理器 (IPCHandler.js)
ipcMain.handle('unlock-app', () => this.unlockApp())
```

### 選單狀態管理

MenuBuilder 根據以下條件動態建立選單:
- 鎖定狀態 (鎖定 = 最小選單)
- Telegram 載入狀態 (載入前 = 無鎖定選項)
- 使用 `setDependencies()` 模式接收回調

### 模組初始化模式

所有主要模組遵循此模式:
1. 建構函式: 僅初始化狀態
2. `setDependencies()` 或 `initialize()`: 接收外部相依性
3. 透過延遲綁定避免循環相依

## 測試與除錯

- 使用 `npm start` 啟動以查看主控台輸出
- 查找 `[Main]`、`[LockManager]`、`[BrowserView]`、`[Panic Detector]` 前綴的日誌
- 計算機鎖定畫面有可用的瀏覽器開發工具 (檢視 > 切換開發者工具)
- 如需要,可以程式化方式開啟 Telegram BrowserView 開發工具

## 常見修改

### 新增 IPC 處理器

1. 在 `IPCHandler.js` 中新增方法
2. 在 `initialize()` 中使用 `ipcMain.handle()` 註冊
3. 在 `preload.js` 中透過 `contextBridge.exposeInMainWorld()` 暴露
4. 從渲染器透過 `window.electronAPI.methodName()` 呼叫

### 變更鎖定/解鎖行為

編輯 `LockManager.js`:
- `lockApp()`: 處理鎖定時的狀態
- `unlockApp()`: 處理解鎖時的狀態
- 記得觸發 `onMenuRebuild()` 回調

### 修改計算機 UI

編輯 `calculator-lock.html` 和 `calculator-lock.js`:
- 使用 React 建置 (從 dist/ 載入)
- 密碼檢查邏輯在 calculator-lock.js
- 支援點擊和鍵盤輸入

## 安全性考量

- 密碼以明文儲存在 config.json (僅本地檔案系統保護)
- 緊急模式 "4444" 序列是硬編碼的 (不可設定以防忘記)
- BrowserView 畫面外定位並非加密安全 (記憶體取證可能恢復)
- 緊急清除刪除檔案但不安全抹除 (SSD TRIM 可能使恢復困難)
