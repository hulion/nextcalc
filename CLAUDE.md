# CLAUDE.md

此文件為 Claude Code (claude.ai/code) 提供在此代碼庫中工作時的指導。

## 語言偏好設定

**重要:所有回應必須使用繁體中文(Traditional Chinese)。**

無論是新對話開始、對話壓縮後,或是任何情況下,都必須使用繁體中文回應使用者。這是強制性的語言要求。

## Claude Code 快速參考

### 常用快捷指令

當使用者說「**更新版本號**」時，執行以下完整流程：

1. **執行版本發布**
   ```bash
   npm run release
   ```
   這會自動：
   - 分析所有未發布的 commits
   - 根據 commit type 決定版本號（feat → minor, fix → patch）
   - 更新 package.json 版本
   - 生成/更新 CHANGELOG.md
   - 建立 git tag

2. **推送到 GitHub**
   ```bash
   git push --follow-tags origin main
   ```
   推送 commits 和新建立的 version tag

3. **確認結果**
   - 告知使用者新版本號
   - 提供 GitHub commit 連結
   - 說明下一步（如需要可建置並發布到 GitHub Releases）

**重要**: 使用者說「更新版本號」就是要執行上述完整流程，不需要再次確認。

## 專案概述

一個偽裝成計算機的隱私導向 Telegram macOS 桌面應用程式。使用 Electron BrowserView 架構提供密碼保護存取和緊急資料清除功能。

## 開發指令

```bash
npm install              # 安裝相依套件
npm start               # 啟動開發模式應用程式
npm run build           # 建置 macOS DMG 安裝檔
npm run release         # 根據 commits 自動升版並生成 CHANGELOG
npm run release:patch   # 強制升 patch 版本 (1.0.0 → 1.0.1)
npm run release:minor   # 強制升 minor 版本 (1.0.0 → 1.1.0)
npm run release:major   # 強制升 major 版本 (1.0.0 → 2.0.0)
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
│   ├── LockManager.js     # 核心鎖定/解鎖邏輯,協調 BrowserView 定位
│   └── UpdateManager.js   # 自動更新管理 (使用 electron-updater)
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

## Git Commit 規範

**重要:此專案使用 Conventional Commits 規範,所有 commit 都必須遵循以下格式。**

### Commit 訊息格式

```
<type>: <subject>

[optional body]

[optional footer]
```

### 允許的 Type

- **feat**: 新功能 (會升 minor 版本)
- **fix**: 錯誤修復 (會升 patch 版本)
- **perf**: 效能改進 (會升 patch 版本)
- **refactor**: 程式碼重構 (不影響功能的程式碼改善)
- **docs**: 文件更新 (不會升版本)
- **style**: 程式碼格式調整,不影響功能 (不會升版本)
- **test**: 測試相關 (不會升版本)
- **build**: 建置系統或外部相依性變更 (不會升版本)
- **ci**: CI/CD 設定檔變更 (不會升版本)
- **chore**: 其他雜項變更 (不會升版本)
- **revert**: 回復先前的 commit

### 範例

```bash
# 新功能
git commit -m "feat: 新增自動鎖定閒置超時設定"
git commit -m "feat: 新增緊急模式快捷鍵"

# 錯誤修復
git commit -m "fix: 修復鎖定畫面閃爍問題"
git commit -m "fix: 修復通知在鎖定狀態下仍顯示的問題"

# 效能改進
git commit -m "perf: 優化 BrowserView 渲染效能"

# 重構
git commit -m "refactor: 重構 LockManager 模組結構"

# 文件更新
git commit -m "docs: 更新 CLAUDE.md 架構說明"

# Breaking Change (會升 major 版本)
git commit -m "feat: 重新設計密碼驗證機制

