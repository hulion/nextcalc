# 企業遠端清除系統規範

此文件為企業遠端清除功能的**唯一標準規範**。所有相關開發和實作必須嚴格遵循此文件的規定。

---

## 📋 功能概述

### 目的

企業遠端清除系統允許公司管理員在緊急情況下（如機敏資訊洩漏、裝置遺失等），遠端登出員工裝置上的 Telegram 會話，達到資料保護目的。

### 核心價值

- **緊急應變**：快速應對資料洩漏事件
- **用戶自主**：員工可自由選擇是否啟用此功能
- **操作透明**：所有操作記錄完整日誌，可供審計
- **可復原性**：只登出 Telegram，員工可重新登入

### 適用情境

- 公司內部人員使用
- 裝置遺失或被盜
- 員工離職但未歸還裝置
- 發現未授權存取行為
- 機敏對話洩漏風險

---

## 🔒 核心原則（強制規範）

### 1. 用戶自主權

✅ **必須遵守**：
- 用戶首次使用時可選擇是否啟用遠端清除功能
- 用戶隨時可以在設定中停用此功能
- 停用後，管理員無法遠端清除該裝置

❌ **絕對禁止**：
- 強制啟用遠端清除功能
- 在用戶不知情下啟用此功能
- 阻止用戶停用此功能

### 2. 靜默執行

✅ **必須遵守**：
- 收到清除指令後**立即靜默執行**
- **不顯示任何警告、通知或提示給用戶**
- 整個清除過程完全在背景執行
- 用戶只會在解鎖後發現 Telegram 已登出

❌ **絕對禁止**：
- 顯示「即將清除」的警告訊息
- 詢問用戶是否同意清除
- 給用戶任何取消清除的機會

### 3. 清除範圍

✅ **必須遵守**：
- **只登出 Telegram 會話**（清除 session、localStorage、IndexedDB）
- **不刪除應用程式資料夾**
- 清除後回到計算機鎖定畫面
- 用戶可重新登入 Telegram（輸入手機號、驗證碼）

❌ **絕對禁止**：
- 刪除整個 telegram-data 資料夾
- 刪除應用程式本身
- 刪除用戶的其他資料或設定

### 4. 檢查機制

✅ **必須遵守**：
- **App 啟動時立即檢查一次**清除指令
- 運行期間**每 5 分鐘檢查一次**
- 檢查失敗時靜默處理，不影響應用程式運行

❌ **絕對禁止**：
- 檢查頻率過高（耗費資源、增加網路流量）
- 檢查頻率過低（延遲清除時間）
- 檢查失敗時顯示錯誤給用戶

### 5. 操作日誌

✅ **必須遵守**：
- 所有清除操作必須記錄日誌
- 日誌包含：時間、執行者、原因、裝置 ID
- 日誌不可刪除或修改
- 日誌儲存在伺服器端（Cloudflare KV）

❌ **絕對禁止**：
- 跳過日誌記錄
- 允許刪除或修改日誌
- 只在客戶端記錄日誌（不可信）

---

## 🔄 清除流程規範

### 完整流程圖

```
┌─────────────┐
│ 管理員      │
│ 發送清除指令│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Cloudflare KV   │
│ 儲存清除指令    │
└──────┬──────────┘
       │
       ▼
┌─────────────────────────────┐
│ 客戶端檢查（啟動 + 每5分鐘）│
└──────┬──────────────────────┘
       │
       ▼
    發現指令？
       │
   是  │  否 → 繼續運行
       ▼
┌──────────────────┐
│ 靜默執行清除     │
│ - 不顯示警告     │
│ - 清除 session   │
│ - 清除 storage   │
│ - 記錄日誌       │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ 鎖定應用程式     │
│ 回到計算機畫面   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ 回報伺服器       │
│ 清除完成         │
└──────────────────┘
```

### 步驟詳解

#### 步驟 1：管理員發送清除指令

**觸發方式**：
1. **單一裝置清除**：指定裝置 ID
2. **批次清除**：選擇多個裝置
3. **群組清除**：清除特定部門/群組的所有裝置

**必填欄位**：
- 清除原因（文字說明）
- 執行者身份（管理員 email）

**操作確認**：
- 顯示二次確認對話框
- 列出將被清除的裝置數量
- 確認後立即發送指令到 Cloudflare KV

#### 步驟 2：客戶端檢查

