# Telegram Mac App

一個使用 Electron 將 Telegram Web 包裝成原生 macOS 應用程式，並支援原生通知的專案。

## 功能特色

- 完整的 Telegram Web 功能
- macOS 原生通知支援
- 原生應用程式體驗
- 標準 Mac 選單列
- Dock 圖示整合

## 安裝與使用

### 1. 安裝依賴

```bash
npm install
```

### 2. 開發模式執行

```bash
npm start
```

### 3. 打包應用程式

```bash
npm run build
```

打包完成後，應用程式會在 `dist` 資料夾中。

## 添加應用程式圖示

要使用自訂圖示，請準備：
- `assets/icon.png` - PNG 格式的圖示（至少 512x512）
- `assets/icon.icns` - macOS 圖示格式（可使用線上工具轉換）

您可以使用這個工具轉換圖示：https://cloudconvert.com/png-to-icns

## 專案結構

```
tg_mac_electron/
├── main.js              # Electron 主程序
├── preload.js           # 預載腳本（安全橋接）
├── package.json         # 專案配置
├── assets/              # 應用程式資源
│   ├── icon.png
│   └── icon.icns
└── build/               # 建置配置
    └── entitlements.mac.plist
```

## 原生通知工作原理

`preload.js` 會攔截 Telegram Web 的通知請求，並將其轉發給 Electron 的原生通知 API，這樣就能在 macOS 上顯示原生通知。

## 系統需求

- macOS 10.13 或更高版本
- Node.js 16 或更高版本

## License

MIT
