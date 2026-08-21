# 更新日誌

此專案的所有重要變更都會記錄在此檔案中。


## [1.4.0](https://github.com/hulion/nextcalc/compare/v1.3.1...v1.4.0) (2026-08-21)

> 執行環境大版本升級。使用者可見功能不變，故為 minor 而非 major。

### 🔨 建置系統

* 升級 Electron `^28.0.0` → `41.10.6`（Chromium 120 → 146.0.7680.216、Node 18 → 24.18.0）
* 升級 electron-builder `^24.9.1` → `26.15.3`（避開 26.15.0/26.15.1 破壞 macOS zip bundle symlink 的問題）
* 升級 electron-updater `^6.6.2` → `6.8.9`
* 新增 `mac.minimumSystemVersion: 12.0`（Electron 41 起不再支援 macOS 11 及更早版本）

### ♻️ 程式碼重構

* BrowserView 遷移至 WebContentsView（BrowserView 自 Electron 30 起已標記棄用）
  - `addBrowserView`/`removeBrowserView` → `mainWindow.contentView.addChildView`/`removeChildView`
  - WebContentsView 無 `setAutoResize`，改由主視窗 `resize` 事件手動驅動 bounds
  - WebContentsView 預設不透明白底 → 建立後即 `setBackgroundColor('#00000000')`
* 保留既有效能優化：鎖定時 detach view（停止合成與渲染）、啟動時預設不 attach

### 🐛 錯誤修復

* 修復視窗縮放後 Telegram 畫面尺寸未跟隨（WebContentsView 無自動 resize，補上手動接線）
* 修復監聽器洩漏：view 生命週期結束時顯式 `webContents.close()`，並在 attach 前加 `isDestroyed()` 守衛

### 📝 文件更新

* 架構文件全面同步 WebContentsView，修正 userData 路徑（`next-calc`）
* 修正 Gatekeeper 放行說明：macOS 15+ 已移除「右鍵 → 打開」的覆寫路徑，改走「系統設定 → 隱私權與安全性 → 仍要打開」
* 更正「鎖定時隱藏通知內容」失敗實驗的歸因：非 Service Worker 繞過 JS 層，而是 `contextIsolation` 世界隔離

### [1.3.1](https://github.com/hulion/nextcalc/compare/v1.3.0...v1.3.1) (2025-11-25)


### 🐛 錯誤修復

* 修復更新通知拖移功能並優化 UI ([f4291b8](https://github.com/hulion/nextcalc/commit/f4291b876baddc3244a3dcd3039a93ef7b0e0bc0))
* 修復視窗關閉後重新打開無法解鎖及緊急模式不登出的問題 ([4821e42](https://github.com/hulion/nextcalc/commit/4821e425d45a725701e3a1c59e151d090eba2c99))

## [1.3.0](https://github.com/hulion/nextcalc/compare/v1.2.0...v1.3.0) (2025-11-24)


### ✨ 新功能

* 新增下載進度 MB 顯示功能 ([c703733](https://github.com/hulion/nextcalc/commit/c7037332f65cb32907c2095072a237bfd95c4b02))

## [1.2.0](https://github.com/hulion/nextcalc/compare/v1.1.1...v1.2.0) (2025-11-24)


### ✨ 新功能

* 改進更新下載流程與打包優化 ([f833785](https://github.com/hulion/nextcalc/commit/f8337856797fbff3b178f9d1db1067ec6e4547b3))

### [1.1.1](https://github.com/hulion/nextcalc/compare/v1.1.0...v1.1.1) (2025-11-24)


### 🐛 錯誤修復

* 優化應用程式品牌與測試功能 ([19d0af3](https://github.com/hulion/nextcalc/commit/19d0af3443598f0529ed250975767c9b40e0371a))

## 1.1.0 (2025-11-24)


### 🔨 建置系統

* 新增語義化版本管理系統 ([2083bb1](https://github.com/hulion/nextcalc/commit/2083bb195abf388c4ff008bbd13d5749e8b7f741))


### 🔧 雜項

* 從版本控制中移除本地設定檔 ([22f4ea5](https://github.com/hulion/nextcalc/commit/22f4ea5245e99de74c53b2e85cd914ff12247e87))


### 🐛 錯誤修復

* 隱藏生產環境的測試通知選單項目 ([10064bf](https://github.com/hulion/nextcalc/commit/10064bf955662fccf36d146b4b7b60a420247775))


### ♻️ 程式碼重構

* 整合測試功能至獨立 Test 選單 ([d40be7e](https://github.com/hulion/nextcalc/commit/d40be7ed5317d107f94a4bf157b56f10f3886658))


### ✨ 新功能

* 實作視窗標題動態更新與開發工具整合 ([a5108c3](https://github.com/hulion/nextcalc/commit/a5108c3b04194b5084cc2fab883313d5a32b85ba))
* 實作自動更新系統與 3D 翻轉動畫效果 ([fe33e90](https://github.com/hulion/nextcalc/commit/fe33e9070f37c276e6ac8811ac3ae925d38aecd0))
* 調整閒置時間選項為 30秒/1分鐘/3分鐘/5分鐘/10分鐘/永不 ([a031f2b](https://github.com/hulion/nextcalc/commit/a031f2bd73095607e4e52758fa93b8bfdf791364))


### 📝 文件更新

* 新增 Claude Code 快速參考章節，記錄更新版本號指令 ([9ecc363](https://github.com/hulion/nextcalc/commit/9ecc363132825a008cdfc37a8e446f21bd6cbea3))
* 記錄失敗實驗 - Service Worker 通知無法攔截 ([220b645](https://github.com/hulion/nextcalc/commit/220b645de426bdb88b6dace35191195e24db21af))