**檢查時機**：
- **啟動時**：App 啟動後 3 秒內檢查一次
- **定期檢查**：運行期間每 5 分鐘（300000ms）檢查一次

**檢查流程**：
```javascript
// 每次檢查
1. 發送 HTTPS 請求到 Cloudflare Workers
2. 攜帶裝置 ID 和時間戳
3. 接收伺服器回應：
   - { shouldWipe: false } → 無需清除，繼續運行
   - { shouldWipe: true, reason, issuedBy, commandId } → 執行清除
```

#### 步驟 3：靜默執行清除

**3 秒處理時間**：
```
第 0 秒：收到清除指令
第 1 秒：記錄本地日誌
第 2 秒：清除 Telegram session
第 3 秒：鎖定應用程式
```

**清除動作**：
1. **清除 BrowserView session**
   ```javascript
   browserView.webContents.session.clearStorageData({
     storages: ['localstorage', 'indexdb', 'serviceworkers']
   });
   ```

2. **鎖定應用程式**
   ```javascript
   // BrowserView 移出畫面
   browserView.setBounds({ x: 0, y: -10000, width, height });
   ```

3. **記錄本地日誌**
   ```
   [WIPE_EXECUTED] deviceId, reason, issuedBy, timestamp
   ```

4. **回報伺服器**
   ```javascript
   POST /api/wipe-complete
   { deviceId, commandId, success: true, timestamp }
   ```

#### 步驟 4：清除完成

**結果**：
- Telegram 已登出（需重新登入）
- 應用程式鎖定（顯示計算機畫面）
- 用戶下次輸入解鎖密碼後，會看到 Telegram 登入畫面

**可復原性**：
- 用戶可以重新登入 Telegram
- 需要輸入手機號碼和驗證碼
- 對話記錄仍在 Telegram 伺服器上（如果有雲端備份）

---

## 🏗️ 技術架構（強制規範）

### 整體架構

```
┌──────────────────────────────────────────┐
│          Cloudflare Workers              │
│  ┌────────────┐      ┌────────────────┐ │
│  │  API 後端  │      │  React 前端    │ │
│  │  /api/*    │      │  /, /login...  │ │
│  └────┬───────┘      └────────────────┘ │
│       │                                  │
│       │  ┌─────────────────────┐        │
│       └──│  Cloudflare KV      │        │
│          │  - 裝置資訊         │        │
│          │  - 清除指令         │        │
│          │  - 操作日誌         │        │
│          └─────────────────────┘        │
└──────────────────────────────────────────┘
                    ▲
                    │ HTTPS
                    │
         ┌──────────┴──────────┐
         │                     │
    ┌────▼─────┐         ┌────▼─────┐
    │ 管理員   │         │ 客戶端   │
    │ Web後台  │         │ Electron │
    └──────────┘         └──────────┘
```

### 技術棧規範

#### 後端（Cloudflare Workers）

**強制使用**：
- **Cloudflare Workers**：Serverless 函數
- **Cloudflare KV**：資料儲存
- **環境變數**：JWT_SECRET（用於管理員認證）

**禁止使用**：
- ❌ 其他雲端服務（AWS Lambda、Azure Functions 等）
- ❌ 傳統伺服器（Node.js + Express 自架）
- ❌ 資料庫（PostgreSQL、MySQL 等）

#### 前端（React 管理後台）

**強制使用**：
- **React 18**：UI 框架
- **Vite**：建置工具
- **Tailwind CSS**：樣式框架
- **shadcn/ui**：UI 組件庫
- **React Router**：路由管理

**建議使用**：
- TypeScript（可選，但建議用於型別安全）
- Zustand 或 Context API（狀態管理）

**禁止使用**：
- ❌ Vue、Angular 等其他框架
- ❌ Webpack、Parcel 等其他建置工具
- ❌ Bootstrap、Material-UI 等其他 UI 庫

#### 客戶端（Electron App）

**強制使用**：
- **Electron**：現有架構
- **RemoteWipeManager.js**：遠端清除模組
- **HTTPS**：通訊協議

**強制要求**：
- 必須在 `features/` 目錄下建立 `RemoteWipeManager.js`
- 必須在 `main.js` 中初始化
- 必須在首次密碼驗證時觸發註冊

### 部署架構

**單一 Workers 部署**：
```bash
# 建置前端
cd frontend-src
npm run build

# 複製到 Workers
cp -r dist ../src/frontend/dist

# 部署（前端 + 後端一起）
wrangler deploy
```