BREAKING CHANGE: 舊版密碼格式不相容,需要重新設定密碼"
```

### 自動驗證

專案已設定 husky + commitlint:
- 每次 commit 時會自動檢查訊息格式
- 不符合規範的 commit 會被拒絕
- 錯誤訊息會說明哪裡需要修正

### Claude Code 執行 git commit 時

當 Claude Code 為您執行 git commit 時,**必須**遵循以下規範:

1. 分析變更內容,判斷適當的 type
2. 使用繁體中文撰寫 subject
3. Subject 簡潔扼要 (50 字以內)
4. 格式範例:
   ```bash
   git commit -m "feat: 新增使用者設定面板"
   git commit -m "fix: 修復記憶體洩漏問題"
   git commit -m "docs: 更新安裝說明"
   ```

### 版本發布流程

1. 完成一系列符合規範的 commits
2. 執行 `npm run release` 自動:
   - 分析所有 commits
   - 決定版本號 (根據 feat/fix/BREAKING CHANGE)
   - 更新 package.json 版本
   - 生成/更新 CHANGELOG.md
   - 建立 git tag
3. 或使用指定版本升級:
   - `npm run release:patch` - 錯誤修復版本
   - `npm run release:minor` - 新功能版本
   - `npm run release:major` - 破壞性更新版本

## 自動更新系統

應用程式使用 `electron-updater` 實作自動更新功能,從 GitHub Releases 獲取更新。

### 更新流程

1. **檢查更新**: 應用程式啟動 3 秒後自動檢查更新
2. **下載更新**: 發現新版本時自動下載
3. **通知使用者**: 顯示更新通知卡片,包含版本號和下載進度
4. **安裝更新**: 使用者點擊「立即重啟安裝」,應用程式重啟並套用更新

### 發佈新版本到 GitHub Releases

#### 步驟 1: 建立並推送版本標籤

```bash
# 1. 確保所有變更已提交
git status

# 2. 執行 release 指令建立版本標籤
npm run release        # 或 release:patch / release:minor / release:major

