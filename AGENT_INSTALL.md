# NextCalc 安裝指引（給 AI agent 讀）

這是一份 **NextCalc 安裝任務**指引：把 `NextCalc-<版本>-arm64.dmg` 安裝到這台 macOS 的 `/Applications`，處理 ad-hoc 無簽名的 Gatekeeper 阻擋，並告知使用者建議的通知設定。給人看的版本是同目錄的 `INSTALL.html`。

**這份文件、`install.sh`、`INSTALL.html` 三個檔案都放在 DMG 內**，所以 DMG 本身就是自足的分發包 —— 使用者只要拿到 DMG 就有安裝腳本與指引，不需要另外下載附檔。

## 前提事實

- 目標 app：`NextCalc`，安裝後位於 `/Applications/NextCalc.app`
- 平台：macOS arm64（Apple Silicon）
- 簽名：**ad-hoc、無 Apple 開發者簽名、未公證** → 首次開啟必被 Gatekeeper 阻擋，需要放行一次
- 使用者資料在 app 套件之外：`~/Library/Application Support/next-calc`（覆蓋安裝不會動到它）
- 系統需求：**macOS 12.0 或更高版本**（1.4.0 起，`minimumSystemVersion` = 12.0）

## 首選路徑：執行 DMG 內的 install.sh

**標準流程（DMG 已掛載）**。先掛載 DMG，再直接執行映像檔內的腳本：

```bash
MOUNT="$(hdiutil attach -nobrowse -readonly -noverify /path/to/NextCalc-1.4.0-arm64.dmg | awk -F'\t' '/\/Volumes\//{print $NF; exit}')"
bash "$MOUNT/install.sh"
```

腳本會偵測到「自己就在掛載點內」，直接沿用該掛載點：**不重複掛載**（不會多出 `/Volumes/NextCalc 1.4.0-arm64 1` 這種掛載點），**也不卸載**這個不是它掛的映像檔——安裝完請自行退出磁碟。

使用者已經在 Finder 雙擊掛載 DMG 時，路徑就是掛載點內的腳本，同樣直接跑：

```bash
bash "/Volumes/NextCalc 1.4.0-arm64/install.sh"
```

掛載點名稱含版本號與架構，換版本就會變，不要寫死；用上面 `hdiutil attach` 的輸出取得，或 `ls -d "/Volumes/NextCalc"*`。

**替代流程（在 DMG 外面執行腳本副本）**：指定 DMG 路徑，腳本自己掛載，結束時自己卸載。

```bash
bash install.sh /path/to/NextCalc-1.4.0-arm64.dmg
```

DMG 與腳本副本放在同一個目錄時可省略參數，腳本會自動挑同目錄（或其 `dist/`）內最新的 `NextCalc-*.dmg`：

```bash
bash install.sh
```

這條路徑的掛載是冪等的：若該 DMG 已經掛載，腳本會沿用現有掛載點而不重複掛載，並且不卸載它。

**環境變數 `NEXTCALC_APP_DEST`**：安裝目的地目錄，預設 `/Applications`。沒有 `/Applications` 寫入權限時改用 `NEXTCALC_APP_DEST="$HOME/Applications"`（目錄不存在會自動建立）。除此之外不要改，安裝到非標準位置會讓使用者找不到 app。

不論走哪條路徑，腳本都會依序做完：取得映像檔內容 → 偵測並結束執行中的舊版 → 移除舊 app → 複製新 app 到 `/Applications` → 移除 `com.apple.quarantine` → （只在自己掛載時）卸載 DMG → 開啟 app。任何一步失敗都會用繁體中文說明原因並以非 0 結束碼中止。

看到結尾的 `✓ NextCalc 安裝完成` 才算成功；只要中止了，請把錯誤訊息原文回報給使用者，不要自行改寫或略過。

腳本失敗時的常見原因與處置：

| 錯誤訊息關鍵字 | 處置 |
| --- | --- |
| `找不到 DMG` | 腳本不在掛載點內、同目錄也沒有 DMG。改用完整路徑再跑一次，或先確認 DMG 已下載完成 |
| `仍在執行中，無法覆蓋` | 請使用者手動結束 NextCalc（`Command + Q`）後重跑 |
| `無寫入權限` | 改用 `sudo bash "$MOUNT/install.sh"`，或裝到使用者目錄：`NEXTCALC_APP_DEST="$HOME/Applications" bash "$MOUNT/install.sh"` |
| `掛載失敗` | DMG 可能下載不完整或損毀，重新取得檔案 |

