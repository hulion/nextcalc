# NextCalc

macOS Telegram 桌面應用程式，含計算機風格鎖定畫面。以 Electron WebContentsView 架構執行 Telegram Web，鎖定畫面為一個功能完整的計算機。

## 功能特色

- **計算機風格鎖定畫面**：應用程式啟動時顯示功能完整的計算機
- **密碼解鎖**：在計算機上輸入數字序列即可解鎖
- **自動鎖定**：閒置一段時間後自動返回鎖定畫面
- **資料重設**：可清除登入資料與會話記錄，並將設定回復為預設值
- **設定管理**：可自訂解鎖密碼與閒置時間
- **macOS 原生通知支援**
- **完整的 Telegram Web 功能**

## 安裝與啟動

### 1. 安裝依賴套件

```bash
npm install
```

### 2. 啟動應用程式

```bash
npm start
```

### 3. 建置 DMG 安裝檔（macOS）

```bash
npm run build
```

產物在 `dist/`：`NextCalc-<版本>-arm64.dmg`（安裝用）、`NextCalc-<版本>-arm64-mac.zip` 與 `latest-mac.yml`（更新用）。

## 基本操作

### 首次使用

1. 啟動應用程式後會看到計算機畫面
2. 輸入預設解鎖密碼（預設值定義於 `config/ConfigManager.js`）
3. 成功解鎖後會顯示 Telegram Web 介面

### 解鎖應用程式

在計算機畫面上輸入您的解鎖密碼即可解鎖。

**提示**：
- 可以使用滑鼠點擊計算機按鈕
- 也可以直接使用鍵盤數字鍵輸入
- 密碼會在背景自動檢測，不需要按等號或確認鍵

### 鎖定應用程式

在 Telegram 介面中，從選單列選擇：**Telegram** > **鎖定應用程式**

### 計算機快捷鍵

在計算機畫面可使用以下鍵盤快捷鍵：