# 3. 推送 commits 和 tags 到 GitHub
git push --follow-tags origin main
```

#### 步驟 2: 建置應用程式

```bash
# 建置 macOS 應用程式 (會產生 zip 和 dmg)
npm run build
```

建置完成後,檔案位於 `dist/` 目錄:
- `NextCalc-{version}-mac.zip` - 自動更新用
- `NextCalc-{version}.dmg` - 使用者下載安裝用
- `latest-mac.yml` - 更新資訊檔

#### 步驟 3: 建立 GitHub Release

1. 前往 https://github.com/hulion/nextcalc/releases
2. 點擊「Draft a new release」
3. 選擇剛剛建立的標籤 (例如 `v1.0.1`)
4. Release title: `v1.0.1` (與標籤相同)
5. 描述欄位:從 CHANGELOG.md 複製此版本的變更內容
6. 上傳以下檔案:
   - `NextCalc-{version}-mac.zip` (必須!)
   - `NextCalc-{version}.dmg`
   - `latest-mac.yml` (必須!)
7. 點擊「Publish release」

#### 步驟 4: 驗證自動更新

發佈後,舊版本的應用程式會:
1. 自動檢測到新版本
2. 在背景下載更新
3. 顯示更新通知
4. 使用者確認後重啟並套用更新

### 更新系統架構

- **UpdateManager.js**: 管理更新邏輯,監聽 electron-updater 事件
- **更新通知 UI**: 在計算機鎖定畫面顯示,符合現有設計語言
- **IPC 通信**: 透過 `update-available`、`update-progress`、`update-downloaded` 事件傳遞更新狀態

### 開發模式注意事項

- 開發模式 (`npm start`) 不會檢查更新
- 只有打包後的應用程式 (`.app`) 才會啟用自動更新
- 測試更新功能需要建置並安裝應用程式

### 疑難排解

**問題**: 使用者沒有收到更新通知

檢查項目:
1. GitHub Release 是否包含 `latest-mac.yml` 和 `.zip` 檔案
2. package.json 的 `repository` 欄位是否正確
3. 檢查主控台是否有 `[UpdateManager]` 相關錯誤訊息

**問題**: 更新下載失敗

可能原因:
1. 網路連線問題
2. GitHub Release 檔案損壞
3. 權限不足無法寫入暫存目錄

## 實驗記錄

### 失敗實驗：鎖定時隱藏通知內容 (2025-11-24)

**目標**: 實作當應用程式鎖定時，通知顯示「NEXT Calc - 您有新訊息」而非完整訊息內容

**嘗試的方法**:
1. ✗ **preload.js 的 Notification API 覆寫** - Service Worker 不使用此 API
2. ✗ **注入 ServiceWorkerRegistration.prototype.showNotification 攔截器** - 攔截器成功注入但從未被調用
3. ✗ **清除 Service Worker 快取** - Service Worker 仍然繞過攔截
4. ✗ **在主進程層級監聽 IPC 和其他事件** - 沒有任何事件被觸發

**結論**:
**Telegram Web 的 Service Worker 通知完全繞過了 Electron 的 JavaScript 層級**，直接從 Chromium 底層到達 macOS 系統通知中心。無法在 JavaScript 或 Electron API 層級攔截這些通知。

**為什麼無法攔截**:
- Service Worker 運行在獨立的執行緒和隔離的上下文中
- Service Worker 的通知 API 調用直接通過 Chromium 的原生實作
- JavaScript 層級的 API 覆寫對已運行的 Service Worker 無效
- Electron 沒有提供主進程層級的通知攔截 API

**可能的替代方案** (未實作):
- 使用 Electron protocol API 攔截並修改 Service Worker 腳本文件本身（技術複雜度極高）
- 改為「鎖定時完全禁用通知」而非「隱藏內容」（功能降級）
- 接受限制，不實作此功能

**學到的教訓**:
- Service Worker 通知無法在應用程式層級攔截
- 需要更深層的系統層級介入才能修改 Service Worker 行為
- 在規劃功能前應先驗證技術可行性

## 遠端清除系統

此專案包含**企業遠端清除功能**，允許公司管理員在緊急情況下遠端登出員工裝置上的 Telegram 會話。

### 重要聲明

⚠️ **完整規範請參考 [REMOTE_WIPE.md](./REMOTE_WIPE.md)**

**此功能的所有設計和實作必須嚴格遵循 REMOTE_WIPE.md 的規範，該文件為唯一標準。**

### 核心原則（絕對不可違反）

1. **用戶自主權**
   - ✅ 用戶可自由選擇是否啟用遠端清除功能
   - ✅ 用戶隨時可以在設定中停用此功能
   - ❌ 禁止強制啟用或在用戶不知情下啟用

2. **靜默執行**
   - ✅ 收到清除指令後立即靜默執行
   - ✅ **不顯示任何警告、通知或提示給用戶**
   - ❌ 禁止顯示警告或詢問用戶確認

3. **清除範圍**
   - ✅ **只登出 Telegram 會話**（清除 session、storage）
   - ✅ 不刪除 telegram-data 資料夾
   - ✅ 用戶可重新登入
   - ❌ 禁止刪除整個資料夾或應用程式

4. **檢查機制**
   - ✅ App 啟動時立即檢查一次
   - ✅ 運行期間每 5 分鐘檢查一次
   - ❌ 禁止修改檢查頻率

5. **技術架構**
   - ✅ **必須使用 Cloudflare Workers**（前端 + 後端整合）
   - ✅ 必須使用 Cloudflare KV 儲存
   - ✅ 前端必須使用 React + Vite + Tailwind + shadcn/ui
   - ❌ 禁止使用其他雲端服務或自架伺服器

### 使用情境

此功能僅適用於：
- 公司內部人員使用
- 裝置遺失或被盜
- 員工離職但未歸還裝置
- 發現未授權存取行為
- 機敏對話洩漏風險

### 快速參考

**完整的架構、API、資料結構、實作步驟、禁止事項等所有細節，請參考：**

📖 **[REMOTE_WIPE.md](./REMOTE_WIPE.md)** - 唯一標準規範文檔

**任何違反 REMOTE_WIPE.md 規範的實作都是不被允許的。**
