/**
 * urlPolicy - Telegram view 的連結去向判斷（單一正本）
 *
 * [task#100449] TG view 內的連結有兩個出口（`setWindowOpenHandler` 處理
 * target=_blank / window.open，`will-navigate` 處理同 frame 導航），兩者共用這裡的
 * `classifyNavigation()`，避免兩份會漂移的白名單判斷。
 *
 * 判斷一律走 `new URL(url).hostname` 精確比對，**不做字串 includes**：
 *   - `https://evil.com/web.telegram.org`      -> hostname `evil.com`            -> 外部
 *   - `https://web.telegram.org.evil.com/...`  -> hostname 不以 `.telegram.org` 結尾 -> 外部
 * 這兩種 payload 用 includes 判斷都會被誤放進 app 內，所以禁止用。
 */

/** TG 自家 apex 網域（子網域另由 `.telegram.org` 後綴比對涵蓋） */
const TELEGRAM_APEX_HOSTS = new Set([
  'telegram.org',   // 官網 / 說明頁
  't.me'            // TG 深連結；訊息裡的 t.me 是站內語意，TG Web 自己會攔下處理
]);

/**
 * 可以安全交給 `shell.openExternal()` 的協定白名單。
 * openExternal 等於把字串交給 macOS `LaunchServices` 路由，餵任意自訂協定
 * （`zoommtg:`、`ms-msdt:` 之類）等於讓頁面內容決定要喚起哪個本機程式，故只放行三種。
 */
const EXTERNAL_SAFE_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tg:'     // 系統若註冊了 Telegram 原生 app 就交給它，沒註冊則 openExternal 自然失敗
]);

/**
 * 瀏覽器內部協定：不是「外部連結」也不該被我們攔，交回 Chromium 原本行為。
 * （blob:/filesystem: 是 TG 存檔與媒體預覽會用到的，攔了會破功能。
 *   刻意不含 `data:` 與 `file:` —— 前者是常見釣魚載體、後者是本機檔案讀取面，一律 block。）
 */
const PASSTHROUGH_PROTOCOLS = new Set(['about:', 'blob:', 'filesystem:']);

/**
 * @param {string} url
 * @returns {URL|null} 解析失敗（空字串、相對路徑、亂碼）回 null
 */
function parseUrl(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * 這個 URL 是否算「Telegram 站內」（可留在 app 內）。
 *
 * 只有 http(s) 才可能是站內；hostname 精確比對 apex 或 `.telegram.org` 子網域。
 * 尾點 FQDN（`web.telegram.org.`）與大寫主機名視為同一台主機。
 *
 * @param {string} url
 * @returns {boolean}
 */
function isTelegramInternalUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  // hostname 已由 URL 正規化成小寫，toLowerCase 只是防呆；尾點 FQDN 去掉再比
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (TELEGRAM_APEX_HOSTS.has(host)) return true;
  return host.endsWith('.telegram.org');   // web.telegram.org、core.telegram.org…
}

/**
 * 這個 URL 是否可以交給 `shell.openExternal()`。
 *
 * @param {string} url
 * @returns {boolean}
 */
function isSafeExternalUrl(url) {
  const parsed = parseUrl(url);
  return !!parsed && EXTERNAL_SAFE_PROTOCOLS.has(parsed.protocol);
}

/**
 * 把一個導航目標分成四類，兩個 handler 共用這個結論。
 *
 * - `internal`  TG 站內 http(s) -> 留在 app 內（will-navigate 放行）
 * - `external`  http(s) 非 TG、mailto:、tg: -> `shell.openExternal()` 後攔掉
 * - `passthru`  about:/blob:/filesystem: -> 不干預，交回 Chromium
 * - `block`     其他（解析失敗、data:、file:、未知自訂協定）-> 攔掉且**不**外送
 *
 * @param {string} url
 * @returns {'internal'|'external'|'passthru'|'block'}
 */
function classifyNavigation(url) {
  const parsed = parseUrl(url);
  if (!parsed) return 'block';
  if (PASSTHROUGH_PROTOCOLS.has(parsed.protocol)) return 'passthru';
  if (isTelegramInternalUrl(url)) return 'internal';
  if (isSafeExternalUrl(url)) return 'external';
  return 'block';
}

module.exports = {
  isTelegramInternalUrl,
  isSafeExternalUrl,
  classifyNavigation
};