**禁止架構**：
- ❌ 前端用 Cloudflare Pages、後端用 Workers（分離部署）
- ❌ 前端用 Vercel、後端用 Cloudflare（跨平台）
- ❌ 自架伺服器

---

## 🔐 安全機制規範

### 管理員認證

**JWT Token**：
- 登入後獲得 JWT token
- 有效期：30 分鐘
- 儲存位置：localStorage
- Header 格式：`Authorization: Bearer <token>`

**密碼規範**：
- 最少 8 個字元
- 必須包含英文和數字
- 儲存方式：bcrypt hash（10 rounds）

### 操作日誌

**必須記錄**：
```json
{
  "action": "WIPE_ISSUED",
  "timestamp": "2025-01-15T10:30:00Z",
  "admin": "admin@company.com",
  "deviceId": "abc123xyz",
  "reason": "裝置遺失",
  "commandId": "cmd-uuid-123"
}
```

**日誌類型**：
- `WIPE_ISSUED` - 管理員發送清除指令
- `WIPE_EXECUTED` - 客戶端執行清除
- `WIPE_COMPLETED` - 客戶端回報完成
- `WIPE_FAILED` - 清除失敗

### 裝置驗證

**裝置 ID 生成**：
```javascript
// 基於機器資訊生成唯一 ID
const machineId = `${appName}-${platform}-${hostname}`;
const deviceId = crypto.createHash('sha256')
  .update(machineId)
  .digest('hex')
  .substring(0, 16);
```

**註冊時機**：
- 首次輸入預設密碼（見 `config/ConfigManager.js` 預設值）驗證成功時
- 自動向伺服器註冊裝置 ID
- 儲存到 Cloudflare KV

---

## 📊 資料結構規範

### Cloudflare KV 鍵值規範

#### 1. 裝置清除指令

**Key**: `wipe:{deviceId}`

**Value**:
```json
{
  "shouldWipe": true,
  "commandId": "cmd-uuid-123",
  "reason": "裝置遺失",
  "issuedBy": "admin@company.com",
  "issuedAt": "2025-01-15T10:30:00Z",
  "status": "pending"
}
```

**Status 值**：
- `pending` - 等待執行
- `completed` - 已完成
- `failed` - 執行失敗

#### 2. 裝置註冊資訊

**Key**: `device:{deviceId}`

**Value**:
```json
{
  "deviceId": "abc123xyz",
  "firstSeen": "2025-01-01T00:00:00Z",
  "lastCheckIn": "2025-01-15T10:25:00Z",
  "appVersion": "1.3.0",
  "platform": "darwin",
  "status": "active",
  "remoteWipeEnabled": true
}
```

**Status 值**：
- `active` - 正常運行
- `offline` - 超過 10 分鐘未心跳
- `wiped` - 已被清除

#### 3. 管理員帳號

**Key**: `admin:{email}`

**Value**:
```json
{
  "email": "admin@company.com",
  "passwordHash": "$2b$10$...",
  "role": "admin",
  "createdAt": "2025-01-01T00:00:00Z",
  "lastLogin": "2025-01-15T09:00:00Z"
}
```

#### 4. 操作日誌

**Key**: `log:{timestamp}-{uuid}`

**Value**:
```json
{
  "action": "WIPE_ISSUED",
  "timestamp": "2025-01-15T10:30:00Z",
  "admin": "admin@company.com",
  "deviceId": "abc123xyz",
  "reason": "裝置遺失",
  "commandId": "cmd-uuid-123"
}
```

#### 5. 裝置群組

**Key**: `group:{groupName}`

**Value**:
```json
{
  "groupName": "研發部",
  "deviceIds": ["abc123", "def456", "ghi789"],
  "createdAt": "2025-01-01T00:00:00Z"
}
```

---

## 🌐 API 規範

### 客戶端 API

#### POST /api/register-device

註冊新裝置

**Request**:
```json
{
  "deviceId": "abc123xyz",
  "appVersion": "1.3.0",
  "platform": "darwin"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Device registered"
}
```

#### POST /api/check-wipe

檢查是否有清除指令

**Request**:
```json
{
  "deviceId": "abc123xyz",
  "timestamp": "2025-01-15T10:25:00Z"
}
```

**Response (無清除指令)**:
```json
{
  "shouldWipe": false
}
```

