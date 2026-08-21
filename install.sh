#!/usr/bin/env bash
#
# NextCalc 自動安裝腳本
#
# 用法：
#   bash "/Volumes/NextCalc <版本>-arm64/install.sh"  # 掛載 DMG 後直接跑映像檔內的這支腳本
#   bash install.sh                                   # 自動尋找同目錄（或 dist/）下最新的 NextCalc-*.dmg
#   bash install.sh /path/to/NextCalc.dmg             # 指定 DMG
#
# 環境變數：
#   NEXTCALC_APP_DEST   安裝目的地目錄，預設 /Applications
#                       （沒有 /Applications 寫入權限時可用 NEXTCALC_APP_DEST="$HOME/Applications"）
#
# 流程：取得映像檔內容 → 覆蓋安裝到目的地 → 移除隔離屬性 → （只卸載自己掛的）→ 開啟 app
#
# 本腳本隨 DMG 一起發佈，因此「自己就在掛載點內」是首要使用情境：
# 偵測到這種情況時直接沿用現有掛載點，不重複掛載，也不卸載（不是我們掛的就不動它）。
#
set -euo pipefail

APP_NAME="NextCalc"
APP_DIR="${NEXTCALC_APP_DEST:-/Applications}"
APP_DEST="${APP_DIR%/}/${APP_NAME}.app"
MOUNT_POINT=""
OWNS_MOUNT=0   # 1 = 掛載點是本腳本掛的，只有這種才可以卸載
FINISHED=0     # 走到最後才設 1；EXIT trap 靠它判斷是不是中途死掉

# --- 輸出工具（一律用 printf '%b'，不用 echo "$var"） ---
log()  { printf '%b' "  $1\n"; }
step() { printf '%b' "\n▸ $1\n"; }
warn() { printf '%b' "  ! $1\n" >&2; }
die()  { printf '%b' "\n✗ 安裝失敗：$1\n" >&2; exit 1; }

