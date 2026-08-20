#!/usr/bin/env bash
#
# NextCalc 自動安裝腳本
#
# 用法：
#   bash install.sh                        # 自動尋找同目錄下最新的 NextCalc-*.dmg
#   bash install.sh /path/to/NextCalc.dmg  # 指定 DMG
#
# 流程：掛載 DMG → 覆蓋安裝到 /Applications → 移除隔離屬性 → 卸載 → 開啟 app
#
set -euo pipefail

APP_NAME="NextCalc"
APP_DEST="/Applications/${APP_NAME}.app"
MOUNT_POINT=""

# --- 輸出工具（一律用 printf '%b'，不用 echo "$var"） ---
log()  { printf '%b' "  $1\n"; }
step() { printf '%b' "\n▸ $1\n"; }
warn() { printf '%b' "  ! $1\n" >&2; }
die()  { printf '%b' "\n✗ 安裝失敗：$1\n" >&2; exit 1; }

# --- 卸載掛載點（正常結束與中斷都會執行） ---
cleanup() {
  if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null \
      || hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null \
      || warn "無法卸載磁碟映像檔 $MOUNT_POINT，請手動在 Finder 退出。"
    MOUNT_POINT=""
  fi
}
trap cleanup EXIT INT TERM

# --- 0. 環境檢查 ---
[[ "$(uname -s)" == "Darwin" ]] || die "此腳本只能在 macOS 上執行（偵測到 $(uname -s)）。"

# --- 1. 決定要安裝的 DMG ---
step "尋找 DMG"
DMG_PATH="${1-}"

if [[ -z "$DMG_PATH" ]]; then
  SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  # 依修改時間排序，取最新一個；找不到時 DMG_PATH 維持空字串
  DMG_PATH="$(
    /usr/bin/find "$SCRIPT_DIR" "$SCRIPT_DIR/dist" -maxdepth 1 -name "${APP_NAME}-*.dmg" -type f 2>/dev/null \
      | while IFS= read -r f; do printf '%s\t%s\n' "$(/usr/bin/stat -f '%m' "$f")" "$f"; done \
      | sort -rn | head -1 | cut -f2-
  )"
  [[ -n "$DMG_PATH" ]] || die "找不到 DMG。請把 DMG 放在腳本同目錄，或指定路徑：bash install.sh /path/to/${APP_NAME}.dmg"
  log "自動選用：$DMG_PATH"
fi

[[ -f "$DMG_PATH" ]] || die "DMG 不存在：$DMG_PATH"
[[ -r "$DMG_PATH" ]] || die "DMG 無法讀取（權限不足）：$DMG_PATH"
log "來源：$DMG_PATH"

# --- 2. 掛載 DMG（掛載點由 hdiutil 輸出解析，不寫死） ---
step "掛載磁碟映像檔"
ATTACH_OUTPUT=""
ATTACH_OUTPUT="$(hdiutil attach -nobrowse -readonly -noverify "$DMG_PATH" 2>&1)" \
  || die "掛載失敗，DMG 可能損毀。hdiutil 輸出：\n$ATTACH_OUTPUT"

# hdiutil 輸出的最後一欄是掛載點；取第一個 /Volumes/ 開頭的路徑
MOUNT_POINT="$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')"
[[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]] \
  || die "無法從 hdiutil 輸出解析掛載點。輸出：\n$ATTACH_OUTPUT"
log "掛載點：$MOUNT_POINT"

APP_SRC="${MOUNT_POINT}/${APP_NAME}.app"
[[ -d "$APP_SRC" ]] || die "映像檔內找不到 ${APP_NAME}.app（掛載點：$MOUNT_POINT）"

# --- 3. 處理舊版本（覆蓋安裝） ---
if [[ -e "$APP_DEST" ]]; then
  step "偵測到已安裝版本，準備覆蓋"

  OLD_VER="$(/usr/bin/defaults read "${APP_DEST}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)"
  [[ -n "$OLD_VER" ]] && log "現有版本：$OLD_VER"

  # app 正在執行 → 請它自己結束，等待最多 10 秒
  if /usr/bin/pgrep -f "${APP_DEST}/Contents/MacOS/" >/dev/null 2>&1; then
    log "${APP_NAME} 正在執行，嘗試結束它…"
    /usr/bin/osascript -e "quit app \"${APP_NAME}\"" >/dev/null 2>&1 || true

    for _ in 1 2 3 4 5 6 7 8 9 10; do
      /usr/bin/pgrep -f "${APP_DEST}/Contents/MacOS/" >/dev/null 2>&1 || break
      /bin/sleep 1
    done

    if /usr/bin/pgrep -f "${APP_DEST}/Contents/MacOS/" >/dev/null 2>&1; then
      die "${APP_NAME} 仍在執行中，無法覆蓋。請手動結束它（選單列 ${APP_NAME} → 結束，或 Command + Q）後重新執行本腳本。"
    fi
    log "已結束舊版程序"
  fi

  log "移除舊版：$APP_DEST"
  rm -rf "$APP_DEST" || die "無法移除舊版 $APP_DEST，請確認權限（必要時用 sudo 手動刪除）。"
fi

# --- 4. 複製到 /Applications ---
step "安裝到 /Applications"
[[ -w /Applications ]] || die "/Applications 無寫入權限，請改用 sudo 執行，或手動把 ${APP_NAME}.app 拖進「應用程式」資料夾。"

cp -R "$APP_SRC" "$APP_DEST" || die "複製失敗：$APP_SRC → $APP_DEST"
[[ -d "$APP_DEST" ]] || die "複製後找不到 $APP_DEST，安裝未完成。"

NEW_VER="$(/usr/bin/defaults read "${APP_DEST}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)"
log "已安裝：$APP_DEST${NEW_VER:+（版本 $NEW_VER）}"

# --- 5. 移除隔離屬性（ad-hoc 無簽名，需放行 Gatekeeper） ---
step "移除隔離屬性"
if /usr/bin/xattr -p com.apple.quarantine "$APP_DEST" >/dev/null 2>&1; then
  if /usr/bin/xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null; then
    log "已移除 com.apple.quarantine"
  else
    warn "移除隔離屬性失敗。首次開啟請對 ${APP_NAME} 按右鍵 → 打開。"
  fi
else
  log "無 com.apple.quarantine 屬性，略過"
fi

# --- 6. 卸載映像檔 ---
step "卸載磁碟映像檔"
cleanup
log "已卸載"

# --- 7. 開啟 app ---
step "開啟 ${APP_NAME}"
if open "$APP_DEST" 2>/dev/null; then
  log "已送出開啟指令"
else
  warn "自動開啟失敗，請自行到「應用程式」開啟 ${APP_NAME}。"
fi

printf '%b' "\n✓ ${APP_NAME} 安裝完成：${APP_DEST}\n"
printf '%b' "  首次開啟若仍被 Gatekeeper 阻擋，對 app 按右鍵 → 打開，再按一次「打開」即可。\n"
printf '%b' "  建議設定通知：系統設定 → 通知 → ${APP_NAME} → 顯示預覽 → 解鎖時。\n\n"