**Response (有清除指令)**:
```json
{
  "shouldWipe": true,
  "commandId": "cmd-uuid-123",
  "reason": "裝置遺失",
  "issuedBy": "admin@company.com",
  "issuedAt": "2025-01-15T10:30:00Z"
}
```

#### POST /api/wipe-complete

回報清除完成

**Request**:
```json
{
  "deviceId": "abc123xyz",
  "commandId": "cmd-uuid-123",
  "success": true,
  "timestamp": "2025-01-15T10:35:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Wipe completion recorded"
}
```

### 管理後台 API

#### POST /api/admin/login

管理員登入

**Request**:
```json
{
  "email": "admin@company.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 1800
}
```

#### GET /api/admin/devices

取得裝置列表

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `status`: active | offline | wiped
- `platform`: darwin | win32 | linux
- `page`: 1, 2, 3...
- `limit`: 10, 20, 50

**Response**:
```json
{
  "devices": [
    {
      "deviceId": "abc123xyz",
      "lastCheckIn": "2025-01-15T10:25:00Z",
      "appVersion": "1.3.0",
      "platform": "darwin",
      "status": "active"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

#### POST /api/admin/wipe

發送清除指令

**Headers**:
```
Authorization: Bearer <token>
```

**Request (單一裝置)**:
```json
{
  "type": "single",
  "deviceId": "abc123xyz",
  "reason": "裝置遺失"
}
```

**Request (批次)**:
```json
{
  "type": "batch",
  "deviceIds": ["abc123", "def456", "ghi789"],
  "reason": "機敏資料洩漏"
}
```

**Request (群組)**:
```json
{
  "type": "group",
  "groupName": "研發部",
  "reason": "部門重組"
}
```

**Response**:
```json
{
  "success": true,
  "commandIds": ["cmd-123", "cmd-456"],
  "affectedDevices": 2
}
```

#### GET /api/admin/logs

取得操作日誌

**Headers**:
```
Authorization: Bearer <token>
```

**Query Parameters**:
- `action`: WIPE_ISSUED | WIPE_EXECUTED | WIPE_COMPLETED
- `startDate`: 2025-01-01T00:00:00Z
- `endDate`: 2025-01-31T23:59:59Z
- `page`: 1
- `limit`: 50

**Response**:
```json
{
  "logs": [
    {
      "action": "WIPE_ISSUED",
      "timestamp": "2025-01-15T10:30:00Z",
      "admin": "admin@company.com",
      "deviceId": "abc123xyz",
      "reason": "裝置遺失"
    }
  ],
  "total": 127,
  "page": 1,
  "limit": 50
}
```

---

## 📁 專案結構規範

```
tg_mac_electron/
├── features/
│   ├── LockManager.js
│   ├── UpdateManager.js
│   └── RemoteWipeManager.js          # 新增：遠端清除管理模組
├── ipc/
│   └── IPCHandler.js                 # 修改：新增遠端清除 IPC
├── main.js                           # 修改：整合 RemoteWipeManager
├── calculator-lock.js                # 修改：首次密碼驗證觸發註冊
├── settings.html                     # 修改：新增遠端清除設定
├── settings.js                       # 修改：遠端清除設定邏輯
├── CLAUDE.md                         # 修改：新增遠端清除章節
├── REMOTE_WIPE.md                    # 本文件
└── server/                           # 新增：Cloudflare 專案
    ├── src/
    │   ├── index.js                  # Workers 主程式
    │   ├── api/
    │   │   ├── auth.js               # 認證 API
    │   │   ├── devices.js            # 裝置管理 API
    │   │   └── wipe.js               # 清除 API
    │   └── frontend/
    │       └── dist/                 # React 打包後的靜態檔案
    ├── frontend-src/                 # React 原始碼
    │   ├── src/
    │   │   ├── pages/
    │   │   │   ├── Login.jsx
    │   │   │   ├── Dashboard.jsx
    │   │   │   ├── Devices.jsx
    │   │   │   └── Emergency.jsx
    │   │   ├── components/
    │   │   │   └── ui/               # shadcn/ui 組件
    │   │   ├── App.jsx
    │   │   └── main.jsx
    │   ├── package.json
    │   ├── vite.config.js
    │   └── tailwind.config.js
    ├── wrangler.toml                 # Cloudflare 配置
    └── package.json
