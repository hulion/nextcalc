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

macOS Telegram 桌面應用程式，含計算機風格鎖定畫面。使用 Electron WebContentsView 架構提供密碼保護存取與資料重設功能。

執行環境（1.4.0）：Electron 41.10.6（Chromium 146 / Node 24）、electron-builder 26.15.3、electron-updater 6.8.9、`minimumSystemVersion` 12.0。

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

開發期間重啟應用程式（**只殺本專案的 Electron**，機器上可能有其他 Electron app 在跑，不要用 `pkill -9 -f Electron`）:
```bash
pkill -9 -f "$PWD/node_modules/electron/dist/Electron.app" 2>/dev/null; sleep 2; npm start
```

## 架構

### 核心架構模式: WebContentsView 鎖定畫面

應用程式使用獨特的雙層架構:

1. **主視窗** (calculator-lock.html) - 始終可見,作為鎖定畫面
2. **WebContentsView** (Telegram Web) - 鎖定時從主視窗 detach,解鎖時 attach 回來

關鍵概念: Telegram Web 的 `webContents` 在鎖定期間仍然活著（**只 detach，不 destroy**），在鎖定/解鎖循環期間從不重新載入。這保留了會話狀態。

> BrowserView 自 Electron 30 起標記棄用，1.4.0 已全面遷移到 `WebContentsView`。差異三點（動這層前必看 `window/BrowserViewManager.js` 檔頭註解）:
> - `addBrowserView` / `removeBrowserView` → `mainWindow.contentView.addChildView` / `removeChildView`
> - **沒有 `setAutoResize`** → 視窗縮放時的 bounds 必須由主視窗 `resize` 事件手動驅動
> - 預設背景是**不透明白色**（BrowserView 是透明）→ 建立後立刻 `setBackgroundColor('#00000000')`，否則會白閃

### 模組組織

```
main.js                    # 入口點,協調所有模組
├── config/
│   ├── ConfigManager.js   # 密碼/設定的單例 (儲存至 ~/Library/Application Support)
│   └── IdleDetector.js    # 基於閒置時間的自動鎖定
├── features/
│   ├── LockManager.js     # 核心鎖定/解鎖邏輯,協調 WebContentsView attach/detach
│   └── UpdateManager.js   # 自動更新管理 (使用 electron-updater)
├── window/
│   ├── MainWindow.js      # 計算機視窗管理
│   └── BrowserViewManager.js  # Telegram WebContentsView 生命週期（檔名沿用舊稱）
├── menu/
│   └── MenuBuilder.js     # macOS 選單列 (根據鎖定狀態變化)
├── ipc/
│   └── IPCHandler.js      # 渲染器和主程序之間的 IPC 通信
├── preload.js             # 安全橋接,將 electronAPI 暴露給渲染器
└── panic-detector.js      # 注入到 Telegram 頁面,偵測緊急按鍵序列
```

### 狀態流程

1. **啟動**: MainWindow 顯示計算機 → 建立 WebContentsView 載入 Telegram，但**不 attach 到主視窗**（省下合成與渲染成本）
2. **解鎖**: 使用者輸入密碼 (預設密碼見 `config/ConfigManager.js` 預設值) → `contentView.addChildView()` + 重設 bounds → 選單變更為解鎖狀態
3. **鎖定**: 手動鎖定或閒置超時 → `contentView.removeChildView()`（webContents 保持存活）→ 選單變更為鎖定狀態
4. **資料重設**: 計算機或 Telegram 中輸入指定按鍵序列 (序列見 `config/ConfigManager.js` 與 `panic-detector.js`) → 清除所有資料 → 重置為鎖定狀態

### 模組相依性

LockManager 是中央協調器:
- 從計算機接收解鎖請求 (透過 IPC)
- 控制 Telegram WebContentsView 的 attach / detach
- 觸發選單重建
- 管理閒置偵測器狀態
- 處理緊急模式資料清除

## 關鍵實作細節

### WebContentsView attach / detach 策略

鎖定/解鎖機制依賴於把 view 從主視窗的 view 樹上摘下與掛回（**不是**把它移到畫面外的 `y: -10000`，那是 1.4.0 之前的舊做法）:

```javascript
// 鎖定狀態：摘下 → 停止合成與渲染，webContents 仍存活
mainWindow.contentView.removeChildView(telegramView);

// 解鎖狀態：掛回 → 必須重設 bounds，否則位置不對
mainWindow.contentView.addChildView(telegramView);
telegramView.setBounds({ x: 0, y: 0, width, height });
```

這種方法:
- 避免銷毀/重建 view (保留 Telegram 會話)
- 提供即時鎖定/解鎖而無需重新載入頁面
- 鎖定期間 renderer 被 Chromium 節流（比舊的「移出畫面」更省資源），但**通知會累積到解鎖後補發**（已知 trade-off）

注意事項:
- `attachView()` 前要 `isDestroyed()` 守衛（避免對已銷毀的 view 操作）
- view 生命週期結束時顯式 `webContents.close()`，否則監聽器會洩漏
- 沒有 `setAutoResize`：主視窗 `resize` 事件是**唯一**的 bounds 更新路徑

### 密碼驗證

密碼檢查發生在 `calculator-lock.js` (渲染器):
1. 使用者透過計算機 UI 輸入數字
2. 最後 N 位數字透過 IPC 與儲存的密碼比對
3. 匹配時: IPC 呼叫 `unlock-app` → LockManager.unlockApp()

