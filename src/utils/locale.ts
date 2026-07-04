/**
 * Detect locale from URL pathname.
 * Used as a drop-in replacement for Astro.currentLocale
 * when Astro's built-in i18n routing is not enabled.
 */
export function getLocaleFromUrl(url: URL | undefined): "zh-CN" | "en" {
  if (!url) return "zh-CN";
  // /en/ prefix or /en (home page)
  if (url.pathname.startsWith("/en/") || url.pathname === "/en") return "en";
  // /posts/en-* or /tags/en-* style paths (English articles without /en/ prefix)
  if (/^\/(?:posts|tags|archives)\/en-/.test(url.pathname)) return "en";
  return "zh-CN";
}