```

---

## 🚀 實作步驟

### 階段 1：客戶端 Electron App（2-3 小時）

#### 1.1 建立 RemoteWipeManager.js

**檔案位置**: `features/RemoteWipeManager.js`

**必須實作的方法**：
- `initialize({ configManager, mainWindow, lockManager })` - 初始化
- `enable({ serverUrl })` - 啟用遠端清除
- `disable()` - 停用遠端清除
- `checkWipeCommand()` - 檢查清除指令（自動定期執行）
- `executeWipe(commandInfo)` - 執行清除
- `reportWipeComplete(commandInfo)` - 回報完成

**配置儲存**：
```json
{
  "remoteWipe": {
    "enabled": false,
    "deviceId": "abc123xyz",
    "serverUrl": "https://your-worker.workers.dev",
    "checkInterval": 300000,
    "lastCheckTime": "2025-01-15T10:25:00Z"
  }
}
```

#### 1.2 修改 calculator-lock.js

**位置**: `calculator-lock.js`

**修改內容**：
```javascript
// 在密碼驗證成功後，添加註冊邏輯
if (inputValue === defaultPassword && !registeredBefore) {
  window.electronAPI.registerDevice();
}
```

#### 1.3 修改 main.js

**位置**: `main.js`

**修改內容**：
```javascript
// 1. 引入 RemoteWipeManager
const RemoteWipeManager = require('./features/RemoteWipeManager');
const remoteWipeManager = new RemoteWipeManager();

// 2. 初始化
remoteWipeManager.initialize({
  configManager,
  mainWindow,
  lockManager
});
```

#### 1.4 修改 IPCHandler.js

**位置**: `ipc/IPCHandler.js`

**新增 IPC 處理**：
- `remote-wipe:get-config` - 取得配置
- `remote-wipe:enable` - 啟用功能
- `remote-wipe:disable` - 停用功能
- `remote-wipe:manual-check` - 手動檢查
- `remote-wipe:register-device` - 註冊裝置

#### 1.5 修改 settings.html 和 settings.js

**新增 UI 區塊**：
```html
<section>
  <h3>企業管理</h3>
  <div>
    <label>裝置 ID：<span id="deviceId"></span></label>
    <label>遠端清除狀態：<span id="remoteWipeStatus"></span></label>
    <label>上次檢查：<span id="lastCheckTime"></span></label>
    <button id="manualCheckBtn">手動檢查</button>
  </div>
</section>
```

### 階段 2：Cloudflare Workers 後端（3-4 小時）

#### 2.1 初始化 Workers 專案

```bash
# 建立專案
mkdir server
cd server
npm init -y
npm install wrangler --save-dev

# 初始化 Workers
npx wrangler init
```

#### 2.2 建立 KV 命名空間

```bash
# 建立 KV
npx wrangler kv:namespace create "WIPE_KV"

# 記下 KV ID，寫入 wrangler.toml
```

#### 2.3 實作 API 端點

**檔案結構**：
```
src/
├── index.js           # 主路由
├── api/
│   ├── auth.js        # 登入、JWT 驗證
│   ├── devices.js     # 裝置管理
│   └── wipe.js        # 清除指令
└── utils/
    ├── jwt.js         # JWT 工具
    └── hash.js        # 密碼 hash
```

#### 2.4 配置 wrangler.toml

```toml
name = "nextcalc-wipe-manager"
main = "src/index.js"
compatibility_date = "2025-01-01"

kv_namespaces = [
  { binding = "WIPE_KV", id = "your-kv-id-here" }
]

[vars]
JWT_SECRET = "your-secret-key-change-in-production"

[site]
bucket = "./src/frontend/dist"
```

### 階段 3：React 管理後台（4-5 小時）

#### 3.1 初始化 React 專案

```bash
cd server
npm create vite@latest frontend-src -- --template react
cd frontend-src
npm install

# 安裝依賴
npm install react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# 安裝 shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input table dialog toast card badge
```

#### 3.2 實作頁面

**頁面列表**：
1. `/login` - 登入頁面
2. `/dashboard` - 儀表板
3. `/devices` - 裝置管理
4. `/emergency` - 緊急清除

**共用組件**：
- `Layout.jsx` - 頁面布局
- `Header.jsx` - 頂部導航
- `Sidebar.jsx` - 側邊欄（可選）

#### 3.3 API 整合

**建立 API client**：
```javascript
// src/api/client.js
const API_BASE = '';  // 同源，無需指定

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}
```

#### 3.4 建置前端

```bash
cd frontend-src
npm run build