### 緊急模式偵測

兩個獨立的觸發器:
1. **計算機鎖定畫面**: 在 calculator-lock.js 中偵測指定輸入序列 (見 `config/ConfigManager.js` 預設值)
2. **Telegram 介面**: `panic-detector.js` 注入到 Telegram 頁面,偵測 3 秒內按 6 次 "4"

兩者都觸發 `clear-telegram-data` IPC → 清除會話儲存、IndexedDB、快取 → 以預設密碼重置為鎖定狀態

### 通知路徑（**注意：preload 的覆寫其實沒有生效**）

實際送出通知的路徑（2026-08 實測，task#100446 Phase 2）:

```
Telegram 頁面呼叫原生 Notification → Chromium → macOS cocoa notification presenter → 系統通知中心
```

也就是說通知**完全沒有經過我們的 JS 層**。`preload.js` 裡的 `ElectronNotification` 類別與 `window.Notification` 覆寫（`preload.js:73-149`）是**死碼**：
- Telegram 是在 main world 執行，preload 在 isolated world（`contextIsolation: true`，見 `window/BrowserViewManager.js:59`）
- 兩個世界的 `window` 不是同一個物件，preload 改的 `window.Notification` 頁面看不到
- Service Worker 的 `showNotification()` 在此環境是 no-op（回傳的 promise 永不 resolve），所以也不是它在送

實務含意:
- 想改通知的顯示內容/時機，**改 preload 沒用**；正解是用 CDP `Page.addScriptToEvaluateOnNewDocument` 在 **main world、document-start** 注入覆寫（已實測可攔到）
- 通知的「鎖定時不顯示內容」目前是靠 macOS 系統設定（通知 → NextCalc → 顯示預覽 → 解鎖時），不是靠 app 邏輯
- 這段死碼暫時保留（移除屬獨立清理任務），但**不要據它推論通知行為**

## 資料儲存位置

- **設定**: `~/Library/Application Support/next-calc/config.json`
- **Telegram 資料**: `~/Library/Application Support/next-calc/telegram-data/`

> 路徑是 `app.getPath('userData')`，實際目錄名由 `package.json` 的 `name`（`next-calc`）決定。舊文件寫的 `telegram-calculator` 是錯的。
- **資料重設**: 刪除上述兩個目錄,將密碼重置為 `config/ConfigManager.js` 中的預設值

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
- 資料重設觸發序列是硬編碼的 (不可設定以防忘記),值見 `config/ConfigManager.js`
- 鎖定只是把 WebContentsView detach，並非加密安全 (webContents 仍存活，記憶體取證可能恢復)
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
git commit -m "perf: 優化 WebContentsView 渲染效能"

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

**結論（2026-08-21 更正歸因，task#100446 Phase 2 實測）**:

上面四條嘗試失敗的記錄為真，但**當年的歸因是錯的**。

- ❌ 舊結論：「Telegram 的 Service Worker 通知繞過了 Electron 的 JavaScript 層」
- ✅ 正確歸因：**`contextIsolation: true` 的世界隔離**。Telegram 頁面在 main world 呼叫**原生 `Notification`**，preload 在 isolated world，兩者的 `window` 不是同一個物件 → preload 的覆寫（嘗試 1）對頁面完全不可見，是死碼。至於 Service Worker 的 `showNotification()`，在此環境其實是 no-op（promise 永不 resolve），所以嘗試 2/3 攔不到不是因為「SW 繞過」，而是因為**通知根本不是 SW 送的**
- 真實送出路徑：頁面原生 `Notification` → Chromium → macOS cocoa notification presenter → 系統通知中心

**正解方向（已實測可攔）**:
- 用 CDP `Page.addScriptToEvaluateOnNewDocument`，在 **main world、document-start** 注入 `Notification` 覆寫 —— 這條路能攔到真正在送的那個 API
- 現行 preload 的 `ElectronNotification` 是死碼，不要在它上面加功能

**學到的教訓**:
- 「攔不到」要先定位**誰在送**，不要直接歸因給最可疑的元件（當年錯把 SW 當兇手，錯了將近兩年）
- `contextIsolation` 下 preload 改 `window.X` 對頁面無效，這是設計而非 bug
- 在規劃功能前應先驗證技術可行性，而且要驗到「路徑」而不只是「結果」

## 遠端會話管理

此專案包含選用的**遠端會話登出功能**：裝置持有者可自行啟用，之後在裝置遺失等情況下由管理端觸發登出，僅清除本機的 Telegram 會話（session / storage），不刪除資料夾、不影響應用程式本體，之後可重新登入。

### 設計規範

完整規範見本地文件 `REMOTE_WIPE.md`（內部文件，不隨 repo 發佈）。實作變更以該文件為準。

### 核心原則

1. **使用者自主權**
   - 功能預設關閉，由使用者自行決定是否啟用
   - 使用者可隨時在設定中停用
   - 不得強制啟用

2. **範圍限定**
   - 只登出 Telegram 會話（清除 session、storage）
   - 不刪除 telegram-data 資料夾，使用者可重新登入
   - 不得刪除整個資料夾或應用程式

3. **檢查機制**
   - App 啟動時檢查一次，運行期間定期檢查
   - 檢查頻率屬規範項目，變更需依規範文件

4. **技術架構**
   - 後端：Cloudflare Workers + Cloudflare KV
   - 管理前端：React + Vite + Tailwind + shadcn/ui
   - 不使用其他雲端服務或自架伺服器