## Fallback：手動流程

腳本不可用時，逐步執行以下命令（把 `<dmg>` 換成實際路徑）。

### 1. 掛載並安裝

```bash
hdiutil attach -nobrowse -readonly <dmg>
cp -R "/Volumes/NextCalc 1.4.0-arm64/NextCalc.app" /Applications/
hdiutil detach "/Volumes/NextCalc 1.4.0-arm64"
```

掛載點名稱含版本號與架構（1.4.0 的實測值是 `/Volumes/NextCalc 1.4.0-arm64`），換版本就會變，不要寫死。用 `hdiutil attach` 輸出的最後一欄，或這樣取得：

```bash
MOUNT="$(hdiutil attach -nobrowse -readonly <dmg> | awk -F'\t' '/\/Volumes\//{print $NF; exit}')"
cp -R "$MOUNT/NextCalc.app" /Applications/
hdiutil detach "$MOUNT"
```

給人操作的等價步驟：雙擊 DMG，把 NextCalc 圖示拖到視窗右側的 Applications 捷徑，完成後退出磁碟。

### 2. 首次開啟（Gatekeeper 繞過）

移除隔離屬性，之後即可正常雙擊開啟：

```bash
xattr -dr com.apple.quarantine /Applications/NextCalc.app
open /Applications/NextCalc.app
```

`xattr` 顯示 `No such xattr` 表示該屬性本來就不存在，屬正常情況，不是錯誤。

無法用命令列時，請使用者照這個順序操作（**「右鍵 → 打開」自 macOS 15 起已被 Apple 移除，不要再教這招**）：

1. 先雙擊一次 `/Applications` 內的 NextCalc —— 這次一定會被拒絕，但系統必須先記錄到這次阻擋，下一步的按鈕才會出現。
2. 開啟「系統設定 → 隱私權與安全性」，捲到「安全性」區塊，找到「已阻止使用 NextCalc」，按「**仍要打開**」。
3. 在確認對話框再按一次「打開」，必要時輸入密碼或用 Touch ID。

### 3. 升級（覆蓋安裝）

新版 DMG 直接覆蓋舊 app 即可，不必先卸除舊版：

```bash
osascript -e 'quit app "NextCalc"'
rm -rf /Applications/NextCalc.app
cp -R "$MOUNT/NextCalc.app" /Applications/
xattr -dr com.apple.quarantine /Applications/NextCalc.app
open /Applications/NextCalc.app
```

- 覆蓋前務必先結束 app，否則正在執行的檔案會導致複製結果不完整
- `~/Library/Application Support/next-calc` 不受影響：Telegram 登入狀態、對話快取、密碼與偏好設定（`config.json`）都會保留，升級後不需重新登入
- **不要**為了「乾淨安裝」去刪除該資料目錄，那等同登出並清掉設定

### 4. 通知設定建議（安裝完成後告知使用者）

兩處各設一次，兩者是串聯關係：Telegram 端決定通知裡有沒有內容，macOS 端決定何時能顯示。

1. **macOS**：系統設定 → 通知 → NextCalc → 「顯示預覽」設為「**解鎖時**」。解鎖時顯示發訊者與訊息內容，鎖定畫面自動隱藏。
2. **Telegram Web 端**：Settings → Notifications → **Message Preview** 開啟，通知才會帶出發訊者與訊息摘要。

這兩項無法用命令列代設，請以文字指引使用者自行操作。

## 完工檢查

```bash
ls -d /Applications/NextCalc.app
defaults read /Applications/NextCalc.app/Contents/Info.plist CFBundleShortVersionString
xattr /Applications/NextCalc.app
codesign -dv --verbose=2 /Applications/NextCalc.app 2>&1 | grep Signature
```

預期：app 存在、版本號與 DMG 一致、`xattr` 輸出不含 `com.apple.quarantine`、簽名為 `adhoc`（這是預期值，不是問題）。