# 複製到 Workers
cp -r dist ../src/frontend/dist
```

### 階段 4：部署與測試（1-2 小時）

#### 4.1 部署到 Cloudflare

```bash
cd server
wrangler deploy
```

**記下 Workers URL**：`https://nextcalc-wipe-manager.your-subdomain.workers.dev`

#### 4.2 建立管理員帳號

```bash
# 使用 Wrangler CLI 建立第一個管理員
wrangler kv:key put --binding=WIPE_KV \
  "admin:admin@company.com" \
  '{"email":"admin@company.com","passwordHash":"$2b$10$...","role":"admin"}'
```

#### 4.3 測試流程

**本地測試**：
1. 啟動 Electron App：`npm start`
2. 首次輸入預設密碼（見 `config/ConfigManager.js` 預設值），觸發註冊
3. 查看 Cloudflare KV 確認裝置已註冊
4. 從 Web 後台發送清除指令
5. 等待 5 分鐘或重啟 App，觀察清除執行

**驗證項目**：
- ✅ 裝置註冊成功
- ✅ 心跳檢查正常
- ✅ 清除指令發送成功
- ✅ 客戶端收到指令並執行
- ✅ Telegram 已登出
- ✅ 應用程式鎖定
- ✅ 日誌記錄完整

---

## ⚠️ 禁止事項（絕對不可違反）

### 1. 架構層面

❌ **禁止使用非 Cloudflare Workers 的後端方案**
- 不可使用 AWS Lambda、Azure Functions
- 不可自架 Node.js 伺服器
- 不可使用其他 Serverless 平台

❌ **禁止前後端分離部署**
- 不可前端用 Cloudflare Pages、後端用 Workers
- 不可前端用 Vercel、後端用其他平台
- 必須使用單一 Workers 整合部署

❌ **禁止使用傳統資料庫**
- 不可使用 PostgreSQL、MySQL
- 不可使用 MongoDB、Redis
- 必須使用 Cloudflare KV

### 2. 功能層面

❌ **禁止顯示清除警告給用戶**
- 不可彈出確認對話框
- 不可顯示倒數計時
- 不可給用戶任何取消機會

❌ **禁止強制啟用遠端清除**
- 不可在用戶不知情下啟用
- 不可阻止用戶停用
- 不可隱藏停用選項

❌ **禁止刪除整個資料夾**
- 不可刪除 telegram-data 資料夾
- 不可刪除應用程式本身
- 只能清除 session 和 storage

❌ **禁止跳過日誌記錄**
- 所有清除操作必須記錄
- 不可允許刪除或修改日誌
- 不可只在客戶端記錄

### 3. 安全層面

❌ **禁止明文儲存密碼**
- 管理員密碼必須 bcrypt hash
- 不可使用 MD5、SHA1
- 不可使用可逆加密

❌ **禁止無限期 Token**
- JWT token 必須設定過期時間
- 最長 30 分鐘
- 不可使用永久 token

❌ **禁止繞過認證**
- 所有管理 API 必須驗證 JWT
- 不可使用 IP 白名單代替認證
- 不可使用簡單密碼

### 4. 用戶體驗層面

❌ **禁止影響正常使用**
- 檢查失敗時不可顯示錯誤
- 不可阻止應用程式啟動
- 不可干擾 Telegram 正常使用

❌ **禁止過度檢查**
- 不可每分鐘檢查
- 不可在用戶操作時檢查
- 必須保持 5 分鐘間隔

---

## 📝 總結

此規範文件是企業遠端清除功能的**唯一標準**。所有開發和實作必須嚴格遵循：

1. ✅ **用戶自主**：用戶可選擇啟用/停用
2. ✅ **靜默執行**：不顯示任何警告
3. ✅ **只登出**：不刪除資料夾
4. ✅ **定期檢查**：啟動 + 每 5 分鐘
5. ✅ **Cloudflare Workers**：唯一後端方案
6. ✅ **React + shadcn/ui**：唯一前端方案
7. ✅ **完整日誌**：所有操作可審計
8. ✅ **操作透明**：管理員操作需確認

**任何違反此規範的實作都是不被允許的。**

如有疑問或需要修改規範，必須先更新此文件並獲得確認。