# --- 卸載掛載點（只卸載自己掛的） ---
cleanup() {
  if [[ "$OWNS_MOUNT" -eq 1 && -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null \
      || hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null \
      || warn "無法卸載磁碟映像檔 ${MOUNT_POINT}，請手動在 Finder 退出。"
    MOUNT_POINT=""
  fi
}

# --- 收尾（正常結束與中斷都會執行） ---
# macOS 內建 bash 3.2 有個坑：set -u / set -e 觸發的中止，在 EXIT trap 裡 $? 已經是 0，
# 光靠 exit code 會把「中途死掉」誤報成成功。所以用 FINISHED 旗標當唯一真相。
on_exit() {
  local status=$?
  cleanup
  if [[ "$FINISHED" -ne 1 ]]; then
    [[ "$status" -eq 0 ]] && status=1
    printf '%b' "\n✗ 安裝未完成就中止了（原因見上方訊息）。app 尚未安裝完成，請修正後重跑。\n" >&2
  fi
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# --- 0. 環境檢查 ---
[[ "$(uname -s)" == "Darwin" ]] || die "此腳本只能在 macOS 上執行（偵測到 $(uname -s)）。"

# --- 查詢某個 DMG 是否已經掛載，有的話印出掛載點（避免重複掛出 "... 1" 這種掛載點） ---
existing_mount_for() {
  local dmg abs
  dmg="$1"
  abs="$(cd -- "$(dirname -- "$dmg")" && pwd)/$(basename -- "$dmg")"
  /usr/bin/hdiutil info 2>/dev/null | /usr/bin/awk -v target="$abs" '
    /^====/                       { same = 0; next }
    /^image-path[[:space:]]*:/    { p = $0
                                    sub(/^image-path[[:space:]]*:[[:space:]]*/, "", p)
                                    same = (p == target); next }
    same && index($0, "/Volumes/") { print substr($0, index($0, "/Volumes/")); exit }
  '
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DMG_PATH="${1-}"

if [[ -z "$DMG_PATH" && "$SCRIPT_DIR" == /Volumes/* && -d "${SCRIPT_DIR}/${APP_NAME}.app" ]]; then
  # --- 情境 A：腳本本身就在已掛載的映像檔內（隨 DMG 發佈的主要用法） ---
  step "偵測到腳本位於已掛載的映像檔內"
  MOUNT_POINT="$SCRIPT_DIR"
  OWNS_MOUNT=0
  log "沿用現有掛載點：$MOUNT_POINT"
  log "（不重複掛載，結束時也不會卸載這個映像檔）"
else
  # --- 情境 B：從 DMG 外面執行，需要自己找到並掛載 DMG ---
  step "尋找 DMG"

  if [[ -z "$DMG_PATH" ]]; then
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

  # --- 掛載 DMG（冪等：已掛載就沿用，掛載點由 hdiutil 輸出解析，不寫死） ---
  ALREADY_MOUNTED="$(existing_mount_for "$DMG_PATH" || true)"
  if [[ -n "$ALREADY_MOUNTED" && -d "$ALREADY_MOUNTED" ]]; then
    step "映像檔已掛載，沿用現有掛載點"
    MOUNT_POINT="$ALREADY_MOUNTED"
    OWNS_MOUNT=0
    log "掛載點：${MOUNT_POINT}（不是本腳本掛的，結束時不卸載）"
  else
    step "掛載磁碟映像檔"
    ATTACH_OUTPUT=""
    ATTACH_OUTPUT="$(hdiutil attach -nobrowse -readonly -noverify "$DMG_PATH" 2>&1)" \
      || die "掛載失敗，DMG 可能損毀。hdiutil 輸出：\n$ATTACH_OUTPUT"

    # hdiutil 輸出的最後一欄是掛載點；取第一個 /Volumes/ 開頭的路徑
    MOUNT_POINT="$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')"
    [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]] \
      || die "無法從 hdiutil 輸出解析掛載點。輸出：\n$ATTACH_OUTPUT"
    OWNS_MOUNT=1
    log "掛載點：$MOUNT_POINT"
  fi
fi

APP_SRC="${MOUNT_POINT}/${APP_NAME}.app"
[[ -d "$APP_SRC" ]] || die "映像檔內找不到 ${APP_NAME}.app（掛載點：${MOUNT_POINT}）"

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
  rm -rf "$APP_DEST" || die "無法移除舊版 ${APP_DEST}，請確認權限（必要時用 sudo 手動刪除）。"
fi

# --- 4. 複製到目的地（預設 /Applications，可用 NEXTCALC_APP_DEST 覆寫） ---
step "安裝到 ${APP_DIR}"
[[ -d "$APP_DIR" ]] || /bin/mkdir -p "$APP_DIR" 2>/dev/null || die "目的地目錄不存在也無法建立：${APP_DIR}"
[[ -w "$APP_DIR" ]] || die "${APP_DIR} 無寫入權限。請改用 sudo 執行、改設 NEXTCALC_APP_DEST=\"\$HOME/Applications\"，或手動把 ${APP_NAME}.app 拖進「應用程式」資料夾。"

cp -R "$APP_SRC" "$APP_DEST" || die "複製失敗：${APP_SRC} → ${APP_DEST}"
[[ -d "$APP_DEST" ]] || die "複製後找不到 ${APP_DEST}，安裝未完成。"

NEW_VER="$(/usr/bin/defaults read "${APP_DEST}/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)"
log "已安裝：${APP_DEST}${NEW_VER:+（版本 ${NEW_VER}）}"

# --- 5. 移除隔離屬性（ad-hoc 無簽名，需放行 Gatekeeper） ---
step "移除隔離屬性"
if /usr/bin/xattr -p com.apple.quarantine "$APP_DEST" >/dev/null 2>&1; then
  if /usr/bin/xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null; then
    log "已移除 com.apple.quarantine"
  else
    warn "移除隔離屬性失敗。首次開啟請先雙擊一次（會被拒），再到「系統設定 → 隱私權與安全性」按 ${APP_NAME} 的「仍要打開」。"
  fi
else
  log "無 com.apple.quarantine 屬性，略過"
fi

# --- 6. 卸載映像檔（只卸載自己掛的） ---
if [[ "$OWNS_MOUNT" -eq 1 ]]; then
  step "卸載磁碟映像檔"
  cleanup
  log "已卸載"
else
  step "保留磁碟映像檔"
  log "${MOUNT_POINT} 不是本腳本掛載的，不卸載；安裝完成後可自行在 Finder 按退出。"
fi

# --- 7. 開啟 app ---
step "開啟 ${APP_NAME}"
if open "$APP_DEST" 2>/dev/null; then
  log "已送出開啟指令"
else
  warn "自動開啟失敗，請自行到「應用程式」開啟 ${APP_NAME}。"
fi

FINISHED=1
printf '%b' "\n✓ ${APP_NAME} 安裝完成：${APP_DEST}\n"
printf '%b' "  首次開啟若被 Gatekeeper 阻擋：先雙擊一次（會被拒），再到「系統設定 → 隱私權與安全性」，在下方找到 ${APP_NAME} 按「仍要打開」。\n"
printf '%b' "  （macOS 15 起「右鍵 → 打開」已被 Apple 移除，不再有效。）\n"
printf '%b' "  建議設定通知：系統設定 → 通知 → ${APP_NAME} → 顯示預覽 → 解鎖時。\n\n"
