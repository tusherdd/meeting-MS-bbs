/**
 * Browser engine from the User-Agent header (SPEC.md §13.10, v1.5): WebKit = Safari and EVERY
 * browser on iPhone / iPad (Apple requires WebKit there: Chrome "CriOS", Firefox "FxiOS", Edge
 * "EdgiOS", …). Chromium-based browsers (Chrome, Edge, Opera, Samsung Internet, Android WebView)
 * also say "AppleWebKit" but carry "Chrome/" or "Chromium/"; Firefox on desktop/Android is Gecko.
 *
 * Only used to pick the Bangla font: NikoshBAN's য় (YA + NUKTA) is drawn with a detached dot by
 * WebKit's text shaper, so WebKit gets Kohinoor Bangla / Noto Sans Bengali instead.
 */
export type BrowserEngine = "webkit" | "other";

export function engineFromUserAgent(userAgent: string | null | undefined): BrowserEngine {
  const ua = userAgent ?? "";
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return "webkit";
  if (!/AppleWebKit\//.test(ua)) return "other";
  return /(Chrome|Chromium)\//.test(ua) ? "other" : "webkit";
}