- **數字鍵 0-9**：輸入數字
- **+ - * /**：運算符號
- **Enter 或 =**：計算結果
- **Backspace**：清除當前輸入（C）
- **Escape**：全部清除（AC）
- **.（小數點）**：輸入小數

## 資料重設

應用程式提供兩種清除本機資料的觸發方式，序列定義於原始碼（`config/ConfigManager.js`、`panic-detector.js`）：

### 方式一：從計算機鎖定畫面觸發

效果：
- 清除所有 Telegram 登入資料
- 清除應用程式快取
- 將密碼重設為預設值
- 顯示「資料已清除，密碼已重置為預設值」訊息

### 方式二：從 Telegram 介面觸發

以指定時間內的連續按鍵序列觸發，實作見 `panic-detector.js`。

效果：
- 立即清除所有 Telegram 會話資料（localStorage、sessionStorage、IndexedDB）
- 清除應用程式快取
- 將密碼重設為預設值
- 自動返回計算機鎖定畫面

## 進階設定

### 自訂密碼和設定

從選單列選擇：**Telegram** > **設定**

在設定面板中可以：

1. **更改解鎖密碼**
   - 輸入新密碼（只能包含數字）
   - 點擊「儲存密碼」
   - 密碼會立即生效

2. **設定自動鎖定時間**
   - 從預設選項挑一個：30 秒 / 1 分鐘 / 3 分鐘 / 5 分鐘 / 10 分鐘 / 永不
   - 點擊「儲存設定」
   - 超過設定時間沒有操作會自動鎖定

3. **重置為預設密碼**
   - 點擊「重置為預設密碼」按鈕
   - 密碼會回復為 `config/ConfigManager.js` 中的預設值

### 自動鎖定

應用程式會監測使用者活動：
- 預設閒置時間：60 秒（`config/ConfigManager.js` 的 `DEFAULT_IDLE_TIMEOUT`）
- 可在設定中改為 30 秒 / 1 分鐘 / 3 分鐘 / 5 分鐘 / 10 分鐘 / 永不
- 超過設定時間沒有鍵盤或滑鼠活動會自動鎖定
- 鎖定後需要輸入密碼才能繼續使用

## 專案結構

```
tg_mac_electron/
├── main.js                 # 主程序，應用程式進入點
├── preload.js              # 預載腳本，提供安全的 API 橋接
├── calculator-lock.html    # 計算機鎖定畫面
├── settings.html           # 設定面板
├── panic-detector.js       # 按鍵序列偵測器（注入到 Telegram 頁面）
├── package.json            # 專案設定和相依套件
└── icon.png               # 應用程式圖示
```

## 運作原理

1. **啟動**：應用程式啟動時顯示 `calculator-lock.html`
2. **WebContentsView**：Telegram Web 載入在一個 WebContentsView 中，啟動時**不掛到主視窗**
3. **解鎖**：輸入正確密碼後，view 掛回主視窗（`contentView.addChildView`）並重設尺寸
4. **鎖定**：view 從主視窗摘下（`contentView.removeChildView`），停止合成與渲染，顯示計算機畫面；Telegram 的 `webContents` 保持存活，不需重新登入
5. **資料重設**：偵測特定按鍵序列，觸發資料清除並返回計算機畫面

## 資料儲存

- 密碼儲存在：`~/Library/Application Support/next-calc/config.json`
- Telegram 資料儲存在：`~/Library/Application Support/next-calc/telegram-data/`
- 資料重設會刪除以上所有資料

## 常見問題

### Q: 忘記密碼怎麼辦？

A: 有兩種方式：

1. 在計算機畫面輸入資料重設序列，清除資料並將密碼回復為預設值
2. 手動刪除設定檔：
   ```bash
   rm ~/Library/Application\ Support/next-calc/config.json
   ```
   然後重新啟動應用程式

### Q: 如何完全移除應用程式？

A:

1. 刪除應用程式：將 NextCalc.app 移到垃圾桶
2. 刪除資料檔案：
   ```bash
   rm -rf ~/Library/Application\ Support/next-calc/
   ```

### Q: 資料重設會刪除哪些資料？

A:
- 所有 Telegram 登入會話
- 聊天記錄快取
- 應用程式設定（密碼會回復為預設值）
- 所有儲存在應用程式目錄的檔案

執行資料重設後需要重新登入 Telegram。

### Q: 為什麼鎖定畫面是計算機？

A: 它是一個功能完整的計算機，鎖定狀態下仍可正常運算使用，不必為了解鎖才能算數。

## 系統需求

- **macOS 12.0 或更高版本**（Electron 41 起不再支援 macOS 11 及更早版本）
- Apple Silicon（arm64）發布版；自行建置才需要 Node.js
- 開發環境：Node.js >= 22.12.0（`electron` 套件的 `engines` 要求；本機建置實測用 v23.8.0）
- Electron 41.10.6（版本已釘住，見 `package.json`）

## 開發資訊

### 除錯

應用程式會在主控台輸出詳細的除錯訊息，使用 `npm start` 啟動時可以查看。

關鍵除錯訊息標籤：
- `[Main]`：主程序訊息
- `[Preload]`：預載腳本訊息
- `[Calculator]`：計算機畫面訊息
- `[Panic Detector]`：按鍵序列偵測器訊息

## 版本歷史

完整紀錄見 `CHANGELOG.md`，以下只列架構層級的里程碑。

### v1.4.0（目前版本）

- 升級 Electron 至 41.10.6（Chromium 146 / Node 24）
- BrowserView 遷移至 WebContentsView（BrowserView 自 Electron 30 起棄用）
- 最低系統需求提升至 macOS 12.0
- 修復視窗縮放與監聽器洩漏

### 早期版本

- 修復計算機狀態重置錯誤
- 移除未使用的檔案（calculator.html, test-notification.html 等）
- 簡化為純 BrowserView 架構（已於 1.4.0 汰換）
- 新增完整的操作文件

### v1.0 (初始版本)

- 實作 BrowserView 架構
- 計算機鎖定畫面
- 密碼保護與資料重設功能
- 自動鎖定機制

## 授權

本專案為內部使用專案。

## 聯絡資訊

如有問題或建議，請聯絡開發團隊。
